import { describe, expect, it } from 'vitest';
import { calculateCart, lineRefundValue } from '../src/domain/tax';
import { can } from '../src/domain/permissions';
import {
  gstinStateCode, isValidDeviceKey, isValidGstin, isValidPin, isValidServerUrl, normalizePhone,
  validateCheckout, validateCollection, validateCustomerDraft, validateLine, validateReturn,
} from '../src/domain/validation';
import { docNumber } from '../src/domain/numbering';
import { salePayload } from '../src/domain/payloads';
import type { CartLine, Customer, Payment, Product, Sale } from '../src/domain/types';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const calculateCartTotals = (serverPos as any).calculateCartTotals as (...args: unknown[]) => any;
// SACONE server implementation — the terminal must compute identical totals.
import * as serverPos from '../../sacone-api/src/services/pos.js';

const line = (over: Partial<CartLine> = {}): CartLine => ({
  productId: 'p1', name: 'Rice 5kg', sku: 'RICE', unit: 'PCS', quantity: 2, unitPrice: 599,
  listPrice: 599, discountAmount: 0, gstRate: 5, ...over,
});
const product = (over: Partial<Product> = {}): Product => ({
  id: 'p1', name: 'Rice 5kg', sku: 'RICE', unit: 'PCS', gstRate: 5, mrp: 650, price: 599,
  onHand: 10, available: 10, isActive: true, updatedAt: '', ...over,
});
const customer = (over: Partial<Customer> = {}): Customer => ({
  id: 'c1', name: 'Ravi Traders', phone: '9876543210', creditLimit: 0, outstanding: 0,
  isActive: true, updatedAt: '', ...over,
});

describe('tax engine', () => {
  it('matches the SACONE server calculation for many random carts', () => {
    let seed = 42;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    for (let i = 0; i < 300; i++) {
      const n = 1 + Math.floor(rnd() * 5);
      const lines = Array.from({ length: n }, (_, k) => line({
        productId: `p${k}`,
        quantity: 1 + Math.floor(rnd() * 9),
        unitPrice: Math.round(rnd() * 200000) / 100,
        discountAmount: 0,
        gstRate: [0, 5, 12, 18, 28][Math.floor(rnd() * 5)],
      }));
      const taxable = lines.reduce((s, l) => s + l.unitPrice * l.quantity, 0);
      const invDisc = Math.floor(rnd() * Math.min(taxable, 500));
      const states = rnd() > 0.5 ? { companyStateCode: '27', customerStateCode: '27' } : { companyStateCode: '27', customerStateCode: '24' };
      const ours = calculateCart(lines, invDisc, states);
      const server = calculateCartTotals(lines.map((l) => ({ ...l, gstPercentage: l.gstRate })), invDisc, states);
      expect(ours.grandTotal).toBe(server.grandTotal);
      expect(ours.gstAmount).toBe(server.gstAmount);
      expect(ours.igstAmount).toBe(server.igstAmount);
      expect(ours.cgstAmount).toBe(server.cgstAmount);
    }
  });

  it('splits CGST/SGST within state and IGST across states', () => {
    const same = calculateCart([line({ quantity: 1, unitPrice: 100, gstRate: 18 })], 0, { companyStateCode: '27', customerStateCode: '27' });
    expect(same.cgstAmount).toBe(9);
    expect(same.igstAmount).toBe(0);
    const inter = calculateCart([line({ quantity: 1, unitPrice: 100, gstRate: 18 })], 0, { companyStateCode: '27', customerStateCode: '29' });
    expect(inter.igstAmount).toBe(18);
    expect(inter.grandTotal).toBe(118);
  });

  it('refund value is pro-rata to the paid line total', () => {
    const t = calculateCart([line({ quantity: 4, unitPrice: 100, gstRate: 18 })]);
    expect(lineRefundValue(t.lines[0], 1)).toBe(118);
  });
});

describe('permissions', () => {
  it('maps ERP keys to capabilities', () => {
    const cashier = ['pos.terminal.view', 'pos.sales.create', 'pos.sales.view', 'pos.returns.create', 'parties.customers.view', 'products.products.view'];
    expect(can(cashier, 'sell')).toBe(true);
    expect(can(cashier, 'overridePrice')).toBe(false);
    expect(can(cashier, 'collectPayment')).toBe(false);
    expect(can(cashier, 'viewStock')).toBe(true);
    expect(can(['*'], 'manageDevice')).toBe(true);
    expect(can([], 'sell')).toBe(false);
  });
});

