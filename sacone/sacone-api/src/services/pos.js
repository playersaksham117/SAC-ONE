import crypto from 'crypto';
import { withFinancialYear } from '../database/context.js';
import { AppError } from '../core/http.js';
import { generateId, nowIso } from '../core/utils.js';
import { MOVEMENT_TYPES } from '../core/inventory-constants.js';
import { financialYearOf } from '../core/financial-year.js';
import { customerPoFrom } from '../core/customer-po.js';
import { getDatabase } from '../database/connection.js';
import { repos } from '../repositories/index.js';
import { authService, isFirmAdmin } from './index.js';
import { inventoryMovementService } from './inventory.js';
import { customerService } from './parties.js';
import { commissionService } from './commissions.js';
import { numberOldCreditNotes } from './notes.js';
import { shipToFrom, transportFrom } from '../core/dispatch.js';
import { assertSerialsFree, cleanSerials, saveSaleSerials } from './warranty.js';
import { isDate, istDate, istToIso } from '../core/ist.js';
import { stateCodeOf } from '../core/gst-state.js';

export { customerService };

const settingsRepo = repos.systemSettings;
const customerRepo = repos.customers;
const saleRepo = repos.posSales;
const heldRepo = repos.posHeldBills;
const returnRepo = repos.posReturns;
const productRepo = repos.products;
const companyRepo = repos.company;
const warehouseRepo = repos.warehouses;
const stockRepo = repos.stockLevels;
const auditRepo = repos.auditLogs;

const PAYMENT_METHODS = new Set(['cash', 'upi', 'bank', 'credit']);
const REFUND_METHODS = new Set(['cash', 'upi', 'bank', 'credit_note']);

function getRequestMeta(req) {
  return {
    ipAddress: req?.ip || req?.headers?.['x-forwarded-for'] || null,
    userAgent: req?.headers?.['user-agent'] || null,
  };
}

function round2(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

/**
 * Selling prices are treated as exclusive of GST.
 * Line: (unitPrice * qty) - discount -> taxable; GST on taxable; total = taxable + GST.
 * Invoice discount is spread proportionally across line taxables.
 */
/**
 * HSN / SAC code for a bill line: the one given for this line (Edit bill lets the admin correct
 * it), else the product's. 2–8 digits.
 */
function lineHsn(given, product) {
  const code = String(given ?? '').replace(/\s/g, '');
  if (!code) return product.hsnCode;
  if (!/^\d{2,8}$/.test(code)) throw new AppError(`HSN / SAC for ${product.name} must be 2 to 8 digits`, 400, 'BAD_HSN');
  return code;
}

export function calculateCartTotals(rawItems, invoiceDiscount = 0, { companyStateCode = null, customerStateCode = null } = {}) {
  if (!Array.isArray(rawItems) || rawItems.length === 0) {
    throw new AppError('Cart must contain at least one item', 400);
  }

  const lines = rawItems.map((item, index) => {
    const quantity = Number(item.quantity);
    const unitPrice = Number(item.unitPrice);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      throw new AppError(`Invalid quantity on line ${index + 1}`, 400);
    }
    if (!Number.isFinite(unitPrice) || unitPrice < 0) {
      throw new AppError(`Invalid unit price on line ${index + 1}`, 400);
    }

    const gross = round2(unitPrice * quantity);
    let discountAmount = Number(item.discountAmount || 0);
    const discountPercent = Number(item.discountPercent || 0);
    if (discountPercent > 0) {
      discountAmount = round2(gross * (discountPercent / 100));
    }
    if (discountAmount < 0 || discountAmount > gross + 0.001) {
      throw new AppError(`Invalid discount on line ${index + 1}`, 400);
    }

    const taxableBeforeInvoice = round2(gross - discountAmount);
    const gstPercentage = Number(item.gstPercentage || 0);

    return {
      ...item,
      quantity,
      unitPrice,
      discountAmount,
      discountPercent,
      gstPercentage,
      gross,
      taxableBeforeInvoice,
    };
  });

  const subtotal = round2(lines.reduce((s, l) => s + l.gross, 0));
  const itemDiscountTotal = round2(lines.reduce((s, l) => s + l.discountAmount, 0));
  const taxableBeforeInvoice = round2(lines.reduce((s, l) => s + l.taxableBeforeInvoice, 0));
  const invoiceDiscountValue = round2(Math.max(0, Number(invoiceDiscount || 0)));
  if (invoiceDiscountValue > taxableBeforeInvoice + 0.001) {
    throw new AppError('Invoice discount cannot exceed taxable amount', 400);
  }

  let allocated = 0;
  const computed = lines.map((line, index) => {
    let share = 0;
    if (invoiceDiscountValue > 0 && taxableBeforeInvoice > 0) {
      if (index === lines.length - 1) {
        share = round2(invoiceDiscountValue - allocated);
      } else {
        share = round2((line.taxableBeforeInvoice / taxableBeforeInvoice) * invoiceDiscountValue);
        allocated = round2(allocated + share);
      }
    }
    const taxableAmount = round2(line.taxableBeforeInvoice - share);
    const gstAmount = round2(taxableAmount * (line.gstPercentage / 100));
    const lineTotal = round2(taxableAmount + gstAmount);
    return {
      productId: line.productId,
      productName: line.productName,
      sku: line.sku,
      hsnCode: line.hsnCode,
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      discountAmount: line.discountAmount,
      discountPercent: line.discountPercent,
      gstPercentage: line.gstPercentage,
      taxableAmount,
      gstAmount,
      lineTotal,
      invoiceDiscountShare: share,
    };
  });

  const taxableAmount = round2(computed.reduce((s, l) => s + l.taxableAmount, 0));
  const gstAmount = round2(computed.reduce((s, l) => s + l.gstAmount, 0));
  const grandTotal = round2(computed.reduce((s, l) => s + l.lineTotal, 0));

  const sameState = !customerStateCode
    || !companyStateCode
    || String(customerStateCode) === String(companyStateCode);
  const cgstAmount = sameState ? round2(gstAmount / 2) : 0;
  const sgstAmount = sameState ? round2(gstAmount / 2) : 0;
  const igstAmount = sameState ? 0 : gstAmount;

  return {
    items: computed,
    subtotal,
    itemDiscountTotal,
    invoiceDiscount: invoiceDiscountValue,
    taxableAmount,
    cgstAmount,
    sgstAmount,
    igstAmount,
    gstAmount,
    grandTotal,
    taxSplit: sameState ? 'cgst_sgst' : 'igst',
  };
}

