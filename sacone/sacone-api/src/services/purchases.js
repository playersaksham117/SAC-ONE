import { withFinancialYear } from '../database/context.js';
import { financialYearOf } from '../core/financial-year.js';
import { AppError } from '../core/http.js';
import { MOVEMENT_TYPES } from '../core/inventory-constants.js';
import { repos } from '../repositories/index.js';
import { authService, isFirmAdmin } from './index.js';
import { getDatabase } from '../database/connection.js';
import { calculateCartTotals } from './pos.js';
import { inventoryMovementService } from './inventory.js';
import { supplierService } from './parties.js';
import { partyStatementService } from './party-statements.js';
import { numberOldDebitNotes } from './notes.js';
import { stateCodeOf } from '../core/gst-state.js';
import { addDays } from './aging.js';

const purchaseRepo = repos.purchases;
const productRepo = repos.products;
const supplierRepo = repos.suppliers;
const warehouseRepo = repos.warehouses;
const companyRepo = repos.company;
const numberingRepo = repos.documentNumbering;
const auditRepo = repos.auditLogs;

function getRequestMeta(req) {
  return {
    ipAddress: req?.ip || req?.headers?.['x-forwarded-for'] || null,
    userAgent: req?.headers?.['user-agent'] || null,
  };
}

function round2(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

function parseCsvLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i += 1; }
      else inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else current += ch;
  }
  result.push(current.trim());
  return result;
}

function parsePriceListCsv(csvText) {
  const lines = csvText.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim().split('\n');
  if (lines.length < 2) throw new AppError('CSV must include header and at least one row', 400);
  const headers = parseCsvLine(lines[0]).map((h) => h.toLowerCase().replace(/\s+/g, '_'));
  const col = (...names) => {
    for (const n of names) {
      const idx = headers.indexOf(n);
      if (idx >= 0) return idx;
    }
    return -1;
  };
  const skuIdx = col('sku', 'supplier_sku', 'item_code', 'code');
  const nameIdx = col('name', 'product_name', 'description', 'item_name');
  const barcodeIdx = col('barcode', 'ean', 'upc');
  const rateIdx = col('rate', 'price', 'unit_price', 'cost', 'purchase_price');
  const mrpIdx = col('mrp', 'list_price');
  const gstIdx = col('gst', 'gst_percentage', 'gst_percent', 'tax');
  const packIdx = col('pack_size', 'pack', 'packsize');
  const unitIdx = col('unit', 'uom');

  const rows = [];
  for (let i = 1; i < lines.length; i += 1) {
    if (!lines[i].trim()) continue;
    const values = parseCsvLine(lines[i]);
    rows.push({
      supplierSku: skuIdx >= 0 ? values[skuIdx] : '',
      supplierName: nameIdx >= 0 ? values[nameIdx] : '',
      supplierBarcode: barcodeIdx >= 0 ? values[barcodeIdx] : '',
      rate: rateIdx >= 0 ? values[rateIdx] : '',
      mrp: mrpIdx >= 0 ? values[mrpIdx] : '',
      gstPercentage: gstIdx >= 0 ? values[gstIdx] : '',
      packSize: packIdx >= 0 ? values[packIdx] : '',
      unit: unitIdx >= 0 ? values[unitIdx] : '',
      rawLine: lines[i],
    });
  }
  return rows;
}

function matchProductRow(row) {
  if (row.supplierSku?.trim()) {
    const bySku = productRepo.findBySku(row.supplierSku.trim());
    if (bySku?.isActive) return { product: bySku, method: 'sku', confidence: 1 };
  }
  if (row.supplierBarcode?.trim()) {
    const byBarcode = productRepo.findByBarcode(row.supplierBarcode.trim());
    if (byBarcode?.isActive) return { product: byBarcode, method: 'barcode', confidence: 0.95 };
  }
  if (row.supplierName?.trim()) {
    const q = row.supplierName.trim();
    const list = productRepo.findAll({ search: q, isActive: true, limit: 5, offset: 0 });
    if (list.items.length === 1) {
      return { product: list.items[0], method: 'name', confidence: 0.75 };
    }
    const exact = list.items.find((p) => p.name.toUpperCase() === q.toUpperCase());
    if (exact) return { product: exact, method: 'name', confidence: 0.9 };
  }
  return { product: null, method: null, confidence: 0 };
}

/** HSN / SAC typed on a bill line: 4–8 digits, or blank for the product's own code. */
function hsnOf(item, product) {
  const typed = String(item.hsnCode ?? '').replace(/\s/g, '');
  if (!typed) return product.hsnCode;
  if (!/^\d{4,8}$/.test(typed)) throw new AppError(`HSN / SAC for ${product.name} must be 4 to 8 digits`, 400);
  return typed;
}

