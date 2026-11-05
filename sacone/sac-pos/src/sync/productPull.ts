import type { ServerProduct } from '../api/sacone';
import { EPOCH, useCatalog } from '../store/catalog';

export type ProductPage = { products: ServerProduct[]; has_more: boolean; server_time: string; all_total?: number };

/**
 * Pull products changed since the phone's cursor. When the phone holds a different number of
 * products than the ERP has (another firm's items left from before, or products removed in the
 * ERP), everything is pulled again and products the server did not send are dropped.
 * Returns the new cursor (to save once the whole sync succeeds) and how many rows came in.
 */
export async function pullProducts(fetchPage: (since: string, page: number) => Promise<ProductPage>): Promise<{ cursor?: string; pulled: number; removed: number }> {
  const catalog = () => useCatalog.getState();
  let fullPull = catalog().productCursor === EPOCH;
  let received = new Set<string>();
  let cursor: string | undefined;
  let pulled = 0;
  let removed = 0;
  for (let page = 1; page < 200; page++) {
    const res = await fetchPage(catalog().productCursor, page);
    const held = Object.keys(catalog().products).length;
    if (page === 1 && !fullPull && res.all_total != null && held !== res.all_total) {
      catalog().setCursors({ productCursor: EPOCH });
      fullPull = true;
      received = new Set();
      cursor = undefined;
      page = 0;
      continue;
    }
    cursor ??= res.server_time;
    catalog().applyProducts(res.products);
    for (const p of res.products) if (p.uuid && p.approval_status !== 'rejected') received.add(p.uuid);
    pulled += res.products.length;
    if (!res.has_more) {
      if (fullPull) removed = catalog().keepOnlyProducts(received);
      break;
    }
  }
  return { cursor, pulled, removed };
}
