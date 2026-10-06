import { AppError } from '../core/http.js';
import { generateId, nowIso } from '../core/utils.js';
import { MOVEMENT_TYPES } from '../core/inventory-constants.js';
import { repos } from '../repositories/index.js';
import { authService } from './index.js';
import { inventoryMovementService } from './inventory.js';
import { customerService } from './parties.js';
import { commissionService } from './commissions.js';

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

export class SettingsService {
  list(actor) {
    authService.checkPermission(actor.permissions, 'core.system_settings.view');
    return settingsRepo.getAll();
  }

  getPublicPosSettings() {
    return {
      allowNegativeStock: settingsRepo.getBoolean('allow_negative_stock', false),
    };
  }

  update(key, value, actor, req) {
    authService.checkPermission(actor.permissions, 'core.system_settings.edit');
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
      companyStateCode: company?.gstStateCode,
      customerStateCode: customer?.gstStateCode,
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
        hsnCode: product.hsnCode,
        quantity: item.quantity,
        unitPrice: item.unitPrice != null ? item.unitPrice : product.sellingPrice,
        discountAmount: item.discountAmount || 0,
        discountPercent: item.discountPercent || 0,
        gstPercentage: item.gstPercentage != null ? item.gstPercentage : product.gstPercentage,
      };
    });
  }

  #normalizePayments(payments, grandTotal) {
    if (!Array.isArray(payments) || payments.length === 0) {
      throw new AppError('At least one payment is required', 400);
    }
    const normalized = payments.map((p) => {
      const method = String(p.method || '').toLowerCase();
      if (!PAYMENT_METHODS.has(method)) {
        throw new AppError(`Invalid payment method: ${p.method}`, 400);
      }
      const amount = round2(p.amount);
      if (!Number.isFinite(amount) || amount <= 0) {
        throw new AppError('Payment amount must be positive', 400);
      }
      return {
        method,
        amount,
        reference: p.reference || null,
        notes: p.notes || null,
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
  checkout(data, actor, req, options = {}) {
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
      companyStateCode: company?.gstStateCode,
      customerStateCode: customer.gstStateCode,
    });

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
      totals.grandTotal
    );

    if (amountCredit > 0 && customer.isWalkIn) {
      throw new AppError('Credit sale is not allowed for walk-in customers', 400);
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

    // Price floor: an edited price or any discount must not take a line below the product's
    // minimum selling price (or its selling price when no minimum is set). Net unit price is
    // GST-exclusive and includes the line's share of the bill discount.
    for (const item of totals.items) {
      const product = productRepo.findById(item.productId);
      const floor = product ? (product.minSellingPrice > 0 ? product.minSellingPrice : product.sellingPrice) : 0;
      if (!(floor > 0) || !(item.quantity > 0)) continue;
      const netUnit = item.taxableAmount / item.quantity;
      if (netUnit + 0.005 < floor) {
        const message = `${item.productName}: net price ₹${netUnit.toFixed(2)} is below the minimum selling price ₹${floor.toFixed(2)}`;
        if (offlineSync) warnings.push({ code: 'BELOW_MIN_PRICE', message });
        else throw new AppError(message, 400, 'BELOW_MIN_PRICE');
      }
    }

    const allowNegative = offlineSync || this.#allowNegativeStock();
    // Pre-validate stock before creating invoice
    for (const item of totals.items) {
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
      saleRepo.updateItemMovement(item.id, result.movement.id);
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
    authService.checkPermission(actor.permissions, 'pos.sales.view');
    return saleRepo.findAll({
      search: filters.search || '',
      customerId: filters.customerId || '',
      warehouseId: filters.warehouseId || '',
      status: filters.status || '',
      dateFrom: /^\d{4}-\d{2}-\d{2}$/.test(filters.dateFrom || '') ? filters.dateFrom : '',
      dateTo: /^\d{4}-\d{2}-\d{2}$/.test(filters.dateTo || '') ? filters.dateTo : '',
      limit: filters.limit ? Math.min(parseInt(filters.limit, 10) || 50, 5000) : 50,
      offset: filters.offset ? parseInt(filters.offset, 10) : 0,
    });
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

    const ret = returnRepo.create({
      header: {
        saleId: sale.id,
        warehouseId: sale.warehouseId,
        customerId: sale.customerId,
        subtotal,
        gstAmount,
        grandTotal,
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
        reason: `Return ${ret.returnNumber} for ${sale.invoiceNumber}`,
      }, actor, req, { skipPermissionCheck: true });
      returnRepo.updateItemMovement(item.id, result.movement.id);
      saleRepo.addReturnedQuantity(item.saleItemId, item.quantity);
    }

    // Outstanding: credit_note reduces customer balance; credit portion of original sale
    if (refundMethod === 'credit_note') {
      customerRepo.adjustOutstanding(sale.customerId, -grandTotal);
    } else if (sale.amountCredit > 0) {
      // Reduce outstanding proportionally for credit sales when refunding cash/upi/bank
      const creditShare = round2(grandTotal * (sale.amountCredit / sale.grandTotal));
      if (creditShare > 0) {
        customerRepo.adjustOutstanding(sale.customerId, -Math.min(creditShare, sale.amountCredit));
      }
    }

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
    return returnRepo.findAll({
      saleId: filters.saleId || '',
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
