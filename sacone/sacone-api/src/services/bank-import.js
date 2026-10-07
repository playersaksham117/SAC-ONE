import { withFinancialYear } from '../database/context.js';
import { AppError } from '../core/http.js';
import { getDatabase } from '../database/connection.js';
import { repos } from '../repositories/index.js';
import { authService } from './index.js';
import { customerReceiptService } from './customer-receipts.js';
import { supplierPaymentVoucherService } from './supplier-payment-vouchers.js';
import { financeService } from './finance.js';
import {
  buildFingerprint,
  round2,
} from '../repositories/sqlite/bank-import.js';

const bankRepo = repos.bankImport;
const accountRepo = repos.financeAccounts;
const customerRepo = repos.customers;
const supplierRepo = repos.suppliers;
const cashRepo = repos.cashBook;
const auditRepo = repos.auditLogs;
const numberingRepo = repos.documentNumbering;

const FIELD_ALIASES = {
  date: ['date', 'txn date', 'transaction date', 'tran date', 'txn_date'],
  valueDate: ['value date', 'value_date', 'val date'],
  narration: ['narration', 'description', 'particulars', 'remarks', 'narrative'],
  reference: ['reference', 'ref no', 'ref. no', 'reference number', 'ref number', 'cheque/ref'],
  utr: ['utr', 'utr number', 'utr no', 'transaction id', 'txn id'],
  cheque: ['cheque', 'cheque no', 'cheque number', 'chq no'],
  debit: ['debit', 'withdrawal', 'dr', 'debit amount', 'amount debited'],
  credit: ['credit', 'deposit', 'cr', 'credit amount', 'amount credited'],
  amount: ['amount', 'txn amount', 'transaction amount'],
  balance: ['balance', 'closing balance', 'available balance'],
};

function meta(req) {
  return {
    ipAddress: req?.ip || req?.headers?.['x-forwarded-for'] || null,
    userAgent: req?.headers?.['user-agent'] || null,
  };
}

function requirePerm(actor, key) {
  authService.checkPermission(actor.permissions, key);
}

function parseCsv(text) {
  const lines = String(text || '').replace(/^\uFEFF/, '').split(/\r?\n/).filter((l) => l.trim().length);
  if (!lines.length) return { headers: [], rows: [] };
  const parseLine = (line) => {
    const out = [];
    let cur = '';
    let inQ = false;
    for (let i = 0; i < line.length; i += 1) {
      const ch = line[i];
      if (ch === '"') {
        if (inQ && line[i + 1] === '"') { cur += '"'; i += 1; }
        else inQ = !inQ;
      } else if (ch === ',' && !inQ) {
        out.push(cur.trim());
        cur = '';
      } else cur += ch;
    }
    out.push(cur.trim());
    return out;
  };
  const headers = parseLine(lines[0]);
  const rows = lines.slice(1).map((l) => parseLine(l));
  return { headers, rows };
}

function suggestMapping(headers) {
  const mapping = {};
  const lower = headers.map((h) => String(h || '').trim().toLowerCase());
  for (const [field, aliases] of Object.entries(FIELD_ALIASES)) {
    const idx = lower.findIndex((h) => aliases.includes(h));
    if (idx >= 0) mapping[field] = headers[idx];
  }
  return mapping;
}

function parseDate(raw) {
  if (!raw) return null;
  const s = String(raw).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const m1 = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (m1) {
    let y = m1[3];
    if (y.length === 2) y = `20${y}`;
    const d = m1[1].padStart(2, '0');
    const mo = m1[2].padStart(2, '0');
    // assume DD/MM/YYYY (India)
    return `${y}-${mo}-${d}`;
  }
  const dt = new Date(s);
  if (!Number.isNaN(dt.getTime())) return dt.toISOString().slice(0, 10);
  return null;
}

function parseAmount(raw) {
  if (raw == null || raw === '') return 0;
  const n = Number(String(raw).replace(/[, ]/g, '').replace(/^\((.*)\)$/, '-$1'));
  return Number.isFinite(n) ? round2(Math.abs(n)) : 0;
}

function cell(row, headers, colName) {
  if (!colName) return '';
  const idx = headers.findIndex((h) => String(h).trim() === String(colName).trim());
  if (idx < 0) return '';
  return row[idx] ?? '';
}