describe('field validation', () => {
  it('phones', () => {
    expect(normalizePhone('+91 98765 43210')).toBe('9876543210');
    expect(normalizePhone('09876543210')).toBe('9876543210');
    expect(normalizePhone('12345')).toBeNull();
    expect(normalizePhone('5876543210')).toBeNull();
  });
  it('gstin', () => {
    expect(isValidGstin('27AABCU9603R1ZM')).toBe(true);
    expect(isValidGstin('27AABCU9603R1Z')).toBe(false);
    expect(gstinStateCode('24AABCP5678B1Z9')).toBe('24');
  });
  it('setup inputs and PIN', () => {
    expect(isValidServerUrl('http://192.168.1.10:4000')).toBe(true);
    expect(isValidServerUrl('192.168.1.10')).toBe(false);
    expect(isValidDeviceKey(`sk_live_${'a1B2'.repeat(8)}`)).toBe(true);
    expect(isValidDeviceKey('abc')).toBe(false);
    expect(isValidPin('4821')).toBe(true);
    expect(isValidPin('1111')).toBe(false);
    expect(isValidPin('1234')).toBe(false);
    expect(isValidPin('12a4')).toBe(false);
  });
  it('customer draft rejects duplicates and bad GSTIN', () => {
    const r = validateCustomerDraft({ name: 'A', phone: '9876543210', gstin: 'XYZ' }, [customer()]);
    expect(r.errors.map((e) => e.field).sort()).toEqual(['gstin', 'name', 'phone']);
  });
});

describe('checkout validation', () => {
  const base = () => {
    const lines = [line()];
    const totals = calculateCart(lines);
    return {
      lines, totals,
      payments: [{ method: 'cash', amount: totals.grandTotal }] as Payment[],
      customer: null as Customer | null,
      products: { p1: product() },
      pendingQty: {},
      allowNegativeStock: false,
      canOverridePrice: false,
    };
  };

  it('accepts a normal cash sale', () => {
    expect(validateCheckout(base()).errors).toEqual([]);
  });
  it('blocks payment mismatch', () => {
    const ctx = base();
    ctx.payments = [{ method: 'cash', amount: 10 }];
    expect(validateCheckout(ctx).errors[0].message).toMatch(/must equal/);
  });
  it('blocks overselling unless negative stock is allowed (counts unsynced sales)', () => {
    const ctx = base();
    ctx.pendingQty = { p1: 9 } as Record<string, number>;
    expect(validateCheckout(ctx).errors.some((e) => /only 1/.test(e.message))).toBe(true);
    expect(validateCheckout({ ...ctx, allowNegativeStock: true }).warnings.length).toBe(1);
  });
  it('credit needs a customer and respects credit limit', () => {
    const ctx = base();
    ctx.payments = [{ method: 'credit', amount: ctx.totals.grandTotal }];
    expect(validateCheckout(ctx).errors.some((e) => e.field === 'customer')).toBe(true);
    ctx.customer = customer({ creditLimit: 1000, outstanding: 900 });
    expect(validateCheckout(ctx).errors.some((e) => /Credit limit/.test(e.message))).toBe(true);
    ctx.customer = customer({ creditLimit: 0 });
    expect(validateCheckout(ctx).errors).toEqual([]);
  });
  it('price override needs permission', () => {
    expect(validateLine(line({ unitPrice: 500 }), { canOverridePrice: false }).length).toBe(1);
    expect(validateLine(line({ unitPrice: 500 }), { canOverridePrice: true }).length).toBe(0);
    expect(validateLine(line({ discountAmount: 5000 }), { canOverridePrice: true }).length).toBe(1);
  });
});

describe('returns & collections', () => {
  const totals = calculateCart([line({ quantity: 3 })]);
  const sale: Sale = {
    id: 's1', number: 'S260926-0001', createdAt: '', userId: 'u', userName: 'U', customer: null, totals,
    payments: [{ method: 'cash', amount: totals.grandTotal }], amountPaid: totals.grandTotal, amountDue: 0,
    returned: { p1: 2 }, sync: 'synced',
  };
  it('cannot return more than remaining', () => {
    expect(validateReturn(sale, { p1: 2 }, 'damaged').errors.length).toBe(1);
    expect(validateReturn(sale, { p1: 1 }, 'damaged').errors).toEqual([]);
    expect(validateReturn(sale, { p1: 1 }, '').errors.length).toBe(1);
  });
  it('collection validation', () => {
    expect(validateCollection(0, customer()).errors.length).toBe(1);
    expect(validateCollection(100, customer({ outstanding: 50 })).warnings.length).toBe(1);
  });
});

describe('payloads & numbering', () => {
  it('builds a server sale payload', () => {
    const totals = calculateCart([line()]);
    const sale: Sale = {
      id: 's1', number: docNumber('S', 7, new Date(2026, 8, 26)), createdAt: '2026-09-26T07:00:00.000Z', userId: 'u1', userName: 'A',
      customer: { id: 'local-1', name: 'New Buyer', phone: '+91 9876543210' }, totals,
      payments: [{ method: 'credit', amount: totals.grandTotal }], amountPaid: 0, amountDue: totals.grandTotal, returned: {}, sync: 'pending',
    };
    const p = salePayload(sale, 'u1');
    expect(p.invoice_no).toBe('S260926-0007');
    expect(p.customer_uuid).toBeUndefined();
    expect(p.customer_phone).toBe('9876543210');
    expect(p.items[0].product_uuid).toBe('p1');
    expect(p.erp_user_id).toBe('u1');
  });
});