function enrichLines(items, { allowInactive = [] } = {}) {
  return items.map((item) => {
    const product = productRepo.findById(item.productId);
    if (!product || (!product.isActive && !allowInactive.includes(item.productId))) {
      throw new AppError(`Product not found: ${item.productId}`, 400);
    }
    return {
      productId: product.id,
      productName: product.name,
      sku: product.sku,
      hsnCode: hsnOf(item, product),
      quantity: Number(item.quantity),
      unitPrice: item.unitPrice != null ? Number(item.unitPrice) : product.purchasePrice,
      discountPercent: Number(item.discountPercent || 0),
      gstPercentage: item.gstPercentage != null ? Number(item.gstPercentage) : product.gstPercentage,
    };
  });
}

function buildPurchaseTotals(items, supplierId, { unregistered = false } = {}) {
  const company = companyRepo.get();
  const supplier = supplierRepo.findById(supplierId);
  if (!supplier) throw new AppError('Supplier not found', 404);
  // Unregistered purchase: no GST on any line; the cost is what is paid.
  if (unregistered) items = items.map((item) => ({ ...item, gstPercentage: 0 }));

  const totals = calculateCartTotals(items, 0, {
    companyStateCode: stateCodeOf(company),
    customerStateCode: stateCodeOf(supplier),
  });

  const computedItems = totals.items.map((line, idx) => ({
    productId: items[idx].productId,
    productName: items[idx].productName,
    sku: items[idx].sku,
    hsnCode: items[idx].hsnCode,
    quantity: line.quantity,
    unitPrice: line.unitPrice,
    discountPercent: line.discountPercent,
    gstPercentage: line.gstPercentage,
    taxableAmount: line.taxableAmount,
    gstAmount: line.gstAmount,
    cgstAmount: totals.taxSplit === 'cgst_sgst' ? round2(line.gstAmount / 2) : 0,
    sgstAmount: totals.taxSplit === 'cgst_sgst' ? round2(line.gstAmount / 2) : 0,
    igstAmount: totals.taxSplit === 'igst' ? line.gstAmount : 0,
    lineTotal: line.lineTotal,
  }));

  return { totals, items: computedItems };
}

/**
 * Unregistered flag for a bill: only when asked (the ERP form ticks it for a supplier without a
 * GSTIN, for the user to confirm), else as the bill already was. Never guessed silently: a
 * registered supplier whose GSTIN is just missing must not lose GST on its bills.
 */
function unregisteredFor(data, fallback = false) {
  if (data.unregistered !== undefined && data.unregistered !== null && data.unregistered !== '') {
    return data.unregistered === true || data.unregistered === 'true' || data.unregistered === 1;
  }
  return Boolean(fallback);
}

function allocateDocNumber(documentType) {
  const firm = numberingRepo.getFirm();
  if (!firm) throw new AppError('Company not configured', 400);
  numberingRepo.ensureDefaultSeries(firm.id);
  return numberingRepo.allocateNumber(firm.id, documentType);
}

export class PurchaseService {
  bootstrap(actor) {
    authService.checkPermission(actor.permissions, 'purchases.orders.view');
    return {
      suppliers: supplierRepo.findAll({ includeInactive: false, limit: 500, offset: 0 }).items,
      warehouses: warehouseRepo.findAll({ includeInactive: false }),
    };
  }

  dashboard(actor) {
    authService.checkPermission(actor.permissions, 'purchases.orders.view');
    return purchaseRepo.getDashboardStats();
  }

  previewLines(data, actor) {
    authService.checkAnyPermission(actor.permissions, [
      'purchases.orders.create',
      'purchases.bills.create',
    ]);
    if (!data.supplierId) throw new AppError('Supplier is required', 400);
    const enriched = enrichLines(data.items || []);
    return buildPurchaseTotals(enriched, data.supplierId, { unregistered: data.unregistered === true });
  }

  listOrders(filters, actor) {
    authService.checkPermission(actor.permissions, 'purchases.orders.view');
    return purchaseRepo.listOrders({
      ...withFinancialYear(filters),
      limit: filters.limit ? parseInt(filters.limit, 10) : 100,
      offset: filters.offset ? parseInt(filters.offset, 10) : 0,
    });
  }

  getOrder(id, actor) {
    authService.checkPermission(actor.permissions, 'purchases.orders.view');
    const po = purchaseRepo.findOrderById(id);
    if (!po) throw new AppError('Purchase order not found', 404);
    return po;
  }

