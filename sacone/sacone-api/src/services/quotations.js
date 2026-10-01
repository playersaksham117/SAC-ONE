import { AppError } from '../core/http.js';
import { generateId, nowIso } from '../core/utils.js';
import { getFinancialYear } from '../core/financial-year.js';
import { repos } from '../repositories/index.js';
import { authService } from './index.js';
import { calculateCartTotals, posService } from './pos.js';
import { buildQuotationDocument } from './document-template.js';
import { documentShareService } from './document-share.js';

const quoteRepo = repos.quotations;
const customerRepo = repos.customers;
const productRepo = repos.products;
const companyRepo = repos.company;
const warehouseRepo = repos.warehouses;
const settingsRepo = repos.systemSettings;
const auditRepo = repos.auditLogs;
const numberingRepo = repos.documentNumbering;

const EDITABLE_STATUSES = new Set(['draft', 'sent']);
const CONVERTIBLE_STATUSES = new Set(['draft', 'sent', 'accepted']);

function getRequestMeta(req) {
  return {
    ipAddress: req?.ip || req?.headers?.['x-forwarded-for'] || null,
    userAgent: req?.headers?.['user-agent'] || null,
  };
}

function buildCustomerSnapshot(customer, overrides = {}) {
  if (!customer && !overrides.name) return {};
  const billingAddress = overrides.billingAddress ?? customer?.address ?? '';
  const shippingAddress = overrides.shippingAddress ?? customer?.shippingAddress ?? billingAddress;
  return {
    name: overrides.name ?? customer?.name ?? '',
    businessName: overrides.businessName ?? customer?.businessName ?? customer?.name ?? '',
    contactPerson: overrides.contactPerson ?? customer?.contactPerson ?? '',
    phone: overrides.phone ?? customer?.phone ?? '',
    email: overrides.email ?? customer?.email ?? '',
    gstNumber: overrides.gstNumber ?? customer?.gstNumber ?? '',
    billingAddress,
    billingCity: overrides.billingCity ?? customer?.city ?? '',
    billingState: overrides.billingState ?? customer?.state ?? '',
    billingPostal: overrides.billingPostal ?? customer?.postalCode ?? '',
    shippingAddress,
    shippingCity: overrides.shippingCity ?? customer?.shippingCity ?? overrides.billingCity ?? customer?.city ?? '',
    shippingState: overrides.shippingState ?? customer?.shippingState ?? overrides.billingState ?? customer?.state ?? '',
    shippingPostal: overrides.shippingPostal ?? customer?.shippingPostal ?? overrides.billingPostal ?? customer?.postalCode ?? '',
  };
}

