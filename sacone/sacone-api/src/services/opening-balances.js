/**
 * Opening stock and opening balances for going live on SACONE.
 *
 *   Opening stock     → `opening_stock` inventory movements (the only way stock changes), so
 *                       stock levels, valuation and SAC-POS phones all follow. An optional cost
 *                       updates the product's purchase price, which drives stock valuation.
 *   Customer / supplier opening dues → `opening_balances` rows. The amount is added to the
 *                       party's outstanding (credit limits, SAC-POS dues), shown as the first
 *                       line of statements, and listed in outstanding / ageing. Payments made
 *                       "on account" (not allocated to a bill) settle it first.
 *   Cash / bank / UPI → the existing opening balance on each payment account (finance API).
 */

import { AppError } from '../core/http.js';
import { generateId, nowIso } from '../core/utils.js';
import { getDatabase } from '../database/connection.js';
import { repos } from '../repositories/index.js';
import { authService } from './index.js';
import { inventoryMovementService } from './inventory.js';
import { MOVEMENT_TYPES } from '../core/inventory-constants.js';

const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const today = () => new Date().toISOString().slice(0, 10);

const PARTY = {
  customer: { table: 'customers', view: 'parties.customers.view', edit: 'parties.customers.edit', adjust: (id, d) => repos.customers.adjustOutstanding(id, d) },
  supplier: { table: 'suppliers', view: 'parties.suppliers.view', edit: 'parties.suppliers.edit', adjust: (id, d) => repos.suppliers.adjustPayable(id, d) },
};

function partySpec(type) {
  const spec = PARTY[type];
  if (!spec) throw new AppError('type must be customer or supplier', 400);
  return spec;
}

/**
 * Opening balance still unpaid: on-account (unallocated) receipts / payment vouchers settle the
 * oldest debt first. Exported for statements and outstanding lists.
 */
export function openingBalanceFor(type, partyId) {
  const db = getDatabase();
  const row = db.prepare('SELECT * FROM opening_balances WHERE party_type = ? AND party_id = ?').get(type, partyId);
  if (!row || Math.abs(row.amount) < 0.001) return null;
  const unallocated = type === 'customer'
    ? db.prepare(`SELECT COALESCE(SUM(unallocated_amount), 0) AS u FROM customer_receipts WHERE customer_id = ? AND status = 'posted'`).get(partyId).u
    : db.prepare(`SELECT COALESCE(SUM(unallocated_amount), 0) AS u FROM supplier_payment_vouchers WHERE supplier_id = ? AND status = 'posted'`).get(partyId).u;
  const remaining = row.amount > 0 ? round2(Math.max(0, row.amount - Number(unallocated || 0))) : round2(row.amount);
  return { id: row.id, amount: round2(row.amount), remaining, asOfDate: row.as_of_date, notes: row.notes };
}

/** All non-zero opening balances of one party type (for outstanding / ageing lists). */
export function openingBalancesOf(type) {
  const rows = getDatabase().prepare('SELECT party_id FROM opening_balances WHERE party_type = ? AND amount > 0.001').all(type);
  return rows.map((r) => ({ partyId: r.party_id, ...openingBalanceFor(type, r.party_id) })).filter((b) => b.remaining > 0.001);
}

export class OpeningBalanceService {
  /* ───────────── opening stock ───────────── */

  stockSheet({ warehouseId, search = '' } = {}, actor) {
    authService.checkPermission(actor.permissions, 'inventory.stock.view');
    const warehouse = warehouseId ? repos.warehouses.findById(warehouseId) : repos.warehouses.findDefault();
    if (!warehouse) throw new AppError('Create a warehouse first (Operations → Warehouse)', 400);
    const q = `%${String(search).trim()}%`;
    const items = getDatabase().prepare(`
      SELECT p.id, p.sku, p.name, p.barcode, p.purchase_price, p.selling_price,
             COALESCE(s.quantity_on_hand, 0) AS on_hand,
             COALESCE((SELECT SUM(m.quantity_in) FROM inventory_movements m
                       WHERE m.product_id = p.id AND m.warehouse_id = @wh
                         AND m.movement_type = 'opening_stock' AND m.status = 'completed'), 0) AS opening_qty
      FROM products p
      LEFT JOIN stock_levels s ON s.product_id = p.id AND s.warehouse_id = @wh
      WHERE p.is_active = 1 AND (@search = '%%' OR p.name LIKE @search OR p.sku LIKE @search OR p.barcode LIKE @search)
      ORDER BY p.name COLLATE NOCASE
      LIMIT 1000
    `).all({ wh: warehouse.id, search: q });
    return {
      warehouse: { id: warehouse.id, code: warehouse.code, name: warehouse.name },
      items: items.map((r) => ({
        id: r.id, sku: r.sku, name: r.name, barcode: r.barcode,
        purchasePrice: Number(r.purchase_price || 0), sellingPrice: Number(r.selling_price || 0),
        onHand: Number(r.on_hand || 0), openingQty: Number(r.opening_qty || 0),
      })),
    };
  }

