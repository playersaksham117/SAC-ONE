import { AppError } from '../core/http.js';
import { generateId, nowIso } from '../core/utils.js';
import { istDate } from '../core/ist.js';
import { periodEnd, periodText } from '../core/warranty.js';
import { getDatabase } from '../database/connection.js';
import { authService } from './index.js';

/**
 * Serial numbers on invoice lines and Warranty Check: find a bill by invoice number or by a
 * unit's serial number and see each item's warranty / guarantee, the date it runs till and
 * whether it is still active.
 */

const db = () => getDatabase();

/** Serials typed or scanned: an array or text split by commas / new lines; trimmed, no repeats. */
export function cleanSerials(input, quantity, productName = 'item') {
  if (input === undefined || input === null || input === '') return [];
  const list = (Array.isArray(input) ? input : String(input).split(/[\n,;]+/))
    .map((s) => String(s ?? '').trim().replace(/\s+/g, ' '))
    .filter(Boolean);
  const seen = new Set();
  for (const s of list) {
    if (s.length > 40) throw new AppError(`${productName}: serial number "${s.slice(0, 20)}…" is too long`, 400);
    const key = s.toUpperCase();
    if (seen.has(key)) throw new AppError(`${productName}: serial number ${s} is entered twice`, 400);
    seen.add(key);
  }
  const qty = Math.floor(Number(quantity) || 0);
  if (qty > 0 && list.length > qty) throw new AppError(`${productName}: ${list.length} serial numbers for ${qty} unit${qty === 1 ? '' : 's'}`, 400);
  return list;
}

/** Serials of this product already on an active (not voided / cancelled) bill. */
function serialsInUse(productId, serials, exceptItemId = null) {
  if (!serials.length) return [];
  return db().prepare(`
    SELECT x.serial_number, s.invoice_number FROM sale_item_serials x
    JOIN pos_sales s ON s.id = x.sale_id
    WHERE x.product_id = ? AND s.status NOT IN ('voided', 'cancelled')
      AND UPPER(x.serial_number) IN (${serials.map(() => '?').join(',')})
      ${exceptItemId ? 'AND x.sale_item_id != ?' : ''}
  `).all(productId, ...serials.map((s) => s.toUpperCase()), ...(exceptItemId ? [exceptItemId] : []));
}

export function assertSerialsFree(productId, serials, productName, exceptItemId = null) {
  const clash = serialsInUse(productId, serials, exceptItemId)[0];
  if (clash) throw new AppError(`${productName}: serial number ${clash.serial_number} is already sold on ${clash.invoice_number}`, 409, 'SERIAL_SOLD');
}

function insertSerials(saleId, itemId, productId, serials, userId) {
  const ins = db().prepare('INSERT INTO sale_item_serials (id, sale_id, sale_item_id, product_id, serial_number, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)');
  for (const s of serials) ins.run(generateId(), saleId, itemId, productId, s, userId || null, nowIso());
}

/** saleItemId → [serial] for a sale (used when the sale is read). */
export function serialsBySaleItem(saleId) {
  const out = {};
  for (const r of db().prepare('SELECT sale_item_id, serial_number FROM sale_item_serials WHERE sale_id = ? ORDER BY created_at, serial_number').all(saleId)) {
    (out[r.sale_item_id] ||= []).push(r.serial_number);
  }
  return out;
}

/** After checkout: store the serials typed for each line. rows: [{ itemId, productId, serials }]. */
export function saveSaleSerials(saleId, rows, userId) {
  for (const r of rows) if (r.serials?.length) insertSerials(saleId, r.itemId, r.productId, r.serials, userId);
}