function mapRow(row, headers, mapping) {
  const date = parseDate(cell(row, headers, mapping.date || mapping.transactionDate));
  const valueDate = parseDate(cell(row, headers, mapping.valueDate)) || date;
  const narration = cell(row, headers, mapping.narration) || cell(row, headers, mapping.description) || '';
  const reference = cell(row, headers, mapping.reference) || '';
  const utr = cell(row, headers, mapping.utr) || '';
  const cheque = cell(row, headers, mapping.cheque) || '';
  let debit = parseAmount(cell(row, headers, mapping.debit));
  let credit = parseAmount(cell(row, headers, mapping.credit));
  const amountRaw = parseAmount(cell(row, headers, mapping.amount));
  const balance = parseAmount(cell(row, headers, mapping.balance)) || null;

  if (!debit && !credit && amountRaw) {
    // signed amount column — negative = debit convention common
    const signed = Number(String(cell(row, headers, mapping.amount)).replace(/[, ]/g, '').replace(/^\((.*)\)$/, '-$1'));
    if (signed < 0) debit = amountRaw;
    else credit = amountRaw;
  }

  if (debit > 0 && credit > 0) {
    // prefer the larger as direction if both set wrongly
    if (debit >= credit) credit = 0;
    else debit = 0;
  }

  const direction = credit > 0 ? 'credit' : (debit > 0 ? 'debit' : null);
  const amount = credit > 0 ? credit : debit;
  const errors = [];
  if (!date) errors.push('Invalid/missing date');
  if (!direction || !(amount > 0)) errors.push('Missing debit/credit amount');

  return {
    transactionDate: date,
    valueDate,
    narration,
    description: narration,
    referenceNumber: reference || null,
    utrNumber: utr || null,
    chequeNumber: cheque || null,
    debitAmount: debit,
    creditAmount: credit,
    amount,
    direction,
    balanceAfter: balance,
    errors,
    valid: errors.length === 0,
  };
}

export class BankImportService {
  listBankAccounts(actor) {
    requirePerm(actor, 'finance.bank_import.view');
    return accountRepo.findAll({ includeInactive: false })
      .filter((a) => a.accountType === 'bank' || a.accountType === 'upi' || a.accountType === 'cash');
  }

  getSavedMapping(paymentAccountId, actor) {
    requirePerm(actor, 'finance.bank_import.view');
    return bankRepo.getMapping(paymentAccountId);
  }

  saveMapping(paymentAccountId, mapping, skipRows, actor, req) {
    requirePerm(actor, 'finance.bank_import.edit');
    if (!accountRepo.findById(paymentAccountId)) throw new AppError('Bank account not found', 404);
    const saved = bankRepo.saveMapping(paymentAccountId, mapping, skipRows || 0);
    auditRepo.create({
      userId: actor.user.id,
      userName: actor.user.fullName,
      action: 'save_mapping',
      module: 'finance',
      recordType: 'bank_column_mapping',
      recordId: paymentAccountId,
      newValue: saved,
      ...meta(req),
    });
    return saved;
  }

  preview(data, actor) {
    requirePerm(actor, 'finance.bank_import.create');
    if (!data.paymentAccountId) throw new AppError('Bank account is required before import', 400);
    const account = accountRepo.findById(data.paymentAccountId);
    if (!account) throw new AppError('Bank account not found', 404);
    if (!data.csvText) throw new AppError('CSV content is required', 400);

    const { headers, rows } = parseCsv(data.csvText);
    const mapping = data.mapping || suggestMapping(headers);
    const skipRows = Number(data.skipRows || 0);
    const body = rows.slice(skipRows);

    const previewRows = [];
    let totalCredit = 0;
    let totalDebit = 0;
    let duplicates = 0;
    let invalid = 0;
    const seenFingerprints = new Set();

    for (const row of body) {
      if (row.every((c) => !String(c || '').trim())) continue;
      const mapped = mapRow(row, headers, mapping);
      if (!mapped.valid) {
        invalid += 1;
        previewRows.push({ ...mapped, status: 'invalid' });
        continue;
      }
      const fingerprint = buildFingerprint({
        paymentAccountId: account.id,
        transactionDate: mapped.transactionDate,
        valueDate: mapped.valueDate,
        amount: mapped.amount,
        direction: mapped.direction,
        utrNumber: mapped.utrNumber,
        referenceNumber: mapped.referenceNumber,
        narration: mapped.narration,
      });
      const isDup = seenFingerprints.has(fingerprint)
        || bankRepo.fingerprintExists(account.id, fingerprint);
      seenFingerprints.add(fingerprint);
      if (isDup) duplicates += 1;
      if (mapped.direction === 'credit') totalCredit = round2(totalCredit + mapped.amount);
      else totalDebit = round2(totalDebit + mapped.amount);
      previewRows.push({
        ...mapped,
        fingerprint,
        status: isDup ? 'duplicate' : 'new',
      });
    }

    return {
      paymentAccount: account,
      headers,
      suggestedMapping: suggestMapping(headers),
      mapping,
      skipRows,
      rows: previewRows,
      summary: {
        totalTransactions: previewRows.length,
        totalCredits: totalCredit,
        totalDebits: totalDebit,
        duplicates,
        invalid,
        importable: previewRows.filter((r) => r.status === 'new').length,
      },
    };
  }

