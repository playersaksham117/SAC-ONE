import { AppError } from '../core/http.js';
import { nowIso } from '../core/utils.js';
import { repos } from '../repositories/index.js';
import { authService } from './index.js';
import { approvalService } from './approvals.js';

const categoryRepo = repos.financeCategories;
const accountRepo = repos.financeAccounts;
const txnRepo = repos.financeTransactions;
const settingsRepo = repos.financeSettings;
const auditRepo = repos.auditLogs;

const PAYMENT_MODES = new Set(['cash', 'upi', 'bank', 'cheque', 'other']);
const EDITABLE_STATUSES = new Set(['draft', 'rejected']);

function getRequestMeta(req) {
  return {
    ipAddress: req?.ip || req?.headers?.['x-forwarded-for'] || null,
    userAgent: req?.headers?.['user-agent'] || null,
  };
}

function round2(n) {
  return Math.round((Number(n || 0) + Number.EPSILON) * 100) / 100;
}

function validateAmount(amount) {
  const n = Number(amount);
  if (!Number.isFinite(n) || n <= 0) throw new AppError('Amount must be a positive number', 400);
  return round2(n);
}

function validatePaymentMode(mode) {
  if (!PAYMENT_MODES.has(mode)) throw new AppError('Invalid payment mode', 400);
}

function validateTransactionPayload(data, { partial = false } = {}) {
  if (!partial && !data.transactionType) throw new AppError('Transaction type is required', 400);
  if (data.transactionType && !['income', 'expense'].includes(data.transactionType)) {
    throw new AppError('Transaction type must be income or expense', 400);
  }
  if (!partial && !data.categoryId) throw new AppError('Category is required', 400);
  if (!partial && !data.paymentAccountId) throw new AppError('Payment account is required', 400);
  if (!partial && !data.paymentMode) throw new AppError('Payment mode is required', 400);
  if (data.paymentMode) validatePaymentMode(data.paymentMode);
  if (data.amount !== undefined) validateAmount(data.amount);
}

function assertCanEdit(txn) {
  if (!EDITABLE_STATUSES.has(txn.status)) {
    throw new AppError(`Cannot edit transaction in status "${txn.status}"`, 400);
  }
}

function resolveSubmitStatus(amount, settings, actor) {
  if (!settings.approvalRequired) return 'posted';
  if (amount >= settings.approvalThresholdAmount) return 'pending_approval';
  if (settings.autoPostBelowThreshold) {
    return actor.permissions.includes('finance.ledger.approve') || actor.permissions.includes('*')
      ? 'posted'
      : 'pending_approval';
  }
  return 'pending_approval';
}

