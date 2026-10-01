import { getDatabase } from '../../database/connection.js';
import { generateId, nowIso } from '../../core/utils.js';

export function round2(n) {
  return Math.round((Number(n || 0) + Number.EPSILON) * 100) / 100;
}

export function allocationStatus(amount, allocated) {
  const a = round2(amount);
  const alloc = round2(allocated);
  if (alloc <= 0.001) return 'unallocated';
  if (alloc + 0.001 >= a) return 'full';
  return 'partial';
}

/** Map stored payment_status + due to display labels from the plan. */
export function resolveInvoicePaymentDisplay({ paymentStatus, amountCredit, dueDate, today = new Date().toISOString().slice(0, 10) }) {
  const due = round2(amountCredit);
  if (due <= 0.001) {
    return { paymentStatus: 'paid', displayStatus: 'Paid', isOverdue: false, dueAmount: 0 };
  }
  const overdue = Boolean(dueDate && dueDate < today);
  if (overdue) {
    return {
      paymentStatus: paymentStatus === 'partial' ? 'partial' : 'unpaid',
      displayStatus: 'Overdue',
      isOverdue: true,
      dueAmount: due,
    };
  }
  if (paymentStatus === 'partial' || (paymentStatus === 'credit' && due > 0)) {
    const paidSomething = paymentStatus === 'partial';
    return {
      paymentStatus: paidSomething ? 'partial' : 'unpaid',
      displayStatus: paidSomething ? 'Partially Paid' : 'Unpaid',
      isOverdue: false,
      dueAmount: due,
    };
  }
  return {
    paymentStatus: paymentStatus || 'unpaid',
    displayStatus: paymentStatus === 'paid' ? 'Paid' : 'Unpaid',
    isOverdue: false,
    dueAmount: due,
  };
}

export function ageingBucket(daysOverdue) {
  if (daysOverdue <= 0) return 'current';
  if (daysOverdue <= 30) return '1-30';
  if (daysOverdue <= 60) return '31-60';
  if (daysOverdue <= 90) return '61-90';
  if (daysOverdue <= 180) return '91-180';
  return '180+';
}

export const AGEING_BUCKETS = ['current', '1-30', '31-60', '61-90', '91-180', '180+'];