  import(data, actor, req) {
    requirePerm(actor, 'finance.bank_import.create');
    if (!data.paymentAccountId) throw new AppError('Bank account is required', 400);
    if (!data.confirm) throw new AppError('Import confirmation required', 400);
    const account = accountRepo.findById(data.paymentAccountId);
    if (!account) throw new AppError('Bank account not found', 404);

    const preview = this.preview(data, actor);
    if (data.mapping) bankRepo.saveMapping(account.id, data.mapping, data.skipRows || 0);

    const firm = numberingRepo.getFirm(data.firmId) || numberingRepo.getFirm();
    const batch = bankRepo.createBatch({
      firmId: firm?.id,
      branchId: data.branchId || null,
      paymentAccountId: account.id,
      statementFrom: data.statementFrom || null,
      statementTo: data.statementTo || null,
      fileName: data.fileName || null,
      mapping: preview.mapping,
      rowCount: preview.summary.totalTransactions,
      importedCount: 0,
      duplicateCount: 0,
      invalidCount: preview.summary.invalid,
      totalCredit: preview.summary.totalCredits,
      totalDebit: preview.summary.totalDebits,
      status: 'imported',
      createdBy: actor.user.id,
    });

    let imported = 0;
    let duplicates = 0;
    const created = [];
    for (const row of preview.rows) {
      if (row.status === 'invalid') continue;
      if (row.status === 'duplicate') {
        duplicates += 1;
        continue;
      }
      const result = bankRepo.insertTransaction({
        batchId: batch.id,
        firmId: firm?.id,
        branchId: data.branchId || null,
        paymentAccountId: account.id,
        transactionDate: row.transactionDate,
        valueDate: row.valueDate,
        narration: row.narration,
        description: row.description,
        referenceNumber: row.referenceNumber,
        utrNumber: row.utrNumber,
        chequeNumber: row.chequeNumber,
        debitAmount: row.debitAmount,
        creditAmount: row.creditAmount,
        amount: row.amount,
        direction: row.direction,
        balanceAfter: row.balanceAfter,
        fingerprint: row.fingerprint,
        reconciliationStatus: 'unmatched',
        createdBy: actor.user.id,
      });
      if (result?.duplicate) {
        duplicates += 1;
      } else {
        imported += 1;
        created.push(result);
      }
    }

    // update batch counts
    getDatabase().prepare(`
      UPDATE bank_import_batches SET imported_count = ?, duplicate_count = ? WHERE id = ?
    `).run(imported, duplicates, batch.id);

    auditRepo.create({
      userId: actor.user.id,
      userName: actor.user.fullName,
      action: 'import',
      module: 'finance',
      recordType: 'bank_import_batch',
      recordId: batch.id,
      newValue: { imported, duplicates, accountId: account.id },
      ...meta(req),
    });

    return {
      batch: bankRepo.findBatch(batch.id),
      imported,
      duplicates,
      invalid: preview.summary.invalid,
      items: created.slice(0, 50),
    };
  }

  listTransactions(query, actor) {
    query = withFinancialYear(query);
    requirePerm(actor, 'finance.bank_import.view');
    return bankRepo.list({
      paymentAccountId: query.paymentAccountId,
      status: query.status,
      direction: query.direction,
      dateFrom: query.dateFrom,
      dateTo: query.dateTo,
      customerId: query.customerId,
      supplierId: query.supplierId,
      search: query.search || query.q,
      amountMin: query.amountMin,
      amountMax: query.amountMax,
      limit: query.limit ? parseInt(query.limit, 10) : 100,
      offset: query.offset ? parseInt(query.offset, 10) : 0,
    });
  }

