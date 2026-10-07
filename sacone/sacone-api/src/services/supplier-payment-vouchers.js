import { withFinancialYear } from '../database/context.js';
import { AppError } from '../core/http.js';
import { repos } from '../repositories/index.js';
import { authService } from './index.js';
import {
  allocationStatus,
  round2,
} from '../repositories/sqlite/party-payments.js';

const voucherRepo = repos.supplierPaymentVouchers;
const cashRepo = repos.cashBook;
const supplierRepo = repos.suppliers;
const billRepo = repos.supplierBills;
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
      documentType: l.documentType || 'purchase_bill',
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
      documentType: 'purchase_bill',
      documentId: doc.id,
      allocatedAmount: take,
      billNumber: doc.billNumber,
      billDate: doc.billDate,
      billAmount: doc.billAmount,
      previousDue: due,
      remainingDue: round2(due - take),
    });
    remaining = round2(remaining - take);
  }
  return { lines, unallocated: remaining };
}

function validateAllocationsAgainstOpen(supplierId, amount, allocations) {
  const open = voucherRepo.listOpenBills(supplierId);
  const byId = Object.fromEntries(open.map((d) => [d.id, d]));
  let sum = 0;
  for (const line of allocations) {
    if (line.documentType === 'purchase_bill') {
      const doc = byId[line.documentId];
      if (!doc) throw new AppError('Purchase bill not found or not open for this supplier', 400);
      if (line.allocatedAmount > doc.previousDue + 0.01) {
        throw new AppError(`Allocation exceeds due on ${doc.billNumber}`, 400);
      }
    }
    sum = round2(sum + line.allocatedAmount);
  }
  if (sum > amount + 0.01) throw new AppError('Total allocation exceeds payment amount', 400);
  return sum;
}

export class SupplierPaymentVoucherService {
  list(query, actor) {
    query = withFinancialYear(query);
    requirePerm(actor, 'parties.supplier_payments.view');
    return voucherRepo.list({
      supplierId: query.supplierId,
      status: query.status,
      firmId: query.firmId,
      dateFrom: query.dateFrom,
      dateTo: query.dateTo,
      limit: query.limit ? parseInt(query.limit, 10) : 50,
      offset: query.offset ? parseInt(query.offset, 10) : 0,
    });
  }

  getById(id, actor) {
    requirePerm(actor, 'parties.supplier_payments.view');
    const voucher = voucherRepo.findById(id);
    if (!voucher) throw new AppError('Payment voucher not found', 404);
    return { ...voucher, allocations: voucherRepo.listAllocations(id) };
  }

  openBills(supplierId, actor) {
    requirePerm(actor, 'parties.supplier_payments.view');
    if (!supplierRepo.findById(supplierId)) throw new AppError('Supplier not found', 404);
    return voucherRepo.listOpenBills(supplierId);
  }