function mapReceipt(row) {
  if (!row) return null;
  return {
    id: row.id,
    voucherNumber: row.voucher_number,
    firmId: row.firm_id,
    receiptDate: row.receipt_date,
    customerId: row.customer_id,
    customerName: row.customer_name || null,
    customerGstin: row.customer_gst || null,
    customerPhone: row.customer_phone || null,
    paymentMode: row.payment_mode,
    paymentAccountId: row.payment_account_id,
    paymentAccountName: row.payment_account_name || null,
    amount: round2(row.amount),
    allocatedAmount: round2(row.allocated_amount),
    unallocatedAmount: round2(row.unallocated_amount),
    allocationStatus: row.allocation_status,
    status: row.status,
    referenceNumber: row.reference_number,
    utrNumber: row.utr_number,
    transactionId: row.transaction_id,
    chequeNumber: row.cheque_number,
    chequeDate: row.cheque_date,
    chequeBank: row.cheque_bank,
    remarks: row.remarks,
    bankTransactionId: row.bank_transaction_id || null,
    postedAt: row.posted_at,
    cancelledAt: row.cancelled_at,
    cancelReason: row.cancel_reason,
    reversalOfId: row.reversal_of_id,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapPv(row) {
  if (!row) return null;
  return {
    id: row.id,
    voucherNumber: row.voucher_number,
    firmId: row.firm_id,
    paymentDate: row.payment_date,
    supplierId: row.supplier_id,
    supplierName: row.supplier_name || null,
    supplierGstin: row.supplier_gst || null,
    supplierPhone: row.supplier_phone || null,
    paymentMode: row.payment_mode,
    paymentAccountId: row.payment_account_id,
    paymentAccountName: row.payment_account_name || null,
    amount: round2(row.amount),
    allocatedAmount: round2(row.allocated_amount),
    unallocatedAmount: round2(row.unallocated_amount),
    allocationStatus: row.allocation_status,
    status: row.status,
    referenceNumber: row.reference_number,
    utrNumber: row.utr_number,
    transactionId: row.transaction_id,
    chequeNumber: row.cheque_number,
    chequeDate: row.cheque_date,
    chequeBank: row.cheque_bank,
    remarks: row.remarks,
    bankTransactionId: row.bank_transaction_id || null,
    postedAt: row.posted_at,
    cancelledAt: row.cancelled_at,
    cancelReason: row.cancel_reason,
    reversalOfId: row.reversal_of_id,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapAlloc(row) {
  if (!row) return null;
  return {
    id: row.id,
    receiptId: row.receipt_id || null,
    voucherId: row.voucher_id || null,
    documentType: row.document_type,
    documentId: row.document_id,
    documentNumber: row.document_number || null,
    documentDate: row.document_date || null,
    documentAmount: row.document_amount != null ? round2(row.document_amount) : null,
    previousDue: row.previous_due != null ? round2(row.previous_due) : null,
    allocatedAmount: round2(row.allocated_amount),
    remainingDue: row.remaining_due != null ? round2(row.remaining_due) : null,
    createdAt: row.created_at,
  };
}

function mapCash(row) {
  if (!row) return null;
  return {
    id: row.id,
    entryDate: row.entry_date,
    firmId: row.firm_id,
    paymentAccountId: row.payment_account_id,
    paymentAccountName: row.payment_account_name || null,
    accountType: row.account_type || null,
    direction: row.direction,
    amount: round2(row.amount),
    paymentMode: row.payment_mode,
    reference: row.reference,
    sourceType: row.source_type,
    sourceId: row.source_id,
    status: row.status,
    createdBy: row.created_by,
    createdAt: row.created_at,
  };
}

const RECEIPT_SELECT = `
  SELECT r.*,
    c.name as customer_name, c.gst_number as customer_gst, c.phone as customer_phone,
    a.name as payment_account_name
  FROM customer_receipts r
  LEFT JOIN customers c ON c.id = r.customer_id
  LEFT JOIN financial_payment_accounts a ON a.id = r.payment_account_id
`;

const PV_SELECT = `
  SELECT v.*,
    s.name as supplier_name, s.gst_number as supplier_gst, s.phone as supplier_phone,
    a.name as payment_account_name
  FROM supplier_payment_vouchers v
  LEFT JOIN suppliers s ON s.id = v.supplier_id
  LEFT JOIN financial_payment_accounts a ON a.id = v.payment_account_id
`;

export class CustomerReceiptRepository {
  findById(id) {
    return mapReceipt(getDatabase().prepare(`${RECEIPT_SELECT} WHERE r.id = ?`).get(id));
  }

  list({ customerId, status, firmId, dateFrom, dateTo, limit = 50, offset = 0 } = {}) {
    const db = getDatabase();
    const where = [];
    const params = [];
    if (customerId) { where.push('r.customer_id = ?'); params.push(customerId); }
    if (status) { where.push('r.status = ?'); params.push(status); }
    if (firmId) { where.push('r.firm_id = ?'); params.push(firmId); }
    if (dateFrom) { where.push('r.receipt_date >= ?'); params.push(dateFrom); }
    if (dateTo) { where.push('r.receipt_date <= ?'); params.push(dateTo); }
    const wh = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const items = db.prepare(`
      ${RECEIPT_SELECT} ${wh}
      ORDER BY r.receipt_date DESC, r.created_at DESC
      LIMIT ? OFFSET ?
    `).all(...params, limit, offset).map(mapReceipt);
    const total = db.prepare(`SELECT COUNT(*) as count FROM customer_receipts r ${wh}`).get(...params).count;
    return { items, total, limit, offset };
  }

  listAllocations(receiptId) {
    return getDatabase().prepare(`
      SELECT a.*,
        s.invoice_number as document_number,
        COALESCE(s.completed_at, s.created_at) as document_date,
        s.grand_total as document_amount,
        s.amount_credit as previous_due
      FROM customer_receipt_allocations a
      LEFT JOIN pos_sales s ON a.document_type = 'sales_invoice' AND s.id = a.document_id
      WHERE a.receipt_id = ?
      ORDER BY a.created_at ASC
    `).all(receiptId).map((row) => {
      const mapped = mapAlloc(row);
      if (mapped.documentType === 'sales_invoice' && mapped.previousDue != null) {
        mapped.remainingDue = round2(Math.max(0, mapped.previousDue - mapped.allocatedAmount));
      }
      return mapped;
    });
  }

  create(data) {
    const id = generateId();
    const now = nowIso();
    const amount = round2(data.amount);
    const allocated = round2(data.allocatedAmount || 0);
    getDatabase().prepare(`
      INSERT INTO customer_receipts (
        id, voucher_number, firm_id, receipt_date, customer_id, payment_mode, payment_account_id,
        amount, allocated_amount, unallocated_amount, allocation_status, status,
        reference_number, utr_number, transaction_id, cheque_number, cheque_date, cheque_bank,
        remarks, bank_transaction_id, created_by, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      data.voucherNumber,
      data.firmId || null,
      data.receiptDate || now.slice(0, 10),
      data.customerId,
      data.paymentMode,
      data.paymentAccountId || null,
      amount,
      allocated,
      round2(amount - allocated),
      allocationStatus(amount, allocated),
      data.referenceNumber || null,
      data.utrNumber || null,
      data.transactionId || null,
      data.chequeNumber || null,
      data.chequeDate || null,
      data.chequeBank || null,
      data.remarks || null,
      data.bankTransactionId || null,
      data.createdBy || null,
      now,
      now
    );
    if (Array.isArray(data.allocations)) {
      this.replaceAllocations(id, data.allocations);
    }
    return this.findById(id);
  }

  updateDraft(id, data) {
    const existing = this.findById(id);
    if (!existing) return null;
    const now = nowIso();
    const amount = data.amount != null ? round2(data.amount) : existing.amount;
    const allocated = data.allocatedAmount != null ? round2(data.allocatedAmount) : existing.allocatedAmount;
    getDatabase().prepare(`
      UPDATE customer_receipts SET
        receipt_date = ?, payment_mode = ?, payment_account_id = ?,
        amount = ?, allocated_amount = ?, unallocated_amount = ?, allocation_status = ?,
        reference_number = ?, utr_number = ?, transaction_id = ?,
        cheque_number = ?, cheque_date = ?, cheque_bank = ?, remarks = ?, updated_at = ?
      WHERE id = ? AND status = 'draft'
    `).run(
      data.receiptDate ?? existing.receiptDate,
      data.paymentMode ?? existing.paymentMode,
      data.paymentAccountId !== undefined ? data.paymentAccountId : existing.paymentAccountId,
      amount,
      allocated,
      round2(amount - allocated),
      allocationStatus(amount, allocated),
      data.referenceNumber !== undefined ? data.referenceNumber : existing.referenceNumber,
      data.utrNumber !== undefined ? data.utrNumber : existing.utrNumber,
      data.transactionId !== undefined ? data.transactionId : existing.transactionId,
      data.chequeNumber !== undefined ? data.chequeNumber : existing.chequeNumber,
      data.chequeDate !== undefined ? data.chequeDate : existing.chequeDate,
      data.chequeBank !== undefined ? data.chequeBank : existing.chequeBank,
      data.remarks !== undefined ? data.remarks : existing.remarks,
      now,
      id
    );
    if (Array.isArray(data.allocations)) {
      this.replaceAllocations(id, data.allocations);
      const sum = this.sumAllocations(id);
      getDatabase().prepare(`
        UPDATE customer_receipts SET
          allocated_amount = ?, unallocated_amount = ?, allocation_status = ?, updated_at = ?
        WHERE id = ?
      `).run(sum, round2(amount - sum), allocationStatus(amount, sum), now, id);
    }
    return this.findById(id);
  }

  replaceAllocations(receiptId, allocations) {
    const db = getDatabase();
    db.prepare('DELETE FROM customer_receipt_allocations WHERE receipt_id = ?').run(receiptId);
    const insert = db.prepare(`
      INSERT INTO customer_receipt_allocations (id, receipt_id, document_type, document_id, allocated_amount, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    const now = nowIso();
    for (const line of allocations) {
      const amt = round2(line.allocatedAmount ?? line.amount);
      if (amt <= 0) continue;
      insert.run(
        generateId(),
        receiptId,
        line.documentType,
        line.documentId || null,
        amt,
        now
      );
    }
  }

  sumAllocations(receiptId) {
    const row = getDatabase().prepare(`
      SELECT COALESCE(SUM(allocated_amount), 0) as total FROM customer_receipt_allocations WHERE receipt_id = ?
    `).get(receiptId);
    return round2(row?.total);
  }

  markPosted(id) {
    const now = nowIso();
    getDatabase().prepare(`
      UPDATE customer_receipts SET status = 'posted', posted_at = ?, updated_at = ? WHERE id = ?
    `).run(now, now, id);
    return this.findById(id);
  }

  markCancelled(id, reason) {
    const now = nowIso();
    getDatabase().prepare(`
      UPDATE customer_receipts SET status = 'cancelled', cancelled_at = ?, cancel_reason = ?, updated_at = ?
      WHERE id = ?
    `).run(now, reason || null, now, id);
    return this.findById(id);
  }

  listOpenInvoices(customerId) {
    return getDatabase().prepare(`
      SELECT id, invoice_number, grand_total, amount_paid, amount_credit, payment_status,
             due_date, COALESCE(completed_at, created_at) as invoice_date, created_at, completed_at
      FROM pos_sales
      WHERE customer_id = ? AND status != 'voided' AND amount_credit > 0.001
      ORDER BY COALESCE(due_date, date(COALESCE(completed_at, created_at))) ASC,
               COALESCE(completed_at, created_at) ASC
    `).all(customerId).map((row) => {
      const display = resolveInvoicePaymentDisplay({
        paymentStatus: row.payment_status,
        amountCredit: row.amount_credit,
        dueDate: row.due_date,
      });
      return {
        id: row.id,
        invoiceNumber: row.invoice_number,
        invoiceDate: (row.invoice_date || '').slice(0, 10),
        dueDate: row.due_date,
        invoiceAmount: round2(row.grand_total),
        amountPaid: round2(row.amount_paid),
        previousDue: round2(row.amount_credit),
        paymentStatus: display.paymentStatus,
        displayStatus: display.displayStatus,
        isOverdue: display.isOverdue,
      };
    });
  }

  applyInvoiceAllocation(saleId, amount) {
    const db = getDatabase();
    const sale = db.prepare('SELECT * FROM pos_sales WHERE id = ?').get(saleId);
    if (!sale) return null;
    const paid = round2(Number(sale.amount_paid) + amount);
    const credit = round2(Math.max(0, Number(sale.amount_credit) - amount));
    let status = 'credit';
    if (credit <= 0.001) status = 'paid';
    else if (paid > 0.001) status = 'partial';
    db.prepare(`
      UPDATE pos_sales SET amount_paid = ?, amount_credit = ?, payment_status = ? WHERE id = ?
    `).run(paid, credit, status, saleId);
    return db.prepare('SELECT * FROM pos_sales WHERE id = ?').get(saleId);
  }

  reverseInvoiceAllocation(saleId, amount) {
    return this.applyInvoiceAllocation(saleId, -amount);
  }
}

export class SupplierPaymentVoucherRepository {
  findById(id) {
    return mapPv(getDatabase().prepare(`${PV_SELECT} WHERE v.id = ?`).get(id));
  }

  list({ supplierId, status, firmId, dateFrom, dateTo, limit = 50, offset = 0 } = {}) {
    const db = getDatabase();
    const where = [];
    const params = [];
    if (supplierId) { where.push('v.supplier_id = ?'); params.push(supplierId); }
    if (status) { where.push('v.status = ?'); params.push(status); }
    if (firmId) { where.push('v.firm_id = ?'); params.push(firmId); }
    if (dateFrom) { where.push('v.payment_date >= ?'); params.push(dateFrom); }
    if (dateTo) { where.push('v.payment_date <= ?'); params.push(dateTo); }
    const wh = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const items = db.prepare(`
      ${PV_SELECT} ${wh}
      ORDER BY v.payment_date DESC, v.created_at DESC
      LIMIT ? OFFSET ?
    `).all(...params, limit, offset).map(mapPv);
    const total = db.prepare(`SELECT COUNT(*) as count FROM supplier_payment_vouchers v ${wh}`).get(...params).count;
    return { items, total, limit, offset };
  }

  listAllocations(voucherId) {
    return getDatabase().prepare(`
      SELECT a.*,
        b.bill_number as document_number,
        b.bill_date as document_date,
        b.grand_total as document_amount,
        b.amount_payable as previous_due
      FROM supplier_payment_allocations a
      LEFT JOIN supplier_bills b ON a.document_type = 'purchase_bill' AND b.id = a.document_id
      WHERE a.voucher_id = ?
      ORDER BY a.created_at ASC
    `).all(voucherId).map((row) => {
      const mapped = mapAlloc({ ...row, voucher_id: row.voucher_id });
      if (mapped.documentType === 'purchase_bill' && mapped.previousDue != null) {
        mapped.remainingDue = round2(Math.max(0, mapped.previousDue - mapped.allocatedAmount));
      }
      return mapped;
    });
  }

  create(data) {
    const id = generateId();
    const now = nowIso();
    const amount = round2(data.amount);
    const allocated = round2(data.allocatedAmount || 0);
    getDatabase().prepare(`
      INSERT INTO supplier_payment_vouchers (
        id, voucher_number, firm_id, payment_date, supplier_id, payment_mode, payment_account_id,
        amount, allocated_amount, unallocated_amount, allocation_status, status,
        reference_number, utr_number, transaction_id, cheque_number, cheque_date, cheque_bank,
        remarks, bank_transaction_id, created_by, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      data.voucherNumber,
      data.firmId || null,
      data.paymentDate || now.slice(0, 10),
      data.supplierId,
      data.paymentMode,
      data.paymentAccountId || null,
      amount,
      allocated,
      round2(amount - allocated),
      allocationStatus(amount, allocated),
      data.referenceNumber || null,
      data.utrNumber || null,
      data.transactionId || null,
      data.chequeNumber || null,
      data.chequeDate || null,
      data.chequeBank || null,
      data.remarks || null,
      data.bankTransactionId || null,
      data.createdBy || null,
      now,
      now
    );
    if (Array.isArray(data.allocations)) {
      this.replaceAllocations(id, data.allocations);
    }
    return this.findById(id);
  }

  updateDraft(id, data) {
    const existing = this.findById(id);
    if (!existing) return null;
    const now = nowIso();
    const amount = data.amount != null ? round2(data.amount) : existing.amount;
    const allocated = data.allocatedAmount != null ? round2(data.allocatedAmount) : existing.allocatedAmount;
    getDatabase().prepare(`
      UPDATE supplier_payment_vouchers SET
        payment_date = ?, payment_mode = ?, payment_account_id = ?,
        amount = ?, allocated_amount = ?, unallocated_amount = ?, allocation_status = ?,
        reference_number = ?, utr_number = ?, transaction_id = ?,
        cheque_number = ?, cheque_date = ?, cheque_bank = ?, remarks = ?, updated_at = ?
      WHERE id = ? AND status = 'draft'
    `).run(
      data.paymentDate ?? existing.paymentDate,
      data.paymentMode ?? existing.paymentMode,
      data.paymentAccountId !== undefined ? data.paymentAccountId : existing.paymentAccountId,
      amount,
      allocated,
      round2(amount - allocated),
      allocationStatus(amount, allocated),
      data.referenceNumber !== undefined ? data.referenceNumber : existing.referenceNumber,
      data.utrNumber !== undefined ? data.utrNumber : existing.utrNumber,
      data.transactionId !== undefined ? data.transactionId : existing.transactionId,
      data.chequeNumber !== undefined ? data.chequeNumber : existing.chequeNumber,
      data.chequeDate !== undefined ? data.chequeDate : existing.chequeDate,
      data.chequeBank !== undefined ? data.chequeBank : existing.chequeBank,
      data.remarks !== undefined ? data.remarks : existing.remarks,
      now,
      id
    );
    if (Array.isArray(data.allocations)) {
      this.replaceAllocations(id, data.allocations);
      const sum = this.sumAllocations(id);
      getDatabase().prepare(`
        UPDATE supplier_payment_vouchers SET
          allocated_amount = ?, unallocated_amount = ?, allocation_status = ?, updated_at = ?
        WHERE id = ?
      `).run(sum, round2(amount - sum), allocationStatus(amount, sum), now, id);
    }
    return this.findById(id);
  }

  replaceAllocations(voucherId, allocations) {
    const db = getDatabase();
    db.prepare('DELETE FROM supplier_payment_allocations WHERE voucher_id = ?').run(voucherId);
    const insert = db.prepare(`
      INSERT INTO supplier_payment_allocations (id, voucher_id, document_type, document_id, allocated_amount, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    const now = nowIso();
    for (const line of allocations) {
      const amt = round2(line.allocatedAmount ?? line.amount);
      if (amt <= 0) continue;
      insert.run(generateId(), voucherId, line.documentType, line.documentId || null, amt, now);
    }
  }

  sumAllocations(voucherId) {
    const row = getDatabase().prepare(`
      SELECT COALESCE(SUM(allocated_amount), 0) as total FROM supplier_payment_allocations WHERE voucher_id = ?
    `).get(voucherId);
    return round2(row?.total);
  }

  markPosted(id) {
    const now = nowIso();
    getDatabase().prepare(`
      UPDATE supplier_payment_vouchers SET status = 'posted', posted_at = ?, updated_at = ? WHERE id = ?
    `).run(now, now, id);
    return this.findById(id);
  }

  markCancelled(id, reason) {
    const now = nowIso();
    getDatabase().prepare(`
      UPDATE supplier_payment_vouchers SET status = 'cancelled', cancelled_at = ?, cancel_reason = ?, updated_at = ?
      WHERE id = ?
    `).run(now, reason || null, now, id);
    return this.findById(id);
  }

  listOpenBills(supplierId) {
    return getDatabase().prepare(`
      SELECT id, bill_number, bill_date, due_date, grand_total, amount_paid, amount_payable, status
      FROM supplier_bills
      WHERE supplier_id = ? AND status != 'cancelled' AND amount_payable > 0.001
      ORDER BY COALESCE(due_date, bill_date) ASC, bill_date ASC
    `).all(supplierId).map((row) => {
      const dueDate = row.due_date;
      const today = new Date().toISOString().slice(0, 10);
      const isOverdue = Boolean(dueDate && dueDate < today);
      let displayStatus = 'Unpaid';
      if (row.status === 'partial') displayStatus = 'Partially Paid';
      if (row.status === 'paid') displayStatus = 'Paid';
      if (isOverdue) displayStatus = 'Overdue';
      return {
        id: row.id,
        billNumber: row.bill_number,
        billDate: row.bill_date,
        dueDate,
        billAmount: round2(row.grand_total),
        amountPaid: round2(row.amount_paid),
        previousDue: round2(row.amount_payable),
        status: row.status,
        displayStatus,
        isOverdue,
      };
    });
  }
}

export class CashBookRepository {
  create(data) {
    const id = generateId();
    const now = nowIso();
    getDatabase().prepare(`
      INSERT INTO cash_book_entries (
        id, entry_date, firm_id, payment_account_id, direction, amount, payment_mode,
        reference, source_type, source_id, status, created_by, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'posted', ?, ?)
    `).run(
      id,
      data.entryDate || now.slice(0, 10),
      data.firmId || null,
      data.paymentAccountId,
      data.direction,
      round2(data.amount),
      data.paymentMode,
      data.reference || null,
      data.sourceType,
      data.sourceId,
      data.createdBy || null,
      now
    );
    return this.findById(id);
  }

  findById(id) {
    return mapCash(getDatabase().prepare(`
      SELECT e.*, a.name as payment_account_name, a.account_type
      FROM cash_book_entries e
      LEFT JOIN financial_payment_accounts a ON a.id = e.payment_account_id
      WHERE e.id = ?
    `).get(id));
  }

  findBySource(sourceType, sourceId) {
    return getDatabase().prepare(`
      SELECT e.*, a.name as payment_account_name, a.account_type
      FROM cash_book_entries e
      LEFT JOIN financial_payment_accounts a ON a.id = e.payment_account_id
      WHERE e.source_type = ? AND e.source_id = ? AND e.status = 'posted'
    `).all(sourceType, sourceId).map(mapCash);
  }

  reverseSource(sourceType, sourceId, createdBy) {
    const entries = this.findBySource(sourceType, sourceId);
    const created = [];
    for (const e of entries) {
      const rev = this.create({
        entryDate: new Date().toISOString().slice(0, 10),
        firmId: e.firmId,
        paymentAccountId: e.paymentAccountId,
        direction: e.direction === 'in' ? 'out' : 'in',
        amount: e.amount,
        paymentMode: e.paymentMode,
        reference: `Reversal of ${e.reference || e.id}`,
        sourceType: 'reversal',
        sourceId: e.id,
        createdBy,
      });
      getDatabase().prepare(`UPDATE cash_book_entries SET status = 'reversed' WHERE id = ?`).run(e.id);
      created.push(rev);
    }
    return created;
  }

  list({ accountType, paymentAccountId, dateFrom, dateTo, direction, firmId, limit = 200, offset = 0 } = {}) {
    const where = [`e.status = 'posted'`];
    const params = [];
    if (accountType) { where.push('a.account_type = ?'); params.push(accountType); }
    if (paymentAccountId) { where.push('e.payment_account_id = ?'); params.push(paymentAccountId); }
    if (dateFrom) { where.push('e.entry_date >= ?'); params.push(dateFrom); }
    if (dateTo) { where.push('e.entry_date <= ?'); params.push(dateTo); }
    if (direction) { where.push('e.direction = ?'); params.push(direction); }
    if (firmId) { where.push('e.firm_id = ?'); params.push(firmId); }
    const wh = `WHERE ${where.join(' AND ')}`;
    const items = getDatabase().prepare(`
      SELECT e.*, a.name as payment_account_name, a.account_type
      FROM cash_book_entries e
      LEFT JOIN financial_payment_accounts a ON a.id = e.payment_account_id
      ${wh}
      ORDER BY e.entry_date DESC, e.created_at DESC
      LIMIT ? OFFSET ?
    `).all(...params, limit, offset).map(mapCash);
    const totals = getDatabase().prepare(`
      SELECT
        COALESCE(SUM(CASE WHEN e.direction = 'in' THEN e.amount ELSE 0 END), 0) as inflow,
        COALESCE(SUM(CASE WHEN e.direction = 'out' THEN e.amount ELSE 0 END), 0) as outflow
      FROM cash_book_entries e
      LEFT JOIN financial_payment_accounts a ON a.id = e.payment_account_id
      ${wh}
    `).get(...params);
    return {
      items,
      total: items.length,
      limit,
      offset,
      inflow: round2(totals?.inflow),
      outflow: round2(totals?.outflow),
      net: round2((totals?.inflow || 0) - (totals?.outflow || 0)),
    };
  }

  summaryByAccountType({ dateFrom, dateTo } = {}) {
    const where = [`e.status = 'posted'`];
    const params = [];
    if (dateFrom) { where.push('e.entry_date >= ?'); params.push(dateFrom); }
    if (dateTo) { where.push('e.entry_date <= ?'); params.push(dateTo); }
    const rows = getDatabase().prepare(`
      SELECT a.account_type,
        COALESCE(SUM(CASE WHEN e.direction = 'in' THEN e.amount ELSE 0 END), 0) as inflow,
        COALESCE(SUM(CASE WHEN e.direction = 'out' THEN e.amount ELSE 0 END), 0) as outflow
      FROM cash_book_entries e
      JOIN financial_payment_accounts a ON a.id = e.payment_account_id
      WHERE ${where.join(' AND ')}
      GROUP BY a.account_type
    `).all(...params);
    const out = { cash: { in: 0, out: 0 }, bank: { in: 0, out: 0 }, upi: { in: 0, out: 0 }, other: { in: 0, out: 0 } };
    for (const r of rows) {
      const key = out[r.account_type] ? r.account_type : 'other';
      out[key].in = round2(r.inflow);
      out[key].out = round2(r.outflow);
    }
    return out;
  }
}
