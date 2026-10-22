/**
 * POS Device Sync — SAC-POS (Expo mobile app) and other POS terminals ↔ SACONE ERP.
 *
 * Contract: /api/v1/sync/*  (see docs/POS_SYNC_API.md)
 *
 * Principles
 *  1. ERP is the master for products, prices, stock and POS users.
 *  2. Terminals are offline-first: a sale that already happened is never rejected for
 *     stock or credit limit — it is recorded and flagged with warnings.
 *  3. Every inbound record goes through the idempotent inbox (device + entity + ref),
 *     so client retries can never double-post invoices, payments or stock.
 *  4. Stock only moves through the inventory movement engine (pos_sale / sales_return /
 *     adjustment requests awaiting approval) — never direct quantity writes.
 */
import { AppError } from '../core/http.js';
import { nowIso } from '../core/utils.js';
import { MOVEMENT_TYPES } from '../core/inventory-constants.js';
import { getDatabase } from '../database/connection.js';
import { repos } from '../repositories/index.js';
import { generateApiKeySecret, hashApiKey } from '../repositories/sqlite/webstore.js';
import { authService } from './index.js';
import { firmService } from './firms.js';
import { currentFirmId } from '../database/context.js';
import { posService, bankForPrint, invoicePrintSettings, labelPrintSettings } from './pos.js';
import { quotationService } from './quotations.js';
import { customerService } from './parties.js';
import { inventoryMovementService } from './inventory.js';
import { customerReceiptService } from './customer-receipts.js';
import { productService } from './products.js';
import { shipToFrom, transportFrom } from '../core/dispatch.js';
import { stateCodeOf } from '../core/gst-state.js';
import { posPins } from './pos-pins.js';

const deviceRepo = repos.posDevices;
const posUserRepo = repos.posUsers;
const inboxRepo = repos.posSyncInbox;
const catalogRepo = repos.posCatalog;
const productRepo = repos.products;
const customerRepo = repos.customers;
const saleRepo = repos.posSales;
const warehouseRepo = repos.warehouses;
const userRepo = repos.users;
const companyRepo = repos.company;
const auditRepo = repos.auditLogs;

/** Permissions a terminal acts with — deliberately narrow. */
export const DEVICE_PERMISSIONS = Object.freeze([
  'pos.terminal.view',
  'pos.sales.view',
  'pos.sales.create',
  'pos.returns.view',
  'pos.returns.create',
  'parties.customers.view',
  'parties.customers.create',
  'parties.customer_receipts.view',
  'parties.customer_receipts.create',
  'inventory.adjustments.create',
  'pos.quotations.view',
  'pos.quotations.create',
]);

/** ERP permission a staff member needs for each synced record type. */
const RECORD_PERMISSIONS = Object.freeze({
  sale: 'pos.sales.create',
  return: 'pos.returns.create',
  payment: 'parties.customer_receipts.create',
  customer: 'parties.customers.create',
  stock_event: 'inventory.adjustments.create',
  quotation: 'pos.quotations.create',
});

/** Inbox statuses that mean "server has it — client may mark the record synced". */
const STORED_STATUSES = new Set(['applied', 'ignored', 'pending_review', 'failed', 'rejected']);

const TOTAL_TOLERANCE = Number(process.env.POS_SYNC_TOTAL_TOLERANCE || 1);
const DEFAULT_TZ_OFFSET = process.env.POS_DEFAULT_TZ_OFFSET || '+05:30';
const PAGE_LIMIT_MAX = 500;
const EPOCH = '1970-01-01T00:00:00.000Z';

const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

const DENOMINATIONS = [500, 200, 100, 50, 20, 10, 5, 2, 1];

/** "₹500×2, ₹100×1" from a terminal's note counts; ignores anything that is not a real denomination. */
function formatNoteCounts(counts) {
  if (!counts || typeof counts !== 'object') return '';
  return DENOMINATIONS
    .map((value) => [value, Math.trunc(Number(counts[String(value)]) || 0)])
    .filter(([, n]) => n > 0 && n <= 100000)
    .map(([value, n]) => `₹${value}×${n}`)
    .join(', ');
}

/** Cash-drawer summary for the invoice notes (SAC-POS "Count notes"). */
function cashDrawerNote(drawer) {
  const received = formatNoteCounts(drawer?.received);
  if (!received) return null;
  const change = formatNoteCounts(drawer?.change);
  return `Cash notes ${received}${change ? `; change ${change}` : ''}`;
}

/**
 * Approval recorded on the phone for a return / exchange. The approver must be an active
 * ERP user whose role has pos.returns.approve; otherwise the note says it was not verified.
 */
function approvalNote(ret) {
  const userId = str(ret?.approved_by_erp_user_id);
  if (!userId) return null;
  const user = userRepo.findById(userId);
  const name = user?.fullName || str(ret.approved_by_name) || userId;
  const perms = user?.isActive ? repos.roles.getPermissions(user.roleId).map((x) => x.permission_key) : [];
  const allowed = perms.includes('*') || perms.includes('pos.returns.approve');
  return allowed ? `Approved by ${name}` : `Approval by ${name} NOT verified (needs active user with pos.returns.approve)`;
}
const str = (v) => (v == null ? '' : String(v).trim());

const period = (value, unit) => (value ? { value: Number(value), unit } : null);

/** An ERP invoice in the shape SAC-POS keeps its bills in. */
function phoneSale(s) {
  const c = s.customerId && !s.customerIsWalkIn ? customerRepo.findById(s.customerId) : null;
  return {
    id: s.id,
    number: s.invoiceNumber,
    date: s.createdAt,
    customer: c ? { id: c.id, name: c.name, phone: c.phone || null, gstin: c.gstNumber || null, gstStateCode: stateCodeOf(c), address: c.address || null, city: c.city || null, state: c.state || null } : null,
    items: (s.items || []).map((i) => ({
      productId: i.productId, name: i.productName, sku: i.sku, hsn: i.hsnCode || null, unit: i.unit || 'pcs',
      quantity: i.quantity, unitPrice: i.unitPrice, discountAmount: i.discountAmount, gstRate: i.gstPercentage,
      taxableAmount: i.taxableAmount, gstAmount: i.gstAmount, lineTotal: i.lineTotal, quantityReturned: i.quantityReturned,
      warranty: period(i.warrantyValue, i.warrantyUnit), guarantee: period(i.guaranteeValue, i.guaranteeUnit),
      serialNumbers: i.serialNumbers || [], shortDescription: i.shortDescription || null,
    })),
    subtotal: s.subtotal, itemDiscountTotal: s.itemDiscountTotal, invoiceDiscount: s.invoiceDiscount,
    taxableAmount: s.taxableAmount, cgstAmount: s.cgstAmount, sgstAmount: s.sgstAmount, igstAmount: s.igstAmount,
    gstAmount: s.gstAmount, grandTotal: s.grandTotal, amountPaid: s.amountPaid, amountDue: s.amountCredit,
    payments: (s.payments || []).map((p) => ({ method: p.method, amount: p.amount, reference: p.reference || null })),
    customerPo: s.customerPoNumber ? { number: s.customerPoNumber, date: s.customerPoDate || null } : null,
    transport: s.transport || null,
    shipTo: s.shipTo || null,
  };
}
const num = (v, fallback = 0) => (Number.isFinite(Number(v)) ? Number(v) : fallback);

