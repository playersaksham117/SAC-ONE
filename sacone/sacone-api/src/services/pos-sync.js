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
import { posService } from './pos.js';
import { customerService } from './parties.js';
import { inventoryMovementService } from './inventory.js';
import { customerReceiptService } from './customer-receipts.js';
import { productService } from './products.js';

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
]);

/** ERP permission a staff member needs for each synced record type. */
const RECORD_PERMISSIONS = Object.freeze({
  sale: 'pos.sales.create',
  return: 'pos.returns.create',
  payment: 'parties.customer_receipts.create',
  customer: 'parties.customers.create',
  stock_event: 'inventory.adjustments.create',
});

/** Inbox statuses that mean "server has it — client may mark the record synced". */
const STORED_STATUSES = new Set(['applied', 'ignored', 'pending_review', 'failed', 'rejected']);

const TOTAL_TOLERANCE = Number(process.env.POS_SYNC_TOTAL_TOLERANCE || 1);
const DEFAULT_TZ_OFFSET = process.env.POS_DEFAULT_TZ_OFFSET || '+05:30';
const PAGE_LIMIT_MAX = 500;
const EPOCH = '1970-01-01T00:00:00.000Z';

const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const str = (v) => (v == null ? '' : String(v).trim());
const num = (v, fallback = 0) => (Number.isFinite(Number(v)) ? Number(v) : fallback);

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
      },
    };
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
      if (item.tax_rate != null) line.gstPercentage = num(item.tax_rate);
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
    const invoiceNumber = `${device.code}-${ref}`;
    if (catalogRepo.findSaleByInvoiceNumber(invoiceNumber)) {
      throw syncError(`Invoice ${invoiceNumber} already exists in ERP`, 'DUPLICATE_INVOICE', 409);
    }

    const created = posService.checkout({
      warehouseId: device.warehouseId,
      customerId: customer.id,
      items: cart,
      invoiceDiscount,
      payments,
      invoiceNumber,
      notes: [sale.notes, `Synced from ${device.name}`].filter(Boolean).join(' · '),
    }, actor, req, { offlineSync: true, completedAt });

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
    const id = catalogRepo.findSaleByInvoiceNumber(`${device.code}-${ref}`) || catalogRepo.findSaleByInvoiceNumber(ref);
    return id ? saleRepo.findById(id) : null;
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
      notes: `POS return ${ret.return_number} (${device.code})`,
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
        return {
          id,
          exists: true,
          isActive: user.isActive,
          fullName: user.fullName,
          email: user.email,
          roleName: user.roleName,
          permissions: user.isActive ? repos.roles.getPermissions(user.roleId).map((p) => p.permission_key) : [],
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
    const device = deviceRepo.create({
      code, name, warehouseId: warehouse.id, actingUserId, keyPrefix, keyHash,
      notes: data.notes, createdBy: actor.user.id,
    });
    this.#audit(actor, req, 'create', device.id, { code, name, warehouseId: warehouse.id });
    return { device, syncKey: rawKey };
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

  /* POS PIN users */

  listUsers(actor) {
    authService.checkPermission(actor.permissions, 'pos.devices.view');
    return posUserRepo.findAll();
  }

  createUser(data, actor, req) {
    authService.checkPermission(actor.permissions, 'pos.devices.create');
    const loginId = str(data.loginId).toUpperCase();
    if (!/^[A-Z0-9_-]{2,20}$/.test(loginId)) throw new AppError('Login ID must be 2–20 letters/digits', 400);
    if (posUserRepo.loginIdExists(loginId)) throw new AppError('Login ID already exists', 409);
    if (!str(data.displayName)) throw new AppError('Display name is required', 400);
    const pinHash = this.#hashPin(data.pin, { required: true });
    const user = posUserRepo.create({
      loginId, displayName: str(data.displayName), pinHash, role: this.#role(data.role),
      permissions: Array.isArray(data.permissions) ? data.permissions : null,
      warehouseId: data.warehouseId || null, linkedUserId: data.linkedUserId || null, createdBy: actor.user.id,
    });
    this.#audit(actor, req, 'create_pos_user', user.id, { loginId, role: user.role });
    return user;
  }

  updateUser(id, data, actor, req) {
    authService.checkPermission(actor.permissions, 'pos.devices.edit');
    if (!posUserRepo.findById(id)) throw new AppError('POS user not found', 404);
    const patch = {
      displayName: data.displayName !== undefined ? str(data.displayName) : undefined,
      role: data.role !== undefined ? this.#role(data.role) : undefined,
      permissions: data.permissions,
      warehouseId: data.warehouseId,
      linkedUserId: data.linkedUserId,
      isActive: data.isActive,
    };
    if (data.pin) patch.pinHash = this.#hashPin(data.pin, { required: true });
    const user = posUserRepo.update(id, patch);
    this.#audit(actor, req, 'update_pos_user', id, { ...data, pin: data.pin ? '••••' : undefined });
    return user;
  }

  #role(value) {
    const role = str(value || 'cashier').toLowerCase();
    if (!['admin', 'manager', 'cashier'].includes(role)) throw new AppError('Role must be admin, manager or cashier', 400);
    return role;
  }

  /** sha256(pin) — identical to BillEase POS AuthService.hashPin so terminals can verify offline. */
  #hashPin(pin, { required }) {
    const value = str(pin);
    if (!value && required) throw new AppError('PIN is required', 400);
    if (!/^\d{4,8}$/.test(value)) throw new AppError('PIN must be 4–8 digits', 400);
    return hashApiKey(value);
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
