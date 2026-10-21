import { getDatabase } from '../../database/connection.js';
import { generateId, nowIso } from '../../core/utils.js';
import { parseJsonObject } from '../../core/dispatch.js';

// Customer master lives in parties.js (shared by POS + CRM + future web store)
export { CustomerRepository } from './parties.js';

function mapSetting(row) {
  if (!row) return null;
  return {
    key: row.key,
    value: row.value,
    description: row.description,
    updatedAt: row.updated_at,
    updatedBy: row.updated_by,
  };
}

export class SystemSettingsRepository {
  get(key) {
    return mapSetting(getDatabase().prepare('SELECT * FROM system_settings WHERE key = ?').get(key));
  }

  getAll() {
    return getDatabase().prepare('SELECT * FROM system_settings ORDER BY key').all().map(mapSetting);
  }

  getBoolean(key, defaultValue = false) {
    const row = this.get(key);
    if (!row) return defaultValue;
    return ['1', 'true', 'yes', 'on'].includes(String(row.value).toLowerCase());
  }

  upsert(key, value, description, userId) {
    const db = getDatabase();
    const now = nowIso();
    db.prepare(`
      INSERT INTO system_settings (key, value, description, updated_at, updated_by)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET
        value = excluded.value,
        description = COALESCE(excluded.description, system_settings.description),
        updated_at = excluded.updated_at,
        updated_by = excluded.updated_by
    `).run(key, String(value), description || null, now, userId || null);
    return this.get(key);
  }
}

function mapSale(row) {
  if (!row) return null;
  return {
    id: row.id,
    invoiceNumber: row.invoice_number,
    warehouseId: row.warehouse_id,
    warehouseName: row.warehouse_name || null,
    customerId: row.customer_id,
    customerName: row.customer_name || null,
    customerPhone: row.customer_phone || null,
    customerIsWalkIn: row.customer_is_walk_in != null ? Boolean(row.customer_is_walk_in) : null,
    status: row.status,
    paymentStatus: row.payment_status,
    subtotal: Number(row.subtotal || 0),
    itemDiscountTotal: Number(row.item_discount_total || 0),
    invoiceDiscount: Number(row.invoice_discount || 0),
    taxableAmount: Number(row.taxable_amount || 0),
    cgstAmount: Number(row.cgst_amount || 0),
    sgstAmount: Number(row.sgst_amount || 0),
    igstAmount: Number(row.igst_amount || 0),
    gstAmount: Number(row.gst_amount || 0),
    grandTotal: Number(row.grand_total || 0),
    amountPaid: Number(row.amount_paid || 0),
    amountCredit: Number(row.amount_credit || 0),
    dueDate: row.due_date || null,
    dueAmount: Number(row.amount_credit || 0),
    notes: row.notes,
    customerPoNumber: row.customer_po_number || null,
    /** The phone's own bill reference for SAC-POS bills (the invoice number is the firm's series). */
    terminalRef: row.terminal_ref || null,
    customerPoDate: row.customer_po_date || null,
    transport: parseJsonObject(row.transport_details),
    shipTo: parseJsonObject(row.ship_to),
    heldBillId: row.held_bill_id,
    quotationId: row.quotation_id || null,
    firmId: row.firm_id || null,
    documentType: row.document_type || 'tax_invoice',
    salesAgentId: row.sales_agent_id || null,
    salesAgentName: row.sales_agent_name || null,
    createdBy: row.created_by,
    createdByName: row.created_by_name || null,
    createdAt: row.created_at,
    completedAt: row.completed_at,
  };
}