/** An ERP quotation in the shape the phone keeps (same item / total fields as phoneSale). */
function phoneQuotation(q) {
  const snap = q.customerSnapshot || {};
  const c = q.customerId ? customerRepo.findById(q.customerId) : null;
  return {
    id: q.id,
    number: q.quotationNumber,
    date: q.quotationDate && q.quotationDate.length === 10 ? `${q.quotationDate}T00:00:00.000Z` : (q.quotationDate || q.createdAt),
    createdAt: q.createdAt,
    validUntil: q.validUntil || null,
    status: q.status,
    preparedBy: q.createdByName || null,
    notes: q.notes || null,
    customer: c && !c.isWalkIn
      ? { id: c.id, name: c.name, phone: c.phone || null, gstin: c.gstNumber || null, gstStateCode: stateCodeOf(c) }
      : (snap.name ? { id: q.customerId || null, name: snap.name, phone: snap.phone || null, gstin: snap.gstNumber || null, gstStateCode: null } : null),
    customerPo: q.customerPoNumber ? { number: q.customerPoNumber, date: q.customerPoDate || null } : null,
    items: (q.items || []).map((i) => ({
      productId: i.productId, name: i.productName, sku: i.sku, hsn: i.hsnCode || null, unit: i.unitAbbreviation || 'pcs',
      quantity: i.quantity, unitPrice: i.unitPrice, discountAmount: i.discountAmount, gstRate: i.gstPercentage,
      taxableAmount: i.taxableAmount, gstAmount: i.gstAmount, lineTotal: i.lineTotal,
      warranty: period(i.warrantyValue, i.warrantyUnit), guarantee: period(i.guaranteeValue, i.guaranteeUnit),
      shortDescription: i.shortDescription || null,
    })),
    subtotal: q.subtotal, itemDiscountTotal: q.itemDiscountTotal, invoiceDiscount: q.invoiceDiscount,
    taxableAmount: q.taxableAmount, cgstAmount: q.cgstAmount, sgstAmount: q.sgstAmount, igstAmount: q.igstAmount,
    gstAmount: q.gstAmount, grandTotal: q.grandTotal,
  };
}

/* ───────────────────────── helpers ───────────────────────── */

/** Parse a terminal timestamp. Local times without an offset are assumed to be POS_DEFAULT_TZ_OFFSET. */
export function parseTerminalTime(value) {
  const raw = str(value);
  if (!raw) return null;
  const hasZone = /(z|[+-]\d{2}:?\d{2})$/i.test(raw);
  const normalized = hasZone ? raw : `${raw.replace(' ', 'T')}${DEFAULT_TZ_OFFSET}`;
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return null;
  const now = new Date();
  return (date > now ? now : date).toISOString();
}

function normalizeSince(value) {
  if (!value) return EPOCH;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? EPOCH : d.toISOString();
}

function pageParams(query) {
  const limit = Math.min(Math.max(parseInt(query.limit, 10) || 100, 1), PAGE_LIMIT_MAX);
  const page = Math.max(parseInt(query.page, 10) || 1, 1);
  return { limit, page, offset: (page - 1) * limit };
}

function mapPaymentMethod(value) {
  const m = str(value).toLowerCase();
  if (['cash'].includes(m)) return 'cash';
  if (['upi', 'wallet', 'gpay', 'phonepe', 'paytm'].includes(m)) return 'upi';
  if (['card', 'bank', 'neft', 'rtgs', 'imps', 'cheque', 'debit card', 'credit card'].includes(m)) return 'bank';
  if (['credit', 'due'].includes(m)) return 'credit';
  return 'cash';
}

function mapReceiptMode(value) {
  const m = mapPaymentMethod(value);
  if (m === 'bank') return str(value).toLowerCase() === 'card' ? 'card' : 'bank';
  return m === 'credit' ? 'other' : m;
}

function syncError(message, code, statusCode = 422) {
  return new AppError(message, statusCode, code);
}

function deviceActor(device) {
  const user = userRepo.findById(device.actingUserId);
  if (!user || !user.isActive) {
    throw new AppError(
      `Device ${device.code} has no active acting user. Reassign it in ERP → POS Devices.`,
      403,
      'DEVICE_USER_INACTIVE'
    );
  }
  return {
    user: { id: user.id, email: user.email, fullName: `${user.fullName} (${device.code})` },
    permissions: [...DEVICE_PERMISSIONS],
    company: companyRepo.get(),
    device,
  };
}

function requestMeta(req) {
  return {
    ipAddress: req?.ip || req?.headers?.['x-forwarded-for'] || null,
    userAgent: req?.headers?.['user-agent'] || null,
  };
}

/* ───────────────────────── device auth ───────────────────────── */

export function authenticateDeviceKey(rawKey, fingerprint) {
  if (!rawKey) return null;
  const device = deviceRepo.findActiveByKeyHash(hashApiKey(rawKey));
  if (!device) return null;
  if (fingerprint) {
    if (!device.deviceFingerprint) {
      deviceRepo.bindFingerprint(device.id, fingerprint);
      device.deviceFingerprint = fingerprint;
    } else if (device.deviceFingerprint !== fingerprint) {
      throw new AppError(
        'This sync key is already bound to another terminal. Rotate the key in ERP to move it.',
        403,
        'DEVICE_MISMATCH'
      );
    }
  }
  return device;
}

/* ═══════════════════════ Terminal-facing sync service ═══════════════════════ */

export class PosSyncService {
  /* ---------- handshake ---------- */

  ping(device, req) {
    deviceRepo.touch(device.id, {
      platform: str(req.headers['x-device-platform']) || null,
      appVersion: str(req.headers['x-app-version']) || null,
    });
    const warehouse = warehouseRepo.findById(device.warehouseId);
    const company = companyRepo.get();
    return {
      message: `Connected to SACONE as ${device.name} (${device.code})`,
      serverTime: nowIso(),
      device: { id: device.id, code: device.code, name: device.name },
      warehouse: warehouse ? { id: warehouse.id, code: warehouse.code, name: warehouse.name } : null,
      company: company ? {
        businessName: company.businessName,
        gstNumber: company.gstNumber,
        gstStateCode: company.gstStateCode,
        address: company.address,
        city: company.city,
        state: company.state,
        phone: company.phone,
      } : null,
      settings: {
        invoicePrefix: `${device.code}-`,
        allowNegativeStock: repos.systemSettings.getBoolean('allow_negative_stock', false),
        // The terminal's bank (else the firm's default) prints under "Our Bankers" with the UPI QR.
        invoice: {
          ...invoicePrintSettings({ withImage: false }),
          ...(device.paymentAccountId
            ? { bank: bankForPrint(repos.financeAccounts.findById(device.paymentAccountId), { withImage: false }) || invoicePrintSettings({ withImage: false }).bank }
            : {}),
        },
        // Barcode label defaults (Settings → Barcode labels) for printing labels on the phone.
        labels: labelPrintSettings(),
        // Registered firms' addresses for the Ship To picker at checkout.
        shipToAddresses: firmService.shipToAddresses(),
      },
    };
  }