function status(startIso, value, unit, today) {
  if (!value || !unit) return null;
  const till = periodEnd(istDate(new Date(startIso)), value, unit);
  const daysLeft = Math.round((Date.parse(`${till}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400000);
  return { period: periodText(value, unit), till, daysLeft: Math.max(daysLeft, 0), active: daysLeft >= 0 };
}

export class WarrantyService {
  /** Search by invoice number (exact or part) or serial number. */
  check(query, actor) {
    authService.checkPermission(actor.permissions, 'pos.sales.view');
    return this.lookup(query);
  }

  /** The search itself (SAC-POS terminals call it with their device key). */
  lookup(query) {
    const q = String(query ?? '').trim();
    if (q.length < 2) throw new AppError('Type at least 2 characters of the invoice or serial number', 400);
    const bySerial = db().prepare(`
      SELECT DISTINCT x.sale_id FROM sale_item_serials x JOIN pos_sales s ON s.id = x.sale_id
      WHERE UPPER(x.serial_number) = UPPER(?) AND s.status != 'voided' LIMIT 20
    `).all(q).map((r) => r.sale_id);
    const byInvoice = db().prepare(`
      SELECT id FROM pos_sales WHERE status != 'voided' AND document_type IS NOT 'quotation'
        AND (UPPER(invoice_number) = UPPER(?) OR UPPER(invoice_number) LIKE UPPER(?))
      ORDER BY CASE WHEN UPPER(invoice_number) = UPPER(?) THEN 0 ELSE 1 END, created_at DESC LIMIT 20
    `).all(q, `%${q}%`, q).map((r) => r.id);
    const ids = [...new Set([...bySerial, ...byInvoice])].slice(0, 20);
    const today = istDate();
    const results = ids.map((id) => {
      const s = db().prepare(`
        SELECT s.id, s.invoice_number, s.created_at, s.completed_at, s.status, c.name AS customer_name, c.phone AS customer_phone, c.is_walk_in
        FROM pos_sales s LEFT JOIN customers c ON c.id = s.customer_id WHERE s.id = ?
      `).get(id);
      const start = s.completed_at || s.created_at;
      const serials = serialsBySaleItem(id);
      const lines = db().prepare('SELECT * FROM pos_sale_items WHERE sale_id = ? ORDER BY sort_order, product_name').all(id).map((l) => ({
        itemId: l.id,
        productId: l.product_id,
        productName: l.product_name,
        sku: l.sku,
        quantity: Number(l.quantity || 0),
        quantityReturned: Number(l.quantity_returned || 0),
        serials: serials[l.id] || [],
        warranty: status(start, l.warranty_value, l.warranty_unit, today),
        guarantee: status(start, l.guarantee_value, l.guarantee_unit, today),
      }));
      const hit = lines.flatMap((l) => l.serials).find((x) => x.toUpperCase() === q.toUpperCase()) || null;
      return {
        saleId: s.id,
        invoiceNumber: s.invoice_number,
        date: start,
        status: s.status,
        customerName: s.is_walk_in ? null : s.customer_name,
        customerPhone: s.is_walk_in ? null : s.customer_phone,
        matchedSerial: hit,
        // A serial search shows just that unit's line first.
        lines: hit ? [...lines].sort((a, b) => Number(b.serials.includes(hit)) - Number(a.serials.includes(hit))) : lines,
      };
    });
    return { query: q, today, results };
  }

  /** Add or correct the serial numbers of one invoice line later. */
  setSerials(saleId, itemId, serialsInput, actor) {
    authService.checkPermission(actor.permissions, 'pos.sales.create');
    const item = db().prepare('SELECT i.*, s.status FROM pos_sale_items i JOIN pos_sales s ON s.id = i.sale_id WHERE i.id = ? AND i.sale_id = ?').get(itemId, saleId);
    if (!item) throw new AppError('Invoice line not found', 404);
    if (item.status === 'voided') throw new AppError('This invoice was replaced by an edit; use the current one', 409);
    const serials = cleanSerials(serialsInput, item.quantity, item.product_name);
    assertSerialsFree(item.product_id, serials, item.product_name, itemId);
    db().transaction(() => {
      db().prepare('DELETE FROM sale_item_serials WHERE sale_item_id = ?').run(itemId);
      insertSerials(saleId, itemId, item.product_id, serials, actor.user.id);
    })();
    return { itemId, serials };
  }
}

export const warrantyService = new WarrantyService();