export class QuotationService {
  #enrichItems(items, actor, { allowPriceEdit = true, allowDiscount = true } = {}) {
    return items.map((item, index) => {
      const product = productRepo.findById(item.productId);
      if (!product || !product.isActive) {
        throw new AppError(`Product not found on line ${index + 1}`, 400);
      }
      const defaultPrice = product.sellingPrice;
      let unitPrice = item.unitPrice != null ? Number(item.unitPrice) : defaultPrice;
      if (unitPrice !== defaultPrice && !allowPriceEdit) {
        authService.checkPermission(actor.permissions, 'pos.pricing.edit');
      }
      let discountAmount = Number(item.discountAmount || 0);
      const discountPercent = Number(item.discountPercent || 0);
      if ((discountAmount > 0 || discountPercent > 0) && !allowDiscount) {
        authService.checkPermission(actor.permissions, 'pos.pricing.edit');
      }
      return {
        productId: product.id,
        productName: product.name,
        sku: product.sku,
        hsnCode: product.hsnCode,
        unitAbbreviation: product.unitAbbreviation || product.unitName || null,
        quantity: item.quantity,
        unitPrice,
        discountAmount,
        discountPercent,
        gstPercentage: item.gstPercentage != null ? item.gstPercentage : product.gstPercentage,
      };
    });
  }

  #computeTotals(data, customer, items) {
    const company = companyRepo.get();
    return calculateCartTotals(items, data.invoiceDiscount || 0, {
      companyStateCode: company?.gstStateCode,
      customerStateCode: customer?.gstStateCode || data.customerSnapshot?.billingState,
    });
  }

  list(filters, actor) {
    authService.checkPermission(actor.permissions, 'pos.quotations.view');
    return quoteRepo.findAll({
      search: filters.search || '',
      status: filters.status || '',
      customerId: filters.customerId || '',
      limit: filters.limit ? parseInt(filters.limit, 10) : 50,
      offset: filters.offset ? parseInt(filters.offset, 10) : 0,
    });
  }

  getById(id, actor) {
    authService.checkPermission(actor.permissions, 'pos.quotations.view');
    const quote = quoteRepo.findById(id);
    if (!quote) throw new AppError('Quotation not found', 404);
    quote.shareHistory = repos.documentShareLog.listForDocument('quotation', id);
    return quote;
  }

  preview(data, actor) {
    authService.checkPermission(actor.permissions, 'pos.quotations.view');
    const customer = data.customerId ? customerRepo.findById(data.customerId) : null;
    const items = this.#enrichItems(data.items || [], actor);
    return this.#computeTotals(data, customer, items);
  }

  create(data, actor, req) {
    authService.checkPermission(actor.permissions, 'pos.quotations.create');
    if (!Array.isArray(data.items) || !data.items.length) {
      throw new AppError('Quotation must have at least one item', 400);
    }

    const firm = numberingRepo.getFirm();
    if (!firm) throw new AppError('Company not configured', 400);

    let customerId = data.customerId;
    const walkIn = customerRepo.findWalkIn();
    if (!customerId) {
      if (!settingsRepo.getBoolean('pos.allow_walk_in_quotation', true)) {
        throw new AppError('Customer is required for quotation', 400);
      }
      customerId = walkIn?.id || null;
    }
    const customer = customerId ? customerRepo.findById(customerId) : null;
    if (customerId && !customer?.isActive) throw new AppError('Customer not found', 400);

    const items = this.#enrichItems(data.items, actor);
    const totals = this.#computeTotals(data, customer, items);
    const quotationDate = data.quotationDate || nowIso().slice(0, 10);
    const fy = getFinancialYear(quotationDate);
    const validityDays = parseInt(settingsRepo.get('quotation.default_validity_days')?.value || '15', 10);
    const validUntil = data.validUntil || new Date(Date.now() + validityDays * 86400000).toISOString().slice(0, 10);

    const allocated = numberingRepo.allocateNumber(firm.id, 'quotation', quotationDate);
    const snapshot = buildCustomerSnapshot(customer, data.customerSnapshot || {});

    const quote = quoteRepo.create({
      header: {
        quotationNumber: allocated.documentNumber,
        firmId: firm.id,
        warehouseId: data.warehouseId || warehouseRepo.findDefault()?.id || null,
        customerId,
        status: data.status === 'sent' ? 'sent' : 'draft',
        quotationDate,
        validUntil,
        financialYear: fy,
        ...totals,
        notes: data.notes,
        termsConditions: data.termsConditions,
        customerSnapshot: snapshot,
        sentAt: data.status === 'sent' ? nowIso() : null,
        createdBy: actor.user.id,
      },
      items: totals.items.map((item) => ({ ...item, id: generateId() })),
    });

    auditRepo.create({
      userId: actor.user.id,
      userName: actor.user.fullName,
      action: 'create',
      module: 'pos',
      recordType: 'quotation',
      recordId: quote.id,
      newValue: { quotationNumber: quote.quotationNumber, grandTotal: quote.grandTotal },
      ...getRequestMeta(req),
    });

    return quote;
  }

  update(id, data, actor, req) {
    authService.checkPermission(actor.permissions, 'pos.quotations.edit');
    const existing = quoteRepo.findById(id);
    if (!existing) throw new AppError('Quotation not found', 404);
    if (!EDITABLE_STATUSES.has(existing.status)) {
      throw new AppError(`Cannot edit quotation in status: ${existing.status}`, 400);
    }

    const customer = data.customerId
      ? customerRepo.findById(data.customerId)
      : (existing.customerId ? customerRepo.findById(existing.customerId) : null);
    const items = this.#enrichItems(data.items || [], actor);
    const totals = this.#computeTotals(data, customer, items);
    const snapshot = buildCustomerSnapshot(customer, {
      ...existing.customerSnapshot,
      ...(data.customerSnapshot || {}),
    });

    const quote = quoteRepo.update(id, {
      header: {
        warehouseId: data.warehouseId,
        customerId: data.customerId ?? existing.customerId,
        status: data.status || existing.status,
        quotationDate: data.quotationDate || existing.quotationDate,
        validUntil: data.validUntil || existing.validUntil,
        ...totals,
        notes: data.notes,
        termsConditions: data.termsConditions,
        customerSnapshot: snapshot,
        updatedBy: actor.user.id,
      },
      items: totals.items.map((item) => ({ ...item, id: generateId() })),
    });

    auditRepo.create({
      userId: actor.user.id,
      userName: actor.user.fullName,
      action: 'update',
      module: 'pos',
      recordType: 'quotation',
      recordId: id,
      ...getRequestMeta(req),
    });

    return quote;
  }

  cancel(id, actor, req) {
    authService.checkPermission(actor.permissions, 'pos.quotations.delete');
    const quote = quoteRepo.findById(id);
    if (!quote) throw new AppError('Quotation not found', 404);
    if (quote.status === 'converted') throw new AppError('Converted quotation cannot be cancelled', 400);
    const updated = quoteRepo.updateStatus(id, 'cancelled', { updatedBy: actor.user.id });
    repos.documentShareLog.create({
      documentType: 'quotation',
      documentId: id,
      documentNumber: quote.quotationNumber,
      action: 'cancelled',
      status: 'success',
      createdBy: actor.user.id,
    });
    auditRepo.create({
      userId: actor.user.id,
      userName: actor.user.fullName,
      action: 'cancel',
      module: 'pos',
      recordType: 'quotation',
      recordId: id,
      ...getRequestMeta(req),
    });
    return updated;
  }

  getDocumentHtml(id, actor) {
    authService.checkPermission(actor.permissions, 'pos.quotations.view');
    const quote = quoteRepo.findById(id);
    if (!quote) throw new AppError('Quotation not found', 404);
    const firm = numberingRepo.getFirm(quote.firmId);
    return buildQuotationDocument({ firm, quotation: quote });
  }

  recordPrint(id, actor, req) {
    authService.checkPermission(actor.permissions, 'pos.quotations.approve');
    const quote = quoteRepo.findById(id);
    if (!quote) throw new AppError('Quotation not found', 404);
    repos.documentShareLog.create({
      documentType: 'quotation',
      documentId: id,
      documentNumber: quote.quotationNumber,
      action: 'printed',
      status: 'success',
      createdBy: actor.user.id,
    });
    auditRepo.create({
      userId: actor.user.id,
      userName: actor.user.fullName,
      action: 'print',
      module: 'pos',
      recordType: 'quotation',
      recordId: id,
      ...getRequestMeta(req),
    });
    return { ok: true };
  }

  recordPdf(id, actor, req) {
    authService.checkPermission(actor.permissions, 'pos.quotations.approve');
    const quote = quoteRepo.findById(id);
    if (!quote) throw new AppError('Quotation not found', 404);
    repos.documentShareLog.create({
      documentType: 'quotation',
      documentId: id,
      documentNumber: quote.quotationNumber,
      action: 'pdf_generated',
      status: 'success',
      createdBy: actor.user.id,
    });
    return { html: this.getDocumentHtml(id, actor) };
  }

  getWhatsAppShare(id, actor) {
    authService.checkPermission(actor.permissions, 'pos.quotations.approve');
    const quote = quoteRepo.findById(id);
    if (!quote) throw new AppError('Quotation not found', 404);
    const firm = companyRepo.get();
    const phone = (quote.customerSnapshot?.phone || '').replace(/\D/g, '');
    const customerName = quote.customerSnapshot?.businessName || quote.customerSnapshot?.name || 'Customer';
    const message = `Dear ${customerName},\n\nPlease find quotation ${quote.quotationNumber} from ${firm?.businessName || 'us'}.\n\nTotal: ₹${quote.grandTotal.toFixed(2)}\nValid until: ${quote.validUntil || '—'}\n\nThank you,\n${firm?.businessName || ''}`;
    repos.documentShareLog.create({
      documentType: 'quotation',
      documentId: id,
      documentNumber: quote.quotationNumber,
      action: 'whatsapp_share',
      channel: 'whatsapp',
      recipient: phone || null,
      status: 'attempted',
      message: 'WhatsApp share initiated by user',
      createdBy: actor.user.id,
    });
    auditRepo.create({
      userId: actor.user.id,
      userName: actor.user.fullName,
      action: 'whatsapp_share',
      module: 'pos',
      recordType: 'quotation',
      recordId: id,
      ...getRequestMeta(req),
    });
    return documentShareService.buildWhatsAppLink({ phone, message });
  }

  sendEmail(id, data, actor, req) {
    authService.checkPermission(actor.permissions, 'pos.quotations.approve');
    const quote = quoteRepo.findById(id);
    if (!quote) throw new AppError('Quotation not found', 404);
    const firm = companyRepo.get();
    const toEmail = data.toEmail || quote.customerSnapshot?.email;
    if (!toEmail) throw new AppError('Customer email is required', 400);

    const subjectTpl = settingsRepo.get('email.default_subject')?.value || 'Quotation {NUMBER} from {FIRM}';
    const bodyTpl = settingsRepo.get('email.default_body')?.value || 'Dear {CUSTOMER},\n\nPlease find attached quotation {NUMBER}.\n\nRegards,\n{FIRM}';
    const signature = settingsRepo.get('email.signature')?.value || '';
    const customerName = quote.customerSnapshot?.businessName || quote.customerSnapshot?.name || 'Customer';

    const subject = subjectTpl
      .replace(/\{NUMBER\}/g, quote.quotationNumber)
      .replace(/\{FIRM\}/g, firm?.businessName || '');
    const body = `${bodyTpl
      .replace(/\{CUSTOMER\}/g, customerName)
      .replace(/\{NUMBER\}/g, quote.quotationNumber)
      .replace(/\{FIRM\}/g, firm?.businessName || '')}${signature ? `\n\n${signature}` : ''}`;

    const html = this.getDocumentHtml(id, actor);
    const result = documentShareService.sendEmail({
      toEmail,
      subject,
      body,
      htmlAttachment: html,
      documentType: 'quotation',
      documentId: id,
      createdBy: actor.user.id,
    });

    repos.documentShareLog.create({
      documentType: 'quotation',
      documentId: id,
      documentNumber: quote.quotationNumber,
      action: result.success ? 'email_sent' : 'email_failed',
      channel: 'email',
      recipient: toEmail,
      status: result.success ? 'success' : 'failed',
      message: result.message,
      createdBy: actor.user.id,
    });

    auditRepo.create({
      userId: actor.user.id,
      userName: actor.user.fullName,
      action: 'email',
      module: 'pos',
      recordType: 'quotation',
      recordId: id,
      newValue: { toEmail, success: result.success },
      ...getRequestMeta(req),
    });

    if (!result.success) throw new AppError(result.message, 400);
    if (quote.status === 'draft') {
      quoteRepo.updateStatus(id, 'sent', { sentAt: nowIso(), updatedBy: actor.user.id });
    }
    return result;
  }

  convertToSale(id, data, actor, req) {
    authService.checkPermission(actor.permissions, 'pos.quotations.approve');
    const quote = quoteRepo.findById(id);
    if (!quote) throw new AppError('Quotation not found', 404);
    if (!CONVERTIBLE_STATUSES.has(quote.status)) {
      throw new AppError(`Quotation cannot be converted from status: ${quote.status}`, 400);
    }

    const sale = posService.checkout({
      warehouseId: data.warehouseId || quote.warehouseId,
      customerId: quote.customerId,
      invoiceDiscount: quote.invoiceDiscount,
      notes: data.notes || quote.notes,
      quotationId: quote.id,
      items: quote.items.map((item) => ({
        productId: item.productId,
        quantity: item.quantity,
        unitPrice: data.refreshPrices ? undefined : item.unitPrice,
        discountAmount: item.discountAmount,
        discountPercent: item.discountPercent,
        gstPercentage: item.gstPercentage,
      })),
      payments: data.payments,
    }, actor, req);

    quoteRepo.updateStatus(id, 'converted', {
      convertedSaleId: sale.id,
      updatedBy: actor.user.id,
    });

    repos.documentShareLog.create({
      documentType: 'quotation',
      documentId: id,
      documentNumber: quote.quotationNumber,
      action: 'converted',
      status: 'success',
      metadataJson: { saleId: sale.id, invoiceNumber: sale.invoiceNumber },
      createdBy: actor.user.id,
    });

    auditRepo.create({
      userId: actor.user.id,
      userName: actor.user.fullName,
      action: 'convert_to_sale',
      module: 'pos',
      recordType: 'quotation',
      recordId: id,
      newValue: { saleId: sale.id, invoiceNumber: sale.invoiceNumber },
      ...getRequestMeta(req),
    });

    return { quotation: quoteRepo.findById(id), sale };
  }
}

export const quotationService = new QuotationService();