  /** The uploaded UPI QR image of this terminal's bank (else the default bank), for caching on the phone. */
  upiQrImage(device) {
    const acct = (device.paymentAccountId && repos.financeAccounts.findById(device.paymentAccountId)) || repos.financeAccounts.findDefault();
    const bank = acct ? bankForPrint(acct) : null;
    return { accountId: acct?.id || null, version: bank?.qrImageVersion || null, image: bank?.qrImage || null };
  }

  /* ---------- generic batch runner ---------- */

  #runBatch(device, req, entityType, records, refOf, applyFn) {
    if (!Array.isArray(records)) throw new AppError(`Expected an array of ${entityType} records`, 400);
    deviceRepo.touch(device.id, { kind: 'push' });
    const actor = deviceActor(device);
    const results = [];
    const counts = { applied: 0, duplicate: 0, ignored: 0, pending_review: 0, failed: 0 };

    for (const record of records) {
      const ref = str(refOf(record));
      if (!ref) {
        results.push({ ref: null, status: 'failed', stored: false, error: 'Missing reference number' });
        counts.failed += 1;
        continue;
      }
      const outcome = this.#applyOne(device, actor, req, entityType, ref, record, applyFn);
      const bucket = outcome.duplicate ? 'duplicate' : outcome.status;
      counts[bucket] = (counts[bucket] || 0) + 1;
      results.push(outcome);
    }

    if (counts.applied > 0 && entityType === 'sale') this.#retryDependents(device, req);

