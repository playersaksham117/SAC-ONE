import { withFinancialYear } from '../database/context.js';
import { AppError } from '../core/http.js';
import { repos } from '../repositories/index.js';
import { authService } from './index.js';
import { commissionService } from './commissions.js';
import {
  allocationStatus,
  round2,
} from '../repositories/sqlite/party-payments.js';

const receiptRepo = repos.customerReceipts;
const cashRepo = repos.cashBook;
const customerRepo = repos.customers;
const accountRepo = repos.financeAccounts;
const numberingRepo = repos.documentNumbering;
const auditRepo = repos.auditLogs;

const PAY_MODES = new Set(['cash', 'bank', 'upi', 'cheque', 'card', 'other']);

function meta(req) {
  return {
    ipAddress: req?.ip || req?.headers?.['x-forwarded-for'] || null,
    userAgent: req?.headers?.['user-agent'] || null,
  };
}

function requirePerm(actor, key) {
  authService.checkPermission(actor.permissions, key);
}

function normalizeAllocations(lines = []) {
  return (lines || [])
    .map((l) => ({
      documentType: l.documentType || 'sales_invoice',
      documentId: l.documentId || null,
      allocatedAmount: round2(l.allocatedAmount ?? l.amount ?? 0),
    }))
    .filter((l) => l.allocatedAmount > 0);
}

function autoAllocate(openDocs, amount) {
  let remaining = round2(amount);
  const lines = [];
  for (const doc of openDocs) {
    if (remaining <= 0.001) break;
    const due = round2(doc.previousDue);
    if (due <= 0.001) continue;
    const take = round2(Math.min(due, remaining));
    lines.push({
      documentType: 'sales_invoice',
      documentId: doc.id,
      allocatedAmount: take,
      invoiceNumber: doc.invoiceNumber,
      invoiceDate: doc.invoiceDate,
      invoiceAmount: doc.invoiceAmount,
      previousDue: due,
      remainingDue: round2(due - take),
    });
    remaining = round2(remaining - take);
  }
  return { lines, unallocated: remaining };
}

function validateAllocationsAgainstOpen(customerId, amount, allocations) {
  const open = receiptRepo.listOpenInvoices(customerId);
  const byId = Object.fromEntries(open.map((d) => [d.id, d]));
  let sum = 0;
  for (const line of allocations) {
    if (line.documentType === 'sales_invoice') {
      const doc = byId[line.documentId];
      if (!doc) throw new AppError('Invoice not found or not open for this customer', 400);
      if (line.allocatedAmount > doc.previousDue + 0.01) {
        throw new AppError(`Allocation exceeds due on ${doc.invoiceNumber}`, 400);
      }
    }
    sum = round2(sum + line.allocatedAmount);
  }
  if (sum > amount + 0.01) throw new AppError('Total allocation exceeds receipt amount', 400);
  return sum;
}

export class CustomerReceiptService {
  list(query, actor) {
    query = withFinancialYear(query);
    requirePerm(actor, 'parties.customer_receipts.view');
    return receiptRepo.list({
      customerId: query.customerId,
      status: query.status,
      firmId: query.firmId,
      dateFrom: query.dateFrom,
      dateTo: query.dateTo,
      limit: query.limit ? parseInt(query.limit, 10) : 50,
      offset: query.offset ? parseInt(query.offset, 10) : 0,
    });
  }

  getById(id, actor) {
    requirePerm(actor, 'parties.customer_receipts.view');
    const receipt = receiptRepo.findById(id);
    if (!receipt) throw new AppError('Receipt voucher not found', 404);
    return { ...receipt, allocations: receiptRepo.listAllocations(id) };
  }

  openInvoices(customerId, actor) {
    requirePerm(actor, 'parties.customer_receipts.view');
    if (!customerRepo.findById(customerId)) throw new AppError('Customer not found', 404);
    return receiptRepo.listOpenInvoices(customerId);
  }

