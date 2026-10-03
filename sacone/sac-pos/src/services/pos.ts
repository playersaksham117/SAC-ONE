import * as Crypto from 'expo-crypto';
import { round2 } from '../domain/money';
import { can } from '../domain/permissions';
import { calculateCart, lineRefundValue } from '../domain/tax';
import type { Approval, Customer, CustomerPayment, Payment, RefundMethod, Sale, SaleReturn } from '../domain/types';
import { compactNotes, type CashDrawer } from '../domain/cash';
import {
  gstinStateCode, normalizePhone, validateCheckout, validateCollection, validateCustomerDraft, validateReturn,
  type CheckResult, type CustomerDraft,
} from '../domain/validation';
import { useCart } from '../store/cart';
import { useCatalog, type LocalCustomer } from '../store/catalog';
import { useDevice } from '../store/device';
import { pendingQty, useLedger } from '../store/ledger';
import { currentUser } from '../store/session';
import { syncNow } from '../sync/engine';

/**
 * POS use-cases. Every action re-checks the user's ERP permissions (not just the UI)
 * and runs the shared validators before writing anything.
 */

export class ValidationError extends Error {
  result: CheckResult;
  constructor(result: CheckResult) {
    super(result.errors.map((e) => e.message).join('\n'));
    this.result = result;
  }
}

function requireUser(capability: Parameters<typeof can>[1]) {
  const user = currentUser();
  if (!user) throw new Error('Your session is locked. Unlock to continue.');
  if (!can(user.permissions, capability)) throw new Error('Your ERP role does not allow this action.');
  return user;
}

const kick = () => { syncNow().catch(() => undefined); };

/* ───────────── cart totals & checkout ───────────── */

export function cartCustomer(): Customer | null {
  const id = useCart.getState().customerId;
  return id ? useCatalog.getState().customers[id] ?? null : null;
}

export function cartTotals() {
  const { lines, invoiceDiscount } = useCart.getState();
  const customer = cartCustomer();
  const company = useDevice.getState().info?.company;
  return calculateCart(lines, invoiceDiscount, {
    companyStateCode: company?.gstStateCode ?? gstinStateCode(company?.gstNumber),
    customerStateCode: customer?.gstStateCode ?? gstinStateCode(customer?.gstin),
  });
}

/** Exchange credit applied to the current cart (never more than the bill total). */
export function exchangeCreditFor(total: number): number {
  const ex = useCart.getState().exchange;
  return ex ? round2(Math.min(ex.amount, total)) : 0;
}

/** Customer payments plus the exchange credit, which settles part of the bill as cash. */
export function withExchangeCredit(payments: Payment[], total: number): Payment[] {
  const ex = useCart.getState().exchange;
  const credit = exchangeCreditFor(total);
  return ex && credit > 0 ? [...payments, { method: 'cash', amount: credit, reference: `Exchange ${ex.returnNumber}` }] : payments;
}

export function checkCheckout(payments: Payment[]): CheckResult {
  const user = currentUser();
  const cart = useCart.getState();
  const ledger = useLedger.getState();
  return validateCheckout({
    lines: cart.lines,
    totals: cartTotals(),
    payments,
    customer: cartCustomer(),
    products: useCatalog.getState().products,
    pendingQty: pendingQty(ledger.sales, ledger.returns),
    allowNegativeStock: Boolean(useDevice.getState().info?.settings.allowNegativeStock),
    canOverridePrice: can(user?.permissions, 'overridePrice'),
  });
}

