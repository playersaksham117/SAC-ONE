import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@react-native-async-storage/async-storage', () => {
  const m = new Map<string, string>();
  return { default: { getItem: async (k: string) => m.get(k) ?? null, setItem: async (k: string, v: string) => { m.set(k, v); }, removeItem: async (k: string) => { m.delete(k); } } };
});
vi.mock('react-native', () => ({ Platform: { OS: 'android' } }));

const { useCart, lineKey } = await import('../src/store/cart');
const { nextTap, MULTI_TAP_MS } = await import('../src/store/prefs');
const { calculateCart, linesByProduct, lineRefundValue } = await import('../src/domain/tax');
const { validateReturn } = await import('../src/domain/validation');
import type { CartLine, Product, Sale } from '../src/domain/types';

const product = (id: string, price = 100): Product => ({
  id, name: `Item ${id}`, sku: id.toUpperCase(), unit: 'PCS', gstRate: 18, mrp: price, price,
  onHand: 10, available: 10, isActive: true, updatedAt: '',
});
const cart = () => useCart.getState();

/** What the Sell screen does on each tap (see tapProduct in sell.tsx). */
function tap(p: Product, at: number, state: { track: ReturnType<typeof nextTap>['track'] | null }) {
  const prev = state.track;
  const { track, third } = nextTap(prev, p.id, at, () => cart().lines);
  state.track = track;
  if (!third) { cart().add(p, 1); return; }
  cart().restoreLines(prev!.before as CartLine[]);
  cart().add(p, 1, { newLine: true });
}

describe('triple tap: new line in the cart', () => {
  beforeEach(() => cart().clear());

  it('single and double taps still add to the same line', () => {
    const p = product('a'); const s = { track: null };
    tap(p, 0, s); tap(p, 200, s);
    expect(cart().lines).toHaveLength(1);
    expect(cart().lines[0].quantity).toBe(2);
  });

  it('three quick taps on a product already on the bill add one on the next line', () => {
    const p = product('a'); const s = { track: null };
    cart().add(p, 1);
    tap(p, 1000, s); tap(p, 1200, s); tap(p, 1400, s);
    expect(cart().lines.map((l) => [lineKey(l), l.quantity])).toEqual([['a', 1], ['a#2', 1]]);
  });

  it('three quick taps on a new product give one line of 1', () => {
    const p = product('a'); const s = { track: null };
    tap(p, 0, s); tap(p, 100, s); tap(p, 200, s);
    expect(cart().lines.map((l) => [lineKey(l), l.quantity])).toEqual([['a', 1]]);
  });

  it('slow taps are just taps', () => {
    const p = product('a'); const s = { track: null };
    tap(p, 0, s); tap(p, MULTI_TAP_MS + 50, s); tap(p, 2 * MULTI_TAP_MS + 100, s);
    expect(cart().lines).toHaveLength(1);
    expect(cart().lines[0].quantity).toBe(3);
  });

  it('later taps go to the newest line; each line is edited and removed on its own', () => {
    const p = product('a');
    cart().add(p, 1);
    cart().add(p, 1, { newLine: true });
    cart().add(p, 1, { newLine: true });
    cart().add(p, 4);
    expect(cart().lines.map((l) => [lineKey(l), l.quantity])).toEqual([['a', 1], ['a#2', 1], ['a#3', 5]]);
    cart().updateLine('a#2', { unitPrice: 80, shortDescription: 'Fitted' });
    cart().setQty('a', 3);
    cart().remove('a#3');
    expect(cart().lines.map((l) => [lineKey(l), l.quantity, l.unitPrice, l.shortDescription])).toEqual([
      ['a', 3, 100, null], ['a#2', 1, 80, 'Fitted'],
    ]);
  });

  it('the bill keeps both lines and returns treat the product as one item', () => {
    const p = product('a');
    cart().add(p, 2);
    cart().add(p, 1, { newLine: true });
    cart().updateLine('a#2', { unitPrice: 50 });
    const totals = calculateCart(cart().lines);
    expect(totals.lines).toHaveLength(2);
    const merged = linesByProduct(totals.lines);
    expect(merged).toHaveLength(1);
    expect(merged[0].quantity).toBe(3);
    expect(merged[0].lineTotal).toBeCloseTo(totals.lines[0].lineTotal + totals.lines[1].lineTotal, 2);
    expect(lineRefundValue(merged[0], 3)).toBeCloseTo(merged[0].lineTotal, 2);
    const sale = { totals, returned: {} } as unknown as Sale;
    expect(validateReturn(sale, { a: 3 }, 'damaged').errors).toEqual([]);
    expect(validateReturn(sale, { a: 4 }, 'damaged').errors.length).toBe(1);
  });
});
