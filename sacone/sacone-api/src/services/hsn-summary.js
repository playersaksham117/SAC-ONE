/**
 * HSN-wise stock summary: opening, IN (+), OUT (−) and closing quantity and value per HSN code
 * for a period, from the inventory movement ledger (the source of truth for stock).
 * Value = quantity × the product's purchase price (movements carry no cost), the same basis as
 * stock valuation elsewhere. Reservations are excluded: they do not change stock on hand.
 */

import { AppError } from '../core/http.js';
import { getDatabase } from '../database/connection.js';
import { MOVEMENT_TYPE_META } from '../core/inventory-constants.js';
import { authService } from './index.js';

const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const round3 = (n) => Math.round((Number(n) + Number.EPSILON) * 1000) / 1000;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const NO_HSN = 'No HSN';

const ON_HAND_TYPES = Object.entries(MOVEMENT_TYPE_META).filter(([, m]) => m.affectsOnHand).map(([t]) => t);

const emptyTotals = () => ({
  products: 0,
  openingQty: 0, openingValue: 0,
  inQty: 0, inValue: 0,
  outQty: 0, outValue: 0,
  closingQty: 0, closingValue: 0,
});

function addInto(target, row) {
  for (const key of ['openingQty', 'inQty', 'outQty', 'closingQty']) target[key] = round3(target[key] + row[key]);
  for (const key of ['openingValue', 'inValue', 'outValue', 'closingValue']) target[key] = round2(target[key] + row[key]);
}

export function hsnStockSummary({ dateFrom = '', dateTo = '', warehouseId = '', hsn = '' } = {}, actor) {
  authService.checkPermission(actor.permissions, 'inventory.stock.view');
  if (dateFrom && !DATE.test(dateFrom)) throw new AppError('dateFrom must be YYYY-MM-DD', 400);
  if (dateTo && !DATE.test(dateTo)) throw new AppError('dateTo must be YYYY-MM-DD', 400);
  if (dateFrom && dateTo && dateFrom > dateTo) throw new AppError('dateFrom is after dateTo', 400);

  const db = getDatabase();
  const params = {
    from: dateFrom || '0000-00-00',
    to: dateTo || '',
    wh: warehouseId || '',
  };
  const types = ON_HAND_TYPES.map((t) => `'${t}'`).join(',');
  // Movements up to the end of the period; created_at is an ISO timestamp.
  const scope = `
    m.status = 'completed' AND m.movement_type IN (${types})
    AND (@wh = '' OR m.warehouse_id = @wh)
    AND (@to = '' OR m.created_at < date(@to, '+1 day'))`;
  const inPeriod = `m.created_at >= @from`;

  const products = db.prepare(`
    SELECT p.id, p.name, p.sku, COALESCE(NULLIF(TRIM(p.hsn_code), ''), '${NO_HSN}') AS hsn,
           COALESCE(p.purchase_price, 0) AS cost,
           SUM(CASE WHEN m.created_at < @from THEN m.quantity_in - m.quantity_out ELSE 0 END) AS opening_qty,
           SUM(CASE WHEN ${inPeriod} THEN m.quantity_in ELSE 0 END) AS in_qty,
           SUM(CASE WHEN ${inPeriod} THEN m.quantity_out ELSE 0 END) AS out_qty
    FROM inventory_movements m
    JOIN products p ON p.id = m.product_id
    WHERE ${scope}
    GROUP BY p.id
  `).all(params);

  const byType = db.prepare(`
    SELECT COALESCE(NULLIF(TRIM(p.hsn_code), ''), '${NO_HSN}') AS hsn, m.movement_type,
           SUM(m.quantity_in) AS qin, SUM(m.quantity_out) AS qout,
           SUM(m.quantity_in * COALESCE(p.purchase_price, 0)) AS vin,
           SUM(m.quantity_out * COALESCE(p.purchase_price, 0)) AS vout
    FROM inventory_movements m
    JOIN products p ON p.id = m.product_id
    WHERE ${scope} AND ${inPeriod}
    GROUP BY hsn, m.movement_type
  `).all(params);

  const groups = new Map();
  const totals = emptyTotals();
  for (const p of products) {
    if (hsn && p.hsn !== hsn) continue;
    const openingQty = round3(p.opening_qty || 0);
    const inQty = round3(p.in_qty || 0);
    const outQty = round3(p.out_qty || 0);
    const closingQty = round3(openingQty + inQty - outQty);
    const row = {
      productId: p.id, name: p.name, sku: p.sku, cost: round2(p.cost),
      openingQty, openingValue: round2(openingQty * p.cost),
      inQty, inValue: round2(inQty * p.cost),
      outQty, outValue: round2(outQty * p.cost),
      closingQty, closingValue: round2(closingQty * p.cost),
    };
    if (!groups.has(p.hsn)) groups.set(p.hsn, { hsn: p.hsn, ...emptyTotals(), byType: {}, items: [] });
    const g = groups.get(p.hsn);
    g.items.push(row);
    g.products += 1;
    addInto(g, row);
    totals.products += 1;
    addInto(totals, row);
  }

  for (const t of byType) {
    const g = groups.get(t.hsn);
    if (!g) continue;
    g.byType[t.movement_type] = {
      label: MOVEMENT_TYPE_META[t.movement_type]?.label || t.movement_type,
      inQty: round3(t.qin || 0), outQty: round3(t.qout || 0),
      inValue: round2(t.vin || 0), outValue: round2(t.vout || 0),
    };
  }

  const rows = [...groups.values()]
    .map((g) => ({ ...g, items: g.items.sort((a, b) => a.name.localeCompare(b.name)) }))
    .sort((a, b) => (a.hsn === NO_HSN) - (b.hsn === NO_HSN) || a.hsn.localeCompare(b.hsn));

  return {
    period: { dateFrom: dateFrom || null, dateTo: dateTo || null, warehouseId: warehouseId || null },
    valuation: 'purchase_price',
    rows,
    totals,
  };
}