function addDaysToDateStr(dateStr, days = 1) {
  const d = new Date(`${String(dateStr).slice(0, 10)}T00:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function postTimestamps(status) {
  const now = nowIso();
  if (status === 'posted') {
    return { postedAt: now, approvedAt: now };
  }
  if (status === 'pending_approval') {
    return { submittedAt: now };
  }
  return { submittedAt: now };
}

export class FinanceService {
  // ── Categories ──────────────────────────────────────────
  listCategories(query, actor) {
    authService.checkPermission(actor.permissions, 'finance.ledger.view');
    return categoryRepo.findAll({
      categoryType: query.categoryType,
      includeInactive: query.includeInactive === 'true',
    });
  }

  createCategory(data, actor, req) {
    authService.checkPermission(actor.permissions, 'finance.ledger.edit');
    if (!data.name || !data.categoryType) throw new AppError('Name and category type required', 400);
    const code = (data.code || data.name).toUpperCase().replace(/[^A-Z0-9]+/g, '_').slice(0, 40);
    if (categoryRepo.codeExists(code)) throw new AppError('Category code already exists', 409);
    const cat = categoryRepo.create({ ...data, code });
    auditRepo.create({
      userId: actor.user.id,
      userName: actor.user.fullName,
      action: 'create',
      module: 'finance',
      recordType: 'financial_category',
      recordId: cat.id,
      newValue: cat,
      ...getRequestMeta(req),
    });
    return cat;
  }

  updateCategory(id, data, actor, req) {
    authService.checkPermission(actor.permissions, 'finance.ledger.edit');
    const existing = categoryRepo.findById(id);
    if (!existing) throw new AppError('Category not found', 404);
    const updated = categoryRepo.update(id, data);
    auditRepo.create({
      userId: actor.user.id,
      userName: actor.user.fullName,
      action: 'update',
      module: 'finance',
      recordType: 'financial_category',
      recordId: id,
      previousValue: existing,
      newValue: updated,
      ...getRequestMeta(req),
    });
    return updated;
  }

  // ── Payment accounts ────────────────────────────────────
  listAccounts(query, actor) {
    authService.checkPermission(actor.permissions, 'finance.ledger.view');
    return accountRepo.findAll({ includeInactive: query.includeInactive === 'true' });
  }

  createAccount(data, actor, req) {
    authService.checkPermission(actor.permissions, 'finance.ledger.edit');
    if (!data.name || !data.accountType) throw new AppError('Name and account type required', 400);
    const code = (data.code || data.name).toUpperCase().replace(/[^A-Z0-9]+/g, '-').slice(0, 30);
    if (accountRepo.codeExists(code)) throw new AppError('Account code already exists', 409);
    const acct = accountRepo.create({ ...data, code });
    auditRepo.create({
      userId: actor.user.id,
      userName: actor.user.fullName,
      action: 'create',
      module: 'finance',
      recordType: 'financial_payment_account',
      recordId: acct.id,
      newValue: acct,
      ...getRequestMeta(req),
    });
    return acct;
  }

  updateAccount(id, data, actor, req) {
    authService.checkPermission(actor.permissions, 'finance.ledger.edit');
    const existing = accountRepo.findById(id);
    if (!existing) throw new AppError('Payment account not found', 404);
    const updated = accountRepo.update(id, data);
    auditRepo.create({
      userId: actor.user.id,
      userName: actor.user.fullName,
      action: 'update',
      module: 'finance',
      recordType: 'financial_payment_account',
      recordId: id,
      previousValue: existing,
      newValue: updated,
      ...getRequestMeta(req),
    });
    return updated;
  }

  // ── Transactions ────────────────────────────────────────
  listTransactions(query, actor) {
    authService.checkPermission(actor.permissions, 'finance.ledger.view');
    return txnRepo.findAll({
      search: query.search,
      status: query.status,
      transactionType: query.transactionType,
      categoryId: query.categoryId,
      paymentMode: query.paymentMode,
      createdBy: query.createdBy,
      dateFrom: query.dateFrom,
      dateTo: query.dateTo,
      limit: query.limit,
      offset: query.offset,
    });
  }

  getTransaction(id, actor) {
    authService.checkPermission(actor.permissions, 'finance.ledger.view');
    const txn = txnRepo.findById(id);
    if (!txn) throw new AppError('Transaction not found', 404);
    return txn;
  }

  createTransaction(data, actor, req) {
    authService.checkPermission(actor.permissions, 'finance.ledger.create');
    validateTransactionPayload(data);
    if (!data.transactionDate) throw new AppError('Transaction date is required', 400);

    const category = categoryRepo.findById(data.categoryId);
    if (!category || !category.isActive) throw new AppError('Invalid category', 400);
    if (category.categoryType !== data.transactionType) {
      throw new AppError('Category type does not match transaction type', 400);
    }
    const account = accountRepo.findById(data.paymentAccountId);
    if (!account || !account.isActive) throw new AppError('Invalid payment account', 400);

    const txn = txnRepo.create({
      ...data,
      amount: validateAmount(data.amount),
      status: 'draft',
      createdBy: actor.user.id,
      firmId: data.firmId || null,
    });

    auditRepo.create({
      userId: actor.user.id,
      userName: actor.user.fullName,
      action: 'create',
      module: 'finance',
      recordType: 'financial_transaction',
      recordId: txn.id,
      newValue: txn,
      ...getRequestMeta(req),
    });
    return txn;
  }

  updateTransaction(id, data, actor, req) {
    authService.checkPermission(actor.permissions, 'finance.ledger.edit');
    const existing = this.getTransaction(id, actor);
    assertCanEdit(existing);
    validateTransactionPayload(data, { partial: true });

    if (data.categoryId) {
      const category = categoryRepo.findById(data.categoryId);
      if (!category?.isActive) throw new AppError('Invalid category', 400);
    }
    if (data.paymentAccountId) {
      const account = accountRepo.findById(data.paymentAccountId);
      if (!account?.isActive) throw new AppError('Invalid payment account', 400);
    }

    const updated = txnRepo.updateDraft(id, data);
    auditRepo.create({
      userId: actor.user.id,
      userName: actor.user.fullName,
      action: 'update',
      module: 'finance',
      recordType: 'financial_transaction',
      recordId: id,
      previousValue: existing,
      newValue: updated,
      ...getRequestMeta(req),
    });
    return updated;
  }

  submitTransaction(id, actor, req) {
    authService.checkPermission(actor.permissions, 'finance.ledger.create');
    const existing = this.getTransaction(id, actor);
    if (existing.status !== 'draft' && existing.status !== 'rejected') {
      throw new AppError('Only draft or rejected transactions can be submitted', 400);
    }

    const settings = settingsRepo.getApprovalSettings();
    let nextStatus = resolveSubmitStatus(existing.amount, settings, actor);

    // Central approval-rule overlay (configurable; does not replace permissions)
    try {
      const preview = approvalService.evaluateAndCreate({
        module: 'finance',
        action: existing.transactionType,
        transactionType: existing.transactionType,
        transactionId: id,
        amount: existing.amount,
        create: false,
      }, actor, req);
      if (preview.required) nextStatus = 'pending_approval';
    } catch {
      /* approval engine optional if migration not applied yet */
    }

    const timestamps = postTimestamps(nextStatus);

    const updated = txnRepo.updateStatus(id, {
      status: nextStatus,
      ...timestamps,
      approvedBy: nextStatus === 'posted' ? actor.user.id : null,
    });

    if (nextStatus === 'pending_approval') {
      try {
        approvalService.evaluateAndCreate({
          module: 'finance',
          action: existing.transactionType,
          transactionType: existing.transactionType,
          transactionId: id,
          amount: existing.amount,
          create: true,
        }, actor, req);
      } catch (err) {
        console.error('approval request create:', err.message);
      }
    }

    auditRepo.create({
      userId: actor.user.id,
      userName: actor.user.fullName,
      action: nextStatus === 'posted' ? 'post' : 'submit',
      module: 'finance',
      recordType: 'financial_transaction',
      recordId: id,
      previousValue: { status: existing.status },
      newValue: { status: nextStatus },
      ...getRequestMeta(req),
    });
    return updated;
  }

  approveTransaction(id, actor, req) {
    authService.checkPermission(actor.permissions, 'finance.ledger.approve');
    const existing = this.getTransaction(id, actor);
    if (existing.status !== 'pending_approval' && existing.status !== 'submitted') {
      throw new AppError('Transaction is not pending approval', 400);
    }
    const now = nowIso();
    const updated = txnRepo.updateStatus(id, {
      status: 'posted',
      approvedBy: actor.user.id,
      approvedAt: now,
      postedAt: now,
    });
    auditRepo.create({
      userId: actor.user.id,
      userName: actor.user.fullName,
      action: 'approve',
      module: 'finance',
      recordType: 'financial_transaction',
      recordId: id,
      previousValue: { status: existing.status },
      newValue: { status: 'posted' },
      ...getRequestMeta(req),
    });
    return updated;
  }

  rejectTransaction(id, { reason } = {}, actor, req) {
    authService.checkPermission(actor.permissions, 'finance.ledger.approve');
    const existing = this.getTransaction(id, actor);
    if (existing.status !== 'pending_approval' && existing.status !== 'submitted') {
      throw new AppError('Transaction is not pending approval', 400);
    }
    const updated = txnRepo.updateStatus(id, {
      status: 'rejected',
      rejectionReason: reason || 'Rejected',
    });
    auditRepo.create({
      userId: actor.user.id,
      userName: actor.user.fullName,
      action: 'reject',
      module: 'finance',
      recordType: 'financial_transaction',
      recordId: id,
      previousValue: { status: existing.status },
      newValue: { status: 'rejected', reason },
      ...getRequestMeta(req),
    });
    return updated;
  }

  voidTransaction(id, { reason } = {}, actor, req) {
    authService.checkPermission(actor.permissions, 'finance.ledger.delete');
    const existing = this.getTransaction(id, actor);
    if (existing.status !== 'posted') {
      throw new AppError('Only posted transactions can be voided', 400);
    }
    if (existing.reversalOfId) {
      throw new AppError('Reversal entries cannot be voided directly', 400);
    }

    const now = nowIso();
    txnRepo.updateStatus(id, { status: 'voided', voidedAt: now });

    const reversal = txnRepo.create({
      transactionDate: now.slice(0, 10),
      transactionType: existing.transactionType,
      categoryId: existing.categoryId,
      amount: existing.amount,
      paymentAccountId: existing.paymentAccountId,
      paymentMode: existing.paymentMode,
      referenceNumber: `VOID-${existing.transactionNumber}`,
      description: `Reversal of ${existing.transactionNumber}${reason ? `: ${reason}` : ''}`,
      source: 'reversal',
      status: 'voided',
      reversalOfId: id,
      createdBy: actor.user.id,
      notes: reason || null,
    });

    auditRepo.create({
      userId: actor.user.id,
      userName: actor.user.fullName,
      action: 'void',
      module: 'finance',
      recordType: 'financial_transaction',
      recordId: id,
      previousValue: existing,
      newValue: { status: 'voided', reversalId: reversal.id },
      ...getRequestMeta(req),
    });
    return { voided: txnRepo.findById(id), reversal: txnRepo.findById(reversal.id) };
  }

  // ── Reports / dashboard data for Finance UI ─────────────
  getReports(query, actor) {
    authService.checkPermission(actor.permissions, 'finance.ledger.view');
    const dateFrom = (query.dateFrom || new Date().toISOString().slice(0, 10)).slice(0, 10);
    const dateToExclusive = addDaysToDateStr(query.dateTo || dateFrom, 1);

    const totals = txnRepo.postedTotals(dateFrom, dateToExclusive);
    const flow = txnRepo.postedFlowByMode(dateFrom, dateToExclusive);
    const accounts = txnRepo.accountBalances();

    const today = new Date().toISOString().slice(0, 10);
    const monthStart = `${today.slice(0, 7)}-01`;
    const tomorrow = addDaysToDateStr(today, 1);
    const incomeToday = txnRepo.postedTotals(today, tomorrow);
    const expenseToday = txnRepo.postedTotals(today, tomorrow);
    const incomeMonth = txnRepo.postedTotals(monthStart, tomorrow);
    const expenseMonth = txnRepo.postedTotals(monthStart, tomorrow);

    return {
      period: { dateFrom, dateTo: query.dateTo || dateFrom },
      income: {
        today: incomeToday.otherIncome,
        thisMonth: incomeMonth.otherIncome,
        byCategory: txnRepo.summaryByCategory(dateFrom, dateToExclusive, 'income'),
        byPaymentMode: txnRepo.summaryByPaymentMode(dateFrom, dateToExclusive, 'income'),
      },
      expenses: {
        today: expenseToday.operatingExpenses,
        thisMonth: expenseMonth.operatingExpenses,
        byCategory: txnRepo.summaryByCategory(dateFrom, dateToExclusive, 'expense'),
        byPaymentMode: txnRepo.summaryByPaymentMode(dateFrom, dateToExclusive, 'expense'),
        trend: txnRepo.expenseTrend(dateFrom, dateToExclusive),
      },
      totals,
      flow,
      accounts,
      pendingApproval: txnRepo.pendingApprovalCount(),
      approvalSettings: settingsRepo.getApprovalSettings(),
    };
  }

  getBootstrap(actor) {
    authService.checkPermission(actor.permissions, 'finance.ledger.view');
    return {
      categories: {
        income: categoryRepo.findAll({ categoryType: 'income' }),
        expense: categoryRepo.findAll({ categoryType: 'expense' }),
      },
      accounts: accountRepo.findAll(),
      paymentModes: ['cash', 'upi', 'bank', 'cheque', 'other'],
      transactionTypes: ['income', 'expense'],
      statuses: ['draft', 'submitted', 'pending_approval', 'approved', 'posted', 'rejected', 'voided'],
      approvalSettings: settingsRepo.getApprovalSettings(),
      pendingApproval: txnRepo.pendingApprovalCount(),
    };
  }
}

export const financeService = new FinanceService();