  getTransaction(id, actor) {
    requirePerm(actor, 'finance.bank_import.view');
    const txn = bankRepo.findById(id);
    if (!txn) throw new AppError('Bank transaction not found', 404);
    const possibleVouchers = bankRepo.findPossibleVouchers({
      direction: txn.direction,
      amount: txn.amount,
      date: txn.transactionDate,
      utr: txn.utrNumber,
      reference: txn.referenceNumber,
    });
    return { ...txn, possibleVouchers };
  }

  dashboard(query, actor) {
    requirePerm(actor, 'finance.bank_import.view');
    return bankRepo.dashboard({
      paymentAccountId: query.paymentAccountId,
      dateFrom: query.dateFrom,
      dateTo: query.dateTo,
    });
  }

  listBatches(query, actor) {
    requirePerm(actor, 'finance.bank_import.view');
    return bankRepo.listBatches({
      paymentAccountId: query.paymentAccountId,
      limit: query.limit ? parseInt(query.limit, 10) : 50,
    });
  }

  assertAllocatable(txn) {
    if (!txn) throw new AppError('Bank transaction not found', 404);
    const ok = ['unmatched', 'partially_allocated'].includes(txn.reconciliationStatus);
    if (!ok) {
      throw new AppError(`Cannot allocate transaction in status "${txn.reconciliationStatus}"`, 400);
    }
  }

  allocate(id, data, actor, req) {
    const partyType = String(data.partyType || '').toLowerCase();
    if (partyType === 'customer') return this.allocateCustomer(id, data, actor, req);
    if (partyType === 'supplier') return this.allocateSupplier(id, data, actor, req);
    if (partyType === 'other_income') return this.markOtherIncome(id, data, actor, req);
    if (partyType === 'other_expense') return this.markOtherExpense(id, data, actor, req);
    if (partyType === 'bank_transfer') return this.bankTransfer(id, data, actor, req);
    if (partyType === 'ignore') return this.ignore(id, data, actor, req);
    throw new AppError('Invalid party type', 400);
  }

  allocateCustomer(id, data, actor, req) {
    requirePerm(actor, 'finance.bank_import.approve');
    const txn = bankRepo.findById(id);
    this.assertAllocatable(txn);
    if (txn.direction !== 'credit') throw new AppError('Customer payments require a bank credit', 400);
    if (!data.customerId) throw new AppError('Customer is required', 400);
    const customer = customerRepo.findById(data.customerId);
    if (!customer) throw new AppError('Customer not found', 404);

    const amount = round2(data.amount ?? txn.unallocatedAmount ?? txn.amount);
    if (amount > txn.unallocatedAmount + 0.01) throw new AppError('Allocation exceeds remaining bank amount', 400);
    if (!(amount > 0)) throw new AppError('Amount must be positive', 400);

    const allocations = (data.allocations || []).map((l) => ({
      documentType: 'sales_invoice',
      documentId: l.documentId || l.invoiceId,
      allocatedAmount: round2(l.allocatedAmount ?? l.amount),
    })).filter((l) => l.allocatedAmount > 0);

    const allocSum = round2(allocations.reduce((s, l) => s + l.allocatedAmount, 0));
    if (allocSum > amount + 0.01) throw new AppError('Invoice allocation exceeds payment amount', 400);

    const voucher = customerReceiptService.create({
      customerId: customer.id,
      receiptDate: data.receiptDate || txn.transactionDate,
      paymentMode: 'bank',
      paymentAccountId: txn.paymentAccountId,
      amount,
      allocations,
      allocate: allocations.length ? 'none' : 'auto',
      referenceNumber: txn.referenceNumber,
      utrNumber: txn.utrNumber || txn.referenceNumber,
      remarks: data.remarks || `Bank import: ${txn.narration || ''}`.trim(),
      bankTransactionId: txn.id,
      firmId: txn.firmId,
      post: true,
    }, actor, req);

    const newAllocated = round2(txn.allocatedAmount + amount);
    const newUnallocated = round2(txn.amount - newAllocated);
    const status = newUnallocated <= 0.001 ? 'fully_allocated' : 'partially_allocated';

    const updated = bankRepo.updateReconciliation(txn.id, {
      reconciliationStatus: status,
      allocatedAmount: newAllocated,
      unallocatedAmount: Math.max(0, newUnallocated),
      partyType: 'customer',
      customerId: customer.id,
      voucherType: 'customer_receipt',
      voucherId: voucher.id,
      remarks: data.remarks,
    });

    auditRepo.create({
      userId: actor.user.id,
      userName: actor.user.fullName,
      action: 'allocate_customer',
      module: 'finance',
      recordType: 'bank_transaction',
      recordId: txn.id,
      previousValue: { status: txn.reconciliationStatus },
      newValue: { status, voucherId: voucher.id, amount, customerId: customer.id },
      ...meta(req),
    });

    return { transaction: updated, voucher };
  }

