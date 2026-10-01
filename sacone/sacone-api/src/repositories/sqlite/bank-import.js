import { createHash } from 'crypto';
import { getDatabase } from '../../database/connection.js';
import { generateId, nowIso } from '../../core/utils.js';

export function round2(n) {
  return Math.round((Number(n || 0) + Number.EPSILON) * 100) / 100;
}

export function normalizeNarration(text) {
  return String(text || '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 200);
}

export function buildFingerprint({
  paymentAccountId,
  transactionDate,
  valueDate,
  amount,
  direction,
  utrNumber,
  referenceNumber,
  narration,
}) {
  const raw = [
    paymentAccountId || '',
    String(transactionDate || '').slice(0, 10),
    String(valueDate || transactionDate || '').slice(0, 10),
    round2(amount).toFixed(2),
    direction || '',
    String(utrNumber || referenceNumber || '').trim().toUpperCase(),
    normalizeNarration(narration),
  ].join('|');
  return createHash('sha256').update(raw).digest('hex');
}

function mapBatch(row) {
  if (!row) return null;
  return {
    id: row.id,
    firmId: row.firm_id,
    branchId: row.branch_id,
    paymentAccountId: row.payment_account_id,
    paymentAccountName: row.payment_account_name || null,
    statementFrom: row.statement_from,
    statementTo: row.statement_to,
    fileName: row.file_name,
    mapping: row.mapping_json ? JSON.parse(row.mapping_json) : null,
    rowCount: Number(row.row_count || 0),
    importedCount: Number(row.imported_count || 0),
    duplicateCount: Number(row.duplicate_count || 0),
    invalidCount: Number(row.invalid_count || 0),
    totalCredit: round2(row.total_credit),
    totalDebit: round2(row.total_debit),
    status: row.status,
    createdBy: row.created_by,
    createdAt: row.created_at,
  };
}

function mapTxn(row) {
  if (!row) return null;
  return {
    id: row.id,
    batchId: row.batch_id,
    firmId: row.firm_id,
    branchId: row.branch_id,
    paymentAccountId: row.payment_account_id,
    paymentAccountName: row.payment_account_name || null,
    transactionDate: row.transaction_date,
    valueDate: row.value_date,
    narration: row.narration,
    description: row.description,
    referenceNumber: row.reference_number,
    utrNumber: row.utr_number,
    chequeNumber: row.cheque_number,
    debitAmount: round2(row.debit_amount),
    creditAmount: round2(row.credit_amount),
    amount: round2(row.amount),
    direction: row.direction,
    balanceAfter: row.balance_after != null ? round2(row.balance_after) : null,
    fingerprint: row.fingerprint,
    reconciliationStatus: row.reconciliation_status,
    allocatedAmount: round2(row.allocated_amount),
    unallocatedAmount: round2(row.unallocated_amount),
    partyType: row.party_type,
    customerId: row.customer_id,
    customerName: row.customer_name || null,
    supplierId: row.supplier_id,
    supplierName: row.supplier_name || null,
    voucherType: row.voucher_type,
    voucherId: row.voucher_id,
    voucherNumber: row.voucher_number || null,
    financialTransactionId: row.financial_transaction_id,
    transferAccountId: row.transfer_account_id,
    transferAccountName: row.transfer_account_name || null,
    linkedVoucherId: row.linked_voucher_id,
    ignoreReason: row.ignore_reason,
    remarks: row.remarks,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const TXN_SELECT = `
  SELECT t.*,
    a.name as payment_account_name,
    c.name as customer_name,
    s.name as supplier_name,
    ta.name as transfer_account_name,
    COALESCE(cr.voucher_number, pv.voucher_number) as voucher_number
  FROM bank_transactions t
  LEFT JOIN financial_payment_accounts a ON a.id = t.payment_account_id
  LEFT JOIN customers c ON c.id = t.customer_id
  LEFT JOIN suppliers s ON s.id = t.supplier_id
  LEFT JOIN financial_payment_accounts ta ON ta.id = t.transfer_account_id
  LEFT JOIN customer_receipts cr ON t.voucher_type = 'customer_receipt' AND cr.id = t.voucher_id
  LEFT JOIN supplier_payment_vouchers pv ON t.voucher_type = 'supplier_payment' AND pv.id = t.voucher_id
`;

export class BankImportRepository {
  getMapping(paymentAccountId) {
    const row = getDatabase().prepare(`
      SELECT * FROM bank_column_mappings WHERE payment_account_id = ?
    `).get(paymentAccountId);
    if (!row) return null;
    return {
      id: row.id,
      paymentAccountId: row.payment_account_id,
      mapping: JSON.parse(row.mapping_json),
      skipRows: Number(row.skip_rows || 0),
      updatedAt: row.updated_at,
    };
  }

  saveMapping(paymentAccountId, mapping, skipRows = 0) {
    const db = getDatabase();
    const now = nowIso();
    const existing = this.getMapping(paymentAccountId);
    if (existing) {
      db.prepare(`
        UPDATE bank_column_mappings SET mapping_json = ?, skip_rows = ?, updated_at = ?
        WHERE payment_account_id = ?
      `).run(JSON.stringify(mapping), skipRows, now, paymentAccountId);
    } else {
      db.prepare(`
        INSERT INTO bank_column_mappings (id, payment_account_id, mapping_json, skip_rows, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(generateId(), paymentAccountId, JSON.stringify(mapping), skipRows, now, now);
    }
    return this.getMapping(paymentAccountId);
  }

  fingerprintExists(paymentAccountId, fingerprint) {
    const row = getDatabase().prepare(`
      SELECT id FROM bank_transactions
      WHERE payment_account_id = ? AND fingerprint = ? AND reconciliation_status != 'duplicate'
    `).get(paymentAccountId, fingerprint);
    return Boolean(row);
  }

  findByFingerprint(paymentAccountId, fingerprint) {
    return mapTxn(getDatabase().prepare(`
      ${TXN_SELECT} WHERE t.payment_account_id = ? AND t.fingerprint = ?
    `).get(paymentAccountId, fingerprint));
  }

  createBatch(data) {
    const id = generateId();
    const now = nowIso();
    getDatabase().prepare(`
      INSERT INTO bank_import_batches (
        id, firm_id, branch_id, payment_account_id, statement_from, statement_to, file_name,
        mapping_json, row_count, imported_count, duplicate_count, invalid_count,
        total_credit, total_debit, status, created_by, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      data.firmId || null,
      data.branchId || null,
      data.paymentAccountId,
      data.statementFrom || null,
      data.statementTo || null,
      data.fileName || null,
      data.mapping ? JSON.stringify(data.mapping) : null,
      data.rowCount || 0,
      data.importedCount || 0,
      data.duplicateCount || 0,
      data.invalidCount || 0,
      round2(data.totalCredit || 0),
      round2(data.totalDebit || 0),
      data.status || 'imported',
      data.createdBy || null,
      now
    );
    return this.findBatch(id);
  }

  findBatch(id) {
    return mapBatch(getDatabase().prepare(`
      SELECT b.*, a.name as payment_account_name
      FROM bank_import_batches b
      LEFT JOIN financial_payment_accounts a ON a.id = b.payment_account_id
      WHERE b.id = ?
    `).get(id));
  }

  listBatches({ paymentAccountId, limit = 50 } = {}) {
    const where = [];
    const params = [];
    if (paymentAccountId) { where.push('b.payment_account_id = ?'); params.push(paymentAccountId); }
    const wh = where.length ? `WHERE ${where.join(' AND ')}` : '';
    return getDatabase().prepare(`
      SELECT b.*, a.name as payment_account_name
      FROM bank_import_batches b
      LEFT JOIN financial_payment_accounts a ON a.id = b.payment_account_id
      ${wh}
      ORDER BY b.created_at DESC
      LIMIT ?
    `).all(...params, limit).map(mapBatch);
  }

  insertTransaction(data) {
    const id = generateId();
    const now = nowIso();
    const amount = round2(data.amount);
    try {
      getDatabase().prepare(`
        INSERT INTO bank_transactions (
          id, batch_id, firm_id, branch_id, payment_account_id,
          transaction_date, value_date, narration, description,
          reference_number, utr_number, cheque_number,
          debit_amount, credit_amount, amount, direction, balance_after,
          fingerprint, reconciliation_status, allocated_amount, unallocated_amount,
          created_by, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?)
      `).run(
        id,
        data.batchId || null,
        data.firmId || null,
        data.branchId || null,
        data.paymentAccountId,
        data.transactionDate,
        data.valueDate || null,
        data.narration || null,
        data.description || null,
        data.referenceNumber || null,
        data.utrNumber || null,
        data.chequeNumber || null,
        round2(data.debitAmount || 0),
        round2(data.creditAmount || 0),
        amount,
        data.direction,
        data.balanceAfter != null ? round2(data.balanceAfter) : null,
        data.fingerprint,
        data.reconciliationStatus || 'unmatched',
        amount,
        data.createdBy || null,
        now,
        now
      );
      return this.findById(id);
    } catch (err) {
      if (String(err.message || '').includes('UNIQUE')) {
        return { duplicate: true, existing: this.findByFingerprint(data.paymentAccountId, data.fingerprint) };
      }
      throw err;
    }
  }

  findById(id) {
    return mapTxn(getDatabase().prepare(`${TXN_SELECT} WHERE t.id = ?`).get(id));
  }

  list({
    paymentAccountId, status, direction, dateFrom, dateTo, customerId, supplierId,
    search, amountMin, amountMax, limit = 100, offset = 0,
  } = {}) {
    const where = [`t.reconciliation_status != 'duplicate'`];
    const params = [];
    if (paymentAccountId) { where.push('t.payment_account_id = ?'); params.push(paymentAccountId); }
    if (status) { where.push('t.reconciliation_status = ?'); params.push(status); }
    if (direction) { where.push('t.direction = ?'); params.push(direction); }
    if (dateFrom) { where.push('t.transaction_date >= ?'); params.push(dateFrom); }
    if (dateTo) { where.push('t.transaction_date <= ?'); params.push(dateTo); }
    if (customerId) { where.push('t.customer_id = ?'); params.push(customerId); }
    if (supplierId) { where.push('t.supplier_id = ?'); params.push(supplierId); }
    if (amountMin != null && amountMin !== '') { where.push('t.amount >= ?'); params.push(Number(amountMin)); }
    if (amountMax != null && amountMax !== '') { where.push('t.amount <= ?'); params.push(Number(amountMax)); }
    if (search) {
      where.push(`(
        LOWER(COALESCE(t.narration,'')) LIKE ? OR LOWER(COALESCE(t.utr_number,'')) LIKE ?
        OR LOWER(COALESCE(t.reference_number,'')) LIKE ? OR LOWER(COALESCE(t.cheque_number,'')) LIKE ?
      )`);
      const q = `%${String(search).toLowerCase()}%`;
      params.push(q, q, q, q);
    }
    const wh = `WHERE ${where.join(' AND ')}`;
    const items = getDatabase().prepare(`
      ${TXN_SELECT} ${wh}
      ORDER BY t.transaction_date DESC, t.created_at DESC
      LIMIT ? OFFSET ?
    `).all(...params, limit, offset).map(mapTxn);
    const total = getDatabase().prepare(`SELECT COUNT(*) as c FROM bank_transactions t ${wh}`).get(...params).c;
    return { items, total, limit, offset };
  }

  updateReconciliation(id, data) {
    const existing = this.findById(id);
    if (!existing) return null;
    const now = nowIso();
    const allocated = data.allocatedAmount != null ? round2(data.allocatedAmount) : existing.allocatedAmount;
    const unallocated = data.unallocatedAmount != null
      ? round2(data.unallocatedAmount)
      : round2(existing.amount - allocated);
    getDatabase().prepare(`
      UPDATE bank_transactions SET
        reconciliation_status = COALESCE(?, reconciliation_status),
        allocated_amount = ?,
        unallocated_amount = ?,
        party_type = COALESCE(?, party_type),
        customer_id = COALESCE(?, customer_id),
        supplier_id = COALESCE(?, supplier_id),
        voucher_type = COALESCE(?, voucher_type),
        voucher_id = COALESCE(?, voucher_id),
        financial_transaction_id = COALESCE(?, financial_transaction_id),
        transfer_account_id = COALESCE(?, transfer_account_id),
        linked_voucher_id = COALESCE(?, linked_voucher_id),
        ignore_reason = COALESCE(?, ignore_reason),
        remarks = COALESCE(?, remarks),
        updated_at = ?
      WHERE id = ?
    `).run(
      data.reconciliationStatus ?? null,
      allocated,
      unallocated,
      data.partyType ?? null,
      data.customerId ?? null,
      data.supplierId ?? null,
      data.voucherType ?? null,
      data.voucherId ?? null,
      data.financialTransactionId ?? null,
      data.transferAccountId ?? null,
      data.linkedVoucherId ?? null,
      data.ignoreReason ?? null,
      data.remarks ?? null,
      now,
      id
    );
    return this.findById(id);
  }

  dashboard({ paymentAccountId, dateFrom, dateTo } = {}) {
    const where = [`reconciliation_status != 'duplicate'`];
    const params = [];
    if (paymentAccountId) { where.push('payment_account_id = ?'); params.push(paymentAccountId); }
    if (dateFrom) { where.push('transaction_date >= ?'); params.push(dateFrom); }
    if (dateTo) { where.push('transaction_date <= ?'); params.push(dateTo); }
    const wh = `WHERE ${where.join(' AND ')}`;
    const totals = getDatabase().prepare(`
      SELECT
        COUNT(*) as total_count,
        COALESCE(SUM(credit_amount), 0) as total_credit,
        COALESCE(SUM(debit_amount), 0) as total_debit,
        COALESCE(SUM(CASE WHEN reconciliation_status IN ('matched','fully_allocated','other_income','other_expense','bank_transfer') THEN amount ELSE 0 END), 0) as reconciled_amount,
        COALESCE(SUM(CASE WHEN reconciliation_status IN ('unmatched','partially_allocated') THEN unallocated_amount ELSE 0 END), 0) as unreconciled_amount
      FROM bank_transactions ${wh}
    `).get(...params);
    const byStatus = getDatabase().prepare(`
      SELECT reconciliation_status as status, COUNT(*) as count, COALESCE(SUM(amount),0) as amount
      FROM bank_transactions ${wh}
      GROUP BY reconciliation_status
    `).all(...params);
    const statusMap = {};
    for (const r of byStatus) {
      statusMap[r.status] = { count: Number(r.count), amount: round2(r.amount) };
    }
    return {
      totalCount: Number(totals.total_count || 0),
      totalCredit: round2(totals.total_credit),
      totalDebit: round2(totals.total_debit),
      reconciledAmount: round2(totals.reconciled_amount),
      unreconciledAmount: round2(totals.unreconciled_amount),
      byStatus: statusMap,
    };
  }

  findPossibleVouchers({ direction, amount, date, utr, reference }) {
    const db = getDatabase();
    const amt = round2(amount);
    const dateFrom = date ? String(date).slice(0, 10) : null;
    const results = [];
    if (direction === 'credit') {
      let sql = `
        SELECT id, voucher_number, receipt_date as txn_date, amount, utr_number, reference_number,
               customer_id as party_id, 'customer_receipt' as voucher_type, status
        FROM customer_receipts
        WHERE status = 'posted' AND ABS(amount - ?) < 0.02
      `;
      const params = [amt];
      if (dateFrom) {
        sql += ` AND receipt_date BETWEEN date(?, '-3 days') AND date(?, '+3 days')`;
        params.push(dateFrom, dateFrom);
      }
      if (utr) {
        sql += ` AND (UPPER(COALESCE(utr_number,'')) = UPPER(?) OR UPPER(COALESCE(reference_number,'')) = UPPER(?))`;
        params.push(utr, utr);
      } else if (reference) {
        sql += ` AND UPPER(COALESCE(reference_number,'')) = UPPER(?)`;
        params.push(reference);
      }
      sql += ' LIMIT 10';
      for (const row of db.prepare(sql).all(...params)) {
        results.push({
          id: row.id,
          voucherNumber: row.voucher_number,
          voucherType: row.voucher_type,
          date: row.txn_date,
          amount: round2(row.amount),
          utr: row.utr_number,
          reference: row.reference_number,
          partyId: row.party_id,
          status: row.status,
        });
      }
    } else {
      let sql = `
        SELECT id, voucher_number, payment_date as txn_date, amount, utr_number, reference_number,
               supplier_id as party_id, 'supplier_payment' as voucher_type, status
        FROM supplier_payment_vouchers
        WHERE status = 'posted' AND ABS(amount - ?) < 0.02
      `;
      const params = [amt];
      if (dateFrom) {
        sql += ` AND payment_date BETWEEN date(?, '-3 days') AND date(?, '+3 days')`;
        params.push(dateFrom, dateFrom);
      }
      if (utr) {
        sql += ` AND (UPPER(COALESCE(utr_number,'')) = UPPER(?) OR UPPER(COALESCE(reference_number,'')) = UPPER(?))`;
        params.push(utr, utr);
      } else if (reference) {
        sql += ` AND UPPER(COALESCE(reference_number,'')) = UPPER(?)`;
        params.push(reference);
      }
      sql += ' LIMIT 10';
      for (const row of db.prepare(sql).all(...params)) {
        results.push({
          id: row.id,
          voucherNumber: row.voucher_number,
          voucherType: row.voucher_type,
          date: row.txn_date,
          amount: round2(row.amount),
          utr: row.utr_number,
          reference: row.reference_number,
          partyId: row.party_id,
          status: row.status,
        });
      }
    }
    return results;
  }
}