  previewAllocate(data, actor) {
    requirePerm(actor, 'parties.customer_receipts.create');
    const customerId = data.customerId;
    const amount = round2(data.amount);
    if (!customerId) throw new AppError('Customer is required', 400);
    if (!(amount > 0)) throw new AppError('Amount must be positive', 400);
    const open = receiptRepo.listOpenInvoices(customerId);
    if (data.mode === 'manual' && Array.isArray(data.allocations)) {
      const allocations = normalizeAllocations(data.allocations);
      validateAllocationsAgainstOpen(customerId, amount, allocations);
      const sum = round2(allocations.reduce((s, l) => s + l.allocatedAmount, 0));
      return {
        allocations: allocations.map((l) => {
          const doc = open.find((d) => d.id === l.documentId);
          return {
            ...l,
            invoiceNumber: doc?.invoiceNumber,
            invoiceDate: doc?.invoiceDate,
            invoiceAmount: doc?.invoiceAmount,
            previousDue: doc?.previousDue,
            remainingDue: doc ? round2(doc.previousDue - l.allocatedAmount) : null,
          };
        }),
        allocatedAmount: sum,
        unallocatedAmount: round2(amount - sum),
        allocationStatus: allocationStatus(amount, sum),
      };
    }
    const { lines, unallocated } = autoAllocate(open, amount);
    const allocated = round2(amount - unallocated);
    return {
      allocations: lines,
      allocatedAmount: allocated,
      unallocatedAmount: unallocated,
      allocationStatus: allocationStatus(amount, allocated),
    };
  }

  create(data, actor, req) {
    requirePerm(actor, 'parties.customer_receipts.create');
    const customer = customerRepo.findById(data.customerId);
    if (!customer) throw new AppError('Customer not found', 404);
    const amount = round2(data.amount);
    if (!(amount > 0)) throw new AppError('Amount must be positive', 400);
    const mode = String(data.paymentMode || '').toLowerCase();
    if (!PAY_MODES.has(mode)) throw new AppError('Invalid payment mode', 400);
    if (data.paymentAccountId && !accountRepo.findById(data.paymentAccountId)) {
      throw new AppError('Invalid payment account', 400);
    }

    const firm = numberingRepo.getFirm(data.firmId) || numberingRepo.getFirm();
    numberingRepo.ensureDefaultSeries(firm?.id);
    const { documentNumber } = numberingRepo.allocateNumber(
      firm?.id,
      'customer_receipt',
      data.receiptDate || new Date()
    );

    let allocations = normalizeAllocations(data.allocations);
    if (data.allocate === 'auto' || (!allocations.length && data.allocate !== 'none')) {
      allocations = autoAllocate(receiptRepo.listOpenInvoices(customer.id), amount).lines.map((l) => ({
        documentType: l.documentType,
        documentId: l.documentId,
        allocatedAmount: l.allocatedAmount,
      }));
    } else if (allocations.length) {
      validateAllocationsAgainstOpen(customer.id, amount, allocations);
    }
    const allocatedAmount = round2(allocations.reduce((s, l) => s + l.allocatedAmount, 0));

    const receipt = receiptRepo.create({
      voucherNumber: documentNumber,
      firmId: firm?.id || null,
      receiptDate: data.receiptDate,
      customerId: customer.id,
      paymentMode: mode,
      paymentAccountId: data.paymentAccountId,
      amount,
      allocatedAmount,
      allocations,
      referenceNumber: data.referenceNumber,
      utrNumber: data.utrNumber,
      transactionId: data.transactionId,
      chequeNumber: data.chequeNumber,
      chequeDate: data.chequeDate,
      chequeBank: data.chequeBank,
      remarks: data.remarks,
      bankTransactionId: data.bankTransactionId || null,
      createdBy: actor.user.id,
    });

    auditRepo.create({
      userId: actor.user.id,
      userName: actor.user.fullName,
      action: 'create',
      module: 'parties',
      recordType: 'customer_receipt',
      recordId: receipt.id,
      newValue: receipt,
      ...meta(req),
    });

    if (data.post === true || data.status === 'posted') {
      return this.post(receipt.id, actor, req);
    }
    return this.getById(receipt.id, actor);
  }

