import { withFinancialYear } from '../database/context.js';
import { IFSC_PATTERN, INDIAN_BANKS, bankForIfsc } from '../core/indian-banks.js';
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

const ACCOUNT_KINDS = { savings: 'Savings', current: 'Current', od: 'Overdraft (OD)', cc: 'Cash Credit (CC)' };
const UPI_PATTERN = /^[a-zA-Z0-9._-]{2,256}@[a-zA-Z][a-zA-Z0-9.-]{1,64}$/;

/**
 * Bank details of a bank (or UPI) account, checked. Only keys present in `data` are returned.
 * The account number is entered twice; an IFSC fills in the bank name from its first 4 letters.
 */
function cleanBankDetails(data, accountType, existing) {
  const out = {};
  const text = (v, max) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max) || null;
  const isBank = accountType === 'bank';
  if (!isBank && accountType !== 'upi') return out;

  if (data.upiId !== undefined) {
    const upi = String(data.upiId ?? '').trim();
    if (upi && !UPI_PATTERN.test(upi)) throw new AppError('UPI ID should look like name@bank', 400, 'BANK_INVALID');
    out.upiId = upi || null;
  }
  if (data.upiQrImage !== undefined) {
    const image = String(data.upiQrImage ?? '').trim();
    if (image && !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(image)) {
      throw new AppError('Upload the UPI QR as a PNG, JPG or WebP image', 400, 'BANK_INVALID');
    }
    if (image.length > 700000) throw new AppError('The UPI QR image is too large (keep it under 500 KB)', 400, 'BANK_INVALID');
    out.upiQrImage = image || null;
  }
  if (!isBank) return out;

  if (data.accountNumber !== undefined) {
    const number = String(data.accountNumber ?? '').replace(/[\s-]/g, '');
    if (number && !/^[0-9]{9,18}$/.test(number)) throw new AppError('Account number should be 9 to 18 digits', 400, 'BANK_INVALID');
    const confirm = String(data.accountNumberConfirm ?? '').replace(/[\s-]/g, '');
    if (number && number !== existing.accountNumber && number !== confirm) {
      throw new AppError('The two account numbers do not match', 400, 'BANK_MISMATCH');
    }
    out.accountNumber = number || null;
  }
  if (data.ifsc !== undefined) {
    const ifsc = String(data.ifsc ?? '').replace(/\s/g, '').toUpperCase();
    if (ifsc && !IFSC_PATTERN.test(ifsc)) throw new AppError('IFSC should be 11 characters like SBIN0001234 (5th is zero)', 400, 'BANK_INVALID');
    out.ifsc = ifsc || null;
    const fromIfsc = ifsc ? bankForIfsc(ifsc) : null;
    if (fromIfsc) out.bankName = fromIfsc;
  }
  if (data.bankName !== undefined && !out.bankName) out.bankName = text(data.bankName, 120);
  if (data.accountHolder !== undefined) out.accountHolder = text(data.accountHolder, 120);
  if (data.branch !== undefined) out.branch = text(data.branch, 120);
  if (data.bankAccountType !== undefined) {
    const kind = String(data.bankAccountType ?? '').toLowerCase();
    if (kind && !ACCOUNT_KINDS[kind]) throw new AppError('Account type should be Savings, Current, OD or CC', 400, 'BANK_INVALID');
    out.bankAccountType = kind || null;
  }
  return out;
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

  /** Only an active bank account with its account number and IFSC can be the default bank. */
  #makeDefault(id) {
    const acct = accountRepo.findById(id);
    if (acct.accountType !== 'bank') throw new AppError('Only a bank account can be the default bank', 400, 'BANK_INVALID');
    if (!acct.isActive) throw new AppError('Switch the account on before making it the default bank', 400, 'BANK_INVALID');
    if (!acct.accountNumber || !acct.ifsc) throw new AppError('Add the account number and IFSC before making it the default bank', 400, 'BANK_INVALID');
    accountRepo.setDefault(id);
  }

  /** The uploaded UPI QR image of an account (for the account form preview). */
  upiQrImage(id, actor) {
    authService.checkPermission(actor.permissions, 'finance.ledger.view');
    if (!accountRepo.findById(id)) throw new AppError('Payment account not found', 404);
    return { image: accountRepo.getUpiQrImage(id) };
  }

  /** Bank list for the account form (IFSC bank codes). */
  banks() {
    return INDIAN_BANKS;
  }

  createAccount(data, actor, req) {
    authService.checkPermission(actor.permissions, 'finance.ledger.edit');
    if (!data.name || !data.accountType) throw new AppError('Name and account type required', 400);
    if (!['cash', 'upi', 'bank', 'other'].includes(data.accountType)) throw new AppError('Account type must be cash, UPI, bank or other', 400);
    const bank = cleanBankDetails(data, data.accountType, {});
    if (data.isDefault === true && (data.accountType !== 'bank' || !bank.accountNumber || !bank.ifsc)) {
      throw new AppError('Add the account number and IFSC of a bank account to make it the default bank', 400, 'BANK_INVALID');
    }
    const code = (data.code || data.name).toUpperCase().replace(/[^A-Z0-9]+/g, '-').slice(0, 30);
    if (accountRepo.codeExists(code)) throw new AppError('Account code already exists', 409);
    const created = accountRepo.create({ ...data, code });
    accountRepo.updateBankDetails(created.id, bank);
    if (data.isDefault === true) this.#makeDefault(created.id);
    const acct = accountRepo.findById(created.id);
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
    const bank = cleanBankDetails(data, existing.accountType, existing);
    accountRepo.update(id, data);
    accountRepo.updateBankDetails(id, bank);
    if (data.isDefault === true) this.#makeDefault(id);
    else if (data.isDefault === false) accountRepo.clearDefault(id);
    const updated = accountRepo.findById(id);
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
    query = withFinancialYear(query);
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