/** Defaults match migration 028; empty values print nothing. */
/**
 * Bank details printed under "Our Bankers" (and used for the UPI pay QR), or null.
 * withImage: include the uploaded QR image; phones instead get qrImageVersion and fetch it once.
 */
export function bankForPrint(acct, { withImage = true } = {}) {
  if (!acct) return null;
  const image = acct.hasUpiQrImage ? repos.financeAccounts.getUpiQrImage(acct.id) : null;
  if (!(acct.accountNumber || acct.upiId || image)) return null;
  return {
    hasQrImage: Boolean(image),
    qrImageVersion: image ? crypto.createHash('sha1').update(image).digest('hex').slice(0, 12) : null,
    ...(withImage && image ? { qrImage: image } : {}),
    id: acct.id,
    name: acct.name,
    bankName: acct.bankName,
    accountHolder: acct.accountHolder,
    accountNumber: acct.accountNumber,
    ifsc: acct.ifsc,
    branch: acct.branch,
    accountType: acct.bankAccountType,
    upiId: acct.upiId,
  };
}

/** The firm's signature and stamp images (Settings → Signature & stamp), kept as firm settings. */
export const SIGN_KEYS = { sign: 'invoice.sign_image', stamp: 'invoice.stamp_image' };
const IMAGE_SETTING_KEYS = new Set(Object.values(SIGN_KEYS));
const imageVersion = (...images) => {
  const present = images.filter(Boolean);
  return present.length ? crypto.createHash('sha1').update(present.join('|')).digest('hex').slice(0, 12) : null;
};

/**
 * What prints in the "For <firm> / Authorised Signatory" box. withImage: include the images;
 * phones get only the version and fetch the images once (GET /api/v1/sync/sign-stamp).
 */
export function signStampForPrint({ withImage = true } = {}) {
  const sign = settingsRepo.get(SIGN_KEYS.sign)?.value || null;
  const stamp = settingsRepo.get(SIGN_KEYS.stamp)?.value || null;
  return {
    print: settingsRepo.getBoolean('invoice.print_sign_stamp', true),
    hasSign: Boolean(sign),
    hasStamp: Boolean(stamp),
    version: imageVersion(sign, stamp),
    ...(withImage ? { signImage: sign, stampImage: stamp } : {}),
  };
}

/** Barcode label defaults (Settings → Barcode labels), for anyone printing labels in the ERP or on SAC-POS. */
export function labelPrintSettings() {
  const company = companyRepo.get();
  return {
    size: settingsRepo.get('label.size')?.value || null,
    fields: settingsRepo.get('label.fields')?.value || null,
    footer: settingsRepo.get('label.footer')?.value || '',
    businessName: company?.businessName || '',
  };
}

export function invoicePrintSettings({ withImage = true } = {}) {
  const get = (key, fallback = '') => {
    const value = settingsRepo.get(key)?.value;
    return value === undefined || value === null ? fallback : String(value);
  };
  return {
    layout: get('invoice.layout', 'classic') === 'modern' ? 'modern' : 'classic',
    copyLabel: get('invoice.copy_label', 'ORIGINAL FOR RECIPIENT'),
    bankDetails: get('invoice.bank_details'),
    bank: bankForPrint(repos.financeAccounts.findDefault(), { withImage }),
    // 'generated' = QR made from the UPI ID with the amount filled in; 'uploaded' = the firm's own QR image.
    upiQrSource: get('invoice.upi_qr_source', 'generated') === 'uploaded' ? 'uploaded' : 'generated',
    // Settings → Invoice printing: UPI pay QR on printed bills, and the scan-to-pay QR on SAC-POS.
    printUpiQr: settingsRepo.getBoolean('invoice.upi_qr_print', true),
    posUpiQr: settingsRepo.getBoolean('pos.upi_qr_screen', true),
    terms: get('invoice.terms'),
    declaration: get('invoice.declaration', 'Certified that the particulars given above are true and correct.'),
    signStamp: signStampForPrint({ withImage }),
  };
}

export class SettingsService {
  list(actor) {
    authService.checkPermission(actor.permissions, 'core.system_settings.view');
    // Images are large; they come from GET /api/settings/invoice instead.
    return settingsRepo.getAll().filter((s) => !IMAGE_SETTING_KEYS.has(s.key));
  }

  /** Upload / remove the firm's signature and stamp, and switch printing them on bills. */
  saveSignStamp(data, actor, req) {
    authService.checkPermission(actor.permissions, 'core.system_settings.edit');
    for (const [field, key, label] of [['signImage', SIGN_KEYS.sign, 'signature'], ['stampImage', SIGN_KEYS.stamp, 'stamp']]) {
      if (data[field] === undefined) continue;
      const image = String(data[field] ?? '').trim();
      if (image && !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(image)) {
        throw new AppError(`Upload the ${label} as a PNG, JPG or WebP image`, 400);
      }
      if (image.length > 700000) throw new AppError(`The ${label} image is too large (keep it under 500 KB)`, 400);
      settingsRepo.upsert(key, image, `Firm ${label} printed on bills`, actor.user.id);
      auditRepo.create({
        userId: actor.user.id, userName: actor.user.fullName, action: image ? 'update' : 'delete', module: 'core',
        recordType: 'system_setting', recordId: key, newValue: { key, uploaded: Boolean(image) }, ...getRequestMeta(req),
      });
    }
    if (data.print !== undefined) settingsRepo.upsert('invoice.print_sign_stamp', data.print ? 'true' : 'false', 'Print signature and stamp on bills', actor.user.id);
    return signStampForPrint();
  }

