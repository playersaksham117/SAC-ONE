import { AppError } from '../core/http.js';
import { getDatabase } from '../database/connection.js';
import { authService } from './index.js';

/**
 * Batch numbers. A batch is "registered" when it is on a purchase bill line; sale lines (SAC-POS /
 * ERP) carry the batch they sold from, registered or not. The register lists every product +
 * batch with what came in (bills, suppliers, dates) and what went out (net of returns).
 */

const db = () => getDatabase();
const r3 = (n) => Math.round((Number(n) || 0) * 1000) / 1000;

/** Purchase side: product + batch → bills it came in on. */
function receivedRows(where = '', params = []) {
  return db().prepare(`
    SELECT i.product_id, UPPER(i.batch_number) AS batch, i.batch_number, i.quantity, b.id AS bill_id, b.bill_number,
      b.supplier_invoice_number, substr(b.bill_date, 1, 10) AS bill_date, s.name AS supplier_name,
      p.name AS product_name, p.sku
    FROM supplier_bill_items i
    JOIN supplier_bills b ON b.id = i.bill_id AND b.status != 'cancelled'
    LEFT JOIN suppliers s ON s.id = b.supplier_id
    LEFT JOIN products p ON p.id = i.product_id
    WHERE i.batch_number IS NOT NULL AND TRIM(i.batch_number) != '' ${where}
    ORDER BY b.bill_date, b.bill_number
  `).all(...params);
}

/** Sale side: product + batch → quantity sold (less returns) and the number of bills. */
function soldRows(where = '', params = []) {
  return db().prepare(`
    SELECT i.product_id, UPPER(i.batch_number) AS batch, i.batch_number,
      SUM(i.quantity - COALESCE(i.quantity_returned, 0)) AS sold, COUNT(DISTINCT i.sale_id) AS bills,
      MAX(COALESCE(s.completed_at, s.created_at)) AS last_sold, MAX(i.product_name) AS product_name, MAX(i.sku) AS sku
    FROM pos_sale_items i
    JOIN pos_sales s ON s.id = i.sale_id AND s.status NOT IN ('voided', 'cancelled') AND s.document_type IS NOT 'quotation'
    WHERE i.batch_number IS NOT NULL AND TRIM(i.batch_number) != '' ${where}
    GROUP BY i.product_id, UPPER(i.batch_number)
  `).all(...params);
}

function merge(received, sold) {
  const map = new Map();
  const key = (pid, batch) => `${pid}|${batch}`;
  for (const r of received) {
    const k = key(r.product_id, r.batch);
    const e = map.get(k) || {
      productId: r.product_id, productName: r.product_name, sku: r.sku, batchNumber: r.batch,
      registered: true, received: 0, sold: 0, saleBills: 0, lastSold: null, bills: [],
    };
    e.received = r3(e.received + Number(r.quantity || 0));
    e.bills.push({ billId: r.bill_id, billNumber: r.bill_number, supplierInvoiceNumber: r.supplier_invoice_number || null, date: r.bill_date, supplierName: r.supplier_name, quantity: Number(r.quantity || 0) });
    map.set(k, e);
  }
  for (const r of sold) {
    const k = key(r.product_id, r.batch);
    const e = map.get(k) || {
      productId: r.product_id, productName: r.product_name, sku: r.sku, batchNumber: r.batch,
      registered: false, received: 0, sold: 0, saleBills: 0, lastSold: null, bills: [],
    };
    e.sold = r3(r.sold);
    e.saleBills = r.bills;
    e.lastSold = r.last_sold;
    map.set(k, e);
  }
  return [...map.values()].map((e) => ({
    ...e,
    firstReceived: e.bills[0]?.date || null,
    balance: e.registered ? r3(e.received - e.sold) : null,
  }));
}

export class BatchService {
  /** Batch Register: every product + batch, newest first. Filters: q (batch / product / bill / supplier), productId, status. */
  register(filters = {}, actor) {
    authService.checkAnyPermission(actor.permissions, ['pos.sales.view', 'purchases.bills.view']);
    const q = String(filters.q || '').trim();
    let rows = merge(
      receivedRows(filters.productId ? 'AND i.product_id = ?' : '', filters.productId ? [filters.productId] : []),
      soldRows(filters.productId ? 'AND i.product_id = ?' : '', filters.productId ? [filters.productId] : []),
    );
    if (q) {
      const t = q.toUpperCase();
      rows = rows.filter((r) => r.batchNumber.includes(t) || String(r.productName || '').toUpperCase().includes(t) || String(r.sku || '').toUpperCase().includes(t)
        || r.bills.some((b) => String(b.billNumber || '').toUpperCase().includes(t) || String(b.supplierName || '').toUpperCase().includes(t) || String(b.supplierInvoiceNumber || '').toUpperCase().includes(t)));
    }
    if (filters.status === 'registered') rows = rows.filter((r) => r.registered);
    if (filters.status === 'unregistered') rows = rows.filter((r) => !r.registered);
    if (filters.status === 'in_stock') rows = rows.filter((r) => r.registered && r.balance > 0);
    rows.sort((a, b) => String(b.firstReceived || b.lastSold || '').localeCompare(String(a.firstReceived || a.lastSold || '')) || a.batchNumber.localeCompare(b.batchNumber));
    const summary = {
      batches: rows.length,
      registered: rows.filter((r) => r.registered).length,
      unregistered: rows.filter((r) => !r.registered).length,
    };
    return { items: rows.slice(0, Number(filters.limit) || 500), summary };
  }

  /** Registered batches of one product (the ones still in stock first), for picking on a sale line. */
  forProduct(productId) {
    if (!productId) throw new AppError('Product is required', 400);
    const rows = merge(receivedRows('AND i.product_id = ?', [productId]), soldRows('AND i.product_id = ?', [productId]))
      .filter((r) => r.registered);
    rows.sort((a, b) => Number(b.balance > 0) - Number(a.balance > 0) || String(b.firstReceived).localeCompare(String(a.firstReceived)));
    return { productId, batches: rows.map((r) => ({ batchNumber: r.batchNumber, received: r.received, sold: r.sold, balance: r.balance, firstReceived: r.firstReceived })) };
  }

  forProductChecked(productId, actor) {
    authService.checkAnyPermission(actor.permissions, ['pos.sales.view', 'pos.sales.create', 'purchases.bills.view']);
    return this.forProduct(productId);
  }

  /** Where a batch came from (Warranty Check): exact batch number, optionally one product. */
  origin(batchNumber, productId = null) {
    const b = String(batchNumber || '').trim();
    if (!b) return null;
    const rows = merge(
      receivedRows(`AND UPPER(i.batch_number) = UPPER(?)${productId ? ' AND i.product_id = ?' : ''}`, productId ? [b, productId] : [b]),
      soldRows(`AND UPPER(i.batch_number) = UPPER(?)${productId ? ' AND i.product_id = ?' : ''}`, productId ? [b, productId] : [b]),
    );
    return rows;
  }
}

export const batchService = new BatchService();
