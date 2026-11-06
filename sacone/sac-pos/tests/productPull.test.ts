import { beforeEach, describe, expect, it, vi } from 'vitest';

// The phone's AsyncStorage needs a browser / device: keep the stores in memory here.
vi.mock('../src/store/persist', async () => {
  const { createJSONStorage } = await import('zustand/middleware');
  const mem = new Map<string, string>();
  return {
    jsonStorage: createJSONStorage(() => ({
      getItem: (k: string) => mem.get(k) ?? null,
      setItem: (k: string, v: string) => { mem.set(k, v); },
      removeItem: (k: string) => { mem.delete(k); },
    })),
  };
});
import type { ServerProduct } from '../src/api/sacone';
import { EPOCH, useCatalog } from '../src/store/catalog';
import { pullProducts, type ProductPage } from '../src/sync/productPull';

const prod = (uuid: string, extra: Partial<ServerProduct> = {}) =>
  ({ uuid, name: uuid.toUpperCase(), sku: uuid, is_active: true, approval_status: 'approved', updated_at: '2026-11-05T10:00:00.000Z', ...extra }) as ServerProduct;

/** A fake server: `all` is every product of the firm; changed since a cursor = `changed`. */
function server(all: ServerProduct[], changed: ServerProduct[] = []) {
  const calls: string[] = [];
  const fetchPage = vi.fn(async (since: string, page: number): Promise<ProductPage> => {
    calls.push(since);
    const rows = since === EPOCH ? all : changed;
    return { products: page === 1 ? rows : [], has_more: false, server_time: '2026-11-05T12:00:00.000Z', all_total: page === 1 ? all.length : undefined };
  });
  return { fetchPage, calls };
}

beforeEach(() => useCatalog.getState().reset());

describe('pulling products onto the phone', () => {
  it('first pull takes everything', async () => {
    const s = server([prod('a'), prod('b')]);
    const r = await pullProducts(s.fetchPage);
    expect(Object.keys(useCatalog.getState().products).sort()).toEqual(['a', 'b']);
    expect(r.cursor).toBe('2026-11-05T12:00:00.000Z');
    expect(s.calls).toEqual([EPOCH]);
  });

  it('an up-to-date phone only pulls what changed', async () => {
    useCatalog.getState().applyProducts([prod('a'), prod('b')]);
    useCatalog.getState().setCursors({ productCursor: '2026-11-05T11:00:00.000Z' });
    const s = server([prod('a'), prod('b', { selling_price: 99 })], [prod('b', { selling_price: 99 })]);
    const r = await pullProducts(s.fetchPage);
    expect(s.calls).toEqual(['2026-11-05T11:00:00.000Z']);
    expect(r.removed).toBe(0);
    expect(useCatalog.getState().products.b.price).toBe(99);
  });

  it('products the ERP does not have (another firm, removed) are dropped', async () => {
    useCatalog.getState().applyProducts([prod('a'), prod('old-firm-1'), prod('old-firm-2')]);
    useCatalog.getState().setCursors({ productCursor: '2026-11-05T11:00:00.000Z' });
    const s = server([prod('a'), prod('b')]);
    const r = await pullProducts(s.fetchPage);
    expect(s.calls).toEqual(['2026-11-05T11:00:00.000Z', EPOCH]);
    expect(Object.keys(useCatalog.getState().products).sort()).toEqual(['a', 'b']);
    expect(r.removed).toBe(2);
  });

  it('a phone missing products pulls them all again', async () => {
    useCatalog.getState().applyProducts([prod('a')]);
    useCatalog.getState().setCursors({ productCursor: '2026-11-05T11:00:00.000Z' });
    await pullProducts(server([prod('a'), prod('b'), prod('c')]).fetchPage);
    expect(Object.keys(useCatalog.getState().products).sort()).toEqual(['a', 'b', 'c']);
  });

  it('an older server (no all_total) works as before', async () => {
    useCatalog.getState().applyProducts([prod('a'), prod('x')]);
    useCatalog.getState().setCursors({ productCursor: '2026-11-05T11:00:00.000Z' });
    const fetchPage = async (): Promise<ProductPage> => ({ products: [], has_more: false, server_time: 'T' });
    const r = await pullProducts(fetchPage);
    expect(r.removed).toBe(0);
    expect(Object.keys(useCatalog.getState().products)).toHaveLength(2);
  });
});
