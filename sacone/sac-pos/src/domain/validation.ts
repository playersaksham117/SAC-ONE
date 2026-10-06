import { round2 } from './money';
import type { CartLine, CartTotals, Customer, Payment, Product, Sale } from './types';

export interface Issue {
  field?: string;
  message: string;
}
export interface CheckResult {
  errors: Issue[];
  warnings: Issue[];
}
const ok = (): CheckResult => ({ errors: [], warnings: [] });

/* ───────────── field validators ───────────── */

/** Indian mobile: 10 digits starting 6–9, optional +91 / 0 prefix. Returns normalized 10 digits or null. */
export function normalizePhone(value: string | null | undefined): string | null {
  const digits = String(value ?? '').replace(/\D/g, '');
  const ten = digits.length === 12 && digits.startsWith('91') ? digits.slice(2)
    : digits.length === 11 && digits.startsWith('0') ? digits.slice(1)
      : digits;
  return /^[6-9]\d{9}$/.test(ten) ? ten : null;
}

const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
export const isValidGstin = (value: string): boolean => GSTIN_RE.test(value.trim().toUpperCase());
export const gstinStateCode = (gstin?: string | null): string | null =>
  gstin && isValidGstin(gstin) ? gstin.trim().slice(0, 2) : null;

export const isValidEmail = (value: string): boolean => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value.trim());

