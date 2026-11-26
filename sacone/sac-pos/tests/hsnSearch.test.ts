import { describe, expect, it, vi } from 'vitest';

vi.mock('../src/store/persist', async () => {
  const { createJSONStorage } = await import('zustand/middleware');
  const mem = new Map<string, string>();
  return { jsonStorage: createJSONStorage(() => ({ getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => { mem.set(k, v); }, removeItem: (k: string) => { mem.delete(k); } })) };
});
const { searchProducts } = await import('../src/store/catalog');

const p = (id: string, name: string, hsn: string | null) => ({ id, name, sku: `S-${id}`, barcode: null, brand: null, hsn, isActive: true }) as never;

describe('product search', () => {
  it('finds products by HSN code', () => {
    const products = { a: p('a', '3 Pin Top', '85366910'), b: p('b', 'LED Bulb', '85395000'), c: p('c', 'Wire', null) };
    expect(searchProducts(products, '8536').map((x: { id: string }) => x.id)).toEqual(['a']);
    expect(searchProducts(products, '853').map((x: { id: string }) => x.id)).toEqual(['a', 'b']);
  });
});

describe('word-by-word product search', () => {
  const p = (id: string, name: string, extra: Record<string, unknown> = {}) => ({ id, name, sku: id.toUpperCase(), isActive: true, price: 1, gstRate: 18, unit: 'NOS', ...extra });
  const products = Object.fromEntries([
    p('a', 'COPPER TUBULAR LUG ECONOMY 16 SQ.MM 6.4MM HOLE ASCON', { brand: 'ASCON' }),
    p('b', 'COPPER TUBULAR LUG ECONOMY 160 SQ.MM ASCON', { brand: 'ASCON' }),
    p('c', 'ALUMINIUM TUBULAR LUG 16 SQ.MM', { brand: 'LOCAL' }),
    p('d', 'LED BATTEN 22W', { brand: 'STURLITE', category: 'LED LIGHTINGS' }),
  ].map((x) => [x.id, x])) as never;
  it('finds every word in any order, whole-word matches first', () => {
    expect(searchProducts(products, 'copper lug 16').map((x: { id: string }) => x.id)).toEqual(['a', 'b']);
    expect(searchProducts(products, 'lug 16 ascon')[0].id).toBe('a');
  });
  it('searches brand and category too', () => {
    expect(searchProducts(products, 'sturlite batten').map((x: { id: string }) => x.id)).toEqual(['d']);
    expect(searchProducts(products, 'lightings').map((x: { id: string }) => x.id)).toEqual(['d']);
  });
  it('an exact code still comes first', () => {
    expect(searchProducts(products, 'C')[0].id).toBe('c');
  });
});

describe('search by the supplier price-list heading (description)', () => {
  const products = {
    l: { id: 'l', name: 'COPPER TUBULAR LUG ECONOMY 16 SQ.MM 6.4MM HOLE ASCON', sku: 'ACUS-09', isActive: true, price: 23, gstRate: 18, unit: 'NOS',
      description: 'COPPER TUBULAR CABLE LUG TERMINAL ENDS, ECONOMY SERIES. STD. PKG 400 PCS.' },
    f: { id: 'f', name: 'COPPER FERRULE ECONOMY 16 SQ.MM ASCON', sku: 'ACB-6', isActive: true, price: 16, gstRate: 18, unit: 'NOS',
      description: 'COPPER TUBULAR FERRULE (IN-LINE CONNECTOR), ECONOMY SERIES.' },
  } as never;
  it('finds the lug by words that are only in its description', () => {
    expect(searchProducts(products, 'COPPER TUBULAR CABLE LUG TERMINAL ENDS').map((x: { id: string }) => x.id)).toEqual(['l']);
    expect(searchProducts(products, 'terminal ends 16').map((x: { id: string }) => x.id)).toEqual(['l']);
  });
});