  createOrder(data, actor, req) {
    authService.checkPermission(actor.permissions, 'purchases.orders.create');
    if (!data.supplierId) throw new AppError('Supplier is required', 400);
    const enriched = enrichLines(data.items || []);
    if (!enriched.length) throw new AppError('At least one line item is required', 400);
    const { totals, items } = buildPurchaseTotals(enriched, data.supplierId);
    const doc = allocateDocNumber('purchase_order');

    const po = purchaseRepo.createOrder({
      poNumber: doc.documentNumber,
      supplierId: data.supplierId,
      orderDate: data.orderDate || new Date().toISOString().slice(0, 10),
      expectedDate: data.expectedDate || null,
      warehouseId: data.warehouseId || null,
      status: data.status || 'draft',
      subtotal: totals.subtotal,
      gstAmount: totals.gstAmount,
      cgstAmount: totals.cgstAmount,
      sgstAmount: totals.sgstAmount,
      igstAmount: totals.igstAmount,
      grandTotal: totals.grandTotal,
      priceListId: data.priceListId || null,
      notes: data.notes || null,
      createdBy: actor.user.id,
    }, items);

    auditRepo.create({
      userId: actor.user.id,
      userName: actor.user.fullName,
      action: 'create',
      module: 'purchases',
      recordType: 'purchase_order',
      recordId: po.id,
      newValue: po,
      ...getRequestMeta(req),
    });
    return po;
  }

  updateOrder(id, data, actor, req) {
    authService.checkPermission(actor.permissions, 'purchases.orders.edit');
    const existing = purchaseRepo.findOrderById(id);
    if (!existing) throw new AppError('Purchase order not found', 404);
    if (['received', 'closed', 'cancelled'].includes(existing.status)) {
      throw new AppError('Cannot edit purchase order in current status', 400);
    }
    const enriched = enrichLines(data.items || [], { allowInactive: existing.items.map((i) => i.productId) });
    if (!enriched.length) throw new AppError('At least one line item is required', 400);
    // Goods already received on this PO stay received; a line cannot go below them.
    const received = new Map();
    for (const i of existing.items) received.set(i.productId, (received.get(i.productId) || 0) + Number(i.receivedQty || 0));
    const ordered = new Map();
    for (const l of enriched) ordered.set(l.productId, (ordered.get(l.productId) || 0) + Number(l.quantity));
    for (const [pid, got] of received) {
      if (got > 0 && (ordered.get(pid) || 0) + 1e-9 < got) {
        const name = existing.items.find((i) => i.productId === pid)?.productName || pid;
        throw new AppError(`${name}: ${got} already received on this PO; the order cannot be less than that.`, 400, 'BELOW_RECEIVED');
      }
    }
    const supplierId = data.supplierId || existing.supplierId;
    if (supplierId !== existing.supplierId && [...received.values()].some((q) => q > 0)) {
      throw new AppError('Goods are already received on this PO; the supplier cannot be changed.', 400);
    }
    const { totals, items } = buildPurchaseTotals(enriched, supplierId);
    const left = new Map(received);
    for (const it of items) {
      const take = Math.min(left.get(it.productId) || 0, Number(it.quantity));
      it.receivedQty = take;
      left.set(it.productId, (left.get(it.productId) || 0) - take);
    }
    const po = purchaseRepo.updateOrder(id, {
      supplierId: data.supplierId || existing.supplierId,
      orderDate: data.orderDate || existing.orderDate,
      expectedDate: data.expectedDate ?? existing.expectedDate,
      warehouseId: data.warehouseId ?? existing.warehouseId,
      status: data.status || existing.status,
      subtotal: totals.subtotal,
      gstAmount: totals.gstAmount,
      cgstAmount: totals.cgstAmount,
      sgstAmount: totals.sgstAmount,
      igstAmount: totals.igstAmount,
      grandTotal: totals.grandTotal,
      notes: data.notes ?? existing.notes,
    }, items);

    auditRepo.create({
      userId: actor.user.id,
      userName: actor.user.fullName,
      action: 'update',
      module: 'purchases',
      recordType: 'purchase_order',
      recordId: id,
      previousValue: existing,
      newValue: po,
      ...getRequestMeta(req),
    });
    return po;
  }

  approveOrder(id, actor, req) {
    authService.checkPermission(actor.permissions, 'purchases.orders.approve');
    const existing = purchaseRepo.findOrderById(id);
    if (!existing) throw new AppError('Purchase order not found', 404);
    if (existing.status !== 'draft') throw new AppError('Only draft POs can be approved', 400);
    const po = purchaseRepo.setOrderStatus(id, 'sent');
    auditRepo.create({
      userId: actor.user.id,
      userName: actor.user.fullName,
      action: 'approve',
      module: 'purchases',
      recordType: 'purchase_order',
      recordId: id,
      newValue: po,
      ...getRequestMeta(req),
    });
    return po;
  }

  cancelOrder(id, actor, req) {
    authService.checkPermission(actor.permissions, 'purchases.orders.delete');
    const existing = purchaseRepo.findOrderById(id);
    if (!existing) throw new AppError('Purchase order not found', 404);
    if (['received', 'closed'].includes(existing.status)) {
      throw new AppError('Cannot cancel a received/closed PO', 400);
    }
    const po = purchaseRepo.setOrderStatus(id, 'cancelled');
    auditRepo.create({
      userId: actor.user.id,
      userName: actor.user.fullName,
      action: 'cancel',
      module: 'purchases',
      recordType: 'purchase_order',
      recordId: id,
      previousValue: existing,
      newValue: po,
      ...getRequestMeta(req),
    });
    return po;
  }