  update(id, data, actor, req) {
    requirePerm(actor, 'parties.customer_receipts.edit');
    const existing = receiptRepo.findById(id);
    if (!existing) throw new AppError('Receipt voucher not found', 404);
    if (existing.status !== 'draft') throw new AppError('Only draft receipts can be edited', 400);

    const amount = data.amount != null ? round2(data.amount) : existing.amount;
    let allocations;
    if (data.allocate === 'auto') {
      allocations = autoAllocate(receiptRepo.listOpenInvoices(existing.customerId), amount).lines.map((l) => ({
        documentType: l.documentType,
        documentId: l.documentId,
        allocatedAmount: l.allocatedAmount,
      }));
    } else if (Array.isArray(data.allocations)) {
      allocations = normalizeAllocations(data.allocations);
      validateAllocationsAgainstOpen(existing.customerId, amount, allocations);
    }

    const allocatedAmount = allocations
      ? round2(allocations.reduce((s, l) => s + l.allocatedAmount, 0))
      : undefined;

    const updated = receiptRepo.updateDraft(id, {
      ...data,
      amount,
      allocatedAmount,
      allocations,
      paymentMode: data.paymentMode ? String(data.paymentMode).toLowerCase() : undefined,
    });

    auditRepo.create({
      userId: actor.user.id,
      userName: actor.user.fullName,
      action: 'edit',
      module: 'parties',
      recordType: 'customer_receipt',
      recordId: id,
      previousValue: existing,
      newValue: updated,
      ...meta(req),
    });
    return this.getById(id, actor);
  }

  post(id, actor, req) {
    requirePerm(actor, 'parties.customer_receipts.approve');
    const receipt = receiptRepo.findById(id);
    if (!receipt) throw new AppError('Receipt voucher not found', 404);
    if (receipt.status !== 'draft') throw new AppError('Only draft receipts can be posted', 400);
    if (!receipt.paymentAccountId) throw new AppError('Payment account is required to post', 400);

    const allocations = receiptRepo.listAllocations(id);
    const invoiceAllocs = allocations.filter((a) => a.documentType === 'sales_invoice');
    validateAllocationsAgainstOpen(
      receipt.customerId,
      receipt.amount,
      invoiceAllocs.map((a) => ({
        documentType: a.documentType,
        documentId: a.documentId,
        allocatedAmount: a.allocatedAmount,
      }))
    );

    for (const line of invoiceAllocs) {
      receiptRepo.applyInvoiceAllocation(line.documentId, line.allocatedAmount);
      try {
        commissionService.refreshForSalePayment(line.documentId, actor, req);
      } catch (err) {
        console.error('Commission eligibility refresh failed:', err.message);
      }
    }
    customerRepo.adjustOutstanding(receipt.customerId, -receipt.amount);
    cashRepo.create({
      entryDate: receipt.receiptDate,
      firmId: receipt.firmId,
      paymentAccountId: receipt.paymentAccountId,
      direction: 'in',
      amount: receipt.amount,
      paymentMode: receipt.paymentMode,
      reference: receipt.voucherNumber,
      sourceType: 'customer_receipt',
      sourceId: receipt.id,
      createdBy: actor.user.id,
    });
    const posted = receiptRepo.markPosted(id);

    auditRepo.create({
      userId: actor.user.id,
      userName: actor.user.fullName,
      action: 'post',
      module: 'parties',
      recordType: 'customer_receipt',
      recordId: id,
      previousValue: receipt,
      newValue: posted,
      ...meta(req),
    });
    return this.getById(id, actor);
  }

  cancel(id, data, actor, req) {
    requirePerm(actor, 'parties.customer_receipts.approve');
    const receipt = receiptRepo.findById(id);
    if (!receipt) throw new AppError('Receipt voucher not found', 404);
    if (receipt.status === 'cancelled') throw new AppError('Already cancelled', 400);

    if (receipt.status === 'draft') {
      const cancelled = receiptRepo.markCancelled(id, data?.reason || 'Draft discarded');
      auditRepo.create({
        userId: actor.user.id,
        userName: actor.user.fullName,
        action: 'cancel',
        module: 'parties',
        recordType: 'customer_receipt',
        recordId: id,
        previousValue: receipt,
        newValue: cancelled,
        ...meta(req),
      });
      return this.getById(id, actor);
    }

    const allocations = receiptRepo.listAllocations(id);
    for (const line of allocations.filter((a) => a.documentType === 'sales_invoice')) {
      receiptRepo.reverseInvoiceAllocation(line.documentId, line.allocatedAmount);
    }
    customerRepo.adjustOutstanding(receipt.customerId, receipt.amount);
    cashRepo.reverseSource('customer_receipt', receipt.id, actor.user.id);
    const cancelled = receiptRepo.markCancelled(id, data?.reason || 'Cancelled');

    auditRepo.create({
      userId: actor.user.id,
      userName: actor.user.fullName,
      action: 'cancel',
      module: 'parties',
      recordType: 'customer_receipt',
      recordId: id,
      previousValue: receipt,
      newValue: cancelled,
      ...meta(req),
    });
    return this.getById(id, actor);
  }
}

export const customerReceiptService = new CustomerReceiptService();
