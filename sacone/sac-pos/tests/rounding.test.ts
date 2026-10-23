import { describe, expect, it } from 'vitest';
import { calculateCart, roundRupee } from '../src/domain/tax';
import type { CartLine } from '../src/domain/types';

const line = (unitPrice: number, gstRate = 18): CartLine => ({
  productId: 'p', name: 'Item', sku: 'I', unit: 'pcs', quantity: 1, unitPrice, listPrice: unitPrice, discountAmount: 0, gstRate,
});

describe('final amount in whole rupees', () => {
  it('.50 and above goes up, below .50 goes down', () => {
    expect(roundRupee(100.5)).toBe(101);
    expect(roundRupee(100.49)).toBe(100);
    expect(roundRupee(100.01)).toBe(100);
    expect(roundRupee(100.99)).toBe(101);
    expect(roundRupee(100)).toBe(100);
  });
  it('bill total is rounded, round off shown, tax unchanged', () => {
    const t = calculateCart([line(85)]); // 85 + 15.30 = 100.30
    expect(t.gstAmount).toBe(15.3);
    expect(t.grandTotal).toBe(100);
    expect(t.roundOff).toBe(-0.3);
    const u = calculateCart([line(85.5)]); // 85.50 + 15.39 = 100.89
    expect(u.grandTotal).toBe(101);
    expect(u.roundOff).toBe(0.11);
  });
});