export function isValidServerUrl(value: string): boolean {
  try {
    const u = new URL(value.trim());
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

export const isValidDeviceKey = (value: string): boolean => /^sk_(live|test)_[A-Za-z0-9_-]{16,}$/.test(value.trim());
export const isValidPin = (pin: string): boolean => /^\d{4,6}$/.test(pin) && !/^(\d)\1+$/.test(pin) && !['1234', '123456', '0000'].includes(pin);

/* ───────────── customers ───────────── */

export interface CustomerDraft {
  name: string;
  phone: string;
  email?: string;
  gstin?: string;
  address?: string;
  city?: string;
  state?: string;
}

export function validateCustomerDraft(d: CustomerDraft, existing: Customer[] = []): CheckResult {
  const r = ok();
  const name = d.name.trim();
  if (name.length < 2) r.errors.push({ field: 'name', message: 'Name must be at least 2 characters' });
  if (name.length > 120) r.errors.push({ field: 'name', message: 'Name is too long' });
  const phone = normalizePhone(d.phone);
  if (!phone) r.errors.push({ field: 'phone', message: 'Enter a valid 10-digit mobile number' });
  else if (existing.some((c) => normalizePhone(c.phone) === phone)) {
    r.errors.push({ field: 'phone', message: 'A customer with this mobile already exists' });
  }
  if (d.email?.trim() && !isValidEmail(d.email)) r.errors.push({ field: 'email', message: 'Invalid email address' });
  if (d.gstin?.trim() && !isValidGstin(d.gstin)) {
    r.errors.push({ field: 'gstin', message: 'GSTIN must be 15 characters, e.g. 27AABCU9603R1ZM' });
  }
  return r;
}

/* ───────────── cart ───────────── */

export const MAX_QTY = 99999;

export function validateLine(line: CartLine, { canOverridePrice }: { canOverridePrice: boolean }): Issue[] {
  const issues: Issue[] = [];
  if (!(line.quantity > 0)) issues.push({ field: 'quantity', message: `${line.name}: quantity must be more than 0` });
  if (line.quantity > MAX_QTY) issues.push({ field: 'quantity', message: `${line.name}: quantity is too large` });
  if (!(line.unitPrice >= 0)) issues.push({ field: 'unitPrice', message: `${line.name}: price cannot be negative` });
  const gross = round2(line.unitPrice * line.quantity);
  if (line.discountAmount < 0 || line.discountAmount > gross + 0.001) {
    issues.push({ field: 'discountAmount', message: `${line.name}: discount must be between 0 and ${gross}` });
  }
  if (!canOverridePrice && (Math.abs(line.unitPrice - line.listPrice) > 0.001 || line.discountAmount > 0)) {
    issues.push({ field: 'unitPrice', message: `${line.name}: you are not allowed to change price or give discount` });
  }
  return issues;
}

/* ───────────── checkout ───────────── */

export interface CheckoutContext {
  lines: CartLine[];
  totals: CartTotals;
  payments: Payment[];
  customer: Customer | null;
  products: Record<string, Product>;
  pendingQty: Record<string, number>;   // qty already sold on this device but not yet synced
  allowNegativeStock: boolean;
  canOverridePrice: boolean;
  /** productId → lowest allowed unit price (before GST, after discounts), set in ERP Product Master.
   *  Products without one may not go below their selling price. */
  minPrices?: Record<string, number>;
}

/**
 * Lines whose effective unit price (after line + bill discounts, before GST) is below the floor:
 * the Commission-settings minimum when one applies, otherwise the product's selling price.
 */
export function belowMinPrice(
  totals: CartTotals, minPrices: Record<string, number> = {}, products: Record<string, Pick<Product, 'price'>> = {},
): Issue[] {
  const issues: Issue[] = [];
  for (const l of totals.lines) {
    const floor = minPrices[l.productId] ?? products[l.productId]?.price;
    if (!(Number(floor) > 0) || !(l.quantity > 0)) continue;
    const price = round2(l.taxableAmount / l.quantity);
    if (price + 0.005 < floor) {
      issues.push({ field: 'unitPrice', message: `${l.name}: lowest allowed price is ${floor.toFixed(2)} before GST (now ${price.toFixed(2)})` });
    }
  }
  return issues;
}

export function validateCheckout(ctx: CheckoutContext): CheckResult {
  const r = ok();
  if (!ctx.lines.length) r.errors.push({ message: 'Cart is empty' });

  for (const line of ctx.lines) r.errors.push(...validateLine(line, { canOverridePrice: ctx.canOverridePrice }));
  r.errors.push(...belowMinPrice(ctx.totals, ctx.minPrices, ctx.products));

  if (ctx.totals.invoiceDiscount > 0 && !ctx.canOverridePrice) {
    r.errors.push({ field: 'invoiceDiscount', message: 'You are not allowed to give a bill discount' });
  }
  const taxableBeforeInvoice = round2(ctx.totals.subtotal - ctx.totals.itemDiscountTotal);
  if (ctx.totals.invoiceDiscount > taxableBeforeInvoice + 0.001) {
    r.errors.push({ field: 'invoiceDiscount', message: 'Bill discount cannot exceed the taxable amount' });
  }

  // Stock (grouped per product)
  const qtyByProduct: Record<string, number> = {};
  for (const l of ctx.lines) qtyByProduct[l.productId] = (qtyByProduct[l.productId] || 0) + l.quantity;
  for (const [productId, qty] of Object.entries(qtyByProduct)) {
    const p = ctx.products[productId];
    if (!p) { r.errors.push({ message: 'A product in the cart is no longer in the catalogue' }); continue; }
    if (!p.isActive) r.errors.push({ message: `${p.name} is inactive in the ERP` });
    const available = round2(p.available - (ctx.pendingQty[productId] || 0));
    if (qty > available + 0.000001) {
      const msg = `${p.name}: only ${Math.max(available, 0)} ${p.unit} in stock`;
      (ctx.allowNegativeStock ? r.warnings : r.errors).push({ message: msg });
    }
  }

  // Payments
  const total = ctx.totals.grandTotal;
  if (ctx.payments.some((p) => !(p.amount > 0))) r.errors.push({ field: 'payments', message: 'Each payment must be more than 0' });
  const paid = round2(ctx.payments.reduce((s, p) => s + p.amount, 0));
  if (Math.abs(paid - total) > 0.01) {
    r.errors.push({ field: 'payments', message: `Payments (${paid.toFixed(2)}) must equal the bill total (${total.toFixed(2)})` });
  }
  if (ctx.payments.some((p) => p.method === 'upi' || p.method === 'bank')) {
    // reference is optional but recommended
    const missing = ctx.payments.filter((p) => (p.method === 'upi' || p.method === 'bank') && !p.reference?.trim());
    if (missing.length) r.warnings.push({ message: 'Add the UPI / card reference number for easier reconciliation' });
  }

  const credit = round2(ctx.payments.filter((p) => p.method === 'credit').reduce((s, p) => s + p.amount, 0));
  if (credit > 0) {
    if (!ctx.customer) r.errors.push({ field: 'customer', message: 'Select a customer for credit (udhar) sales' });
    else {
      if (!normalizePhone(ctx.customer.phone) && !ctx.customer.gstin) {
        r.errors.push({ field: 'customer', message: 'Credit customer needs a mobile number or GSTIN' });
      }
      if (ctx.customer.creditLimit > 0 && ctx.customer.outstanding + credit > ctx.customer.creditLimit + 0.01) {
        r.errors.push({
          field: 'customer',
          message: `Credit limit exceeded: outstanding ${ctx.customer.outstanding.toFixed(2)} + ${credit.toFixed(2)} > limit ${ctx.customer.creditLimit.toFixed(2)}`,
        });
      }
    }
  }
  return r;
}

/* ───────────── returns ───────────── */

export function validateReturn(sale: Sale, qtyByProduct: Record<string, number>, reason: string): CheckResult {
  const r = ok();
  const entries = Object.entries(qtyByProduct).filter(([, q]) => q > 0);
  if (!entries.length) r.errors.push({ message: 'Select at least one item to return' });
  for (const [productId, qty] of entries) {
    const soldLine = sale.totals.lines.find((l) => l.productId === productId);
    if (!soldLine) { r.errors.push({ message: 'Item not on this bill' }); continue; }
    const sold = sale.totals.lines.filter((l) => l.productId === productId).reduce((s, l) => s + l.quantity, 0);
    const remaining = sold - (sale.returned[productId] || 0);
    if (qty > remaining + 0.000001) r.errors.push({ message: `${soldLine.name}: only ${remaining} can be returned` });
  }
  if (reason.trim().length < 3) r.errors.push({ field: 'reason', message: 'Enter a reason for the return' });
  return r;
}

/* ───────────── customer payments ───────────── */

export function validateCollection(amount: number, customer: Customer | null): CheckResult {
  const r = ok();
  if (!customer) r.errors.push({ message: 'Select a customer' });
  if (!(amount > 0)) r.errors.push({ field: 'amount', message: 'Amount must be more than 0' });
  if (customer && amount > customer.outstanding + 0.01) {
    r.warnings.push({ message: `Amount is more than the outstanding ${customer.outstanding.toFixed(2)} — extra will be kept as advance` });
  }
  return r;
}
