import { getDb } from "../erp/db.mjs";

export type ErpInventoryItem = {
  id: string;
  name: string;
  sku: string;
  category: string;
  brand: string | null;
  selling_price: number | string;
  description: string | null;
};

function asRows<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

/** Live ERP catalog from the master DB (Postgres or pg-mem). */
export function fetchErpInventoryItems(): ErpInventoryItem[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT id, name, sku, category, brand, selling_price, description
       FROM inventory_items
       WHERE is_deleted = 0
       ORDER BY name`
    )
    .all();
  return asRows<ErpInventoryItem>(rows);
}

/** Warehouse quantities keyed by inventory item id. */
export function fetchErpStockByItem(): Map<string, number> {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT item_id, COALESCE(SUM(quantity), 0) AS qty
       FROM stock
       GROUP BY item_id`
    )
    .all();
  const map = new Map<string, number>();
  for (const row of asRows<{ item_id: string; qty: number | string }>(rows)) {
    map.set(row.item_id, Number(row.qty) || 0);
  }
  return map;
}

export function extractApiKey(headers: Headers): string {
  const headerKey = headers.get("x-api-key")?.trim() || "";
  if (headerKey) return headerKey;
  const auth = headers.get("authorization") || "";
  return auth.replace(/^Bearer\s+/i, "").trim();
}