  parsePriceList(data, actor) {
    authService.checkPermission(actor.permissions, 'purchases.price_lists.create');
    if (!data.csv?.trim()) throw new AppError('CSV content is required', 400);
    const parsed = parsePriceListCsv(data.csv);
    const rows = parsed.map((row) => {
      const match = matchProductRow(row);
      return {
        ...row,
        rate: row.rate !== '' ? Number(row.rate) : null,
        mrp: row.mrp !== '' ? Number(row.mrp) : null,
        gstPercentage: row.gstPercentage !== '' ? Number(row.gstPercentage) : null,
        matchedProductId: match.product?.id || null,
        matchedProductName: match.product?.name || null,
        matchedSku: match.product?.sku || null,
        matchMethod: match.method,
        matchConfidence: match.confidence,
      };
    });
    return {
      rows,
      rowCount: rows.length,
      matchedCount: rows.filter((r) => r.matchedProductId).length,
    };
  }

  savePriceList(data, actor, req) {
    authService.checkPermission(actor.permissions, 'purchases.price_lists.create');
    if (!data.supplierId || !data.name?.trim()) {
      throw new AppError('Supplier and list name are required', 400);
    }
    const parsed = this.parsePriceList({ csv: data.csv }, actor);
    const list = purchaseRepo.createPriceList({
      supplierId: data.supplierId,
      name: data.name.trim(),
      effectiveDate: data.effectiveDate || null,
      sourceFilename: data.sourceFilename || null,
      notes: data.notes || null,
      createdBy: actor.user.id,
    }, parsed.rows);

    auditRepo.create({
      userId: actor.user.id,
      userName: actor.user.fullName,
      action: 'create',
      module: 'purchases',
      recordType: 'supplier_price_list',
      recordId: list.id,
      newValue: { id: list.id, matchedCount: list.matchedCount, rowCount: list.rowCount },
      ...getRequestMeta(req),
    });
    return list;
  }

  listPriceLists(filters, actor) {
    authService.checkPermission(actor.permissions, 'purchases.price_lists.view');
    return purchaseRepo.listPriceLists(filters);
  }

  getPriceList(id, actor) {
    authService.checkPermission(actor.permissions, 'purchases.price_lists.view');
    const list = purchaseRepo.findPriceListById(id);
    if (!list) throw new AppError('Price list not found', 404);
    return list;
  }

  createPoFromPriceList(id, data, actor, req) {
    authService.checkPermission(actor.permissions, 'purchases.orders.create');
    const list = purchaseRepo.findPriceListById(id);
    if (!list) throw new AppError('Price list not found', 404);
    const matched = (list.items || []).filter((i) => i.matchedProductId && i.rate != null);
    if (!matched.length) throw new AppError('No matched priced rows in this list', 400);

    const items = matched.map((row) => ({
      productId: row.matchedProductId,
      quantity: Number(data.defaultQty || 1),
      unitPrice: row.rate,
      gstPercentage: row.gstPercentage,
    }));

    return this.createOrder({
      supplierId: list.supplierId,
      warehouseId: data.warehouseId,
      priceListId: list.id,
      notes: `Created from price list: ${list.name}`,
      items,
    }, actor, req);
  }

  listBills(filters, actor) {
    authService.checkAnyPermission(actor.permissions, [
      'purchases.bills.view',
      'purchases.orders.view',
    ]);
    return purchaseRepo.listBills(withFinancialYear(filters));
  }

  getBill(id, actor) {
    authService.checkPermission(actor.permissions, 'purchases.bills.view');
    const bill = purchaseRepo.findBillById(id);
    if (!bill) throw new AppError('Purchase bill not found', 404);
    // How much of each line is already on debit notes (for the return form).
    const returned = purchaseRepo.returnedQtyByBillItem(bill.id);
    bill.items = bill.items.map((item) => ({ ...item, returnedQuantity: round2(returned.get(item.id) || 0) }));
    return bill;
  }