  allocateSupplier(id, data, actor, req) {
    requirePerm(actor, 'finance.bank_import.approve');
    const txn = bankRepo.findById(id);
    this.assertAllocatable(txn);
    if (txn.direction !== 'debit') throw new AppError('Supplier payments require a bank debit', 400);
    if (!data.supplierId) throw new AppError('Supplier is required', 400);
    const supplier = supplierRepo.findById(data.supplierId);
    if (!supplier) throw new AppError('Supplier not found', 404);

    const amount = round2(data.amount ?? txn.unallocatedAmount ?? txn.amount);
    if (amount > txn.unallocatedAmount + 0.01) throw new AppError('Allocation exceeds remaining bank amount', 400);

    const allocations = (data.allocations || []).map((l) => ({
      documentType: 'purchase_bill',
      documentId: l.documentId || l.billId,
      allocatedAmount: round2(l.allocatedAmount ?? l.amount),
    })).filter((l) => l.allocatedAmount > 0);

    const allocSum = round2(allocations.reduce((s, l) => s + l.allocatedAmount, 0));
    if (allocSum > amount + 0.01) throw new AppError('Bill allocation exceeds payment amount', 400);

    const voucher = supplierPaymentVoucherService.create({
      supplierId: supplier.id,
      paymentDate: data.paymentDate || txn.transactionDate,
      paymentMode: 'bank',
      paymentAccountId: txn.paymentAccountId,
      amount,
      allocations,
      allocate: allocations.length ? 'none' : 'auto',
      referenceNumber: txn.referenceNumber,
      utrNumber: txn.utrNumber || txn.referenceNumber,
      remarks: data.remarks || `Bank import: ${txn.narration || ''}`.trim(),
      bankTransactionId: txn.id,
      firmId: txn.firmId,
      post: true,
    }, actor, req);

    const newAllocated = round2(txn.allocatedAmount + amount);
    const newUnallocated = round2(txn.amount - newAllocated);
    const status = newUnallocated <= 0.001 ? 'fully_allocated' : 'partially_allocated';

    const updated = bankRepo.updateReconciliation(txn.id, {
      reconciliationStatus: status,
      allocatedAmount: newAllocated,
      unallocatedAmount: Math.max(0, newUnallocated),
      partyType: 'supplier',
      supplierId: supplier.id,
      voucherType: 'supplier_payment',
      voucherId: voucher.id,
      remarks: data.remarks,
    });

    auditRepo.create({
      userId: actor.user.id,
      userName: actor.user.fullName,
      action: 'allocate_supplier',
      module: 'finance',
      recordType: 'bank_transaction',
      recordId: txn.id,
      previousValue: { status: txn.reconciliationStatus },
      newValue: { status, voucherId: voucher.id, amount, supplierId: supplier.id },
      ...meta(req),
    });

    return { transaction: updated, voucher };
  }