  previewAllocate(data, actor) {
    requirePerm(actor, 'parties.supplier_payments.create');
    const supplierId = data.supplierId;
    const amount = round2(data.amount);
    if (!supplierId) throw new AppError('Supplier is required', 400);
    if (!(amount > 0)) throw new AppError('Amount must be positive', 400);
    const open = voucherRepo.listOpenBills(supplierId);
    if (data.mode === 'manual' && Array.isArray(data.allocations)) {
      const allocations = normalizeAllocations(data.allocations);
      validateAllocationsAgainstOpen(supplierId, amount, allocations);
      const sum = round2(allocations.reduce((s, l) => s + l.allocatedAmount, 0));
      return {
        allocations: allocations.map((l) => {
          const doc = open.find((d) => d.id === l.documentId);
          return {
            ...l,
            billNumber: doc?.billNumber,
            billDate: doc?.billDate,
            billAmount: doc?.billAmount,
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
    requirePerm(actor, 'parties.supplier_payments.create');
    const supplier = supplierRepo.findById(data.supplierId);
    if (!supplier) throw new AppError('Supplier not found', 404);
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
      'supplier_payment',
      data.paymentDate || new Date()
    );

    let allocations = normalizeAllocations(data.allocations);
    if (data.allocate === 'auto' || (!allocations.length && data.allocate !== 'none')) {
      allocations = autoAllocate(voucherRepo.listOpenBills(supplier.id), amount).lines.map((l) => ({
        documentType: l.documentType,
        documentId: l.documentId,
        allocatedAmount: l.allocatedAmount,
      }));
    } else if (allocations.length) {
      validateAllocationsAgainstOpen(supplier.id, amount, allocations);
    }
    const allocatedAmount = round2(allocations.reduce((s, l) => s + l.allocatedAmount, 0));

    const voucher = voucherRepo.create({
      voucherNumber: documentNumber,
      firmId: firm?.id || null,
      paymentDate: data.paymentDate,
      supplierId: supplier.id,
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
      recordType: 'supplier_payment_voucher',
      recordId: voucher.id,
      newValue: voucher,
      ...meta(req),
    });

    if (data.post === true || data.status === 'posted') {
      return this.post(voucher.id, actor, req);
    }
    return this.getById(voucher.id, actor);
  }

  update(id, data, actor, req) {
    requirePerm(actor, 'parties.supplier_payments.edit');
    const existing = voucherRepo.findById(id);
    if (!existing) throw new AppError('Payment voucher not found', 404);
    if (existing.status !== 'draft') throw new AppError('Only draft vouchers can be edited', 400);

    const amount = data.amount != null ? round2(data.amount) : existing.amount;
    let allocations;
    if (data.allocate === 'auto') {
      allocations = autoAllocate(voucherRepo.listOpenBills(existing.supplierId), amount).lines.map((l) => ({
        documentType: l.documentType,
        documentId: l.documentId,
        allocatedAmount: l.allocatedAmount,
      }));
    } else if (Array.isArray(data.allocations)) {
      allocations = normalizeAllocations(data.allocations);
      validateAllocationsAgainstOpen(existing.supplierId, amount, allocations);
    }

    const allocatedAmount = allocations
      ? round2(allocations.reduce((s, l) => s + l.allocatedAmount, 0))
      : undefined;

    const updated = voucherRepo.updateDraft(id, {
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
      recordType: 'supplier_payment_voucher',
      recordId: id,
      previousValue: existing,
      newValue: updated,
      ...meta(req),
    });
    return this.getById(id, actor);
  }

  post(id, actor, req) {
    requirePerm(actor, 'parties.supplier_payments.approve');
    const voucher = voucherRepo.findById(id);
    if (!voucher) throw new AppError('Payment voucher not found', 404);
    if (voucher.status !== 'draft') throw new AppError('Only draft vouchers can be posted', 400);
    if (!voucher.paymentAccountId) throw new AppError('Payment account is required to post', 400);

    const allocations = voucherRepo.listAllocations(id);
    const billAllocs = allocations.filter((a) => a.documentType === 'purchase_bill');
    validateAllocationsAgainstOpen(
      voucher.supplierId,
      voucher.amount,
      billAllocs.map((a) => ({
        documentType: a.documentType,
        documentId: a.documentId,
        allocatedAmount: a.allocatedAmount,
      }))
    );

    for (const line of billAllocs) {
      billRepo.applyPayment(line.documentId, line.allocatedAmount);
    }
    supplierRepo.adjustPayable(voucher.supplierId, -voucher.amount);
    cashRepo.create({
      entryDate: voucher.paymentDate,
      firmId: voucher.firmId,
      paymentAccountId: voucher.paymentAccountId,
      direction: 'out',
      amount: voucher.amount,
      paymentMode: voucher.paymentMode,
      reference: voucher.voucherNumber,
      sourceType: 'supplier_payment',
      sourceId: voucher.id,
      createdBy: actor.user.id,
    });
    const posted = voucherRepo.markPosted(id);

    auditRepo.create({
      userId: actor.user.id,
      userName: actor.user.fullName,
      action: 'post',
      module: 'parties',
      recordType: 'supplier_payment_voucher',
      recordId: id,
      previousValue: voucher,
      newValue: posted,
      ...meta(req),
    });
    return this.getById(id, actor);
  }

  cancel(id, data, actor, req) {
    requirePerm(actor, 'parties.supplier_payments.approve');
    const voucher = voucherRepo.findById(id);
    if (!voucher) throw new AppError('Payment voucher not found', 404);
    if (voucher.status === 'cancelled') throw new AppError('Already cancelled', 400);

    if (voucher.status === 'draft') {
      const cancelled = voucherRepo.markCancelled(id, data?.reason || 'Draft discarded');
      auditRepo.create({
        userId: actor.user.id,
        userName: actor.user.fullName,
        action: 'cancel',
        module: 'parties',
        recordType: 'supplier_payment_voucher',
        recordId: id,
        previousValue: voucher,
        newValue: cancelled,
        ...meta(req),
      });
      return this.getById(id, actor);
    }

    const allocations = voucherRepo.listAllocations(id);
    for (const line of allocations.filter((a) => a.documentType === 'purchase_bill')) {
      billRepo.applyPayment(line.documentId, -line.allocatedAmount);
    }
    supplierRepo.adjustPayable(voucher.supplierId, voucher.amount);
    cashRepo.reverseSource('supplier_payment', voucher.id, actor.user.id);
    const cancelled = voucherRepo.markCancelled(id, data?.reason || 'Cancelled');

    auditRepo.create({
      userId: actor.user.id,
      userName: actor.user.fullName,
      action: 'cancel',
      module: 'parties',
      recordType: 'supplier_payment_voucher',
      recordId: id,
      previousValue: voucher,
      newValue: cancelled,
      ...meta(req),
    });
    return this.getById(id, actor);
  }
}

export const supplierPaymentVoucherService = new SupplierPaymentVoucherService();
