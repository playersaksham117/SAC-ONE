import { describe, expect, it } from 'vitest';
import { calculateCart } from '../src/domain/tax';
import { belowMinPrice } from '../src/domain/validation';
import type { CartLine } from '../src/domain/types';

const line = (unitPrice: number): CartLine => ({
  productId: 'p1', name: 'Fan', sku: 'FAN', unit: 'NOS', quantity: 1, unitPrice, listPrice: 120, discountAmount: 0, gstRate: 18,
});

describe('retail price and minimum selling price', () => {
  const products = { p1: { price: 120, minPrice: 100 } }; // retail 120, minimum 100

  it('a discount down to the minimum is allowed', () => {
    expect(belowMinPrice(calculateCart([line(110)]), {}, products)).toEqual([]);
    expect(belowMinPrice(calculateCart([line(100)]), {}, products)).toEqual([]);
  });

  it('below the minimum is refused', () => {
    expect(belowMinPrice(calculateCart([line(95)]), {}, products)[0].message).toMatch(/lowest allowed price is 100\.00/);
  });

  it('a Commission-settings rule still wins', () => {
    expect(belowMinPrice(calculateCart([line(95)]), { p1: 90 }, products)).toEqual([]);
  });

  it('an older server (no minimum sent) keeps the price as the floor', () => {
    expect(belowMinPrice(calculateCart([line(110)]), {}, { p1: { price: 120 } }).length).toBe(1);
  });
});
