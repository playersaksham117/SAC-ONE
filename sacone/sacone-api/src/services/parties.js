import { AppError } from '../core/http.js';
import { csvBool, csvNumber, parseCsv } from '../core/csv.js';
import { repos } from '../repositories/index.js';
import { isFirmAdmin, authService } from './index.js';

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

/** Shared row loop for customer / supplier CSV imports: update the matching party, else create. */
function importParties(csvText, { repo, map, create, update, label }) {
  const { rows } = parseCsv(csvText, { required: [['name', `${label.toLowerCase()}_name`]] });
  const results = { created: 0, updated: 0, errors: [] };
  for (const { line, data } of rows) {
    try {
      const payload = map(data);
      if (!payload.name) throw new AppError(`${label} name is required`, 400);
      const existingId = repo.findImportMatch(payload);
      if (existingId) {
        update(existingId, payload);
        results.updated += 1;
      } else {
        create(payload);
        results.created += 1;
      }
    } catch (err) {
      results.errors.push({ row: line, name: data.name || data[`${label.toLowerCase()}_name`] || null, message: err.message });
    }
  }
  return results;
}

const gstOf = (d) => (d.gst_number || d.gstin || d.gst || '').replace(/\s/g, '').toUpperCase() || undefined;
const text = (v) => (String(v ?? '').trim() || undefined);

export class CustomerService {
  list(filters, actor) {
    authService.checkPermission(actor.permissions, 'parties.customers.view');
    return customerRepo.findAll({
      search: filters.search || '',
      credit: filters.credit || '',
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
    // Only the firm admin (or group owner) can allow credit; customers from SAC-POS wait for approval.
    if (data.creditApproved === true && isFirmAdmin(actor.user) && !customer.isWalkIn) {
      return customerRepo.setCreditApproval(customer.id, { approved: true, userId: actor.user.id });
    }
    return customer;
  }

  /**
   * Import customers from CSV (name required). Matches existing customers by code, GSTIN or mobile
   * and updates them; others are created. credit_approved is honoured only for the firm admin.
   */
  importCsv(csvText, actor, req) {
    authService.checkPermission(actor.permissions, 'parties.customers.create');
    const admin = isFirmAdmin(actor.user);
    const results = importParties(csvText, {
      repo: customerRepo,
      label: 'Customer',
      map: (d) => ({
        code: text(d.code || d.customer_code)?.toUpperCase(),
        name: text(d.name || d.customer_name),
        phone: text(d.phone || d.mobile),
        email: text(d.email),
        gstNumber: gstOf(d),
        gstStateCode: text(d.gst_state_code || d.state_code),
        address: text(d.address),
        city: text(d.city),
        state: text(d.state),
        creditLimit: csvNumber(d.credit_limit),
        notes: text(d.notes),
        isActive: csvBool(d.is_active, undefined),
        creditApproved: csvBool(d.credit_approved, undefined),
      }),
      create: (row) => {
        const { isActive, creditApproved, ...rest } = row;
        const created = this.create({ ...rest, sourceChannel: 'import', creditApproved: admin && creditApproved === true }, actor, req);
        if (isActive === false) this.update(created.id, { isActive: false }, actor, req);
      },
      update: (id, row) => {
        const { creditApproved, code, ...rest } = row;
        const clean = Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== undefined));
        this.update(id, clean, actor, req);
        if (admin && creditApproved !== undefined && creditApproved !== customerRepo.findById(id).creditApproved) {
          this.setCreditApproval(id, { approved: creditApproved }, actor, req);
        }
      },
    });
    auditRepo.create({
      userId: actor.user.id, userName: actor.user.fullName, action: 'import', module: 'parties',
      recordType: 'customer', newValue: results, ...getRequestMeta(req),
    });
    return results;
  }

  /** Firm admin approves (or withdraws) credit for a customer, optionally setting the limit. */
  setCreditApproval(id, data, actor, req) {
    authService.checkPermission(actor.permissions, 'parties.customers.edit');
    if (!isFirmAdmin(actor.user)) throw new AppError('Only the firm admin or the group owner can approve credit', 403, 'ADMIN_ONLY');
    const existing = customerRepo.findById(id);
    if (!existing) throw new AppError('Customer not found', 404);
    if (existing.isWalkIn) throw new AppError('Walk-in customers cannot buy on credit', 400);
    const approved = data.approved !== false;
    let creditLimit;
    if (data.creditLimit !== undefined && data.creditLimit !== '' && data.creditLimit !== null) {
      creditLimit = Number(data.creditLimit);
      if (!Number.isFinite(creditLimit) || creditLimit < 0) throw new AppError('Credit limit must be zero or more (0 = no limit)', 400);
    }
    if (approved && !existing.phone && !existing.gstNumber) {
      throw new AppError('Add the customer\'s mobile number or GSTIN before approving credit', 400);
    }
    const updated = customerRepo.setCreditApproval(id, { approved, creditLimit, userId: actor.user.id });
    auditRepo.create({
      userId: actor.user.id,
      userName: actor.user.fullName,
      action: approved ? 'approve_credit' : 'withdraw_credit',
      module: 'parties',
      recordType: 'customer',
      recordId: id,
      previousValue: { creditApproved: existing.creditApproved, creditLimit: existing.creditLimit },
      newValue: { creditApproved: updated.creditApproved, creditLimit: updated.creditLimit },
      ...getRequestMeta(req),
    });
    return updated;
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
  /** Import suppliers from CSV (name required); matches by code, GSTIN or mobile and updates them. */
  importCsv(csvText, actor, req) {
    authService.checkPermission(actor.permissions, 'parties.suppliers.create');
    const results = importParties(csvText, {
      repo: supplierRepo,
      label: 'Supplier',
      map: (d) => ({
        code: text(d.code || d.supplier_code)?.toUpperCase(),
        name: text(d.name || d.supplier_name),
        contactName: text(d.contact_name || d.contact_person || d.contact),
        phone: text(d.phone || d.mobile),
        email: text(d.email),
        gstNumber: gstOf(d),
        gstStateCode: text(d.gst_state_code || d.state_code),
        address: text(d.address),
        city: text(d.city),
        state: text(d.state),
        paymentTerms: text(d.payment_terms || d.terms),
        notes: text(d.notes),
        isActive: csvBool(d.is_active, undefined),
      }),
      create: (row) => {
        const { isActive, ...rest } = row;
        const created = this.create(rest, actor, req);
        if (isActive === false) this.update(created.id, { isActive: false }, actor, req);
      },
      update: (id, row) => {
        const { code, ...rest } = row;
        this.update(id, Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== undefined)), actor, req);
      },
    });
    auditRepo.create({
      userId: actor.user.id, userName: actor.user.fullName, action: 'import', module: 'parties',
      recordType: 'supplier', newValue: results, ...getRequestMeta(req),
    });
    return results;
  }

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
