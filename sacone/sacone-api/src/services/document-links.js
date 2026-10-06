import crypto from 'crypto';
import { AppError } from '../core/http.js';
import { config } from '../config/index.js';
import { repos } from '../repositories/index.js';
import { DocumentShareLinkRepository } from '../repositories/sqlite/document-share-links.js';
import { authService, companyService } from './index.js';
import { settingsService } from './pos.js';

const linkRepo = new DocumentShareLinkRepository();
const saleRepo = repos.posSales;
const customerRepo = repos.customers;
const auditRepo = repos.auditLogs;

const SALE_INVOICE = 'sale_invoice';
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
/** One message for missing, expired, revoked and deleted, so a link can't be probed for which it is. */
const GONE = () => new AppError('This invoice link has expired or is no longer valid. Ask the shop to share it again.', 410, 'LINK_EXPIRED');

const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

function meta(req) {
  return {
    ipAddress: req?.ip || null,
    userAgent: String(req?.headers?.['user-agent'] || '').slice(0, 200) || null,
  };
}

const pick = (obj, keys) => (obj ? Object.fromEntries(keys.filter((k) => obj[k] !== undefined).map((k) => [k, obj[k]])) : null);

const SALE_FIELDS = [
  'invoiceNumber', 'createdAt', 'createdByName', 'customerIsWalkIn', 'customerName', 'customerPhone',
  'subtotal', 'itemDiscountTotal', 'invoiceDiscount', 'taxableAmount', 'cgstAmount', 'sgstAmount', 'igstAmount',
  'gstAmount', 'grandTotal', 'amountPaid', 'amountCredit', 'paymentStatus', 'salesAgentName', 'notes',
];
const ITEM_FIELDS = ['productName', 'hsnCode', 'quantity', 'unit', 'unitPrice', 'discountAmount', 'taxableAmount', 'gstAmount', 'gstPercentage', 'lineTotal'];
const PAYMENT_FIELDS = ['method', 'reference', 'amount'];
/** Only what the invoice prints — never credit limits, balances, email or internal notes. */
const CUSTOMER_FIELDS = ['gstNumber', 'gstStateCode', 'address', 'city', 'state', 'postalCode', 'shippingAddress', 'shippingCity', 'shippingState', 'shippingPostal'];
const COMPANY_FIELDS = ['businessName', 'addressLine1', 'addressLine2', 'city', 'state', 'postalCode', 'phone', 'gstNumber', 'gstStateCode'];

function invoiceView(sale) {
  const customer = sale.customerId && !sale.customerIsWalkIn ? customerRepo.findById(sale.customerId) : null;
  return {
    sale: {
      ...pick(sale, SALE_FIELDS),
      items: (sale.items || []).map((l) => pick(l, ITEM_FIELDS)),
      payments: (sale.payments || []).map((p) => pick(p, PAYMENT_FIELDS)),
    },
    customer: pick(customer, CUSTOMER_FIELDS),
    company: pick(companyService.get(), COMPANY_FIELDS),
    invoice: settingsService.getInvoiceSettings(),
  };
}

function shareableSale(id) {
  const sale = saleRepo.findById(id);
  if (!sale || sale.status === 'voided') return null;
  return sale;
}

export const documentLinkService = {
  isEnabled() {
    return Boolean(config.publicDocumentBaseUrl);
  },

  status(saleId, actor) {
    authService.checkPermission(actor.permissions, 'pos.sales.view');
    return {
      enabled: this.isEnabled(),
      ttlHours: config.documentLinkTtlHours,
      activeLinks: this.isEnabled() ? linkRepo.activeCount(SALE_INVOICE, saleId) : 0,
    };
  },

  /** A signed-in user who may view sales creates a short-lived link to one invoice. */
  createSaleLink(saleId, actor, req) {
    authService.checkPermission(actor.permissions, 'pos.sales.view');
    if (!this.isEnabled()) {
      throw new AppError('Invoice links are off: set PUBLIC_DOCUMENT_BASE_URL to the ERP\'s public https:// address.', 409, 'SHARE_LINKS_DISABLED');
    }
    const sale = shareableSale(saleId);
    if (!sale) throw new AppError('Sale not found', 404);

    linkRepo.purgeOld();
    const token = crypto.randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + config.documentLinkTtlHours * 3600000).toISOString();
    const link = linkRepo.create({ tokenHash: hashToken(token), documentType: SALE_INVOICE, documentId: sale.id, expiresAt, createdBy: actor.user.id });
    auditRepo.create({
      userId: actor.user.id, userName: actor.user.fullName,
      action: 'share_link_create', module: 'pos', recordType: 'document_share_link', recordId: link.id,
      newValue: { documentType: SALE_INVOICE, documentId: sale.id, invoiceNumber: sale.invoiceNumber, expiresAt },
      ...meta(req),
    });
    // The token rides in the URL fragment, which browsers never send to servers, proxies or logs.
    return { url: `${config.publicDocumentBaseUrl}/share#${token}`, expiresAt, invoiceNumber: sale.invoiceNumber };
  },

  revokeSaleLinks(saleId, actor, req) {
    authService.checkPermission(actor.permissions, 'pos.sales.view');
    const revoked = linkRepo.revokeForDocument(SALE_INVOICE, saleId);
    if (revoked) {
      auditRepo.create({
        userId: actor.user.id, userName: actor.user.fullName,
        action: 'share_link_revoke', module: 'pos', recordType: 'pos_sale', recordId: saleId,
        newValue: { revoked }, ...meta(req),
      });
    }
    return { revoked };
  },

  /** Public: exchange a link token for the minimum data needed to show that one invoice. */
  resolve(token, req) {
    if (!this.isEnabled() || typeof token !== 'string' || !TOKEN_PATTERN.test(token)) throw GONE();
    const link = linkRepo.findByTokenHash(hashToken(token));
    if (!link || link.revokedAt || new Date(link.expiresAt).getTime() <= Date.now()) throw GONE();
    const sale = link.documentType === SALE_INVOICE ? shareableSale(link.documentId) : null;
    if (!sale) throw GONE();

    linkRepo.recordAccess(link.id);
    auditRepo.create({
      userId: null, userName: 'Shared link',
      action: 'share_link_open', module: 'pos', recordType: 'document_share_link', recordId: link.id,
      newValue: { documentId: link.documentId, accessCount: link.accessCount + 1 }, ...meta(req),
    });
    return { ...invoiceView(sale), expiresAt: link.expiresAt };
  },
};
