import { getDatabase } from '../../database/connection.js';
import { generateId, nowIso } from '../../core/utils.js';

function num(v) {
  return Math.round((Number(v || 0) + Number.EPSILON) * 100) / 100;
}

function round2(v) {
  return Math.round((Number(v || 0) + Number.EPSILON) * 100) / 100;
}

const POSTED_STATUS = "'posted'";
const REPORTABLE_WHERE = "status = 'posted' AND source IN ('manual_income', 'manual_expense', 'correction')";

function mapCategory(row) {
  if (!row) return null;
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    categoryType: row.category_type,
    isActive: Boolean(row.is_active),
    isSystem: Boolean(row.is_system),
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapAccount(row) {
  if (!row) return null;
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    accountType: row.account_type,
    openingBalance: num(row.opening_balance),
    isActive: Boolean(row.is_active),
    isSystem: Boolean(row.is_system),
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapTransaction(row) {
  if (!row) return null;
  return {
    id: row.id,
    transactionNumber: row.transaction_number,
    transactionDate: row.transaction_date,
    transactionType: row.transaction_type,
    categoryId: row.category_id,
    categoryName: row.category_name || null,
    categoryCode: row.category_code || null,
    amount: num(row.amount),
    paymentAccountId: row.payment_account_id,
    paymentAccountName: row.payment_account_name || null,
    paymentMode: row.payment_mode,
    referenceNumber: row.reference_number,
    description: row.description,
    firmId: row.firm_id,
    branchId: row.branch_id,
    source: row.source,
    status: row.status,
    attachmentName: row.attachment_name,
    attachmentPath: row.attachment_path,
    notes: row.notes,
    reversalOfId: row.reversal_of_id,
    rejectionReason: row.rejection_reason,
    createdBy: row.created_by,
    createdByName: row.created_by_name || null,
    approvedBy: row.approved_by,
    approvedByName: row.approved_by_name || null,
    submittedAt: row.submitted_at,
    approvedAt: row.approved_at,
    postedAt: row.posted_at,
    voidedAt: row.voided_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class FinanceCategoryRepository {
  findAll({ categoryType, includeInactive = false } = {}) {
    const wh = [];
    const p = [];
    if (categoryType) {
      wh.push('AND category_type = ?');
      p.push(categoryType);
    }
    if (!includeInactive) wh.push('AND is_active = 1');
    return getDatabase().prepare(`
      SELECT * FROM financial_categories
      WHERE 1=1 ${wh.join(' ')}
      ORDER BY sort_order ASC, name ASC
    `).all(...p).map(mapCategory);
  }

  findById(id) {
    return mapCategory(getDatabase().prepare('SELECT * FROM financial_categories WHERE id = ?').get(id));
  }

  codeExists(code, excludeId = null) {
    const row = excludeId
      ? getDatabase().prepare('SELECT id FROM financial_categories WHERE code = ? AND id != ?').get(code, excludeId)
      : getDatabase().prepare('SELECT id FROM financial_categories WHERE code = ?').get(code);
    return Boolean(row);
  }

  create(data) {
    const id = generateId();
    const now = nowIso();
    getDatabase().prepare(`
      INSERT INTO financial_categories (id, code, name, category_type, is_active, is_system, sort_order, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?)
    `).run(id, data.code, data.name, data.categoryType, data.isActive !== false ? 1 : 0, data.sortOrder || 0, now, now);
    return this.findById(id);
  }

  update(id, data) {
    const now = nowIso();
    getDatabase().prepare(`
      UPDATE financial_categories SET
        name = COALESCE(?, name),
        is_active = COALESCE(?, is_active),
        sort_order = COALESCE(?, sort_order),
        updated_at = ?
      WHERE id = ?
    `).run(
      data.name ?? null,
      data.isActive !== undefined ? (data.isActive ? 1 : 0) : null,
      data.sortOrder ?? null,
      now,
      id
    );
    return this.findById(id);
  }
}

export class FinancePaymentAccountRepository {
  findAll({ includeInactive = false } = {}) {
    const wh = includeInactive ? '' : 'WHERE is_active = 1';
    return getDatabase().prepare(`
      SELECT * FROM financial_payment_accounts ${wh} ORDER BY name ASC
    `).all().map(mapAccount);
  }

  findById(id) {
    return mapAccount(getDatabase().prepare('SELECT * FROM financial_payment_accounts WHERE id = ?').get(id));
  }

  codeExists(code, excludeId = null) {
    const row = excludeId
      ? getDatabase().prepare('SELECT id FROM financial_payment_accounts WHERE code = ? AND id != ?').get(code, excludeId)
      : getDatabase().prepare('SELECT id FROM financial_payment_accounts WHERE code = ?').get(code);
    return Boolean(row);
  }

  create(data) {
    const id = generateId();
    const now = nowIso();
    getDatabase().prepare(`
      INSERT INTO financial_payment_accounts (
        id, code, name, account_type, opening_balance, is_active, is_system, notes, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?)
    `).run(
      id,
      data.code,
      data.name,
      data.accountType,
      num(data.openingBalance || 0),
      data.isActive !== false ? 1 : 0,
      data.notes || null,
      now,
      now
    );
    return this.findById(id);
  }

  update(id, data) {
    const now = nowIso();
    getDatabase().prepare(`
      UPDATE financial_payment_accounts SET
        name = COALESCE(?, name),
        opening_balance = COALESCE(?, opening_balance),
        is_active = COALESCE(?, is_active),
        notes = COALESCE(?, notes),
        updated_at = ?
      WHERE id = ?
    `).run(
      data.name ?? null,
      data.openingBalance !== undefined ? num(data.openingBalance) : null,
      data.isActive !== undefined ? (data.isActive ? 1 : 0) : null,
      data.notes ?? null,
      now,
      id
    );
    return this.findById(id);
  }
}

export class FinanceTransactionRepository {
  nextNumber() {
    const row = getDatabase().prepare(`
      SELECT transaction_number FROM financial_transactions
      WHERE transaction_number LIKE 'FT-%'
      ORDER BY transaction_number DESC LIMIT 1
    `).get();
    let seq = 1;
    if (row?.transaction_number) {
      const m = row.transaction_number.match(/FT-(\d+)/);
      if (m) seq = parseInt(m[1], 10) + 1;
    }
    return `FT-${String(seq).padStart(6, '0')}`;
  }

  _selectJoin() {
    return `
      SELECT t.*,
             c.name as category_name, c.code as category_code,
             a.name as payment_account_name,
             u.full_name as created_by_name,
             au.full_name as approved_by_name
      FROM financial_transactions t
      LEFT JOIN financial_categories c ON c.id = t.category_id
      LEFT JOIN financial_payment_accounts a ON a.id = t.payment_account_id
      LEFT JOIN users u ON u.id = t.created_by
      LEFT JOIN users au ON au.id = t.approved_by
    `;
  }

  findById(id) {
    return mapTransaction(getDatabase().prepare(`${this._selectJoin()} WHERE t.id = ?`).get(id));
  }

  findAll(filters = {}) {
    const wh = ['1=1'];
    const p = [];
    if (filters.status) {
      wh.push('AND t.status = ?');
      p.push(filters.status);
    }
    if (filters.transactionType) {
      wh.push('AND t.transaction_type = ?');
      p.push(filters.transactionType);
    }
    if (filters.categoryId) {
      wh.push('AND t.category_id = ?');
      p.push(filters.categoryId);
    }
    if (filters.paymentMode) {
      wh.push('AND t.payment_mode = ?');
      p.push(filters.paymentMode);
    }
    if (filters.createdBy) {
      wh.push('AND t.created_by = ?');
      p.push(filters.createdBy);
    }
    if (filters.dateFrom) {
      wh.push('AND t.transaction_date >= ?');
      p.push(filters.dateFrom);
    }
    if (filters.dateTo) {
      wh.push('AND t.transaction_date <= ?');
      p.push(filters.dateTo);
    }
    if (filters.search) {
      wh.push(`AND (
        t.transaction_number LIKE ? OR t.description LIKE ? OR t.reference_number LIKE ?
        OR c.name LIKE ?
      )`);
      const q = `%${filters.search}%`;
      p.push(q, q, q, q);
    }
    const limit = Math.min(parseInt(filters.limit || '100', 10) || 100, 500);
    const offset = parseInt(filters.offset || '0', 10) || 0;
    const rows = getDatabase().prepare(`
      ${this._selectJoin()}
      WHERE ${wh.join(' ')}
      ORDER BY t.transaction_date DESC, t.created_at DESC
      LIMIT ? OFFSET ?
    `).all(...p, limit, offset);
    const countRow = getDatabase().prepare(`
      SELECT COUNT(*) as count
      FROM financial_transactions t
      LEFT JOIN financial_categories c ON c.id = t.category_id
      WHERE ${wh.join(' ')}
    `).get(...p);
    return {
      items: rows.map(mapTransaction),
      total: countRow?.count || 0,
      limit,
      offset,
    };
  }

  create(data) {
    const id = generateId();
    const now = nowIso();
    const txnNo = data.transactionNumber || this.nextNumber();
    const source = data.transactionType === 'expense' ? 'manual_expense' : 'manual_income';
    getDatabase().prepare(`
      INSERT INTO financial_transactions (
        id, transaction_number, transaction_date, transaction_type, category_id, amount,
        payment_account_id, payment_mode, reference_number, description, firm_id, branch_id,
        source, status, attachment_name, attachment_path, notes, reversal_of_id,
        created_by, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      txnNo,
      data.transactionDate,
      data.transactionType,
      data.categoryId,
      num(data.amount),
      data.paymentAccountId,
      data.paymentMode,
      data.referenceNumber || null,
      data.description || null,
      data.firmId || null,
      data.branchId || null,
      data.source || source,
      data.status || 'draft',
      data.attachmentName || null,
      data.attachmentPath || null,
      data.notes || null,
      data.reversalOfId || null,
      data.createdBy || null,
      now,
      now
    );
    return this.findById(id);
  }

  updateStatus(id, patch) {
    const now = nowIso();
    getDatabase().prepare(`
      UPDATE financial_transactions SET
        status = COALESCE(?, status),
        rejection_reason = COALESCE(?, rejection_reason),
        approved_by = COALESCE(?, approved_by),
        submitted_at = COALESCE(?, submitted_at),
        approved_at = COALESCE(?, approved_at),
        posted_at = COALESCE(?, posted_at),
        voided_at = COALESCE(?, voided_at),
        updated_at = ?
      WHERE id = ?
    `).run(
      patch.status ?? null,
      patch.rejectionReason ?? null,
      patch.approvedBy ?? null,
      patch.submittedAt ?? null,
      patch.approvedAt ?? null,
      patch.postedAt ?? null,
      patch.voidedAt ?? null,
      now,
      id
    );
    return this.findById(id);
  }

  updateDraft(id, data) {
    const now = nowIso();
    getDatabase().prepare(`
      UPDATE financial_transactions SET
        transaction_date = COALESCE(?, transaction_date),
        category_id = COALESCE(?, category_id),
        amount = COALESCE(?, amount),
        payment_account_id = COALESCE(?, payment_account_id),
        payment_mode = COALESCE(?, payment_mode),
        reference_number = COALESCE(?, reference_number),
        description = COALESCE(?, description),
        attachment_name = COALESCE(?, attachment_name),
        attachment_path = COALESCE(?, attachment_path),
        notes = COALESCE(?, notes),
        updated_at = ?
      WHERE id = ? AND status IN ('draft', 'rejected')
    `).run(
      data.transactionDate ?? null,
      data.categoryId ?? null,
      data.amount !== undefined ? num(data.amount) : null,
      data.paymentAccountId ?? null,
      data.paymentMode ?? null,
      data.referenceNumber ?? null,
      data.description ?? null,
      data.attachmentName ?? null,
      data.attachmentPath ?? null,
      data.notes ?? null,
      now,
      id
    );
    return this.findById(id);
  }

  /** Posted manual transactions only — feeds CEO dashboard & finance reports */
  postedTotals(dateFrom, dateTo) {
    const income = getDatabase().prepare(`
      SELECT COALESCE(SUM(amount), 0) as total, COUNT(*) as count
      FROM financial_transactions
      WHERE ${REPORTABLE_WHERE} AND transaction_type = 'income'
        AND transaction_date >= ? AND transaction_date < ?
    `).get(dateFrom?.slice(0, 10), dateTo?.slice(0, 10));

    const expense = getDatabase().prepare(`
      SELECT COALESCE(SUM(amount), 0) as total, COUNT(*) as count
      FROM financial_transactions
      WHERE ${REPORTABLE_WHERE} AND transaction_type = 'expense'
        AND transaction_date >= ? AND transaction_date < ?
    `).get(dateFrom?.slice(0, 10), dateTo?.slice(0, 10));

    return {
      otherIncome: num(income?.total),
      otherIncomeCount: num(income?.count),
      operatingExpenses: num(expense?.total),
      operatingExpensesCount: num(expense?.count),
    };
  }

  postedFlowByMode(dateFrom, dateTo) {
    const rows = getDatabase().prepare(`
      SELECT payment_mode, transaction_type, COALESCE(SUM(amount), 0) as total
      FROM financial_transactions
      WHERE ${REPORTABLE_WHERE}
        AND transaction_date >= ? AND transaction_date < ?
      GROUP BY payment_mode, transaction_type
    `).all(dateFrom?.slice(0, 10), dateTo?.slice(0, 10));

    const flow = {
      cashIn: 0, cashOut: 0, upiIn: 0, upiOut: 0, bankIn: 0, bankOut: 0,
    };
    for (const r of rows) {
      const amt = num(r.total);
      const mode = r.payment_mode === 'cheque' ? 'bank' : r.payment_mode;
      if (r.transaction_type === 'income') {
        if (mode === 'cash') flow.cashIn += amt;
        else if (mode === 'upi') flow.upiIn += amt;
        else if (mode === 'bank') flow.bankIn += amt;
      } else {
        if (mode === 'cash') flow.cashOut += amt;
        else if (mode === 'upi') flow.upiOut += amt;
        else if (mode === 'bank') flow.bankOut += amt;
      }
    }
    Object.keys(flow).forEach((k) => { flow[k] = round2(flow[k]); });
    return flow;
  }

  summaryByCategory(dateFrom, dateTo, transactionType) {
    return getDatabase().prepare(`
      SELECT c.id, c.name, c.code, COALESCE(SUM(t.amount), 0) as total, COUNT(t.id) as count
      FROM financial_transactions t
      INNER JOIN financial_categories c ON c.id = t.category_id
      WHERE t.status = 'posted' AND t.source IN ('manual_income', 'manual_expense', 'correction') AND t.transaction_type = ?
        AND t.transaction_date >= ? AND t.transaction_date < ?
      GROUP BY c.id
      ORDER BY total DESC
    `).all(transactionType, dateFrom?.slice(0, 10), dateTo?.slice(0, 10)).map((r) => ({
      categoryId: r.id,
      name: r.name,
      code: r.code,
      total: num(r.total),
      count: num(r.count),
    }));
  }

  summaryByPaymentMode(dateFrom, dateTo, transactionType) {
    return getDatabase().prepare(`
      SELECT payment_mode, COALESCE(SUM(amount), 0) as total, COUNT(*) as count
      FROM financial_transactions
      WHERE ${REPORTABLE_WHERE} AND transaction_type = ?
        AND transaction_date >= ? AND transaction_date < ?
      GROUP BY payment_mode
      ORDER BY total DESC
    `).all(transactionType, dateFrom?.slice(0, 10), dateTo?.slice(0, 10)).map((r) => ({
      paymentMode: r.payment_mode,
      total: num(r.total),
      count: num(r.count),
    }));
  }

  expenseTrend(dateFrom, dateTo) {
    return getDatabase().prepare(`
      SELECT strftime('%Y-%m-%d', transaction_date) as day,
             COALESCE(SUM(amount), 0) as total
      FROM financial_transactions
      WHERE ${REPORTABLE_WHERE} AND transaction_type = 'expense'
        AND transaction_date >= ? AND transaction_date < ?
      GROUP BY day ORDER BY day
    `).all(dateFrom?.slice(0, 10), dateTo?.slice(0, 10)).map((r) => ({
      day: r.day,
      total: num(r.total),
    }));
  }

  accountBalances() {
    const accounts = this.findAllAccountsForBalance();
    return accounts;
  }

  findAllAccountsForBalance() {
    const db = getDatabase();
    return db.prepare(`
      SELECT a.*,
        COALESCE(SUM(CASE WHEN t.status = 'posted' AND t.source IN ('manual_income', 'manual_expense', 'correction') AND t.transaction_type = 'income' THEN t.amount ELSE 0 END), 0) as total_in,
        COALESCE(SUM(CASE WHEN t.status = 'posted' AND t.source IN ('manual_income', 'manual_expense', 'correction') AND t.transaction_type = 'expense' THEN t.amount ELSE 0 END), 0) as total_out
      FROM financial_payment_accounts a
      LEFT JOIN financial_transactions t ON t.payment_account_id = a.id
      WHERE a.is_active = 1
      GROUP BY a.id
      ORDER BY a.name
    `).all().map((r) => ({
      ...mapAccount(r),
      totalIn: num(r.total_in),
      totalOut: num(r.total_out),
      closingBalance: round2(num(r.opening_balance) + num(r.total_in) - num(r.total_out)),
    }));
  }

  pendingApprovalCount() {
    return getDatabase().prepare(`
      SELECT COUNT(*) as count FROM financial_transactions WHERE status = 'pending_approval'
    `).get()?.count || 0;
  }
}

export class FinanceSettingsRepository {
  getApprovalSettings() {
    const db = getDatabase();
    const get = (key, fallback) => {
      const row = db.prepare('SELECT value FROM system_settings WHERE key = ?').get(key);
      return row?.value ?? fallback;
    };
    return {
      approvalRequired: ['1', 'true', 'yes', 'on'].includes(String(get('finance.approval_required', 'true')).toLowerCase()),
      approvalThresholdAmount: num(get('finance.approval_threshold_amount', '10000')),
      autoPostBelowThreshold: ['1', 'true', 'yes', 'on'].includes(String(get('finance.auto_post_below_threshold', 'true')).toLowerCase()),
    };
  }
}