  createBill(data, actor, req) {
    authService.checkPermission(actor.permissions, 'purchases.bills.create');
    if (!data.supplierId) throw new AppError('Supplier is required', 400);
    const enriched = enrichLines(data.items || []);
    if (!enriched.length) throw new AppError('At least one line item is required', 400);
    const unregistered = unregisteredFor(data);
    const { totals, items } = buildPurchaseTotals(enriched, data.supplierId, { unregistered });
    const doc = allocateDocNumber('purchase_bill');
    const warehouseId = data.warehouseId || null;

    const billDate = data.billDate || new Date().toISOString().slice(0, 10);
    const creditDays = repos.suppliers.findById(data.supplierId)?.creditDays;
    const bill = purchaseRepo.createBillWithItems({
      billNumber: doc.documentNumber,
      supplierId: data.supplierId,
      supplierInvoiceNumber: data.supplierInvoiceNumber || null,
      billDate,
      // blank due date: bill date + the supplier's credit days
      dueDate: data.dueDate || (creditDays != null ? addDays(billDate, creditDays) : null),
      warehouseId,
      purchaseOrderId: data.purchaseOrderId || null,
      subtotal: totals.subtotal,
      gstAmount: totals.gstAmount,
      cgstAmount: totals.cgstAmount,
      sgstAmount: totals.sgstAmount,
      igstAmount: totals.igstAmount,
      grandTotal: totals.grandTotal,
      stockPosted: false,
      notes: data.notes || null,
      createdBy: actor.user.id,
      isUnregistered: unregistered,
    }, items);

    supplierRepo.adjustPayable(data.supplierId, totals.grandTotal);

    for (const line of items) {
      inventoryMovementService.createMovement({
        movementType: MOVEMENT_TYPES.PURCHASE,
        productId: line.productId,
        warehouseId,
        quantity: line.quantity,
        referenceType: 'supplier_bill',
        referenceId: bill.id,
        reason: `Purchase bill ${bill.billNumber}`,
      }, actor, req, { skipPermissionCheck: true });

      productRepo.update(line.productId, { purchasePrice: line.unitPrice });

      if (data.purchaseOrderId) {
        purchaseRepo.addReceivedQty(data.purchaseOrderId, line.productId, line.quantity);
      }
    }

    purchaseRepo.markBillStockPosted(bill.id);

    if (data.purchaseOrderId) {
      const po = purchaseRepo.findOrderById(data.purchaseOrderId);
      if (po) {
        const allReceived = po.items.every((i) => i.receivedQty >= i.quantity);
        purchaseRepo.setOrderStatus(data.purchaseOrderId, allReceived ? 'received' : 'partial');
      }
    }

    auditRepo.create({
      userId: actor.user.id,
      userName: actor.user.fullName,
      action: 'create',
      module: 'purchases',
      recordType: 'purchase_bill',
      recordId: bill.id,
      newValue: bill,
      ...getRequestMeta(req),
    });

    return purchaseRepo.findBillById(bill.id);
  }