    return {
      message: `${entityType}: ${counts.applied} applied, ${counts.duplicate} duplicate, `
        + `${counts.failed} failed${counts.pending_review ? `, ${counts.pending_review} pending review` : ''}`,
      received: records.length,
      ...counts,
      results,
      serverTime: nowIso(),
    };
  }

  /** Apply a single record inside a DB transaction and write the inbox ledger. */
  #applyOne(device, actor, req, entityType, ref, record, applyFn) {
    const existing = inboxRepo.find(device.id, entityType, ref);
    if (existing && ['applied', 'ignored', 'pending_review', 'rejected'].includes(existing.status)) {
      return {
        ref, status: existing.status, duplicate: true, stored: true,
        id: existing.resultId, warnings: existing.warnings,
      };
    }

    const db = getDatabase();
    try {
      const { actor: recordActor, warnings: actorWarnings } = this.#resolveRecordActor(device, actor, entityType, record);
      const outcome = db.transaction(() => {
        const res = applyFn.call(this, device, recordActor, req, record, ref) || {};
        res.warnings = [...actorWarnings, ...(res.warnings || [])];
        inboxRepo.record({
          deviceId: device.id,
          entityType,
          externalRef: ref,
          payload: record,
          status: res.status || 'applied',
          resultType: res.resultType || null,
          resultId: res.resultId || null,
          warnings: res.warnings || [],
        });
        return res;
      })();
      return {
        ref,
        status: outcome.status || 'applied',
        stored: true,
        id: outcome.resultId || null,
        number: outcome.number || null,
        warnings: outcome.warnings || [],
      };
    } catch (err) {
      // Transaction rolled back — keep the payload so ERP staff can fix & retry.
      inboxRepo.record({
        deviceId: device.id,
        entityType,
        externalRef: ref,
        payload: record,
        status: 'failed',
        errorCode: err.code || 'SYNC_ERROR',
        errorMessage: err.message,
      });
      if (!(err instanceof AppError)) console.error(`[pos-sync] ${entityType} ${ref}:`, err);
      return { ref, status: 'failed', stored: true, error: err.message, errorCode: err.code || 'SYNC_ERROR' };
    }
  }

  /**
   * Terminals send `erp_user_id` (the staff member logged in on SAC-POS). The record
   * is attributed to that ERP user when they are active AND their ERP role grants the
   * permission for this record type — server-side RBAC, not just UI hiding. Otherwise
   * the device's acting user is used and a warning is stored for review.
   */
  #resolveRecordActor(device, deviceActorObj, entityType, record) {
    const userId = str(record?.erp_user_id);
    if (!userId) return { actor: deviceActorObj, warnings: [] };
    const required = RECORD_PERMISSIONS[entityType];
    const user = userRepo.findById(userId);
    if (!user || !user.isActive) {
      return { actor: deviceActorObj, warnings: [{ code: 'USER_INACTIVE', message: `ERP user ${userId} not found or inactive` }] };
    }
    const perms = repos.roles.getPermissions(user.roleId).map((p) => p.permission_key);
    if (required && !perms.includes('*') && !perms.includes(required)) {
      return {
        actor: deviceActorObj,
        warnings: [{ code: 'USER_NOT_PERMITTED', message: `${user.fullName} lacks ${required}; recorded under device user` }],
      };
    }
    return {
      actor: {
        ...deviceActorObj,
        user: { id: user.id, email: user.email, fullName: `${user.fullName} (${device.code})` },
      },
      warnings: [],
    };
  }

  /** Returns/payments that failed only because their sale wasn't synced yet. */
  #retryDependents(device, req) {
    const waiting = inboxRepo.list({ deviceId: device.id, status: 'failed', limit: 200 }).items
      .filter((i) => ['SALE_NOT_SYNCED'].includes(i.errorCode) && ['return', 'payment'].includes(i.entityType));
    for (const item of waiting) {
      try { this.retryInboxItem(item.id, null, req, { system: true }); } catch { /* stays failed */ }
    }
  }

  /* ---------- push endpoints ---------- */

  pushSales(device, body, req) {
    return this.#runBatch(device, req, 'sale', body.sales || [], (s) => s.invoice_no || s.sale_number, this.#applySale);
  }

  pushReturns(device, body, req) {
    return this.#runBatch(device, req, 'return', body.returns || [], (r) => r.return_number, this.#applyReturn);
  }

  pushPayments(device, body, req) {
    return this.#runBatch(device, req, 'payment', body.payments || [], (p) => p.voucher_number, this.#applyPayment);
  }

  pushCustomers(device, body, req) {
    return this.#runBatch(
      device, req, 'customer', body.customers || [],
      (c) => c.customer_code || c.phone, this.#applyCustomer
    );
  }

  /** Quotations made on the phone (Sale / Quotation toggle) become ERP quotations. */
  pushQuotations(device, body, req) {
    return this.#runBatch(device, req, 'quotation', body.quotations || [], (q) => q.quotation_no, this.#applyQuotation);
  }

  pushStockEvents(device, body, req) {
    return this.#runBatch(device, req, 'stock_event', body.stock_events || [], (e) => e.event_uuid, this.#applyStockEvent);
  }

  pushProducts(device, body, req) {
    return this.#runBatch(device, req, 'product', body.products || [], (p) => p.uuid || p.sku, this.#applyProductRequest);
  }

  /** Bulk push in dependency order. */
  pushAll(device, body, req) {
    const sections = [
      ['customers', () => this.pushCustomers(device, body, req)],
      ['quotations', () => this.pushQuotations(device, body, req)],
      ['sales', () => this.pushSales(device, body, req)],
      ['returns', () => this.pushReturns(device, body, req)],
      ['payments', () => this.pushPayments(device, body, req)],
      ['stock_events', () => this.pushStockEvents(device, body, req)],
      ['products', () => this.pushProducts(device, body, req)],
    ];
    const out = { serverTime: nowIso() };
    for (const [key, run] of sections) {
      if (Array.isArray(body[key]) && body[key].length) out[key] = run();
    }
    return out;
  }

  /* ---------- appliers ---------- */

  #resolveProduct(item) {
    const byId = str(item.product_uuid || item.uuid);
    if (byId) {
      const p = productRepo.findById(byId);
      if (p) return p;
    }
    if (str(item.sku)) {
      const p = productRepo.findBySku(str(item.sku));
      if (p) return p;
    }
    if (str(item.barcode)) {
      const p = productRepo.findByBarcode(str(item.barcode));
      if (p) return p;
    }
    return null;
  }

  #resolveCustomer(record, actor, req, { requireRegistered = false } = {}) {
    const name = str(record.customer_name);
    const phone = str(record.customer_phone || record.phone);
    const gst = str(record.customer_gstin || record.gstin);

    const serverId = str(record.customer_uuid);
    if (serverId && customerRepo.findById(serverId)) return { id: serverId, created: false };

    const found = catalogRepo.findCustomerByGst(gst) || catalogRepo.findCustomerByPhone(phone);
    if (found) return { id: found, created: false };

    const isWalkInName = !name || /^walk[\s-]?in/i.test(name);
    if (!isWalkInName && (phone || gst || requireRegistered)) {
      const created = customerService.create({
        name,
        phone: phone || null,
        gstNumber: gst || null,
        address: str(record.customer_address) || null,
        sourceChannel: 'pos',
        notes: `Created from POS sync (${actor.device.code})`,
      }, actor, req);
      return { id: created.id, created: true };
    }
    if (requireRegistered) {
      throw syncError('Credit/due sale needs a customer name and phone', 'CUSTOMER_REQUIRED');
    }
    const walkIn = customerRepo.findWalkIn();
    if (!walkIn) throw syncError('Walk-in customer is not configured in ERP', 'WALK_IN_MISSING', 500);
    return { id: walkIn.id, created: false };
  }

  #applyQuotation(device, actor, req, q, ref) {
    const items = Array.isArray(q.items) ? q.items : [];
    if (!items.length) throw syncError('Quotation has no items', 'EMPTY_QUOTATION');
    const lines = items.map((item, index) => {
      const product = this.#resolveProduct(item);
      if (!product) {
        throw syncError(`Line ${index + 1}: product not found in ERP (sku ${item.sku || '—'})`, 'UNKNOWN_PRODUCT');
      }
      const line = {
        productId: product.id,
        quantity: num(item.quantity),
        unitPrice: num(item.unit_price, product.sellingPrice),
        discountAmount: num(item.discount_amount, 0),
      };
      if (item.tax_rate != null) line.gstPercentage = num(item.tax_rate);
      if (item.description != null) line.description = str(item.description);
      return line;
    });
    const hasCustomer = str(q.customer_uuid) || str(q.customer_phone) || str(q.customer_name);
    const customer = hasCustomer ? this.#resolveCustomer(q, actor, req) : null;
    const date = parseTerminalTime(q.quotation_date_utc || q.created_at) || nowIso();
    const created = quotationService.create({
      warehouseId: device.warehouseId,
      customerId: customer?.id || null,
      items: lines,
      invoiceDiscount: round2(num(q.discount_amount, 0)),
      quotationDate: date.slice(0, 10),
      validUntil: /^\d{4}-\d{2}-\d{2}$/.test(str(q.valid_until)) ? str(q.valid_until) : undefined,
      status: 'sent',
      notes: [q.notes, `From ${device.name} (${device.code}-${ref})`].filter(Boolean).join(' · '),
      customerPoNumber: str(q.customer_po_number).slice(0, 60) || undefined,
      customerPoDate: str(q.customer_po_number) && /^\d{4}-\d{2}-\d{2}$/.test(str(q.customer_po_date)) ? str(q.customer_po_date) : undefined,
    }, actor, req);
    return { status: 'applied', resultType: 'quotation', resultId: created.id, number: created.quotationNumber };
  }

  /** A phone sale made from a phone quotation marks that quotation converted. */
  #markQuotationConverted(device, quotationRef, saleId, actor) {
    const ref = str(quotationRef);
    if (!ref) return;
    // A quotation made on this phone (by its own number), else one made in the ERP and pulled.
    const inbox = inboxRepo.find(device.id, 'quotation', ref);
    const quote = inbox?.status === 'applied' && inbox.resultId
      ? repos.quotations.findById(inbox.resultId)
      : repos.quotations.findByNumber(ref);
    if (quote && ['draft', 'sent', 'accepted'].includes(quote.status)) {
      repos.quotations.updateStatus(quote.id, 'converted', { convertedSaleId: saleId, updatedBy: actor.user.id });
    }
  }

  #applySale(device, actor, req, sale, ref) {
    const items = Array.isArray(sale.items) ? sale.items : [];
    if (!items.length) throw syncError('Sale has no items', 'EMPTY_SALE');

    const warnings = [];
    const cart = items.map((item, index) => {
      const product = this.#resolveProduct(item);
      if (!product) {
        throw syncError(
          `Line ${index + 1}: product not found in ERP (sku ${item.sku || '—'}, barcode ${item.barcode || '—'})`,
          'UNKNOWN_PRODUCT'
        );
      }
      if (!product.isActive) {
        warnings.push({ code: 'INACTIVE_PRODUCT', message: `${product.name} is inactive in ERP` });
      }
      const line = {
        productId: product.id,
        quantity: num(item.quantity),
        unitPrice: num(item.unit_price, product.sellingPrice),
        discountAmount: num(item.discount_amount, 0),
      };
      if (Array.isArray(item.serial_numbers) && item.serial_numbers.length) line.serialNumbers = item.serial_numbers;
      if (item.tax_rate != null) line.gstPercentage = num(item.tax_rate);
      // per-bill work description and the cost of providing the line (services)
      if (item.description != null) line.description = str(item.description);
      if (item.cost_amount != null && Number.isFinite(Number(item.cost_amount)) && Number(item.cost_amount) >= 0) line.costAmount = num(item.cost_amount);
      return line;
    });

    const posTotal = round2(num(sale.total_amount));
    const due = round2(Math.max(0, sale.due_amount != null
      ? num(sale.due_amount)
      : posTotal - num(sale.paid_amount, posTotal)));
    const customer = this.#resolveCustomer(sale, actor, req, { requireRegistered: due > 0.009 });

    const invoiceDiscount = round2(num(sale.discount_amount, 0));
    const preview = posService.preview({ items: cart, invoiceDiscount, customerId: customer.id }, actor);

    const diff = round2(preview.grandTotal - posTotal);
    if (posTotal > 0 && Math.abs(diff) > TOTAL_TOLERANCE) {
      throw syncError(
        `Invoice total mismatch: terminal ${posTotal}, ERP ${preview.grandTotal}. Check product GST/prices.`,
        'TOTAL_MISMATCH'
      );
    }
    if (posTotal > 0 && Math.abs(diff) >= 0.01) {
      warnings.push({ code: 'TOTAL_ROUNDING', message: `Adjusted by ${diff} to ERP total ${preview.grandTotal}` });
    }

    // Payments: explicit split if the terminal sent one, else paid + due.
    const grand = preview.grandTotal;
    let payments;
    if (Array.isArray(sale.payments) && sale.payments.length) {
      payments = sale.payments
        .map((p) => ({ method: mapPaymentMethod(p.method), amount: round2(num(p.amount)), reference: p.reference || null }))
        .filter((p) => p.amount > 0);
    } else {
      const credit = Math.min(due, grand);
      const paid = round2(grand - credit);
      payments = [];
      if (paid > 0) {
        payments.push({ method: mapPaymentMethod(sale.payment_method), amount: paid, reference: sale.payment_reference || null });
      }
      if (credit > 0) payments.push({ method: 'credit', amount: round2(credit) });
    }
    // Absorb rounding into the last payment so ERP totals balance.
    const paySum = round2(payments.reduce((s, p) => s + p.amount, 0));
    if (payments.length && Math.abs(paySum - grand) > 0.001) {
      payments[payments.length - 1].amount = round2(payments[payments.length - 1].amount + (grand - paySum));
    }

    const completedAt = parseTerminalTime(sale.sale_date_utc || sale.sale_date || sale.created_at) || nowIso();
    // The phone's own reference; the ERP gives the bill the firm's invoice series number
    // (e.g. SE/0005/26-27) for its date, and the phone shows that number once synced.
    const terminalRef = `${device.code}-${ref}`;
    if (catalogRepo.findSaleByTerminalRef(terminalRef) || catalogRepo.findSaleByInvoiceNumber(terminalRef)) {
      throw syncError(`Bill ${terminalRef} already exists in ERP`, 'DUPLICATE_INVOICE', 409);
    }

    const created = posService.checkout({
      warehouseId: device.warehouseId,
      customerId: customer.id,
      items: cart,
      invoiceDiscount,
      payments,
      terminalRef,
      defaultPaymentAccountId: device.paymentAccountId || null,
      // Customer's PO from the phone; a malformed date is dropped rather than failing the sale.
      customerPoNumber: str(sale.customer_po_number).slice(0, 60) || undefined,
      customerPoDate: str(sale.customer_po_number) && /^\d{4}-\d{2}-\d{2}$/.test(str(sale.customer_po_date))
        ? str(sale.customer_po_date) : undefined,
      // GST bills: transport / dispatch details and a separate Shipped To (consignee).
      // A malformed block is dropped rather than failing the sale.
      transport: (() => { try { return transportFrom(sale.transport); } catch { return null; } })(),
      shipTo: (() => { try { return shipToFrom(sale.ship_to); } catch { return null; } })(),
      notes: [
        sale.notes,
        cashDrawerNote(sale.cash_drawer),
        str(sale.exchange_return_number) ? `Exchange: part paid by return ${str(sale.exchange_return_number)}` : null,
        `Synced from ${device.name}`,
      ].filter(Boolean).join(' · '),
    }, actor, req, { offlineSync: true, completedAt });
    this.#markQuotationConverted(device, sale.quotation_no, created.id, actor);

    return {
      status: 'applied',
      resultType: 'pos_sale',
      resultId: created.id,
      number: created.invoiceNumber,
      warnings: [...warnings, ...(created.syncWarnings || [])],
    };
  }

  #findSyncedSale(device, saleNumber) {
    const ref = str(saleNumber);
    if (!ref) return null;
    const inbox = inboxRepo.find(device.id, 'sale', ref);
    if (inbox?.status === 'applied' && inbox.resultId) return saleRepo.findById(inbox.resultId);
    const id = catalogRepo.findSaleByTerminalRef(`${device.code}-${ref}`) || catalogRepo.findSaleByInvoiceNumber(`${device.code}-${ref}`) || catalogRepo.findSaleByInvoiceNumber(ref);
    return id ? saleRepo.findById(id) : null;
  }

  /**
   * The ERP's current copy of bills this phone synced (refs = the phone's own bill numbers), so
   * an admin's Edit bill in the ERP reaches the phone. Only this device's bills are returned.
   */
  currentSales(device, body) {
    const refs = [...new Set((Array.isArray(body?.refs) ? body.refs : []).map(str).filter(Boolean))].slice(0, 500);
    return {
      sales: refs.map((ref) => {
        let id = catalogRepo.findSaleByTerminalRef(`${device.code}-${ref}`);
        if (!id) {
          const inbox = inboxRepo.find(device.id, 'sale', ref);
          if (inbox?.status === 'applied' && inbox.resultId) id = inbox.resultId;
        }
        const sale = id ? saleRepo.findById(id) : null;
        if (!sale) return { ref, status: 'unknown' };
        if (sale.status === 'voided') return { ref, status: 'voided' };
        return { ref, status: 'current', sale: phoneSale(sale) };
      }),
    };
  }

  #applyReturn(device, actor, req, ret) {
    const sale = this.#findSyncedSale(device, ret.sale_number);
    if (!sale) {
      throw syncError(`Original sale ${ret.sale_number || '—'} is not synced yet`, 'SALE_NOT_SYNCED');
    }
    const remaining = new Map(sale.items.map((i) => [i.id, i.quantity - i.quantityReturned]));
    const lines = (ret.items || []).map((item) => {
      const product = this.#resolveProduct(item);
      const saleItem = sale.items.find((si) => (product ? si.productId === product.id : si.sku === item.sku)
        && remaining.get(si.id) >= num(item.quantity) - 0.000001);
      if (!saleItem) {
        throw syncError(`Return line ${item.sku}: not found on ${sale.invoiceNumber} or over-returned`, 'RETURN_LINE_INVALID');
      }
      remaining.set(saleItem.id, remaining.get(saleItem.id) - num(item.quantity));
      return { saleItemId: saleItem.id, quantity: num(item.quantity) };
    });
    const refund = str(ret.refund_method).toLowerCase();
    const created = posService.createReturn({
      saleId: sale.id,
      items: lines,
      refundMethod: ['cash', 'upi', 'bank', 'credit_note'].includes(refund) ? refund : 'cash',
      reason: ret.reason || null,
      notes: [
        `POS ${str(ret.return_type) === 'exchange' ? 'exchange' : 'return'} ${ret.return_number} (${device.code})`,
        approvalNote(ret),
      ].filter(Boolean).join(' · '),
    }, actor, req);
    return { status: 'applied', resultType: 'pos_sales_return', resultId: created.id, number: created.returnNumber };
  }

  #applyPayment(device, actor, req, pay) {
    const amount = round2(num(pay.amount));
    if (!(amount > 0)) throw syncError('Payment amount must be positive', 'INVALID_AMOUNT');

    let customerId = null;
    let allocations;
    if (str(pay.invoice_number)) {
      const sale = this.#findSyncedSale(device, pay.invoice_number);
      if (!sale) throw syncError(`Invoice ${pay.invoice_number} is not synced yet`, 'SALE_NOT_SYNCED');
      customerId = sale.customerId;
      allocations = [{ documentType: 'sales_invoice', documentId: sale.id, allocatedAmount: amount }];
    } else {
      customerId = this.#resolveCustomer(pay, actor, req, { requireRegistered: true }).id;
    }

    const base = {
      customerId,
      amount,
      paymentMode: mapReceiptMode(pay.payment_method),
      receiptDate: (parseTerminalTime(pay.created_at) || nowIso()).slice(0, 10),
      referenceNumber: `${device.code}-${pay.voucher_number}`,
      remarks: `Collected on POS ${device.name}${pay.notes ? ` · ${pay.notes}` : ''}`,
    };
    let receipt;
    try {
      receipt = customerReceiptService.create({ ...base, allocations }, actor, req);
    } catch (err) {
      if (!allocations) throw err;
      receipt = customerReceiptService.create({ ...base, allocate: 'auto' }, actor, req);
    }
    return {
      status: 'applied',
      resultType: 'customer_receipt',
      resultId: receipt.id,
      number: receipt.voucherNumber,
      warnings: [{ code: 'DRAFT_RECEIPT', message: 'Created as draft — post it in ERP after choosing the cash/bank account' }],
    };
  }

  #applyCustomer(device, actor, req, c) {
    const phone = str(c.phone);
    const gst = str(c.gstin);
    const existingId = catalogRepo.findCustomerByGst(gst) || catalogRepo.findCustomerByPhone(phone);
    if (existingId) {
      return { status: 'applied', resultType: 'customer', resultId: existingId, warnings: [{ code: 'MATCHED_EXISTING', message: 'Linked to existing ERP customer' }] };
    }
    if (!str(c.name)) throw syncError('Customer name is required', 'CUSTOMER_NAME_REQUIRED');
    const created = customerService.create({
      name: str(c.name),
      phone: phone || null,
      email: str(c.email) || null,
      gstNumber: gst || null,
      address: str(c.address) || null,
      city: str(c.city) || null,
      state: str(c.state) || null,
      sourceChannel: 'pos',
      notes: `POS code ${c.customer_code || '—'} (${device.code})`,
    }, actor, req);
    return { status: 'applied', resultType: 'customer', resultId: created.id, number: created.code };
  }

  #applyStockEvent(device, actor, req, e) {
    const type = str(e.event_type).toUpperCase();
    const refType = str(e.reference_type).toLowerCase();
    // Sales and returns move stock when their documents sync — never twice.
    if (['SALE', 'RETURN'].includes(type) || ['sale', 'return', 'sale_return'].includes(refType)) {
      return { status: 'ignored', warnings: [{ code: 'COVERED_BY_DOCUMENT', message: 'Stock moves with the synced sale/return' }] };
    }
    const product = this.#resolveProduct({ product_uuid: e.product_uuid, sku: e.sku });
    if (!product) throw syncError(`Product ${e.sku} not found in ERP`, 'UNKNOWN_PRODUCT');
    const change = num(e.quantity_change);
    if (!change) return { status: 'ignored' };

    // Terminal-side adjustments/purchases become ERP adjustment requests (approval queue).
    const result = inventoryMovementService.createMovement({
      productId: product.id,
      warehouseId: device.warehouseId,
      movementType: change > 0 ? MOVEMENT_TYPES.ADJUSTMENT_INCREASE : MOVEMENT_TYPES.ADJUSTMENT_DECREASE,
      quantity: Math.abs(change),
      referenceType: 'pos_device',
      referenceId: device.id,
      reason: `POS ${type.toLowerCase()} ${e.reference_number || ''} (${device.code})`.trim(),
      notes: `event ${e.event_uuid}`,
    }, actor, req, { skipPermissionCheck: false });
    return {
      status: 'pending_review',
      resultType: 'inventory_movement',
      resultId: result.movement?.id || null,
      warnings: [{ code: 'NEEDS_APPROVAL', message: 'Stock adjustment awaits approval in ERP Inventory' }],
    };
  }

  #applyProductRequest(device, actor, req, p) {
    if (str(p.sku) && productRepo.findBySku(str(p.sku))) {
      return { status: 'applied', resultType: 'product', resultId: productRepo.findBySku(str(p.sku)).id,
        warnings: [{ code: 'MATCHED_EXISTING', message: 'SKU already exists in ERP' }] };
    }
    if (!str(p.name)) throw syncError('Product name is required', 'PRODUCT_NAME_REQUIRED');
    return { status: 'pending_review', warnings: [{ code: 'NEEDS_APPROVAL', message: 'New product awaits approval in ERP' }] };
  }

  /* ---------- pull endpoints ---------- */

  pullProducts(device, query) {
    const since = normalizeSince(query.since);
    const { limit, page, offset } = pageParams(query);
    const serverTime = nowIso();
    const { items, total } = catalogRepo.findChanged(device.warehouseId, since, { limit, offset });

    const products = items.map((r) => ({
      uuid: r.id,
      name: r.name,
      sku: r.sku,
      barcode: r.barcode,
      category: r.category_name,
      brand: r.brand_name,
      unit: r.unit_abbreviation || r.unit_name || 'PCS',
      hsn: r.hsn_code,
      gst_rate: Number(r.gst_percentage || 0),
      mrp: Number(r.mrp || 0),
      selling_price: Number(r.selling_price || 0),
      item_type: r.item_type === 'service' ? 'service' : 'goods',
      // Warranty / guarantee from the invoice date (printed on the phone's bills).
      short_description: r.short_description || null,
      warranty_value: r.warranty_value || null,
      warranty_unit: r.warranty_value ? r.warranty_unit : null,
      guarantee_value: r.guarantee_value || null,
      guarantee_unit: r.guarantee_value ? r.guarantee_unit : null,
      wholesale_price: Number(r.purchase_price || 0) > 0 ? Number(r.selling_price || 0) : 0,
      current_stock: Number(r.quantity_on_hand || 0),
      reserved_stock: Number(r.quantity_reserved || 0),
      available_stock: Number(r.quantity_available || 0),
      image_url: r.image_url,
      is_active: Boolean(r.is_active),
      approval_status: 'approved',
      updated_at: r.changed_at || r.updated_at,
    }));

    // First page also carries decisions on terminal-created product requests.
    if (page === 1) {
      for (const reviewed of inboxRepo.reviewedProductRequests(device.id, since)) {
        if (reviewed.status === 'rejected') {
          products.push({
            uuid: reviewed.payload.uuid || reviewed.id,
            name: reviewed.payload.name,
            sku: reviewed.payload.sku,
            is_active: false,
            approval_status: 'rejected',
            updated_at: reviewed.reviewedAt,
          });
        }
      }
    }

    deviceRepo.touch(device.id, { kind: 'pull' });
    return {
      products,
      page,
      limit,
      total,
      has_more: offset + items.length < total,
      server_time: serverTime,
    };
  }

  pendingProductCount(device, query) {
    return { count: catalogRepo.countChanged(device.warehouseId, normalizeSince(query.since)), server_time: nowIso() };
  }

  /**
   * Current status + ERP permissions for staff who use this terminal (SAC-POS PIN unlock).
   * Lets a terminal refresh RBAC and block deactivated users without their password.
   */
  staffStatus(device, query) {
    const ids = String(query.ids || '').split(',').map((s) => s.trim()).filter(Boolean).slice(0, 100);
    deviceRepo.touch(device.id);
    return {
      staff: ids.map((id) => {
        const user = userRepo.findById(id);
        if (!user) return { id, exists: false, isActive: false, permissions: [] };
        // Staff may use this terminal only if they may open the firm it belongs to.
        const firmId = currentFirmId();
        const allowed = user.isActive && (!firmId || firmService.canOpen({ id: user.id, roleSlug: user.roleSlug, firmId: user.firmId }, firmId));
        return {
          id,
          exists: true,
          isActive: allowed,
          firmAccess: allowed || !user.isActive ? undefined : false,
          fullName: user.fullName,
          email: user.email,
          roleName: user.roleName,
          permissions: allowed ? repos.roles.getPermissions(user.roleId).map((p) => p.permission_key) : [],
          // When the ERP last set / cleared this person's SAC-POS PIN: phones drop a cached PIN that changed.
          pinSetAt: posPins.pinVersion(id),
        };
      }),
      server_time: nowIso(),
    };
  }

  pullCustomers(device, query) {
    const since = normalizeSince(query.since);
    const { limit, page, offset } = pageParams(query);
    const serverTime = nowIso();
    const { items, total } = catalogRepo.findChangedCustomers(since, { limit, offset });
    deviceRepo.touch(device.id, { kind: 'pull' });
    return {
      // Every registered customer of the firm: a phone holding fewer pulls them all again.
      all_total: catalogRepo.countCustomers(),
      customers: items.map((c) => ({
        uuid: c.id,
        code: c.code,
        name: c.name,
        phone: c.phone,
        email: c.email,
        gstin: c.gst_number,
        gst_state_code: c.gst_state_code,
        address: c.address,
        city: c.city,
        state: c.state,
        credit_limit: Number(c.credit_limit || 0),
        outstanding: Number(c.outstanding_balance || 0),
        credit_approved: Boolean(c.credit_approved),
        is_active: Boolean(c.is_active),
        updated_at: c.updated_at,
      })),
      page,
      limit,
      total,
      has_more: offset + items.length < total,
      server_time: serverTime,
    };
  }

  /**
   * Bills and quotations made in the ERP or on other terminals of this firm, for the signed-in
   * staff member: bills need "POS Sales – view", quotations "POS Quotations – view". The phone
   * replaces its copies with each answer, so a document dropped here disappears there too.
   */
  pullDocuments(device, query) {
    const userId = str(query.userId);
    const staff = userId ? this.staffStatus(device, { ids: userId }).staff[0] : null;
    const perms = staff?.isActive ? staff.permissions : [];
    const has = (key) => perms.includes('*') || perms.includes(key);
    const days = Math.min(Math.max(parseInt(query.days, 10) || 30, 1), 90);
    const from = new Date(Date.now() - days * 86400000).toISOString();
    const db = getDatabase();
    deviceRepo.touch(device.id, { kind: 'pull' });

    // This terminal's own bills come too, tagged with the phone's bill number (phoneRef): a phone
    // that still has the bill skips it, one that lost it (re-paired, reinstalled) gets it back.
    const own = `${device.code}-`;
    const sales = has('pos.sales.view')
      ? db.prepare(`
          SELECT id FROM pos_sales
          WHERE status != 'voided' AND COALESCE(completed_at, created_at) >= ?
          ORDER BY created_at DESC LIMIT 1000
        `).all(from)
        .map((r) => saleRepo.findById(r.id)).filter(Boolean)
        .map((s) => {
          const mine = Boolean(s.terminalRef?.startsWith(own));
          return {
            ...phoneSale(s),
            source: mine ? 'this_terminal' : s.terminalRef ? 'terminal' : 'erp',
            phoneRef: mine ? s.terminalRef.slice(own.length) : null,
            createdBy: s.createdByName || null,
          };
        })
      : null;

    const today = nowIso().slice(0, 10);
    const quotations = has('pos.quotations.view')
      ? db.prepare(`
          SELECT id FROM pos_quotations
          WHERE status != 'cancelled' AND (created_at >= ? OR (status IN ('draft', 'sent', 'accepted') AND COALESCE(valid_until, ?) >= ?))
          ORDER BY created_at DESC LIMIT 500
        `).all(from, today, from.slice(0, 10))
        .map((r) => repos.quotations.findById(r.id)).filter(Boolean)
        .map(phoneQuotation)
      : null;

    return { sales, quotations, days, server_time: nowIso() };
  }

  pullUsers(device, query) {
    const since = normalizeSince(query.since);
    const { limit, page, offset } = pageParams(query);
    const serverTime = nowIso();
    const { items, total } = posUserRepo.findChangedForWarehouse(device.warehouseId, since, { limit, offset });
    return {
      users: items.map((u) => ({
        uuid: u.id,
        user_id: u.loginId,
        display_name: u.displayName,
        pin_hash: u.pinHash,
        role: u.role,
        permissions: u.permissions,
        is_active: u.isActive,
        updated_at: u.updatedAt,
      })),
      page,
      limit,
      total,
      has_more: offset + items.length < total,
      server_time: serverTime,
    };
  }

  acknowledge(device, body, kind) {
    const uuids = Array.isArray(body?.uuids) ? body.uuids : [];
    deviceRepo.touch(device.id, { kind: 'pull' });
    return { acknowledged: uuids.length, kind };
  }

  /* ═══════════════════════ ERP admin operations ═══════════════════════ */

  retryInboxItem(id, adminActor, req, { system = false } = {}) {
    if (!system) authService.checkPermission(adminActor.permissions, 'pos.devices.edit');
    const item = inboxRepo.findById(id);
    if (!item) throw new AppError('Sync record not found', 404);
    if (item.status !== 'failed') throw new AppError('Only failed records can be retried', 400);
    const device = deviceRepo.findById(item.deviceId);
    if (!device) throw new AppError('Device not found', 404);
    const appliers = {
      sale: this.#applySale,
      return: this.#applyReturn,
      payment: this.#applyPayment,
      customer: this.#applyCustomer,
      stock_event: this.#applyStockEvent,
      product: this.#applyProductRequest,
    };
    const outcome = this.#applyOne(
      device, deviceActor(device), req, item.entityType, item.externalRef, item.payload, appliers[item.entityType]
    );
    return { ...inboxRepo.findById(id), outcome };
  }

  approveProductRequest(id, overrides, adminActor, req) {
    authService.checkPermission(adminActor.permissions, 'pos.devices.approve');
    const item = inboxRepo.findById(id);
    if (!item || item.entityType !== 'product') throw new AppError('Product request not found', 404);
    if (item.status !== 'pending_review') throw new AppError('Request is not pending review', 400);
    const p = item.payload;
    const product = productService.create({
      name: overrides.name ?? p.name,
      sku: overrides.sku ?? p.sku,
      barcode: overrides.barcode ?? (p.barcode || null),
      hsnCode: overrides.hsnCode ?? (p.hsn || null),
      gstPercentage: overrides.gstPercentage ?? num(p.gst_rate),
      sellingPrice: overrides.sellingPrice ?? num(p.selling_price),
      mrp: overrides.mrp ?? num(p.selling_price),
      purchasePrice: overrides.purchasePrice ?? 0,
      categoryId: overrides.categoryId || null,
      brandId: overrides.brandId || null,
      unitId: overrides.unitId || null,
      description: `Requested from POS ${item.deviceCode || ''}`.trim(),
    }, adminActor, req);
    return inboxRepo.review(id, {
      status: 'applied', resultType: 'product', resultId: product.id, reviewedBy: adminActor.user.id,
    });
  }

  rejectInboxItem(id, reason, adminActor) {
    authService.checkPermission(adminActor.permissions, 'pos.devices.approve');
    const item = inboxRepo.findById(id);
    if (!item) throw new AppError('Sync record not found', 404);
    if (!['pending_review', 'failed'].includes(item.status)) {
      throw new AppError('Only pending or failed records can be rejected', 400);
    }
    return inboxRepo.review(id, {
      status: 'rejected', reviewedBy: adminActor.user.id, errorMessage: reason || 'Rejected in ERP',
    });
  }

  listInbox(query, adminActor) {
    authService.checkPermission(adminActor.permissions, 'pos.devices.view');
    return inboxRepo.list({
      deviceId: query.deviceId || '',
      entityType: query.entityType || '',
      status: query.status || '',
      limit: Math.min(parseInt(query.limit, 10) || 100, 500),
      offset: parseInt(query.offset, 10) || 0,
    });
  }

  inboxSummary(adminActor) {
    authService.checkPermission(adminActor.permissions, 'pos.devices.view');
    return inboxRepo.summary();
  }
}