  /**
   * Post opening stock lines: [{ productId | sku | barcode, quantity, unitCost? }].
   * All lines are validated first; then everything is posted in one transaction.
   */
  postOpeningStock({ warehouseId, lines = [], asOfDate } = {}, actor, req) {
    authService.checkPermission(actor.permissions, 'inventory.movements.create');
    const warehouse = warehouseId ? repos.warehouses.findById(warehouseId) : repos.warehouses.findDefault();
    if (!warehouse?.isActive) throw new AppError('Choose an active warehouse', 400);
    const date = DATE.test(String(asOfDate || '')) ? asOfDate : today();

    const errors = [];
    const resolved = [];
    lines.forEach((line, i) => {
      const qty = Number(line.quantity);
      if (!(qty > 0)) return; // blank rows are skipped
      const product = (line.productId && repos.products.findById(line.productId))
        || (line.sku && repos.products.findBySku(String(line.sku).trim()))
        || (line.barcode && repos.products.findByBarcode(String(line.barcode).trim()));
      if (!product) { errors.push(`Line ${i + 1}: product ${line.sku || line.barcode || line.productId || '?'} not found`); return; }
      if (!product.isActive) { errors.push(`Line ${i + 1}: ${product.name} is inactive`); return; }
      const cost = line.unitCost === '' || line.unitCost == null ? null : Number(line.unitCost);
      if (cost !== null && !(cost >= 0)) { errors.push(`Line ${i + 1}: cost must be 0 or more`); return; }
      resolved.push({ product, qty, cost });
    });
    if (errors.length) throw new AppError(`Nothing was posted. ${errors.slice(0, 10).join('; ')}`, 400, 'OPENING_STOCK_INVALID');
    if (!resolved.length) throw new AppError('Enter a quantity for at least one product', 400);

    const db = getDatabase();
    const setCost = db.prepare('UPDATE products SET purchase_price = ?, updated_at = ? WHERE id = ?');
    const post = db.transaction(() => resolved.map(({ product, qty, cost }) => {
      if (cost !== null && Math.abs(cost - Number(product.purchasePrice || 0)) > 0.0001) setCost.run(cost, nowIso(), product.id);
      return inventoryMovementService.recordOpeningStock({
        productId: product.id,
        warehouseId: warehouse.id,
        quantity: qty,
        referenceType: 'opening_balance',
        reason: 'Opening stock',
        notes: `Opening stock as of ${date}`,
      }, actor, req);
    }));
    const movements = post();
    return {
      posted: movements.length,
      totalQuantity: round2(resolved.reduce((s, l) => s + l.qty, 0)),
      warehouse: { id: warehouse.id, name: warehouse.name },
      movementType: MOVEMENT_TYPES.OPENING_STOCK,
    };
  }

  /* ───────────── customer / supplier opening dues ───────────── */

  partySheet({ type, search = '' } = {}, actor) {
    const spec = partySpec(type);
    authService.checkPermission(actor.permissions, spec.view);
    const q = `%${String(search).trim()}%`;
    const balanceCol = type === 'customer' ? 'outstanding_balance' : 'outstanding_payable';
    const walkIn = type === 'customer' ? 'AND p.is_walk_in = 0' : '';
    const rows = getDatabase().prepare(`
      SELECT p.id, p.code, p.name, p.phone, p.${balanceCol} AS outstanding, ob.amount AS opening_amount, ob.as_of_date, ob.notes
      FROM ${spec.table} p
      LEFT JOIN opening_balances ob ON ob.party_type = @type AND ob.party_id = p.id
      WHERE p.is_active = 1 ${walkIn} AND (@search = '%%' OR p.name LIKE @search OR p.code LIKE @search OR p.phone LIKE @search)
      ORDER BY p.name COLLATE NOCASE
      LIMIT 2000
    `).all({ type, search: q });
    return rows.map((r) => ({
      id: r.id, code: r.code, name: r.name, phone: r.phone,
      outstanding: round2(r.outstanding || 0),
      openingAmount: round2(r.opening_amount || 0),
      asOfDate: r.as_of_date || null,
      notes: r.notes || null,
    }));
  }

  /** Set opening dues: [{ partyId, amount, asOfDate?, notes? }]. Re-saving replaces, never doubles. */
  saveParty({ type, entries = [] } = {}, actor, req) {
    const spec = partySpec(type);
    authService.checkPermission(actor.permissions, spec.edit);
    const db = getDatabase();
    const find = db.prepare('SELECT * FROM opening_balances WHERE party_type = ? AND party_id = ?');
    const insert = db.prepare(`
      INSERT INTO opening_balances (id, party_type, party_id, amount, as_of_date, notes, created_by, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const update = db.prepare('UPDATE opening_balances SET amount = ?, as_of_date = ?, notes = ?, updated_at = ? WHERE id = ?');
    const exists = db.prepare(`SELECT id, name FROM ${spec.table} WHERE id = ?`);

    const changes = [];
    const apply = db.transaction(() => {
      for (const e of entries) {
        const party = exists.get(e.partyId);
        if (!party) throw new AppError(`${type} ${e.partyId} not found`, 404);
        const amount = round2(Number(e.amount) || 0);
        const date = DATE.test(String(e.asOfDate || '')) ? e.asOfDate : today();
        const prev = find.get(type, e.partyId);
        const delta = round2(amount - (prev?.amount || 0));
        if (prev) update.run(amount, date, e.notes ?? prev.notes ?? null, nowIso(), prev.id);
        else if (Math.abs(amount) >= 0.001) insert.run(generateId(), type, e.partyId, amount, date, e.notes ?? null, actor.user.id, nowIso(), nowIso());
        else continue;
        if (Math.abs(delta) >= 0.001) spec.adjust(e.partyId, delta);
        changes.push({ partyId: e.partyId, name: party.name, previous: round2(prev?.amount || 0), amount, delta });
      }
    });
    apply();

    if (changes.length) {
      repos.auditLogs.create({
        userId: actor.user.id,
        userName: actor.user.fullName,
        action: 'update',
        module: 'parties',
        recordType: `${type}_opening_balance`,
        recordId: changes.length === 1 ? changes[0].partyId : null,
        newValue: { changes },
        ipAddress: req?.ip,
        userAgent: req?.headers?.['user-agent'],
      });
    }
    return { saved: changes.length, changes };
  }
}

export const openingBalanceService = new OpeningBalanceService();