  /** Barcode label defaults: any signed-in user can print labels. */
  getLabelSettings() {
    return labelPrintSettings();
  }

  /** Invoice print settings (any signed-in user prints invoices; editing needs system settings). */
  getInvoiceSettings() {
    return invoicePrintSettings();
  }

  getPublicPosSettings() {
    return {
      allowNegativeStock: settingsRepo.getBoolean('allow_negative_stock', false),
    };
  }

  update(key, value, actor, req) {
    authService.checkPermission(actor.permissions, 'core.system_settings.edit');
    if (IMAGE_SETTING_KEYS.has(key)) throw new AppError('Upload the signature or stamp from Settings → Signature & stamp', 400);
    const updated = settingsRepo.upsert(key, value, null, actor.user.id);
    auditRepo.create({
      userId: actor.user.id,
      userName: actor.user.fullName,
      action: 'update',
      module: 'core',
      recordType: 'system_setting',
      recordId: key,
      newValue: updated,
      ...getRequestMeta(req),
    });
    return updated;
  }
}

export class PosService {
  #allowNegativeStock() {
    return settingsRepo.getBoolean('allow_negative_stock', false);
  }

  getBootstrap(actor) {
    authService.checkPermission(actor.permissions, 'pos.terminal.view');
    const warehouses = warehouseRepo.findAll({ includeInactive: false });
    const defaultWarehouse = warehouses.find((w) => w.isDefault) || warehouses[0] || null;
    const walkIn = customerRepo.findWalkIn();
    const company = companyRepo.get();
    return {
      warehouses,
      defaultWarehouse,
      walkInCustomer: walkIn,
      company: company ? {
        businessName: company.businessName,
        gstNumber: company.gstNumber,
        gstStateCode: company.gstStateCode,
        address: company.address,
        city: company.city,
        state: company.state,
        phone: company.phone,
      } : null,
      salesAgents: repos.salesAgents.list({ status: 'active', limit: 500 }),
      settings: {
        allowNegativeStock: this.#allowNegativeStock(),
      },
    };
  }

  searchProducts(query, actor) {
    authService.checkPermission(actor.permissions, 'pos.terminal.view');
    const q = String(query || '').trim();
    if (!q) return { items: [] };

    // Exact barcode / SKU first for scanner speed
    const byBarcode = productRepo.findByBarcode(q);
    if (byBarcode?.isActive) return { items: [byBarcode], match: 'barcode' };
    const bySku = productRepo.findBySku(q);
    if (bySku?.isActive) return { items: [bySku], match: 'sku' };

    const list = productRepo.findAll({ search: q, isActive: true, limit: 30, offset: 0 });
    return { items: list.items, match: 'search' };
  }

  preview(data, actor) {
    authService.checkPermission(actor.permissions, 'pos.terminal.view');
    const company = companyRepo.get();
    const customer = data.customerId
      ? customerRepo.findById(data.customerId)
      : customerRepo.findWalkIn();
    const enriched = this.#enrichCartItems(data.items || []);
    return calculateCartTotals(enriched, data.invoiceDiscount || 0, {
      companyStateCode: stateCodeOf(company),
      customerStateCode: stateCodeOf(customer),
    });
  }

  #enrichCartItems(items) {
    return items.map((item) => {
      const product = productRepo.findById(item.productId);
      if (!product || !product.isActive) {
        throw new AppError(`Product not found: ${item.productId}`, 400);
      }
      return {
        productId: product.id,
        productName: product.name,
        sku: product.sku,
        hsnCode: lineHsn(item.hsnCode, product),
        quantity: item.quantity,
        unitPrice: item.unitPrice != null ? item.unitPrice : product.sellingPrice,
        discountAmount: item.discountAmount || 0,
        discountPercent: item.discountPercent || 0,
        gstPercentage: item.gstPercentage != null ? item.gstPercentage : product.gstPercentage,
        itemType: product.itemType,
      };
    });
  }

  #normalizePayments(payments, grandTotal, defaultAccountId = null) {
    if (!Array.isArray(payments) || payments.length === 0) {
      throw new AppError('At least one payment is required', 400);
    }
    // UPI / bank money lands in a bank account: as chosen, else the terminal's, else the firm's default bank.
    const fallbackAccount = defaultAccountId || repos.financeAccounts.findDefault()?.id || null;
    const normalized = payments.map((p) => {
      const method = String(p.method || '').toLowerCase();
      if (!PAYMENT_METHODS.has(method)) {
        throw new AppError(`Invalid payment method: ${p.method}`, 400);
      }
      const amount = round2(p.amount);
      if (!Number.isFinite(amount) || amount <= 0) {
        throw new AppError('Payment amount must be positive', 400);
      }
      let paymentAccountId = null;
      if (method === 'upi' || method === 'bank') {
        if (p.paymentAccountId) {
          const acct = repos.financeAccounts.findById(p.paymentAccountId);
          if (!acct?.isActive || !['bank', 'upi'].includes(acct.accountType)) {
            throw new AppError('Choose an active bank or UPI account for this payment', 400, 'BANK_INVALID');
          }
          paymentAccountId = acct.id;
        } else {
          paymentAccountId = fallbackAccount;
        }
      }
      return {
        method,
        amount,
        reference: p.reference || null,
        notes: p.notes || null,
        paymentAccountId,
      };
    });

    const totalPaid = round2(normalized.reduce((s, p) => s + p.amount, 0));
    if (Math.abs(totalPaid - grandTotal) > 0.02) {
      throw new AppError(
        `Payments (${totalPaid}) must equal invoice total (${grandTotal})`,
        400,
        'PAYMENT_MISMATCH'
      );
    }

    const creditAmount = round2(
      normalized.filter((p) => p.method === 'credit').reduce((s, p) => s + p.amount, 0)
    );
    const amountPaid = round2(totalPaid - creditAmount);
    let paymentStatus = 'paid';
    if (creditAmount >= grandTotal - 0.02) paymentStatus = 'credit';
    else if (creditAmount > 0) paymentStatus = 'partial';

    return { payments: normalized, amountPaid, amountCredit: creditAmount, paymentStatus };
  }

  /**
   * Complete POS sale:
   * Create Invoice -> POS Sale movements -> Update Customer Outstanding -> Record Payment
   * Never directly edits stock_levels.
   */
  /**
   * @param {object} options
   * @param {boolean} [options.offlineSync] Sale already happened on an offline terminal:
   *   stock may go negative and customer credit limit is not enforced (warnings are
   *   returned instead), and the terminal's own sale time is preserved.
   * @param {string}  [options.completedAt] ISO timestamp of the original sale.
   */
  /**
   * Bill date chosen by the firm admin / group owner (YYYY-MM-DD): 12:00 noon IST on that day, so
   * the day is the same in every report (some read the UTC date). Everyone else always bills
   * today; a date in the future is refused.
   */
  #billDateIso(billDate, actor) {
    if (!isDate(billDate)) throw new AppError('Bill date is not a valid date', 400);
    const today = istDate();
    if (billDate === today) return null;
    if (!isFirmAdmin(actor.user)) throw new AppError('Only the firm admin or the group owner can change the bill date', 403, 'OWNER_ONLY');
    if (billDate > today) throw new AppError('The bill date cannot be in the future', 400);
    return istToIso(billDate, '12:00');
  }

  checkout(data, actor, req, options = {}) {
    // Admin date control: the bill is dated (and numbered in the financial year of) the chosen day.
    if (data.billDate) {
      const at = this.#billDateIso(String(data.billDate), actor);
      if (at) options = { ...options, completedAt: at, billDated: true };
    }
    authService.checkPermission(actor.permissions, 'pos.sales.create');
    const offlineSync = Boolean(options.offlineSync);
    const warnings = [];

    const warehouseId = data.warehouseId || warehouseRepo.findDefault()?.id;
    if (!warehouseId) throw new AppError('Warehouse is required', 400);
    const warehouse = warehouseRepo.findById(warehouseId);
    if (!warehouse?.isActive) throw new AppError('Warehouse not found or inactive', 400);

    let customerId = data.customerId;
    if (!customerId) {
      const walkIn = customerRepo.findWalkIn();
      if (!walkIn) throw new AppError('Walk-in customer is not configured', 500);
      customerId = walkIn.id;
    }
    const customer = customerRepo.findById(customerId);
    if (!customer?.isActive) throw new AppError('Customer not found or inactive', 400);

    // Agent = the staff member who sold (their ERP login), else the customer's agent.
    let salesAgentId = data.salesAgentId || commissionService.agentForUser(actor.user.id)?.id || null;
    if (!salesAgentId && customer.primarySalesAgentId) {
      salesAgentId = customer.primarySalesAgentId;
    }
    if (salesAgentId) {
      const agent = repos.salesAgents.findById(salesAgentId);
      if (!agent || agent.status !== 'active') throw new AppError('Sales agent not found or inactive', 400);
    }

    // Multi-agent optional: data.agents = [{ salesAgentId, sharePercent }]
    let agentShares = null;
    if (Array.isArray(data.agents) && data.agents.length) {
      agentShares = data.agents;
      salesAgentId = data.agents[0].salesAgentId;
    } else if (salesAgentId) {
      agentShares = [{ salesAgentId, sharePercent: 100 }];
    }

    const company = companyRepo.get();
    const enriched = this.#enrichCartItems(data.items || []);
    const totals = calculateCartTotals(enriched, data.invoiceDiscount || 0, {
      companyStateCode: stateCodeOf(company),
      customerStateCode: stateCodeOf(customer),
    });
    // Serial numbers of the units on each line (warranty claims). A serial already sold is refused,
    // except for sales synced from a phone (those happened already; they are stored as sold).
    const lineSerials = (data.items || []).map((it, i) => {
      if (it.serialNumbers === undefined) return [];
      try {
        return cleanSerials(it.serialNumbers, it.quantity, totals.items[i]?.productName);
      } catch (err) {
        if (options.offlineSync) return [];
        throw err;
      }
    });
    if (!options.offlineSync) {
      lineSerials.forEach((serials, i) => assertSerialsFree(totals.items[i].productId, serials, totals.items[i].productName));
    }

    const belowMin = commissionService.belowMinPrice(totals.items);
    if (belowMin.length) {
      const detail = belowMin.map((l) => `${l.name}: ${l.unitPrice} < minimum ${l.floor}`).join('; ');
      if (offlineSync) {
        warnings.push({ code: 'BELOW_MIN_PRICE', message: `Sold below minimum selling price (no commission on these lines): ${detail}` });
      } else {
        throw new AppError(`Below minimum selling price: ${detail}`, 400, 'BELOW_MIN_PRICE');
      }
    }

    const { payments: normalizedPayments, amountPaid, amountCredit, paymentStatus } = this.#normalizePayments(
      data.payments,
      totals.grandTotal,
      data.defaultPaymentAccountId
    );

    if (amountCredit > 0 && customer.isWalkIn) {
      throw new AppError('Credit sale is not allowed for walk-in customers', 400);
    }
    // Credit (udhar) only for customers the firm admin approved. A phone that sold offline is
    // recorded with a warning so the admin sees it; everywhere else it is refused.
    if (amountCredit > 0 && !customer.creditApproved) {
      if (offlineSync) {
        warnings.push({ code: 'CREDIT_NOT_APPROVED', message: `${customer.name} is not approved for credit; approve or collect in the ERP` });
      } else {
        throw new AppError(
          `${customer.name} is not approved for credit. The firm admin can approve credit in Customers & Suppliers.`,
          400,
          'CREDIT_NOT_APPROVED'
        );
      }
    }
    if (amountCredit > 0 && customer.creditLimit > 0) {
      const projected = customer.outstandingBalance + amountCredit;
      if (projected > customer.creditLimit + 0.02 && offlineSync) {
        warnings.push({ code: 'CREDIT_LIMIT', message: `Credit limit exceeded for ${customer.name}` });
      } else if (projected > customer.creditLimit + 0.02) {
        throw new AppError(
          `Credit exceeds customer limit. Outstanding ${customer.outstandingBalance}, limit ${customer.creditLimit}`,
          400,
          'CREDIT_LIMIT'
        );
      }
    }

    const allowNegative = offlineSync || this.#allowNegativeStock();
    // Pre-validate stock before creating invoice
    const serviceIds = new Set(enriched.filter((i) => i.itemType === 'service').map((i) => i.productId));
    for (const item of totals.items) {
      if (serviceIds.has(item.productId)) continue; // services have no stock to check
      const stock = stockRepo.ensureRow(item.productId, warehouseId);
      if (offlineSync && stock.quantityAvailable + 0.000001 < item.quantity) {
        warnings.push({
          code: 'NEGATIVE_STOCK',
          message: `${item.productName}: sold ${item.quantity}, available ${stock.quantityAvailable}`,
        });
        continue;
      }
      if (allowNegative) continue;
      if (stock.quantityAvailable + 0.000001 < item.quantity) {
        throw new AppError(
          `Insufficient stock for ${item.productName}. Available: ${stock.quantityAvailable}`,
          400,
          'INSUFFICIENT_STOCK'
        );
      }
    }

    const isAllCash = normalizedPayments.every((p) => p.method !== 'credit');
    const docType = isAllCash && amountCredit <= 0 ? 'cash_invoice' : 'tax_invoice';
    let invoiceNumber = data.invoiceNumber;
    let firmId = company?.id || null;
    if (!invoiceNumber) {
      const allocated = repos.documentNumbering.allocateNumber(
        firmId,
        docType,
        options.completedAt ? new Date(options.completedAt) : new Date()
      );
      invoiceNumber = allocated.documentNumber;
      firmId = allocated.firmId;
    }

    const customerPo = customerPoFrom(data);
    const transport = transportFrom(data.transport);
    const shipTo = shipToFrom(data.shipTo);
    const itemIds = totals.items.map(() => generateId());
    const sale = saleRepo.create({
      header: {
        warehouseId,
        customerId,
        invoiceNumber,
        firmId,
        documentType: docType,
        quotationId: data.quotationId || null,
        salesAgentId: salesAgentId || null,
        paymentStatus,
        subtotal: totals.subtotal,
        itemDiscountTotal: totals.itemDiscountTotal,
        invoiceDiscount: totals.invoiceDiscount,
        taxableAmount: totals.taxableAmount,
        cgstAmount: totals.cgstAmount,
        sgstAmount: totals.sgstAmount,
        igstAmount: totals.igstAmount,
        gstAmount: totals.gstAmount,
        grandTotal: totals.grandTotal,
        amountPaid,
        amountCredit,
        dueDate: amountCredit > 0
          ? (() => {
            const daysMatch = String(customer.paymentTerms || '30').match(/(\d+)/);
            const days = daysMatch ? parseInt(daysMatch[1], 10) : 30;
            const d = new Date();
            d.setDate(d.getDate() + days);
            return d.toISOString().slice(0, 10);
          })()
          : null,
        notes: data.notes,
        heldBillId: data.heldBillId || null,
        createdBy: actor.user.id,
        completedAt: options.completedAt || undefined,
      },
      items: totals.items.map((item, i) => ({ ...item, id: itemIds[i] })),
      payments: normalizedPayments,
    });
    if (customerPo.number) saleRepo.setCustomerPo(sale.id, customerPo);
    if (transport || shipTo) saleRepo.setDispatch(sale.id, { transport, shipTo });
    saleRepo.snapshotPeriods(sale.id);
    if (data.terminalRef) saleRepo.setTerminalRef(sale.id, data.terminalRef);
    if (options.billDated) saleRepo.restoreOrigin(sale.id, { createdAt: options.completedAt, createdBy: actor.user.id });
    saveSaleSerials(sale.id, lineSerials.map((serials, i) => ({ itemId: itemIds[i], productId: totals.items[i].productId, serials })), actor.user.id);

    // Inventory movements (POS sale) — never direct stock write
    for (let i = 0; i < sale.items.length; i++) {
      const item = sale.items[i];
      const result = inventoryMovementService.createMovement({
        productId: item.productId,
        warehouseId,
        movementType: MOVEMENT_TYPES.POS_SALE,
        quantity: item.quantity,
        allowNegative,
        referenceType: 'pos_sale',
        referenceId: sale.id,
        reason: `POS ${sale.invoiceNumber}`,
        notes: item.sku || null,
      }, actor, req, { skipPermissionCheck: true });
      if (result.movement) saleRepo.updateItemMovement(item.id, result.movement.id);
    }

    if (amountCredit > 0) {
      customerRepo.adjustOutstanding(customerId, amountCredit);
    }

    if (data.heldBillId) {
      const held = heldRepo.findById(data.heldBillId);
      if (held && held.status === 'held') {
        heldRepo.markResumed(data.heldBillId);
      }
    }

    const completed = saleRepo.findById(sale.id);

    try {
      commissionService.createForSale(completed, {
        agents: agentShares,
        actor,
        req,
      });
    } catch (err) {
      console.error('Commission create failed:', err.message);
    }

    auditRepo.create({
      userId: actor.user.id,
      userName: actor.user.fullName,
      action: 'checkout',
      module: 'pos',
      recordType: 'pos_sale',
      recordId: completed.id,
      newValue: {
        invoiceNumber: completed.invoiceNumber,
        grandTotal: completed.grandTotal,
        paymentStatus: completed.paymentStatus,
        itemCount: completed.items.length,
        salesAgentId: completed.salesAgentId || null,
        source: offlineSync ? 'pos_device_sync' : 'erp_terminal',
        warnings: warnings.length ? warnings : undefined,
      },
      ...getRequestMeta(req),
    });

    if (offlineSync) completed.syncWarnings = warnings;
    return completed;
  }

  listSales(filters, actor) {
    filters = withFinancialYear(filters);
    authService.checkPermission(actor.permissions, 'pos.sales.view');
    return saleRepo.findAll({
      search: filters.search || '',
      customerId: filters.customerId || '',
      warehouseId: filters.warehouseId || '',
      status: filters.status || '',
      includeVoided: filters.includeVoided === 'true' || filters.includeVoided === true,
      dateFrom: /^\d{4}-\d{2}-\d{2}$/.test(filters.dateFrom || '') ? filters.dateFrom : '',
      dateTo: /^\d{4}-\d{2}-\d{2}$/.test(filters.dateTo || '') ? filters.dateTo : '',
      limit: filters.limit ? Math.min(parseInt(filters.limit, 10) || 50, 5000) : 50,
      offset: filters.offset ? parseInt(filters.offset, 10) : 0,
    });
  }

  /** Edit / delete are for the firm admin (or group owner), on top of the sales edit/delete permission. */
  #assertOwner(actor, action) {
    authService.checkPermission(actor.permissions, `pos.sales.${action}`);
    if (!isFirmAdmin(actor.user)) {
      throw new AppError(`Only the firm admin or the group owner can ${action} invoices`, 403, 'OWNER_ONLY');
    }
  }

  #editableSale(id, verb) {
    const sale = saleRepo.findById(id);
    if (!sale) throw new AppError('Sale not found', 404);
    if (sale.status === 'voided') throw new AppError('This invoice is already deleted', 400);
    if (sale.status !== 'completed') {
      throw new AppError(`This invoice has returns; it cannot be ${verb}. Handle it with a return instead.`, 400, 'SALE_HAS_RETURNS');
    }
    if (saleRepo.receiptAllocationCount(id) > 0) {
      throw new AppError(`A customer receipt is allocated to this invoice; remove that allocation before it can be ${verb}.`, 400, 'SALE_HAS_RECEIPTS');
    }
    if (saleRepo.commissionPaid(id) > 0) {
      throw new AppError(`Commission on this invoice has already been paid; it cannot be ${verb}.`, 400, 'COMMISSION_PAID');
    }
    return sale;
  }

  /** Undo a sale's effects: items back to stock, credit off the customer, commission cancelled. */
  #reverseSale(sale, label, actor, req) {
    for (const item of sale.items || []) {
      inventoryMovementService.createMovement({
        productId: item.productId,
        warehouseId: sale.warehouseId,
        movementType: MOVEMENT_TYPES.SALES_RETURN,
        quantity: item.quantity,
        referenceType: 'pos_sale_void',
        referenceId: sale.id,
        reason: `${label} ${sale.invoiceNumber}`,
        notes: item.sku || null,
      }, actor, req, { skipPermissionCheck: true });
    }
    if (Number(sale.amountCredit) > 0) customerRepo.adjustOutstanding(sale.customerId, -Number(sale.amountCredit));
    saleRepo.cancelCommissions(sale.id, `${label} by ${actor.user.fullName}`);
  }

  /** Delete (void) an invoice: products return to stock as before the sale. Kept for audit, hidden everywhere. */
  deleteSale(id, { reason } = {}, actor, req) {
    this.#assertOwner(actor, 'delete');
    const sale = this.#editableSale(id, 'deleted');
    const note = `Deleted by ${actor.user.fullName} on ${new Date().toLocaleString('en-IN')}${reason ? `: ${reason}` : ''}`;
    getDatabase().transaction(() => {
      this.#reverseSale(sale, 'Deleted invoice', actor, req);
      saleRepo.markVoided(id, { note });
    })();
    auditRepo.create({
      userId: actor.user.id, userName: actor.user.fullName,
      action: 'delete', module: 'pos', recordType: 'pos_sale', recordId: id,
      previousValue: sale, newValue: { status: 'voided', reason: reason || null }, ...getRequestMeta(req),
    });
    return saleRepo.findById(id);
  }

  /**
   * Edit an invoice. Atomically: the old version goes back to stock and is kept voided as
   * <number>-E1 for audit, and the corrected invoice is posted under the same number and date
   * through the normal checkout rules (stock, minimum price, credit limit, commission).
   */
  editSale(id, data = {}, actor, req) {
    this.#assertOwner(actor, 'edit');
    const old = this.#editableSale(id, 'edited');
    if (!Array.isArray(data.items) || !data.items.length) throw new AppError('An invoice needs at least one item', 400);
    const customerId = data.customerId ?? old.customerId;
    const invoiceDiscount = data.invoiceDiscount ?? old.invoiceDiscount;

    // Either explicit payments, or one method + amount received (the rest goes on credit).
    let payments = data.payments;
    if (!Array.isArray(payments) || !payments.length) {
      const total = this.preview({ items: data.items, invoiceDiscount, customerId }, actor).grandTotal;
      const method = data.paymentMethod || 'cash';
      const received = method === 'credit' ? 0 : Math.min(total, Math.max(0, Number(data.amountReceived ?? total)));
      payments = [
        ...(received > 0 ? [{ method, amount: received, paymentAccountId: data.paymentAccountId || undefined }] : []),
        ...(total - received > 0.009 ? [{ method: 'credit', amount: Math.round((total - received) * 100) / 100 }] : []),
      ];
    }

    // A SAC-POS bill synced before phone bills took the firm series still carries the phone's
    // number (DEVICE-S261021-0001): saving it gives it the firm's invoice number for its date.
    const renumber = Boolean(old.terminalRef) && old.terminalRef === old.invoiceNumber;
    const updated = getDatabase().transaction(() => {
      this.#reverseSale(old, 'Edited invoice', actor, req);
      saleRepo.markVoided(id, {
        note: `Edited by ${actor.user.fullName} on ${new Date().toLocaleString('en-IN')}; replaced by the corrected ${renumber ? 'invoice (firm series number)' : old.invoiceNumber}`,
        newInvoiceNumber: saleRepo.editedCopyNumber(old.invoiceNumber),
      });
      // Serial numbers stay with the edited lines unless the edit sends new ones.
      const oldSerials = new Map((old.items || []).filter((i) => i.serialNumbers?.length).map((i) => [i.productId, i.serialNumbers]));
      const created = this.checkout({
        warehouseId: old.warehouseId,
        customerId,
        items: (data.items || []).map((it) => (it.serialNumbers !== undefined || !oldSerials.has(it.productId) ? it : { ...it, serialNumbers: oldSerials.get(it.productId) })),
        invoiceDiscount,
        payments,
        ...(renumber ? {} : { invoiceNumber: old.invoiceNumber }),
        salesAgentId: data.salesAgentId !== undefined ? data.salesAgentId : old.salesAgentId,
        notes: data.notes !== undefined ? data.notes : old.notes,
        // The customer's PO stays with the invoice unless the edit changes it.
        ...(() => { const po = customerPoFrom(data, old); return { customerPoNumber: po.number || '', customerPoDate: po.date || '' }; })(),
        terminalRef: old.terminalRef || undefined,
        // A new bill date from the admin (checked in checkout).
        ...(data.billDate ? { billDate: data.billDate } : {}),
        // Transport and Ship-to stay with the invoice unless the edit sends new ones.
        transport: data.transport !== undefined ? data.transport : old.transport,
        shipTo: data.shipTo !== undefined ? data.shipTo : old.shipTo,
      }, actor, req, { completedAt: old.completedAt || old.createdAt });
      // A new bill date (admin) moves the invoice; otherwise it keeps its original date.
      saleRepo.restoreOrigin(created.id, { createdAt: data.billDate && created.completedAt.slice(0, 10) !== String(old.completedAt || old.createdAt).slice(0, 10) ? created.completedAt : old.createdAt, createdBy: old.createdBy });
      return created;
    })();

    auditRepo.create({
      userId: actor.user.id, userName: actor.user.fullName,
      action: 'update', module: 'pos', recordType: 'pos_sale', recordId: updated.id,
      previousValue: old, newValue: saleRepo.findById(updated.id), ...getRequestMeta(req),
    });
    return saleRepo.findById(updated.id);
  }

  getSale(id, actor) {
    authService.checkPermission(actor.permissions, 'pos.sales.view');
    const sale = saleRepo.findById(id);
    if (!sale) throw new AppError('Sale not found', 404);
    return sale;
  }

  holdBill(data, actor, req) {
    authService.checkPermission(actor.permissions, 'pos.sales.create');
    if (!Array.isArray(data.items) || data.items.length === 0) {
      throw new AppError('Cannot hold an empty cart', 400);
    }
    const warehouseId = data.warehouseId || warehouseRepo.findDefault()?.id;
    if (!warehouseId) throw new AppError('Warehouse is required', 400);

    // Validate products exist; stock is NOT reserved on hold
    this.#enrichCartItems(data.items);

    const held = heldRepo.create({
      warehouseId,
      customerId: data.customerId || null,
      cart: data.items,
      invoiceDiscount: data.invoiceDiscount || 0,
      notes: data.notes,
      createdBy: actor.user.id,
    });

    auditRepo.create({
      userId: actor.user.id,
      userName: actor.user.fullName,
      action: 'hold',
      module: 'pos',
      recordType: 'pos_held_bill',
      recordId: held.id,
      newValue: { holdNumber: held.holdNumber, itemCount: held.cart.length },
      ...getRequestMeta(req),
    });

    return held;
  }

  listHeldBills(filters, actor) {
    authService.checkPermission(actor.permissions, 'pos.sales.view');
    return heldRepo.findHeld({
      warehouseId: filters.warehouseId || '',
      limit: filters.limit ? parseInt(filters.limit, 10) : 50,
    });
  }

  resumeHeldBill(id, actor, req) {
    authService.checkPermission(actor.permissions, 'pos.sales.create');
    const held = heldRepo.findById(id);
    if (!held) throw new AppError('Held bill not found', 404);
    if (held.status !== 'held') throw new AppError('Bill is not in held status', 400);

    auditRepo.create({
      userId: actor.user.id,
      userName: actor.user.fullName,
      action: 'resume',
      module: 'pos',
      recordType: 'pos_held_bill',
      recordId: id,
      ...getRequestMeta(req),
    });

    // Return cart payload; mark resumed only after successful checkout (or cancel separately)
    return held;
  }

  cancelHeldBill(id, actor, req) {
    authService.checkPermission(actor.permissions, 'pos.sales.create');
    const held = heldRepo.findById(id);
    if (!held) throw new AppError('Held bill not found', 404);
    if (held.status !== 'held') throw new AppError('Bill is not in held status', 400);
    const cancelled = heldRepo.cancel(id);
    auditRepo.create({
      userId: actor.user.id,
      userName: actor.user.fullName,
      action: 'cancel',
      module: 'pos',
      recordType: 'pos_held_bill',
      recordId: id,
      ...getRequestMeta(req),
    });
    return cancelled;
  }

  createReturn(data, actor, req) {
    authService.checkPermission(actor.permissions, 'pos.returns.create');

    const sale = saleRepo.findById(data.saleId);
    if (!sale) throw new AppError('Original sale not found', 404);
    if (!['completed', 'partially_returned'].includes(sale.status)) {
      throw new AppError('Sale cannot be returned', 400);
    }

    const refundMethod = String(data.refundMethod || '').toLowerCase();
    if (!REFUND_METHODS.has(refundMethod)) {
      throw new AppError('Invalid refund method', 400);
    }
    if (!Array.isArray(data.items) || data.items.length === 0) {
      throw new AppError('Return items are required', 400);
    }

    const returnItems = [];
    for (const reqItem of data.items) {
      const saleItem = sale.items.find((i) => i.id === reqItem.saleItemId);
      if (!saleItem) throw new AppError('Sale item not found on invoice', 400);
      const qty = Number(reqItem.quantity);
      if (!Number.isFinite(qty) || qty <= 0) throw new AppError('Return quantity must be positive', 400);
      const remaining = saleItem.quantity - saleItem.quantityReturned;
      if (qty > remaining + 0.000001) {
        throw new AppError(
          `Cannot return more than sold for ${saleItem.productName}. Remaining: ${remaining}`,
          400
        );
      }

      const ratio = qty / saleItem.quantity;
      const taxableAmount = round2(saleItem.taxableAmount * ratio);
      const gstAmount = round2(saleItem.gstAmount * ratio);
      const lineTotal = round2(saleItem.lineTotal * ratio);

      returnItems.push({
        id: generateId(),
        saleItemId: saleItem.id,
        productId: saleItem.productId,
        productName: saleItem.productName,
        quantity: qty,
        unitPrice: saleItem.unitPrice,
        gstPercentage: saleItem.gstPercentage,
        taxableAmount,
        gstAmount,
        lineTotal,
      });
    }

    const subtotal = round2(returnItems.reduce((s, i) => s + i.taxableAmount, 0));
    const gstAmount = round2(returnItems.reduce((s, i) => s + i.gstAmount, 0));
    const grandTotal = round2(returnItems.reduce((s, i) => s + i.lineTotal, 0));

    // GST credit note: same tax split as the invoice (IGST when it was inter-state).
    const interState = Number(sale.igstAmount || 0) > 0;
    const cgstAmount = interState ? 0 : round2(gstAmount / 2);
    const sgstAmount = interState ? 0 : round2(gstAmount - cgstAmount);
    const igstAmount = interState ? gstAmount : 0;

    // Settlement: the note first clears what is still unpaid on the invoice. A 'credit_note'
    // return keeps any remainder as customer credit; cash / UPI / bank pays the remainder back.
    const againstInvoice = round2(Math.min(grandTotal, Math.max(0, Number(sale.amountCredit || 0))));
    const adjustedAmount = refundMethod === 'credit_note' ? grandTotal : againstInvoice;
    const refundAmount = round2(grandTotal - adjustedAmount);

    const firm = repos.documentNumbering.getFirm();
    if (!firm) throw new AppError('Company not configured', 400);
    numberOldCreditNotes();
    const note = repos.documentNumbering.allocateNumber(firm.id, 'credit_note', new Date());

    const ret = returnRepo.create({
      header: {
        saleId: sale.id,
        warehouseId: sale.warehouseId,
        customerId: sale.customerId,
        subtotal,
        gstAmount,
        cgstAmount,
        sgstAmount,
        igstAmount,
        grandTotal,
        adjustedAmount,
        refundAmount,
        noteNumber: note.documentNumber,
        financialYear: financialYearOf(new Date()),
        refundMethod,
        reason: data.reason,
        notes: data.notes,
        createdBy: actor.user.id,
      },
      items: returnItems,
    });

    const allowNegative = this.#allowNegativeStock();
    for (const item of ret.items) {
      const result = inventoryMovementService.createMovement({
        productId: item.productId,
        warehouseId: sale.warehouseId,
        movementType: MOVEMENT_TYPES.SALES_RETURN,
        quantity: item.quantity,
        allowNegative,
        referenceType: 'pos_sales_return',
        referenceId: ret.id,
        reason: `Credit note ${ret.noteNumber} for ${sale.invoiceNumber}`,
      }, actor, req, { skipPermissionCheck: true });
      if (result.movement) returnRepo.updateItemMovement(item.id, result.movement.id);
      saleRepo.addReturnedQuantity(item.saleItemId, item.quantity);
    }

    // Balances: the customer owes less by whatever was not paid back in money.
    if (againstInvoice > 0) returnRepo.reduceSaleDue(sale.id, againstInvoice);
    if (adjustedAmount > 0) customerRepo.adjustOutstanding(sale.customerId, -adjustedAmount);

    const refreshed = saleRepo.findById(sale.id);
    const allReturned = refreshed.items.every((i) => i.quantityReturned + 0.000001 >= i.quantity);
    const anyReturned = refreshed.items.some((i) => i.quantityReturned > 0);
    saleRepo.updateStatus(sale.id, allReturned ? 'returned' : (anyReturned ? 'partially_returned' : sale.status));

    try {
      commissionService.reverseForReturn(sale.id, grandTotal, actor, req);
    } catch (err) {
      console.error('Commission reverse failed:', err.message);
    }

    const completed = returnRepo.findById(ret.id);
    auditRepo.create({
      userId: actor.user.id,
      userName: actor.user.fullName,
      action: 'return',
      module: 'pos',
      recordType: 'pos_sales_return',
      recordId: completed.id,
      newValue: {
        returnNumber: completed.returnNumber,
        noteNumber: completed.noteNumber,
        saleId: sale.id,
        grandTotal: completed.grandTotal,
        refundMethod,
      },
      ...getRequestMeta(req),
    });

    return completed;
  }

  listReturns(filters, actor) {
    authService.checkPermission(actor.permissions, 'pos.returns.view');
    numberOldCreditNotes();
    // Returns of one sale are shown whatever year they fall in.
    if (!filters.saleId) filters = withFinancialYear(filters);
    return returnRepo.findAll({
      saleId: filters.saleId || '',
      customerId: filters.customerId || '',
      financialYear: filters.financialYear || '',
      search: filters.search || '',
      dateFrom: filters.dateFrom || '',
      dateTo: filters.dateTo || '',
      limit: filters.limit ? parseInt(filters.limit, 10) : 50,
      offset: filters.offset ? parseInt(filters.offset, 10) : 0,
    });
  }

  getReturn(id, actor) {
    authService.checkPermission(actor.permissions, 'pos.returns.view');
    const ret = returnRepo.findById(id);
    if (!ret) throw new AppError('Return not found', 404);
    return ret;
  }
}

export const settingsService = new SettingsService();
export const posService = new PosService();
