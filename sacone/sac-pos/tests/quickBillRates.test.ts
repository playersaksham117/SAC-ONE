import { describe, expect, it } from 'vitest';
import { billDiscountExclGst, billDiscountInclGst, calculateCart, exclGst, inclGst } from '../src/domain/tax';
import type { CartLine } from '../src/domain/types';

const line = (p: Partial<CartLine>): CartLine => ({
  productId: 'p', name: 'Item', sku: 'S', hsn: '', unit: 'pcs', quantity: 1, unitPrice: 100, listPrice: 100, discountAmount: 0, gstRate: 18, ...p,
} as CartLine);

describe('Quick Bill: rates typed incl. GST, bill keeps the price before GST', () => {
  it('shows the list price incl. GST', () => {
    expect(inclGst(100, 18)).toBe(118);
    expect(inclGst(84.75, 18)).toBe(100.01);
  });

  it('typing the list rate back keeps the list price exactly', () => {
    expect(exclGst(118, 18, 100)).toBe(100);
  });

  it('a typed rate incl. GST becomes the price before GST; the ERP formula gives the rate back', () => {
    const unitPrice = exclGst(100, 18, 120);
    expect(unitPrice).toBeCloseTo(84.7458, 4);
    const t = calculateCart([line({ unitPrice, listPrice: 120, quantity: 3 })]);
    expect(t.taxableAmount).toBe(254.24); // booked before GST: the ERP works out GST, margin, profit
    expect(t.gstAmount).toBe(45.76);
    expect(t.grandTotal).toBe(300); // 3 × ₹100 incl. GST
  });

  it('a bill discount typed incl. GST lowers the total by that much, across GST rates', () => {
    const lines = [line({ productId: 'a', unitPrice: 100, gstRate: 18 }), line({ productId: 'b', unitPrice: 200, gstRate: 5 })];
    const before = calculateCart(lines).grandTotal; // 118 + 210 = 328
    const disc = billDiscountExclGst(28, lines);
    expect(calculateCart(lines, disc).grandTotal).toBe(before - 28);
    expect(billDiscountInclGst(disc, lines)).toBe(28);
  });

  it('a line discount typed incl. GST', () => {
    const t = calculateCart([line({ discountAmount: exclGst(18, 18) })]); // ₹118 − ₹18 incl. GST
    expect(t.grandTotal).toBe(100);
  });
});