  /**
   * Edit a purchase bill (firm admin only). Same bill number; lines, supplier invoice no., dates,
   * warehouse and notes can change. Stock moves only by the difference, the supplier's payable
   * follows the new total. Not allowed once a debit note is made against the bill, or below
   * what is already paid.
   */
  updateBill(id, data, actor, req) {
    authService.checkPermission(actor.permissions, 'purchases.bills.create');
    if (!isFirmAdmin(actor.user)) throw new AppError('Only the firm admin or the group owner can edit purchase bills', 403, 'OWNER_ONLY');
    const old = purchaseRepo.findBillById(id);
    if (!old) throw new AppError('Purchase bill not found', 404);
    if (old.status === 'cancelled') throw new AppError('This purchase bill is cancelled', 400);
    if (purchaseRepo.returnedQtyByBillItem(id).size || Number(old.returnedAmount || 0) > 0) {
      throw new AppError('A debit note is made against this bill; it cannot be edited. Correct it with a debit note instead.', 400, 'BILL_HAS_RETURNS');
    }
    const supplierId = data.supplierId || old.supplierId;
    const paid = Number(old.amountPaid || 0);
    if (supplierId !== old.supplierId && paid > 0) {
      throw new AppError('A payment is recorded on this bill; the supplier cannot be changed.', 400, 'BILL_HAS_PAYMENTS');
    }
    const enriched = enrichLines(data.items || [], { allowInactive: old.items.map((i) => i.productId) });
    if (!enriched.length) throw new AppError('At least one line item is required', 400);
    // the bill keeps its registered / unregistered choice unless the edit changes it (or the supplier)
    const unregistered = unregisteredFor(data, old.isUnregistered);
    const { totals, items } = buildPurchaseTotals(enriched, supplierId, { unregistered });
    if (totals.grandTotal + 0.009 < paid) {
      throw new AppError(`The new total ${totals.grandTotal} is less than the ${paid} already paid on this bill.`, 400, 'BELOW_PAID');
    }
    const oldWh = old.warehouseId || null;
    const warehouseId = data.warehouseId !== undefined ? (data.warehouseId || null) : oldWh;
    const billDate = data.billDate || old.billDate;
    if (!/^\d{4}-\d{2}-\d{2}/.test(String(billDate))) throw new AppError('Bill date must be a date', 400);

    const updated = getDatabase().transaction(() => {
      // Stock: only the difference per product (all of it when the warehouse changes).
      const qty = (lines) => lines.reduce((m, l) => m.set(l.productId, (m.get(l.productId) || 0) + Number(l.quantity)), new Map());
      const before = qty(old.items);
      const after = qty(items);
      const move = (productId, wh, q) => {
        if (Math.abs(q) < 1e-9) return;
        inventoryMovementService.createMovement({
          movementType: q > 0 ? MOVEMENT_TYPES.PURCHASE : MOVEMENT_TYPES.PURCHASE_RETURN,
          productId,
          warehouseId: wh,
          quantity: Math.abs(q),
          referenceType: 'supplier_bill',
          referenceId: old.id,
          reason: `Edited purchase bill ${old.billNumber}`,
        }, actor, req, { skipPermissionCheck: true });
      };
      if (warehouseId !== oldWh) {
        for (const [pid, q] of before) move(pid, oldWh, -q);
        for (const [pid, q] of after) move(pid, warehouseId, q);
      } else {
        for (const pid of new Set([...before.keys(), ...after.keys()])) move(pid, warehouseId, (after.get(pid) || 0) - (before.get(pid) || 0));
      }
      if (old.purchaseOrderId) {
        for (const pid of new Set([...before.keys(), ...after.keys()])) {
          const d = (after.get(pid) || 0) - (before.get(pid) || 0);
          if (d) purchaseRepo.addReceivedQty(old.purchaseOrderId, pid, d);
        }
      }

      // Supplier payable follows the new total.
      supplierRepo.adjustPayable(old.supplierId, -Number(old.grandTotal));
      supplierRepo.adjustPayable(supplierId, totals.grandTotal);

      purchaseRepo.replaceBill(old.id, {
        supplierId,
        supplierInvoiceNumber: data.supplierInvoiceNumber !== undefined ? (data.supplierInvoiceNumber || null) : old.supplierInvoiceNumber,
        billDate,
        dueDate: data.dueDate !== undefined ? (data.dueDate || null) : old.dueDate,
        warehouseId,
        subtotal: totals.subtotal,
        gstAmount: totals.gstAmount,
        cgstAmount: totals.cgstAmount,
        sgstAmount: totals.sgstAmount,
        igstAmount: totals.igstAmount,
        grandTotal: totals.grandTotal,
        notes: data.notes !== undefined ? (data.notes || null) : old.notes,
        isUnregistered: unregistered,
      }, items);
      for (const line of items) productRepo.update(line.productId, { purchasePrice: line.unitPrice });
      return purchaseRepo.findBillById(old.id);
    })();

    auditRepo.create({
      userId: actor.user.id,
      userName: actor.user.fullName,
      action: 'update',
      module: 'purchases',
      recordType: 'purchase_bill',
      recordId: id,
      previousValue: old,
      newValue: updated,
      ...getRequestMeta(req),
    });
    return updated;
  }

  /**
   * Mark a purchase bill as from an unregistered supplier (no GST, no input credit) or back to
   * registered (GST at each item's rate). Same rules as editing the bill; totals and the payable follow.
   */
  setBillRegistration(id, unregistered, actor, req) {
    const bill = purchaseRepo.findBillById(id);
    if (!bill) throw new AppError('Purchase bill not found', 404);
    const flag = unregistered === true || unregistered === 'true';
    if (flag === bill.isUnregistered) return bill;
    return this.updateBill(id, {
      unregistered: flag,
      // back to registered: each item's GST rate from the product
      items: bill.items.map((i) => ({
        productId: i.productId, quantity: i.quantity, unitPrice: i.unitPrice, discountPercent: i.discountPercent, hsnCode: i.hsnCode,
        ...(flag ? {} : { gstPercentage: undefined }),
      })),
    }, actor, req);
  }

  createBillFromPo(poId, data, actor, req) {
    authService.checkPermission(actor.permissions, 'purchases.bills.create');
    const po = purchaseRepo.findOrderById(poId);
    if (!po) throw new AppError('Purchase order not found', 404);
    if (['cancelled', 'draft'].includes(po.status)) {
      throw new AppError('Approve/send PO before billing', 400);
    }

    const items = po.items.map((line) => ({
      productId: line.productId,
      quantity: line.quantity - line.receivedQty,
      unitPrice: line.unitPrice,
      discountPercent: line.discountPercent,
      gstPercentage: line.gstPercentage,
    })).filter((l) => l.quantity > 0);

    if (!items.length) throw new AppError('All PO lines are already received', 400);

    return this.createBill({
      supplierId: po.supplierId,
      warehouseId: data.warehouseId || po.warehouseId,
      purchaseOrderId: po.id,
      supplierInvoiceNumber: data.supplierInvoiceNumber,
      billDate: data.billDate,
      dueDate: data.dueDate,
      notes: data.notes || `GRN for PO ${po.poNumber}`,
      items,
    }, actor, req);
  }