export function completeSale(
  customerPayments: Payment[],
  { tendered, cashDrawer }: { tendered?: number; cashDrawer?: CashDrawer | null } = {},
): Sale {
  const user = requireUser('sell');
  const cart = useCart.getState();
  const totals = cartTotals();
  const payments = withExchangeCredit(customerPayments, totals.grandTotal);
  const check = checkCheckout(payments);
  if (check.errors.length) throw new ValidationError(check);

  const customer = cartCustomer();
  const amountDue = round2(payments.filter((p) => p.method === 'credit').reduce((s, p) => s + p.amount, 0));
  // Change is worked out against the cash the customer hands over (not the exchange credit).
  const cashPaid = round2(customerPayments.filter((p) => p.method === 'cash').reduce((s, p) => s + p.amount, 0));

  const sale: Sale = {
    id: Crypto.randomUUID(),
    number: useLedger.getState().nextNumber('S'),
    createdAt: new Date().toISOString(),
    userId: user.userId,
    userName: user.name,
    customer: customer ? { id: customer.id, name: customer.name, phone: customer.phone, gstin: customer.gstin, gstStateCode: customer.gstStateCode } : null,
    totals,
    payments: payments.map((p) => ({ ...p, amount: round2(p.amount) })),
    amountPaid: round2(totals.grandTotal - amountDue),
    amountDue,
    tendered: tendered && tendered > cashPaid ? round2(tendered) : undefined,
    change: tendered && tendered > cashPaid ? round2(tendered - cashPaid) : undefined,
    cashDrawer: cashDrawer ? { received: compactNotes(cashDrawer.received), change: compactNotes(cashDrawer.change) } : undefined,
    exchange: cart.exchange ? { returnId: cart.exchange.returnId, returnNumber: cart.exchange.returnNumber, credit: exchangeCreditFor(totals.grandTotal) } : null,
    notes: cart.notes || null,
    returned: {},
    sync: 'pending',
  };
  useLedger.getState().addSale(sale);
  if (customer && amountDue > 0) useCatalog.getState().adjustOutstanding(customer.id, amountDue);
  cart.clear();
  kick();
  return sale;
}

export function holdCurrentBill(label?: string) {
  requireUser('sell');
  const cart = useCart.getState();
  if (!cart.lines.length) throw new Error('Cart is empty');
  const customer = cartCustomer();
  useLedger.getState().hold({
    id: Crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    label: label || customer?.name || `${cart.lines.length} item(s)`,
    lines: cart.lines,
    customerId: cart.customerId,
    invoiceDiscount: cart.invoiceDiscount,
  });
  cart.clear();
}

/* ───────────── returns ───────────── */

export function createReturn(
  saleId: string,
  qtyByProduct: Record<string, number>,
  refundMethod: RefundMethod,
  reason: string,
  { type = 'return', approval }: { type?: 'return' | 'exchange'; approval: Approval },
): SaleReturn {
  const user = requireUser('returns');
  if (!approval) throw new Error('A manager must approve this return');
  if (type === 'exchange' && !can(user.permissions, 'sell')) throw new Error('Exchanges need permission to create sales');
  const sale = useLedger.getState().sales.find((s) => s.id === saleId);
  if (!sale) throw new Error('Sale not found on this phone');
  const check = validateReturn(sale, qtyByProduct, reason);
  if (check.errors.length) throw new ValidationError(check);
  if (refundMethod === 'credit_note' && !sale.customer) throw new Error('Credit note needs a registered customer');

  const lines = Object.entries(qtyByProduct).filter(([, q]) => q > 0).map(([productId, quantity]) => {
    const sold = sale.totals.lines.find((l) => l.productId === productId)!;
    return { productId, sku: sold.sku, name: sold.name, quantity, amount: lineRefundValue(sold, quantity) };
  });
  const ret: SaleReturn = {
    id: Crypto.randomUUID(),
    number: useLedger.getState().nextNumber('R'),
    saleId: sale.id,
    saleNumber: sale.number,
    createdAt: new Date().toISOString(),
    userId: user.userId,
    userName: user.name,
    lines,
    refundMethod,
    reason: reason.trim(),
    total: round2(lines.reduce((s, l) => s + l.amount, 0)),
    type,
    approvedBy: approval,
    sync: 'pending',
  };
  useLedger.getState().addReturn(ret);
  if (sale.customer && refundMethod === 'credit_note') useCatalog.getState().adjustOutstanding(sale.customer.id, -ret.total);
  kick();
  return ret;
}