function mapSaleItem(row) {
  if (!row) return null;
  return {
    id: row.id,
    saleId: row.sale_id,
    productId: row.product_id,
    productName: row.product_name,
    sku: row.sku,
    hsnCode: row.hsn_code,
    unit: row.unit_abbreviation || null,
    quantity: Number(row.quantity || 0),
    unitPrice: Number(row.unit_price || 0),
    discountAmount: Number(row.discount_amount || 0),
    discountPercent: Number(row.discount_percent || 0),
    gstPercentage: Number(row.gst_percentage || 0),
    taxableAmount: Number(row.taxable_amount || 0),
    gstAmount: Number(row.gst_amount || 0),
    lineTotal: Number(row.line_total || 0),
    quantityReturned: Number(row.quantity_returned || 0),
    warrantyValue: row.warranty_value || null,
    warrantyUnit: row.warranty_value ? row.warranty_unit : null,
    guaranteeValue: row.guarantee_value || null,
    guaranteeUnit: row.guarantee_value ? row.guarantee_unit : null,
    shortDescription: row.short_description || null,
    movementId: row.movement_id,
    sortOrder: row.sort_order,
  };
}

function mapPayment(row) {
  if (!row) return null;
  return {
    id: row.id,
    saleId: row.sale_id,
    method: row.method,
    amount: Number(row.amount || 0),
    reference: row.reference,
    notes: row.notes,
    paymentAccountId: row.payment_account_id || null,
    paymentAccountName: row.payment_account_name || null,
    bankName: row.bank_name || null,
    createdBy: row.created_by,
    createdAt: row.created_at,
  };
}