  getReturn(id, actor) {
    authService.checkPermission(actor.permissions, 'purchases.returns.view');
    numberOldDebitNotes();
    const purchaseReturn = purchaseRepo.findReturnById(id);
    if (!purchaseReturn) throw new AppError('Purchase return not found', 404);
    return purchaseReturn;
  }

  listReturns(filters, actor) {
    authService.checkPermission(actor.permissions, 'purchases.returns.view');
    numberOldDebitNotes();
    return purchaseRepo.listReturns(withFinancialYear(filters));
  }

  /**
   * Return to a supplier = GST debit note. Against a bill, lines must be on that bill (no more
   * than billed less already returned) and take the bill's rate, discount and GST; the note
   * comes off the bill's payable. The supplier's balance always drops by the full note.
   */
  /**
   * Edit a debit note (firm admin only): lines, date, warehouse, reason and notes. Same note
   * number. Atomically undoes what the note did (stock out, supplier payable, bill balance)
   * and books the corrected note.
   */
  updateReturn(id, data = {}, actor, req) {
    authService.checkPermission(actor.permissions, 'purchases.returns.create');
    if (!isFirmAdmin(actor.user)) throw new AppError('Only the firm admin or the group owner can edit debit notes', 403, 'OWNER_ONLY');
    const old = purchaseRepo.findReturnById(id);
    if (!old) throw new AppError('Debit note not found', 404);
    if (old.status !== 'completed') throw new AppError('This debit note is cancelled', 400);

    const updated = getDatabase().transaction(() => {
      // 1. Undo the old note: goods back in, payable and bill balance restored.
      for (const line of old.items) {
        inventoryMovementService.createMovement({
          movementType: MOVEMENT_TYPES.PURCHASE,
          productId: line.productId,
          warehouseId: old.warehouseId,
          quantity: line.quantity,
          referenceType: 'purchase_return_edit',
          referenceId: old.id,
          reason: `Edited debit note ${old.noteNumber || old.returnNumber}`,
        }, actor, req, { skipPermissionCheck: true });
      }
      supplierRepo.adjustPayable(old.supplierId, old.grandTotal);
      if (old.billId && old.adjustedAmount > 0) purchaseRepo.applyBillReturn(old.billId, -old.adjustedAmount);
      purchaseRepo.clearReturnItems(old.id);

      // 2. The corrected note (same supplier and bill), booked like a new one.
      const prep = this.#prepareReturn({
        ...data,
        supplierId: old.supplierId,
        billId: old.billId,
        warehouseId: data.warehouseId || old.warehouseId,
      });
      const returnDate = data.returnDate || old.returnDate;
      const ret = purchaseRepo.replaceReturn(old.id, {
        returnDate,
        financialYear: financialYearOf(returnDate),
        warehouseId: prep.warehouseId,
        subtotal: round2(prep.totals.subtotal),
        gstAmount: round2(prep.totals.gstAmount),
        cgstAmount: round2(prep.totals.cgstAmount),
        sgstAmount: round2(prep.totals.sgstAmount),
        igstAmount: round2(prep.totals.igstAmount),
        grandTotal: prep.grandTotal,
        adjustedAmount: prep.adjustedAmount,
        reason: data.reason !== undefined ? data.reason : old.reason,
        notes: data.notes !== undefined ? data.notes : old.notes,
      }, prep.items);
      supplierRepo.adjustPayable(old.supplierId, -ret.grandTotal);
      if (prep.adjustedAmount > 0) purchaseRepo.applyBillReturn(old.billId, prep.adjustedAmount);
      for (const line of prep.items) {
        inventoryMovementService.createMovement({
          movementType: MOVEMENT_TYPES.PURCHASE_RETURN,
          productId: line.productId,
          warehouseId: prep.warehouseId,
          quantity: line.quantity,
          referenceType: 'purchase_return',
          referenceId: ret.id,
          reason: `Debit note ${ret.noteNumber || ret.returnNumber}${prep.bill ? ` against ${prep.bill.billNumber}` : ''} (edited)`,
        }, actor, req, { skipPermissionCheck: true });
      }
      return purchaseRepo.findReturnById(ret.id);
    })();

    auditRepo.create({
      userId: actor.user.id, userName: actor.user.fullName,
      action: 'update', module: 'purchases', recordType: 'purchase_return', recordId: id,
      previousValue: old, newValue: updated, ...getRequestMeta(req),
    });
    return updated;
  }

  /** Lines, bill matching, warehouse and totals of a debit note (new or edited). */
  #prepareReturn(data) {
    if (!data.supplierId) throw new AppError('Supplier is required', 400);
    let lines = enrichLines((data.items || []).filter((l) => l.productId), { allowInactive: (data.items || []).map((l) => l.productId) });
    if (!lines.length) throw new AppError('At least one line item is required', 400);
    for (const line of lines) {
      if (!Number.isFinite(line.quantity) || line.quantity <= 0) {
        throw new AppError(`Return quantity for ${line.productName} must be more than zero`, 400);
      }
    }

    let bill = null;
    if (data.billId) {
      bill = purchaseRepo.findBillById(data.billId);
      if (!bill) throw new AppError('Purchase bill not found', 404);
      if (bill.supplierId !== data.supplierId) throw new AppError(`Bill ${bill.billNumber} is from a different supplier`, 400);
      if (bill.status === 'cancelled') throw new AppError(`Bill ${bill.billNumber} is cancelled`, 400);
      const returned = purchaseRepo.returnedQtyByBillItem(bill.id);
      lines = lines.map((line, idx) => {
        const wanted = data.items.filter((l) => l.productId)[idx];
        const remainingOf = (bi) => bi.quantity - (returned.get(bi.id) || 0);
        const billItem = wanted.billItemId
          ? bill.items.find((bi) => bi.id === wanted.billItemId)
          : bill.items.find((bi) => bi.productId === line.productId && remainingOf(bi) > 0.000001)
            || bill.items.find((bi) => bi.productId === line.productId);
        if (!billItem || billItem.productId !== line.productId) {
          throw new AppError(`${line.productName} is not on bill ${bill.billNumber}`, 400);
        }
        const remaining = remainingOf(billItem);
        if (line.quantity > remaining + 0.000001) {
          throw new AppError(`Cannot return more than billed for ${line.productName}. Remaining on ${bill.billNumber}: ${round2(remaining)}`, 400);
        }
        returned.set(billItem.id, (returned.get(billItem.id) || 0) + line.quantity);
        return {
          ...line,
          billItemId: billItem.id,
          unitPrice: billItem.unitPrice,
          discountPercent: billItem.discountPercent,
          gstPercentage: billItem.gstPercentage,
        };
      });
    }

    const warehouseId = data.warehouseId || bill?.warehouseId
      || warehouseRepo.findAll({ includeInactive: false }).find((w) => w.isDefault)?.id || null;
    if (!warehouseId) throw new AppError('Choose the warehouse the goods leave from', 400);

    const { totals, items } = buildPurchaseTotals(lines, data.supplierId);
    items.forEach((item, idx) => { item.billItemId = lines[idx].billItemId || null; });
    const grandTotal = round2(totals.grandTotal);
    const adjustedAmount = bill ? round2(Math.min(grandTotal, Math.max(0, bill.amountPayable))) : 0;
    return { bill, warehouseId, totals, items, grandTotal, adjustedAmount };
  }

  createReturn(data, actor, req) {
    authService.checkPermission(actor.permissions, 'purchases.returns.create');
    const { bill, warehouseId, totals, items, grandTotal, adjustedAmount } = this.#prepareReturn(data);
    const returnDate = data.returnDate || new Date().toISOString().slice(0, 10);
    numberOldDebitNotes();
    const note = allocateDocNumber('debit_note');

    const ret = purchaseRepo.createReturn({
      returnNumber: purchaseRepo.nextReturnNumber(),
      noteNumber: note.documentNumber,
      financialYear: financialYearOf(returnDate),
      supplierId: data.supplierId,
      billId: bill?.id || null,
      returnDate,
      warehouseId,
      subtotal: round2(totals.subtotal),
      gstAmount: round2(totals.gstAmount),
      cgstAmount: round2(totals.cgstAmount),
      sgstAmount: round2(totals.sgstAmount),
      igstAmount: round2(totals.igstAmount),
      grandTotal,
      adjustedAmount,
      reason: data.reason || null,
      notes: data.notes || null,
      createdBy: actor.user.id,
    }, items);

    supplierRepo.adjustPayable(data.supplierId, -ret.grandTotal);
    if (adjustedAmount > 0) purchaseRepo.applyBillReturn(bill.id, adjustedAmount);

    for (const line of items) {
      inventoryMovementService.createMovement({
        movementType: MOVEMENT_TYPES.PURCHASE_RETURN,
        productId: line.productId,
        warehouseId,
        quantity: line.quantity,
        referenceType: 'purchase_return',
        referenceId: ret.id,
        reason: `Debit note ${ret.noteNumber}${bill ? ` against ${bill.billNumber}` : ''}`,
      }, actor, req, { skipPermissionCheck: true });
    }

    auditRepo.create({
      userId: actor.user.id,
      userName: actor.user.fullName,
      action: 'create',
      module: 'purchases',
      recordType: 'purchase_return',
      recordId: ret.id,
      newValue: ret,
      ...getRequestMeta(req),
    });
    return ret;
  }

  getSupplierLedger(supplierId, filters, actor) {
    authService.checkPermission(actor.permissions, 'purchases.orders.view');
    return partyStatementService.supplierStatement(supplierId, filters, actor);
  }

  reports(filters, actor) {
    authService.checkPermission(actor.permissions, 'purchases.reports.view');
    return purchaseRepo.getReportsSummary(filters);
  }
}

export const purchaseService = new PurchaseService();