/* ───────────── customers ───────────── */

export function createCustomer(draft: CustomerDraft): LocalCustomer {
  const user = requireUser('createCustomers');
  const existing = Object.values(useCatalog.getState().customers);
  const check = validateCustomerDraft(draft, existing);
  if (check.errors.length) throw new ValidationError(check);
  const gstin = draft.gstin?.trim().toUpperCase() || null;
  const c: LocalCustomer = {
    id: `local-${Crypto.randomUUID()}`,
    code: useLedger.getState().nextNumber('C'),
    name: draft.name.trim(),
    phone: normalizePhone(draft.phone),
    email: draft.email?.trim() || null,
    gstin,
    gstStateCode: gstinStateCode(gstin),
    address: draft.address?.trim() || null,
    city: draft.city?.trim() || null,
    state: draft.state?.trim() || null,
    creditLimit: 0,
    outstanding: 0,
    isActive: true,
    updatedAt: new Date().toISOString(),
    isLocal: true,
    sync: 'pending',
    createdBy: user.userId,
  };
  useCatalog.getState().addLocalCustomer(c);
  kick();
  return c;
}

export function collectPayment(
  customerId: string,
  amount: number,
  method: CustomerPayment['method'],
  { reference, invoiceNumber, notes }: { reference?: string; invoiceNumber?: string | null; notes?: string } = {},
): CustomerPayment {
  const user = requireUser('collectPayment');
  const customer = useCatalog.getState().customers[customerId] ?? null;
  const check = validateCollection(round2(amount), customer);
  if (check.errors.length) throw new ValidationError(check);
  const p: CustomerPayment = {
    id: Crypto.randomUUID(),
    number: useLedger.getState().nextNumber('P'),
    createdAt: new Date().toISOString(),
    userId: user.userId,
    userName: user.name,
    customerId,
    customerName: customer!.name,
    customerPhone: customer!.phone,
    invoiceNumber: invoiceNumber ?? null,
    amount: round2(amount),
    method,
    reference: reference?.trim() || null,
    notes: notes?.trim() || null,
    sync: 'pending',
  };
  useLedger.getState().addPayment(p);
  useCatalog.getState().adjustOutstanding(customerId, -p.amount);
  kick();
  return p;
}

/* ───────────── reports ───────────── */

export function daySummary(date = new Date()) {
  const key = date.toDateString();
  const { sales, returns, payments } = useLedger.getState();
  const today = <T extends { createdAt: string }>(d: T) => new Date(d.createdAt).toDateString() === key;
  const s = sales.filter(today);
  const byMethod: Record<string, number> = { cash: 0, upi: 0, bank: 0, credit: 0 };
  for (const sale of s) for (const p of sale.payments) byMethod[p.method] = round2((byMethod[p.method] || 0) + p.amount);
  const r = returns.filter(today);
  const pay = payments.filter(today);
  const cashRefunds = round2(r.filter((x) => x.refundMethod === 'cash').reduce((t, x) => t + x.total, 0));
  const cashCollected = round2(pay.filter((x) => x.method === 'cash').reduce((t, x) => t + x.amount, 0));
  return {
    billCount: s.length,
    gross: round2(s.reduce((t, x) => t + x.totals.grandTotal, 0)),
    gst: round2(s.reduce((t, x) => t + x.totals.gstAmount, 0)),
    discount: round2(s.reduce((t, x) => t + x.totals.itemDiscountTotal + x.totals.invoiceDiscount, 0)),
    byMethod,
    returnCount: r.length,
    returnTotal: round2(r.reduce((t, x) => t + x.total, 0)),
    collections: round2(pay.reduce((t, x) => t + x.amount, 0)),
    cashInDrawer: round2(byMethod.cash + cashCollected - cashRefunds),
  };
}
