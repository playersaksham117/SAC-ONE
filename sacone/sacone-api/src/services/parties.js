import { AppError } from '../core/http.js';
import { repos } from '../repositories/index.js';
import { authService } from './index.js';

const customerRepo = repos.customers;
const supplierRepo = repos.suppliers;
const billRepo = repos.supplierBills;
const supplierPaymentRepo = repos.supplierPayments;
const auditRepo = repos.auditLogs;

const SOURCE_CHANNELS = new Set(['manual', 'pos', 'web', 'import']);
const PAY_METHODS = new Set(['cash', 'upi', 'bank', 'cheque', 'other']);

function getRequestMeta(req) {
  return {
    ipAddress: req?.ip || req?.headers?.['x-forwarded-for'] || null,
    userAgent: req?.headers?.['user-agent'] || null,
  };
}

function round2(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

export class CustomerService {
  list(filters, actor) {
    authService.checkPermission(actor.permissions, 'parties.customers.view');
    return customerRepo.findAll({
      search: filters.search || '',
      includeInactive: filters.includeInactive === 'true' || filters.includeInactive === true,
      limit: filters.limit ? parseInt(filters.limit, 10) : 100,
      offset: filters.offset ? parseInt(filters.offset, 10) : 0,
    });
  }

  /**
   * Clean lookup API for POS terminal and future web store.
   * Same customer master — never a separate POS/web customer table.
   */
  lookup(query, actor, { limit } = {}) {
    authService.checkPermission(actor.permissions, 'parties.customers.view');
    return {
      items: customerRepo.lookup(query, {
        limit: limit ? parseInt(limit, 10) : 20,
      }),
    };
  }

  getById(id, actor) {
    authService.checkPermission(actor.permissions, 'parties.customers.view');
    const customer = customerRepo.findById(id);
    if (!customer) throw new AppError('Customer not found', 404);
    return customer;
  }

  getWalkIn(actor) {
    authService.checkPermission(actor.permissions, 'parties.customers.view');
    const walkIn = customerRepo.findWalkIn();
    if (!walkIn) throw new AppError('Walk-in customer is not configured', 500);
    return walkIn;
  }

  getSummary(id, actor) {
    authService.checkPermission(actor.permissions, 'parties.customers.view');
    const customer = this.getById(id, actor);
    return {
      customer,
      outstandingBalance: customer.outstandingBalance,
      ...customerRepo.getSummary(id),
    };
  }

  getSalesHistory(id, filters, actor) {
    this.getById(id, actor);
    return customerRepo.listSales(id, {
      limit: filters.limit ? parseInt(filters.limit, 10) : 50,
      offset: filters.offset ? parseInt(filters.offset, 10) : 0,
    });
  }

  getInvoiceHistory(id, filters, actor) {
    // POS invoices are the sales ledger for this master
    return this.getSalesHistory(id, filters, actor);
  }

  getPaymentHistory(id, filters, actor) {
    this.getById(id, actor);
    return customerRepo.listPayments(id, {
      limit: filters.limit ? parseInt(filters.limit, 10) : 100,
      offset: filters.offset ? parseInt(filters.offset, 10) : 0,
    });
  }

  getStatement(id, filters, actor) {
    const customer = this.getById(id, actor);
    const statement = customerRepo.buildStatement(id, {
      dateFrom: filters.dateFrom || '',
      dateTo: filters.dateTo || '',
    });
    return {
      customer: {
        id: customer.id,
        code: customer.code,
        name: customer.name,
        outstandingBalance: customer.outstandingBalance,
      },
      ...statement,
    };
  }

  create(data, actor, req) {
    authService.checkPermission(actor.permissions, 'parties.customers.create');
    if (!data.name?.trim()) throw new AppError('Customer name is required', 400);
    const code = (data.code || customerRepo.nextCode()).trim().toUpperCase();
    if (customerRepo.codeExists(code)) throw new AppError('Customer code already exists', 409);

    const sourceChannel = data.sourceChannel || 'manual';
    if (!SOURCE_CHANNELS.has(sourceChannel)) {
      throw new AppError('Invalid source channel', 400);
    }

    const customer = customerRepo.create({
      code,
      name: data.name.trim(),
      phone: data.phone,
      email: data.email,
      gstNumber: data.gstNumber,
      gstStateCode: data.gstStateCode,
      address: data.address,
      city: data.city,
      state: data.state,
      creditLimit: data.creditLimit,
      notes: data.notes,
      sourceChannel,
      createdBy: actor.user.id,
    });

    auditRepo.create({
      userId: actor.user.id,
      userName: actor.user.fullName,
      action: 'create',
      module: 'parties',
      recordType: 'customer',
      recordId: customer.id,
      newValue: customer,
      ...getRequestMeta(req),
    });
    return customer;
  }

  update(id, data, actor, req) {
    authService.checkPermission(actor.permissions, 'parties.customers.edit');
    const existing = customerRepo.findById(id);
    if (!existing) throw new AppError('Customer not found', 404);
    if (existing.isWalkIn && data.isActive === false) {
      throw new AppError('Walk-in customer cannot be deactivated', 400);
    }
    if (data.code && customerRepo.codeExists(data.code, id)) {
      throw new AppError('Customer code already exists', 409);
    }
    if (data.sourceChannel && !SOURCE_CHANNELS.has(data.sourceChannel)) {
      throw new AppError('Invalid source channel', 400);
    }
    const updated = customerRepo.update(id, data);
    auditRepo.create({
      userId: actor.user.id,
      userName: actor.user.fullName,
      action: 'update',
      module: 'parties',
      recordType: 'customer',
      recordId: id,
      previousValue: existing,
      newValue: updated,
      ...getRequestMeta(req),
    });
    return updated;
  }
}

export class SupplierService {
  list(filters, actor) {
    authService.checkPermission(actor.permissions, 'parties.suppliers.view');
    return supplierRepo.findAll({
      search: filters.search || '',
      includeInactive: filters.includeInactive === 'true' || filters.includeInactive === true,
      limit: filters.limit ? parseInt(filters.limit, 10) : 100,
      offset: filters.offset ? parseInt(filters.offset, 10) : 0,
    });
  }

  lookup(query, actor, { limit } = {}) {
    authService.checkPermission(actor.permissions, 'parties.suppliers.view');
    return {
      items: supplierRepo.lookup(query, { limit: limit ? parseInt(limit, 10) : 20 }),
    };
  }

  getById(id, actor) {
    authService.checkPermission(actor.permissions, 'parties.suppliers.view');
    const supplier = supplierRepo.findById(id);
    if (!supplier) throw new AppError('Supplier not found', 404);
    return supplier;
  }

  getSummary(id, actor) {
    authService.checkPermission(actor.permissions, 'parties.suppliers.view');
    const supplier = this.getById(id, actor);
    return {
      supplier,
      outstandingPayable: supplier.outstandingPayable,
      ...supplierRepo.getSummary(id),
    };
  }

  getPurchaseHistory(id, filters, actor) {
    this.getById(id, actor);
    return billRepo.listBySupplier(id, {
      limit: filters.limit ? parseInt(filters.limit, 10) : 50,
      offset: filters.offset ? parseInt(filters.offset, 10) : 0,
    });
  }

  getPaymentHistory(id, filters, actor) {
    this.getById(id, actor);
    return supplierPaymentRepo.listBySupplier(id, {
      limit: filters.limit ? parseInt(filters.limit, 10) : 100,
      offset: filters.offset ? parseInt(filters.offset, 10) : 0,
    });
  }

  getStatement(id, filters, actor) {
    const supplier = this.getById(id, actor);
    const statement = supplierPaymentRepo.buildStatement(id, {
      dateFrom: filters.dateFrom || '',
      dateTo: filters.dateTo || '',
    });
    return {
      supplier: {
        id: supplier.id,
        code: supplier.code,
        name: supplier.name,
        outstandingPayable: supplier.outstandingPayable,
      },
      ...statement,
    };
  }

  create(data, actor, req) {
    authService.checkPermission(actor.permissions, 'parties.suppliers.create');
    if (!data.name?.trim()) throw new AppError('Supplier name is required', 400);
    const code = (data.code || supplierRepo.nextCode()).trim().toUpperCase();
    if (supplierRepo.codeExists(code)) throw new AppError('Supplier code already exists', 409);

    const supplier = supplierRepo.create({
      code,
      name: data.name.trim(),
      contactName: data.contactName,
      phone: data.phone,
      email: data.email,
      gstNumber: data.gstNumber,
      gstStateCode: data.gstStateCode,
      address: data.address,
      city: data.city,
      state: data.state,
      paymentTerms: data.paymentTerms,
      notes: data.notes,
      createdBy: actor.user.id,
    });

    auditRepo.create({
      userId: actor.user.id,
      userName: actor.user.fullName,
      action: 'create',
      module: 'parties',
      recordType: 'supplier',
      recordId: supplier.id,
      newValue: supplier,
      ...getRequestMeta(req),
    });
    return supplier;
  }

  update(id, data, actor, req) {
    authService.checkPermission(actor.permissions, 'parties.suppliers.edit');
    const existing = supplierRepo.findById(id);
    if (!existing) throw new AppError('Supplier not found', 404);
    if (data.code && supplierRepo.codeExists(data.code, id)) {
      throw new AppError('Supplier code already exists', 409);
    }
    const updated = supplierRepo.update(id, data);
    auditRepo.create({
      userId: actor.user.id,
      userName: actor.user.fullName,
      action: 'update',
      module: 'parties',
      recordType: 'supplier',
      recordId: id,
      previousValue: existing,
      newValue: updated,
      ...getRequestMeta(req),
    });
    return updated;
  }

  /** Record a purchase bill (also used later by Purchases module) */
  createBill(supplierId, data, actor, req) {
    authService.checkPermission(actor.permissions, 'parties.suppliers.edit');
    const supplier = this.getById(supplierId, actor);
    const grandTotal = round2(data.grandTotal);
    if (!Number.isFinite(grandTotal) || grandTotal <= 0) {
      throw new AppError('Bill amount must be positive', 400);
    }

    const bill = billRepo.create({
      supplierId: supplier.id,
      billNumber: data.billNumber,
      billDate: data.billDate,
      dueDate: data.dueDate,
      subtotal: data.subtotal != null ? round2(data.subtotal) : grandTotal,
      gstAmount: round2(data.gstAmount || 0),
      grandTotal,
      notes: data.notes,
      referenceType: data.referenceType || 'manual',
      referenceId: data.referenceId || null,
      createdBy: actor.user.id,
    });
    supplierRepo.adjustPayable(supplier.id, grandTotal);

    auditRepo.create({
      userId: actor.user.id,
      userName: actor.user.fullName,
      action: 'create',
      module: 'parties',
      recordType: 'supplier_bill',
      recordId: bill.id,
      newValue: bill,
      ...getRequestMeta(req),
    });
    return bill;
  }

  createPayment(supplierId, data, actor, req) {
    authService.checkPermission(actor.permissions, 'parties.suppliers.edit');
    const supplier = this.getById(supplierId, actor);
    const method = String(data.method || '').toLowerCase();
    if (!PAY_METHODS.has(method)) throw new AppError('Invalid payment method', 400);
    const amount = round2(data.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new AppError('Payment amount must be positive', 400);
    }

    if (data.billId) {
      const bill = billRepo.findById(data.billId);
      if (!bill || bill.supplierId !== supplier.id) {
        throw new AppError('Bill not found for this supplier', 404);
      }
    }

    const payment = supplierPaymentRepo.create({
      supplierId: supplier.id,
      billId: data.billId || null,
      paymentDate: data.paymentDate,
      method,
      amount,
      reference: data.reference,
      notes: data.notes,
      createdBy: actor.user.id,
    });

    if (data.billId) {
      billRepo.applyPayment(data.billId, amount);
    }
    supplierRepo.adjustPayable(supplier.id, -amount);

    auditRepo.create({
      userId: actor.user.id,
      userName: actor.user.fullName,
      action: 'create',
      module: 'parties',
      recordType: 'supplier_payment',
      recordId: payment.id,
      newValue: payment,
      ...getRequestMeta(req),
    });
    return payment;
  }
}

export const customerService = new CustomerService();
export const supplierService = new SupplierService();
