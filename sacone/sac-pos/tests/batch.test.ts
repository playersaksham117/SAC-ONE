import { describe, expect, it, vi } from 'vitest';
import type { CartLine, Sale } from '../src/domain/types';

vi.mock('@react-native-async-storage/async-storage', () => {
  const m = new Map<string, string>();
  return { default: { getItem: async (k: string) => m.get(k) ?? null, setItem: async (k: string, v: string) => { m.set(k, v); }, removeItem: async (k: string) => { m.delete(k); } } };
});
vi.mock('react-native', () => ({ Platform: { OS: 'android' } }));

const { calculateCart } = await import('../src/domain/tax');
const { salePayload } = await import('../src/domain/payloads');
const { lineNote } = await import('../src/domain/warranty');
const { useCart, lineKey } = await import('../src/store/cart');

const line = (patch: Partial<CartLine> = {}): CartLine => ({
  productId: 'p1', name: 'Fan', sku: 'FAN', unit: 'NOS', quantity: 1, unitPrice: 100, listPrice: 100, discountAmount: 0, gstRate: 18, ...patch,
});

describe('batch numbers on bill lines', () => {
  it('prints the batch under the item, before serials and warranty', () => {
    expect(lineNote({ batchNumber: 'B2611', serialNumbers: ['S1'] }, '2026-11-24T05:00:00Z')).toBe('Batch B2611 · S/N S1');
    expect(lineNote({}, '2026-11-24T05:00:00Z')).toBe('');
  });

  it('sends the batch of each line when the bill syncs', () => {
    const totals = calculateCart([line({ batchNumber: 'B1' }), line({ lineId: 'p1#2', quantity: 2, batchNumber: null })]);
    const sale: Sale = {
      id: 's1', number: 'S261124-0001', createdAt: '2026-11-24T05:00:00Z', userId: 'u', userName: 'U', customer: null, totals,
      payments: [{ method: 'cash', amount: totals.grandTotal }], amountPaid: totals.grandTotal, amountDue: 0, returned: {}, sync: 'pending',
    };
    const p = salePayload(sale, 'u');
    expect(p.items[0].batch_number).toBe('B1');
    expect(p.items[1].batch_number).toBeUndefined();
  });

  it('two lines of one product keep their own batches', () => {
    const cart = useCart.getState();
    cart.clear();
    const product = { id: 'p9', name: 'Lug', sku: 'LUG', unit: 'NOS', price: 10, gstRate: 18, stock: 100 } as never;
    cart.add(product, 1);
    cart.add(product, 1, { newLine: true });
    const [a, b] = useCart.getState().lines;
    cart.updateLine(lineKey(a), { batchNumber: 'A1' });
    cart.updateLine(lineKey(b), { batchNumber: 'B2' });
    expect(useCart.getState().lines.map((l) => l.batchNumber)).toEqual(['A1', 'B2']);
    cart.clear();
  });
});