/* ═══════════════════════ Device & POS-user administration ═══════════════════════ */

export class PosDeviceAdminService {
  list(actor) {
    authService.checkPermission(actor.permissions, 'pos.devices.view');
    return deviceRepo.findAll();
  }

  create(data, actor, req) {
    authService.checkPermission(actor.permissions, 'pos.devices.create');
    const name = str(data.name);
    if (!name) throw new AppError('Device name is required', 400);
    const warehouse = warehouseRepo.findById(data.warehouseId) || warehouseRepo.findDefault();
    if (!warehouse?.isActive) throw new AppError('An active warehouse is required', 400);
    const actingUserId = data.actingUserId || actor.user.id;
    if (!userRepo.findById(actingUserId)?.isActive) throw new AppError('Acting user must be an active ERP user', 400);

    const code = (str(data.code) || deviceRepo.nextCode()).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10);
    if (!code) throw new AppError('Device code must be alphanumeric', 400);
    if (deviceRepo.codeExists(code)) throw new AppError('Device code already exists', 409);

    const { rawKey, keyPrefix, keyHash } = generateApiKeySecret();
    const paymentAccountId = this.#terminalBank(data.paymentAccountId);
    const created = deviceRepo.create({
      code, name, warehouseId: warehouse.id, actingUserId, keyPrefix, keyHash,
      notes: data.notes, createdBy: actor.user.id,
    });
    const device = paymentAccountId ? deviceRepo.update(created.id, { paymentAccountId }) : created;
    this.#audit(actor, req, 'create', device.id, { code, name, warehouseId: warehouse.id, paymentAccountId });
    return { device, syncKey: rawKey };
  }

  /** A terminal's UPI / bank money goes to an active bank or UPI account (or the default bank when none). */
  #terminalBank(id) {
    if (!id) return null;
    const acct = repos.financeAccounts.findById(id);
    if (!acct?.isActive || !['bank', 'upi'].includes(acct.accountType)) {
      throw new AppError('Choose an active bank or UPI account for this terminal', 400, 'BANK_INVALID');
    }
    return acct.id;
  }

  update(id, data, actor, req) {
    authService.checkPermission(actor.permissions, 'pos.devices.edit');
    if (!deviceRepo.findById(id)) throw new AppError('Device not found', 404);
    if (data.warehouseId && !warehouseRepo.findById(data.warehouseId)?.isActive) {
      throw new AppError('Warehouse not found or inactive', 400);
    }
    if (data.actingUserId && !userRepo.findById(data.actingUserId)?.isActive) {
      throw new AppError('Acting user must be an active ERP user', 400);
    }
    if (data.paymentAccountId) this.#terminalBank(data.paymentAccountId);
    const updated = deviceRepo.update(id, data);
    this.#audit(actor, req, 'update', id, data);
    return updated;
  }

  rotateKey(id, actor, req) {
    authService.checkPermission(actor.permissions, 'pos.devices.edit');
    if (!deviceRepo.findById(id)) throw new AppError('Device not found', 404);
    const { rawKey, keyPrefix, keyHash } = generateApiKeySecret();
    const device = deviceRepo.rotateKey(id, { keyPrefix, keyHash });
    this.#audit(actor, req, 'rotate_key', id, { keyPrefix });
    return { device, syncKey: rawKey };
  }

  revoke(id, actor, req) {
    authService.checkPermission(actor.permissions, 'pos.devices.delete');
    if (!deviceRepo.findById(id)) throw new AppError('Device not found', 404);
    const device = deviceRepo.revoke(id);
    this.#audit(actor, req, 'revoke', id, {});
    return device;
  }

  #audit(actor, req, action, recordId, newValue) {
    auditRepo.create({
      userId: actor.user.id,
      userName: actor.user.fullName,
      action,
      module: 'pos',
      recordType: 'pos_device',
      recordId,
      newValue,
      ...requestMeta(req),
    });
  }
}

export const posSyncService = new PosSyncService();
export const posDeviceAdminService = new PosDeviceAdminService();
export { STORED_STATUSES };