  markOtherIncome(id, data, actor, req) {
    requirePerm(actor, 'finance.bank_import.approve');
    const txn = bankRepo.findById(id);
    this.assertAllocatable(txn);
    if (txn.direction !== 'credit') throw new AppError('Other income requires a bank credit', 400);
    if (!data.categoryId) throw new AppError('Income category is required', 400);

    const amount = round2(data.amount ?? txn.unallocatedAmount);
    const ft = financeService.createTransaction({
      transactionDate: data.transactionDate || txn.transactionDate,
      transactionType: 'income',
      categoryId: data.categoryId,
      amount,
      paymentAccountId: txn.paymentAccountId,
      paymentMode: 'bank',
      referenceNumber: txn.utrNumber || txn.referenceNumber,
      description: data.description || txn.narration || 'Bank other income',
      notes: data.remarks,
      status: 'draft',
    }, actor, req);
    // submit/post via existing workflow — force post path
    let posted = ft;
    try {
      posted = financeService.submitTransaction(ft.id, actor, req);
      if (posted.status === 'pending_approval' && actor.permissions.includes('finance.ledger.approve')) {
        posted = financeService.approveTransaction(ft.id, actor, req);
      }
    } catch {
      posted = ft;
    }

    const updated = bankRepo.updateReconciliation(txn.id, {
      reconciliationStatus: 'other_income',
      allocatedAmount: txn.amount,
      unallocatedAmount: 0,
      partyType: 'other_income',
      financialTransactionId: posted.id,
      remarks: data.remarks,
    });

    auditRepo.create({
      userId: actor.user.id,
      userName: actor.user.fullName,
      action: 'mark_other_income',
      module: 'finance',
      recordType: 'bank_transaction',
      recordId: txn.id,
      newValue: { financialTransactionId: posted.id },
      ...meta(req),
    });
    return { transaction: updated, financialTransaction: posted };
  }

  markOtherExpense(id, data, actor, req) {
    requirePerm(actor, 'finance.bank_import.approve');
    const txn = bankRepo.findById(id);
    this.assertAllocatable(txn);
    if (txn.direction !== 'debit') throw new AppError('Other expense requires a bank debit', 400);
    if (!data.categoryId) throw new AppError('Expense category is required', 400);

    const amount = round2(data.amount ?? txn.unallocatedAmount);
    const ft = financeService.createTransaction({
      transactionDate: data.transactionDate || txn.transactionDate,
      transactionType: 'expense',
      categoryId: data.categoryId,
      amount,
      paymentAccountId: txn.paymentAccountId,
      paymentMode: 'bank',
      referenceNumber: txn.utrNumber || txn.referenceNumber,
      description: data.description || txn.narration || 'Bank other expense',
      notes: data.remarks,
      status: 'draft',
    }, actor, req);
    let posted = ft;
    try {
      posted = financeService.submitTransaction(ft.id, actor, req);
      if (posted.status === 'pending_approval' && actor.permissions.includes('finance.ledger.approve')) {
        posted = financeService.approveTransaction(ft.id, actor, req);
      }
    } catch {
      posted = ft;
    }

    const updated = bankRepo.updateReconciliation(txn.id, {
      reconciliationStatus: 'other_expense',
      allocatedAmount: txn.amount,
      unallocatedAmount: 0,
      partyType: 'other_expense',
      financialTransactionId: posted.id,
      remarks: data.remarks,
    });

    auditRepo.create({
      userId: actor.user.id,
      userName: actor.user.fullName,
      action: 'mark_other_expense',
      module: 'finance',
      recordType: 'bank_transaction',
      recordId: txn.id,
      newValue: { financialTransactionId: posted.id },
      ...meta(req),
    });
    return { transaction: updated, financialTransaction: posted };
  }

  bankTransfer(id, data, actor, req) {
    requirePerm(actor, 'finance.bank_import.approve');
    const txn = bankRepo.findById(id);
    this.assertAllocatable(txn);
    if (!data.destinationAccountId) throw new AppError('Destination account is required', 400);
    if (data.destinationAccountId === txn.paymentAccountId) {
      throw new AppError('Source and destination accounts must differ', 400);
    }
    const dest = accountRepo.findById(data.destinationAccountId);
    if (!dest) throw new AppError('Destination account not found', 404);

    const amount = round2(data.amount ?? txn.amount);
    // Debit on source account = money left → credit (in) on destination
    // Credit on source account = money arrived (e.g. transfer in shown on dest stmt) → debit (out) on linked account
    if (txn.direction === 'debit') {
      cashRepo.create({
        entryDate: txn.transactionDate,
        firmId: txn.firmId,
        paymentAccountId: dest.id,
        direction: 'in',
        amount,
        paymentMode: 'bank',
        reference: txn.utrNumber || txn.referenceNumber || txn.id,
        sourceType: 'bank_transfer',
        sourceId: txn.id,
        createdBy: actor.user.id,
      });
    } else {
      cashRepo.create({
        entryDate: txn.transactionDate,
        firmId: txn.firmId,
        paymentAccountId: dest.id,
        direction: 'out',
        amount,
        paymentMode: 'bank',
        reference: txn.utrNumber || txn.referenceNumber || txn.id,
        sourceType: 'bank_transfer',
        sourceId: txn.id,
        createdBy: actor.user.id,
      });
    }

    const updated = bankRepo.updateReconciliation(txn.id, {
      reconciliationStatus: 'bank_transfer',
      allocatedAmount: txn.amount,
      unallocatedAmount: 0,
      partyType: 'bank_transfer',
      transferAccountId: dest.id,
      remarks: data.remarks || `Transfer with ${dest.name}`,
    });

    auditRepo.create({
      userId: actor.user.id,
      userName: actor.user.fullName,
      action: 'bank_transfer',
      module: 'finance',
      recordType: 'bank_transaction',
      recordId: txn.id,
      newValue: { transferAccountId: dest.id, amount },
      ...meta(req),
    });
    return { transaction: updated };
  }