function mapHeld(row) {
  if (!row) return null;
  return {
    id: row.id,
    holdNumber: row.hold_number,
    warehouseId: row.warehouse_id,
    customerId: row.customer_id,
    customerName: row.customer_name || null,
    cart: JSON.parse(row.cart_json || '[]'),
    invoiceDiscount: Number(row.invoice_discount || 0),
    notes: row.notes,
    status: row.status,
    createdBy: row.created_by,
    createdByName: row.created_by_name || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapReturn(row) {
  if (!row) return null;
  return {
    id: row.id,
    returnNumber: row.return_number,
    noteNumber: row.note_number || null,
    financialYear: row.financial_year || null,
    saleId: row.sale_id,
    invoiceNumber: row.invoice_number || null,
    invoiceDate: row.invoice_date || null,
    warehouseId: row.warehouse_id,
    warehouseName: row.warehouse_name || null,
    customerId: row.customer_id,
    customerName: row.customer_name || null,
    customerIsWalkIn: Boolean(row.customer_is_walk_in),
    status: row.status,
    subtotal: Number(row.subtotal || 0),
    gstAmount: Number(row.gst_amount || 0),
    cgstAmount: Number(row.cgst_amount || 0),
    sgstAmount: Number(row.sgst_amount || 0),
    igstAmount: Number(row.igst_amount || 0),
    grandTotal: Number(row.grand_total || 0),
    adjustedAmount: Number(row.adjusted_amount || 0),
    refundAmount: Number(row.refund_amount || 0),
    refundMethod: row.refund_method,
    reason: row.reason,
    notes: row.notes,
    createdBy: row.created_by,
    createdAt: row.created_at,
  };
}

const RETURN_SELECT = `
  SELECT r.*, s.invoice_number, s.created_at as invoice_date, c.name as customer_name,
         c.is_walk_in as customer_is_walk_in, w.name as warehouse_name
  FROM pos_sales_returns r
  LEFT JOIN pos_sales s ON s.id = r.sale_id
  LEFT JOIN customers c ON c.id = r.customer_id
  LEFT JOIN warehouses w ON w.id = r.warehouse_id
`;

const SALE_SELECT = `
  SELECT s.*,
    w.name as warehouse_name,
    c.name as customer_name,
    c.phone as customer_phone,
    c.is_walk_in as customer_is_walk_in,
    u.full_name as created_by_name,
    sa.name as sales_agent_name
  FROM pos_sales s
  LEFT JOIN warehouses w ON w.id = s.warehouse_id
  LEFT JOIN customers c ON c.id = s.customer_id
  LEFT JOIN users u ON u.id = s.created_by
  LEFT JOIN sales_agents sa ON sa.id = s.sales_agent_id
`;

export class PosSaleRepository {
  nextInvoiceNumber() {
    const count = getDatabase().prepare('SELECT COUNT(*) as count FROM pos_sales').get().count;
    return `INV-${String(count + 1).padStart(5, '0')}`;
  }

  findById(id) {
    const sale = mapSale(getDatabase().prepare(`${SALE_SELECT} WHERE s.id = ?`).get(id));
    if (!sale) return null;
    sale.items = this.listItems(id);
    sale.payments = this.listPayments(id);
    return sale;
  }

  findByInvoiceNumber(invoiceNumber) {
    const row = getDatabase().prepare(`${SALE_SELECT} WHERE s.invoice_number = ?`).get(invoiceNumber);
    if (!row) return null;
    return this.findById(row.id);
  }

  listItems(saleId) {
    const serials = {};
    for (const r of getDatabase().prepare('SELECT sale_item_id, serial_number FROM sale_item_serials WHERE sale_id = ? ORDER BY created_at, serial_number').all(saleId)) {
      (serials[r.sale_item_id] ||= []).push(r.serial_number);
    }
    return getDatabase().prepare(`
      SELECT i.*, u.abbreviation AS unit_abbreviation FROM pos_sale_items i LEFT JOIN products p ON p.id = i.product_id LEFT JOIN units u ON u.id = p.unit_id
      WHERE i.sale_id = ? ORDER BY i.sort_order ASC, i.product_name ASC
    `).all(saleId).map((row) => ({ ...mapSaleItem(row), serialNumbers: serials[row.id] || [] }));
  }

  /** Customer receipts already allocated against this invoice. */
  receiptAllocationCount(saleId) {
    return getDatabase().prepare(`
      SELECT COUNT(*) AS c FROM customer_receipt_allocations WHERE document_id = ?
    `).get(saleId).c;
  }

  commissionPaid(saleId) {
    return Number(getDatabase().prepare(
      'SELECT COALESCE(SUM(commission_paid), 0) AS paid FROM sale_commissions WHERE sale_id = ?',
    ).get(saleId).paid || 0);
  }

  cancelCommissions(saleId, remark) {
    getDatabase().prepare(`
      UPDATE sale_commissions
      SET status = 'cancelled', commission_eligible = 0, commission_due = 0, remarks = ?, updated_at = ?
      WHERE sale_id = ? AND status != 'cancelled'
    `).run(remark, nowIso(), saleId);
  }

  /** Mark voided (deleted); optionally move it aside under a new number so an edit can reuse the old one. */
  markVoided(saleId, { note, newInvoiceNumber = null }) {
    getDatabase().prepare(`
      UPDATE pos_sales
      SET status = 'voided',
          invoice_number = COALESCE(?, invoice_number),
          notes = TRIM(COALESCE(notes, '') || CASE WHEN COALESCE(notes, '') = '' THEN '' ELSE ' · ' END || ?)
      WHERE id = ?
    `).run(newInvoiceNumber, note, saleId);
  }

  /** Free suffix for the voided copy of an edited invoice: INV-1 → INV-1-E1, INV-1-E2 … */
  editedCopyNumber(invoiceNumber) {
    const db = getDatabase();
    for (let i = 1; ; i += 1) {
      const candidate = `${invoiceNumber}-E${i}`;
      if (!db.prepare('SELECT 1 FROM pos_sales WHERE invoice_number = ?').get(candidate)) return candidate;
    }
  }

  /** An edited invoice keeps its original date and creator. */
  restoreOrigin(saleId, { createdAt, createdBy }) {
    getDatabase().prepare('UPDATE pos_sales SET created_at = ?, created_by = ? WHERE id = ?').run(createdAt, createdBy, saleId);
  }

  listPayments(saleId) {
    return getDatabase().prepare(`
      SELECT p.*, a.name AS payment_account_name, a.bank_name
      FROM pos_payments p LEFT JOIN financial_payment_accounts a ON a.id = p.payment_account_id
      WHERE p.sale_id = ? ORDER BY p.created_at ASC
    `).all(saleId).map(mapPayment);
  }

  findAll({ search = '', customerId = '', warehouseId = '', status = '', dateFrom = '', dateTo = '', includeVoided = false, limit = 50, offset = 0 } = {}) {
    const db = getDatabase();
    const where = [];
    const params = [];
    if (search) {
      where.push('(s.invoice_number LIKE ? OR c.name LIKE ? OR c.phone LIKE ? OR s.customer_po_number LIKE ?)');
      const q = `%${search}%`;
      params.push(q, q, q, q);
    }
    if (customerId) {
      where.push('s.customer_id = ?');
      params.push(customerId);
    }
    if (warehouseId) {
      where.push('s.warehouse_id = ?');
      params.push(warehouseId);
    }
    if (status) {
      where.push('s.status = ?');
      params.push(status);
    } else if (!includeVoided) {
      where.push("s.status != 'voided'");
    }
    // Dates are YYYY-MM-DD, inclusive; created_at is an ISO timestamp.
    if (dateFrom) {
      where.push('s.created_at >= ?');
      params.push(dateFrom);
    }
    if (dateTo) {
      where.push("s.created_at < date(?, '+1 day')");
      params.push(dateTo);
    }
    const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const items = db.prepare(`
      ${SALE_SELECT} ${clause}
      ORDER BY s.created_at DESC
      LIMIT ? OFFSET ?
    `).all(...params, limit, offset).map(mapSale);
    const total = db.prepare(`
      SELECT COUNT(*) as count FROM pos_sales s
      LEFT JOIN customers c ON c.id = s.customer_id
      ${clause}
    `).get(...params).count;
    return { items, total, limit, offset };
  }

  create({ header, items, payments }) {
    const db = getDatabase();
    const id = generateId();
    const now = nowIso();
    const invoiceNumber = header.invoiceNumber || this.nextInvoiceNumber();

    const tx = db.transaction(() => {
      db.prepare(`
        INSERT INTO pos_sales (
          id, invoice_number, warehouse_id, customer_id, status, payment_status,
          subtotal, item_discount_total, invoice_discount, taxable_amount,
          cgst_amount, sgst_amount, igst_amount, gst_amount, grand_total,
          amount_paid, amount_credit, notes, held_bill_id, quotation_id, firm_id, document_type,
          sales_agent_id, created_by, created_at, completed_at, due_date
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id,
        invoiceNumber,
        header.warehouseId,
        header.customerId,
        header.status || 'completed',
        header.paymentStatus,
        header.subtotal,
        header.itemDiscountTotal,
        header.invoiceDiscount,
        header.taxableAmount,
        header.cgstAmount,
        header.sgstAmount,
        header.igstAmount,
        header.gstAmount,
        header.grandTotal,
        header.amountPaid,
        header.amountCredit,
        header.notes || null,
        header.heldBillId || null,
        header.quotationId || null,
        header.firmId || null,
        header.documentType || 'tax_invoice',
        header.salesAgentId || null,
        header.createdBy || null,
        now,
        header.completedAt || now,
        header.dueDate || null
      );

      const insertItem = db.prepare(`
        INSERT INTO pos_sale_items (
          id, sale_id, product_id, product_name, sku, hsn_code, quantity, unit_price,
          discount_amount, discount_percent, gst_percentage, taxable_amount, gst_amount,
          line_total, quantity_returned, movement_id, sort_order
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
      `);

      items.forEach((item, index) => {
        insertItem.run(
          item.id || generateId(),
          id,
          item.productId,
          item.productName,
          item.sku || null,
          item.hsnCode || null,
          item.quantity,
          item.unitPrice,
          item.discountAmount,
          item.discountPercent,
          item.gstPercentage,
          item.taxableAmount,
          item.gstAmount,
          item.lineTotal,
          item.movementId || null,
          index
        );
      });

      const insertPay = db.prepare(`
        INSERT INTO pos_payments (id, sale_id, method, amount, reference, notes, payment_account_id, created_by, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const pay of payments) {
        insertPay.run(
          generateId(),
          id,
          pay.method,
          pay.amount,
          pay.reference || null,
          pay.notes || null,
          pay.paymentAccountId || null,
          header.createdBy || null,
          now
        );
      }
    });

    tx();
    return this.findById(id);
  }

  setDispatch(id, { transport, shipTo }) {
    getDatabase().prepare('UPDATE pos_sales SET transport_details = ?, ship_to = ? WHERE id = ?')
      .run(transport ? JSON.stringify(transport) : null, shipTo ? JSON.stringify(shipTo) : null, id);
  }

  /** Copy each line's product warranty / guarantee onto the invoice (kept even if the product changes). */
  snapshotPeriods(saleId) {
    getDatabase().prepare(`
      UPDATE pos_sale_items SET
        warranty_value = (SELECT p.warranty_value FROM products p WHERE p.id = pos_sale_items.product_id),
        warranty_unit = (SELECT p.warranty_unit FROM products p WHERE p.id = pos_sale_items.product_id),
        guarantee_value = (SELECT p.guarantee_value FROM products p WHERE p.id = pos_sale_items.product_id),
        guarantee_unit = (SELECT p.guarantee_unit FROM products p WHERE p.id = pos_sale_items.product_id),
        short_description = (SELECT p.short_description FROM products p WHERE p.id = pos_sale_items.product_id)
      WHERE sale_id = ?
    `).run(saleId);
  }

  setTerminalRef(id, terminalRef) {
    getDatabase().prepare('UPDATE pos_sales SET terminal_ref = ? WHERE id = ?').run(terminalRef, id);
  }

  setCustomerPo(id, { number, date }) {
    getDatabase().prepare('UPDATE pos_sales SET customer_po_number = ?, customer_po_date = ? WHERE id = ?')
      .run(number || null, date || null, id);
  }

  updateItemMovement(itemId, movementId) {
    getDatabase().prepare('UPDATE pos_sale_items SET movement_id = ? WHERE id = ?').run(movementId, itemId);
  }

  updateStatus(id, status) {
    getDatabase().prepare('UPDATE pos_sales SET status = ? WHERE id = ?').run(status, id);
    return this.findById(id);
  }

  addReturnedQuantity(itemId, qty) {
    getDatabase().prepare(`
      UPDATE pos_sale_items SET quantity_returned = quantity_returned + ? WHERE id = ?
    `).run(Number(qty), itemId);
  }
}

export class PosHeldBillRepository {
  nextHoldNumber() {
    const count = getDatabase().prepare('SELECT COUNT(*) as count FROM pos_held_bills').get().count;
    return `HOLD-${String(count + 1).padStart(4, '0')}`;
  }

  findById(id) {
    return mapHeld(getDatabase().prepare(`
      SELECT h.*, c.name as customer_name, u.full_name as created_by_name
      FROM pos_held_bills h
      LEFT JOIN customers c ON c.id = h.customer_id
      LEFT JOIN users u ON u.id = h.created_by
      WHERE h.id = ?
    `).get(id));
  }

  findHeld({ warehouseId = '', limit = 50 } = {}) {
    const params = [];
    let where = "WHERE h.status = 'held'";
    if (warehouseId) {
      where += ' AND h.warehouse_id = ?';
      params.push(warehouseId);
    }
    return getDatabase().prepare(`
      SELECT h.*, c.name as customer_name, u.full_name as created_by_name
      FROM pos_held_bills h
      LEFT JOIN customers c ON c.id = h.customer_id
      LEFT JOIN users u ON u.id = h.created_by
      ${where}
      ORDER BY h.created_at DESC
      LIMIT ?
    `).all(...params, limit).map(mapHeld);
  }

  create(data) {
    const id = generateId();
    const now = nowIso();
    const holdNumber = data.holdNumber || this.nextHoldNumber();
    getDatabase().prepare(`
      INSERT INTO pos_held_bills (
        id, hold_number, warehouse_id, customer_id, cart_json, invoice_discount,
        notes, status, created_by, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'held', ?, ?, ?)
    `).run(
      id,
      holdNumber,
      data.warehouseId,
      data.customerId || null,
      JSON.stringify(data.cart || []),
      Number(data.invoiceDiscount || 0),
      data.notes || null,
      data.createdBy || null,
      now,
      now
    );
    return this.findById(id);
  }

  markResumed(id) {
    getDatabase().prepare(`
      UPDATE pos_held_bills SET status = 'resumed', updated_at = ? WHERE id = ?
    `).run(nowIso(), id);
    return this.findById(id);
  }

  cancel(id) {
    getDatabase().prepare(`
      UPDATE pos_held_bills SET status = 'cancelled', updated_at = ? WHERE id = ?
    `).run(nowIso(), id);
    return this.findById(id);
  }
}

export class PosReturnRepository {
  nextReturnNumber() {
    const count = getDatabase().prepare('SELECT COUNT(*) as count FROM pos_sales_returns').get().count;
    return `RET-${String(count + 1).padStart(5, '0')}`;
  }

  findById(id) {
    const row = getDatabase().prepare(`${RETURN_SELECT} WHERE r.id = ?`).get(id);
    if (!row) return null;
    const ret = mapReturn(row);
    ret.items = getDatabase().prepare(`
      SELECT ri.*, COALESCE(si.product_name, p.name) as product_name, COALESCE(si.sku, p.sku) as sku,
             COALESCE(si.hsn_code, p.hsn_code) as hsn_code, u.abbreviation as unit_abbreviation
      FROM pos_sales_return_items ri
      LEFT JOIN pos_sale_items si ON si.id = ri.sale_item_id
      LEFT JOIN products p ON p.id = ri.product_id
      LEFT JOIN units u ON u.id = p.unit_id
      WHERE ri.return_id = ?
    `).all(id).map((item) => ({
      id: item.id,
      returnId: item.return_id,
      saleItemId: item.sale_item_id,
      productId: item.product_id,
      productName: item.product_name,
      sku: item.sku,
      hsnCode: item.hsn_code,
      unit: item.unit_abbreviation || null,
      quantity: Number(item.quantity),
      unitPrice: Number(item.unit_price),
      gstPercentage: Number(item.gst_percentage),
      taxableAmount: Number(item.taxable_amount),
      gstAmount: Number(item.gst_amount),
      lineTotal: Number(item.line_total),
      movementId: item.movement_id,
    }));
    return ret;
  }

  findAll({
    saleId = '', customerId = '', financialYear = '', search = '', dateFrom = '', dateTo = '', limit = 50, offset = 0,
  } = {}) {
    const params = [];
    const conditions = [];
    if (saleId) {
      conditions.push('r.sale_id = ?');
      params.push(saleId);
    }
    if (customerId) { conditions.push('r.customer_id = ?'); params.push(customerId); }
    if (financialYear) { conditions.push('r.financial_year = ?'); params.push(financialYear); }
    if (search) {
      conditions.push('(r.note_number LIKE ? OR r.return_number LIKE ? OR s.invoice_number LIKE ? OR c.name LIKE ? OR c.phone LIKE ?)');
      const like = `%${search}%`;
      params.push(like, like, like, like, like);
    }
    if (dateFrom) { conditions.push('substr(r.created_at, 1, 10) >= ?'); params.push(dateFrom); }
    if (dateTo) { conditions.push('substr(r.created_at, 1, 10) <= ?'); params.push(dateTo); }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const db = getDatabase();
    const items = db.prepare(`
      ${RETURN_SELECT}
      ${where}
      ORDER BY r.created_at DESC
      LIMIT ? OFFSET ?
    `).all(...params, limit, offset).map(mapReturn);
    const total = db.prepare(`
      SELECT COUNT(*) as count FROM pos_sales_returns r
      LEFT JOIN pos_sales s ON s.id = r.sale_id
      LEFT JOIN customers c ON c.id = r.customer_id
      ${where}
    `).get(...params).count;
    return { items, total, limit, offset };
  }

  /** Returns still without a credit-note number (made before notes existed), oldest first. */
  findWithoutNoteNumber() {
    return getDatabase().prepare(`
      SELECT id, created_at FROM pos_sales_returns WHERE note_number IS NULL ORDER BY created_at ASC
    `).all();
  }

  setNoteNumber(id, noteNumber, financialYear) {
    getDatabase().prepare('UPDATE pos_sales_returns SET note_number = ?, financial_year = ? WHERE id = ?')
      .run(noteNumber, financialYear, id);
  }

  /** Takes a credit note off the invoice's unpaid balance (amount_credit). */
  reduceSaleDue(saleId, amount) {
    const db = getDatabase();
    const sale = db.prepare('SELECT amount_paid, amount_credit FROM pos_sales WHERE id = ?').get(saleId);
    if (!sale) return;
    const credit = Math.max(0, Math.round((Number(sale.amount_credit) - amount + Number.EPSILON) * 100) / 100);
    const status = credit <= 0.001 ? 'paid' : (Number(sale.amount_paid) > 0.001 ? 'partial' : 'credit');
    db.prepare('UPDATE pos_sales SET amount_credit = ?, payment_status = ? WHERE id = ?').run(credit, status, saleId);
  }

  create({ header, items }) {
    const db = getDatabase();
    const id = generateId();
    const now = nowIso();
    const returnNumber = header.returnNumber || this.nextReturnNumber();

    const tx = db.transaction(() => {
      db.prepare(`
        INSERT INTO pos_sales_returns (
          id, return_number, sale_id, warehouse_id, customer_id, status,
          subtotal, gst_amount, grand_total, refund_method, reason, notes, created_by, created_at,
          note_number, financial_year, cgst_amount, sgst_amount, igst_amount, adjusted_amount, refund_amount
        ) VALUES (?, ?, ?, ?, ?, 'completed', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id,
        returnNumber,
        header.saleId,
        header.warehouseId,
        header.customerId,
        header.subtotal,
        header.gstAmount,
        header.grandTotal,
        header.refundMethod,
        header.reason || null,
        header.notes || null,
        header.createdBy || null,
        now,
        header.noteNumber || null,
        header.financialYear || null,
        header.cgstAmount || 0,
        header.sgstAmount || 0,
        header.igstAmount || 0,
        header.adjustedAmount || 0,
        header.refundAmount || 0
      );

      const insert = db.prepare(`
        INSERT INTO pos_sales_return_items (
          id, return_id, sale_item_id, product_id, quantity, unit_price,
          gst_percentage, taxable_amount, gst_amount, line_total, movement_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const item of items) {
        insert.run(
          item.id || generateId(),
          id,
          item.saleItemId,
          item.productId,
          item.quantity,
          item.unitPrice,
          item.gstPercentage,
          item.taxableAmount,
          item.gstAmount,
          item.lineTotal,
          item.movementId || null
        );
      }
    });

    tx();
    return this.findById(id);
  }

  updateItemMovement(itemId, movementId) {
    getDatabase().prepare('UPDATE pos_sales_return_items SET movement_id = ? WHERE id = ?')
      .run(movementId, itemId);
  }
}
