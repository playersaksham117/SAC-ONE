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