  ignore(id, data, actor, req) {
    requirePerm(actor, 'finance.bank_import.edit');
    const txn = bankRepo.findById(id);
    if (!txn) throw new AppError('Bank transaction not found', 404);
    if (txn.voucherId) throw new AppError('Cannot ignore a transaction linked to a voucher', 400);
    const updated = bankRepo.updateReconciliation(txn.id, {
      reconciliationStatus: 'ignored',
      ignoreReason: data?.reason || 'Ignored',
      remarks: data?.remarks,
    });
    auditRepo.create({
      userId: actor.user.id,
      userName: actor.user.fullName,
      action: 'ignore',
      module: 'finance',
      recordType: 'bank_transaction',
      recordId: txn.id,
      previousValue: { status: txn.reconciliationStatus },
      newValue: { status: 'ignored', reason: data?.reason },
      ...meta(req),
    });
    return updated;
  }

  linkExistingVoucher(id, data, actor, req) {
    requirePerm(actor, 'finance.bank_import.approve');
    const txn = bankRepo.findById(id);
    this.assertAllocatable(txn);
    if (!data.voucherId || !data.voucherType) throw new AppError('voucherId and voucherType required', 400);

    let voucher = null;
    if (data.voucherType === 'customer_receipt') {
      voucher = repos.customerReceipts.findById(data.voucherId);
      if (!voucher || voucher.status !== 'posted') throw new AppError('Posted customer receipt not found', 404);
      if (Math.abs(voucher.amount - txn.amount) > 0.05) {
        throw new AppError('Voucher amount does not match bank transaction', 400);
      }
    } else if (data.voucherType === 'supplier_payment') {
      voucher = repos.supplierPaymentVouchers.findById(data.voucherId);
      if (!voucher || voucher.status !== 'posted') throw new AppError('Posted supplier payment not found', 404);
      if (Math.abs(voucher.amount - txn.amount) > 0.05) {
        throw new AppError('Voucher amount does not match bank transaction', 400);
      }
    } else {
      throw new AppError('Invalid voucher type', 400);
    }

    const updated = bankRepo.updateReconciliation(txn.id, {
      reconciliationStatus: 'matched',
      allocatedAmount: txn.amount,
      unallocatedAmount: 0,
      partyType: data.voucherType === 'customer_receipt' ? 'customer' : 'supplier',
      customerId: voucher.customerId || null,
      supplierId: voucher.supplierId || null,
      voucherType: data.voucherType,
      voucherId: voucher.id,
      linkedVoucherId: voucher.id,
      remarks: data.remarks || 'Linked to existing voucher',
    });

    try {
      if (data.voucherType === 'customer_receipt') {
        getDatabase().prepare('UPDATE customer_receipts SET bank_transaction_id = ? WHERE id = ? AND bank_transaction_id IS NULL')
          .run(txn.id, voucher.id);
      } else {
        getDatabase().prepare('UPDATE supplier_payment_vouchers SET bank_transaction_id = ? WHERE id = ? AND bank_transaction_id IS NULL')
          .run(txn.id, voucher.id);
      }
    } catch { /* non-fatal */ }

    auditRepo.create({
      userId: actor.user.id,
      userName: actor.user.fullName,
      action: 'link_existing_voucher',
      module: 'finance',
      recordType: 'bank_transaction',
      recordId: txn.id,
      newValue: { voucherId: voucher.id, voucherType: data.voucherType },
      ...meta(req),
    });
    return { transaction: updated, voucher };
  }
}

export const bankImportService = new BankImportService();
