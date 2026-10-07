import { withFinancialYear } from '../database/context.js';
import { AppError } from '../core/http.js';
import { MOVEMENT_TYPES } from '../core/inventory-constants.js';
import { repos } from '../repositories/index.js';
import { authService } from './index.js';
import { calculateCartTotals } from './pos.js';
import { inventoryMovementService } from './inventory.js';
import { supplierService } from './parties.js';
import { partyStatementService } from './party-statements.js';

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

function enrichLines(items) {
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
      quantity: Number(item.quantity),
      unitPrice: item.unitPrice != null ? Number(item.unitPrice) : product.purchasePrice,
      discountPercent: Number(item.discountPercent || 0),
      gstPercentage: item.gstPercentage != null ? Number(item.gstPercentage) : product.gstPercentage,
    };
  });
}

function buildPurchaseTotals(items, supplierId) {
  const company = companyRepo.get();
  const supplier = supplierRepo.findById(supplierId);
  if (!supplier) throw new AppError('Supplier not found', 404);

  const totals = calculateCartTotals(items, 0, {
    companyStateCode: company?.gstStateCode,
    customerStateCode: supplier.gstStateCode,
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
    return buildPurchaseTotals(enriched, data.supplierId);
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
    const enriched = enrichLines(data.items || []);
    const { totals, items } = buildPurchaseTotals(enriched, data.supplierId || existing.supplierId);
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
    return bill;
  }

  createBill(data, actor, req) {
    authService.checkPermission(actor.permissions, 'purchases.bills.create');
    if (!data.supplierId) throw new AppError('Supplier is required', 400);
    const enriched = enrichLines(data.items || []);
    if (!enriched.length) throw new AppError('At least one line item is required', 400);
    const { totals, items } = buildPurchaseTotals(enriched, data.supplierId);
    const doc = allocateDocNumber('purchase_bill');
    const warehouseId = data.warehouseId || null;

    const bill = purchaseRepo.createBillWithItems({
      billNumber: doc.documentNumber,
      supplierId: data.supplierId,
      supplierInvoiceNumber: data.supplierInvoiceNumber || null,
      billDate: data.billDate || new Date().toISOString().slice(0, 10),
      dueDate: data.dueDate || null,
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
    const purchaseReturn = purchaseRepo.findReturnById(id);
    if (!purchaseReturn) throw new AppError('Purchase return not found', 404);
    return purchaseReturn;
  }

  listReturns(filters, actor) {
    authService.checkPermission(actor.permissions, 'purchases.returns.view');
    return purchaseRepo.listReturns(withFinancialYear(filters));
  }

  createReturn(data, actor, req) {
    authService.checkPermission(actor.permissions, 'purchases.returns.create');
    if (!data.supplierId) throw new AppError('Supplier is required', 400);
    const enriched = enrichLines(data.items || []);
    if (!enriched.length) throw new AppError('At least one line item is required', 400);

    let subtotal = 0;
    let gstAmount = 0;
    const items = enriched.map((line) => {
      const taxable = round2(line.unitPrice * line.quantity);
      const gst = round2(taxable * (line.gstPercentage / 100));
      const lineTotal = round2(taxable + gst);
      subtotal += taxable;
      gstAmount += gst;
      return {
        ...line,
        lineTotal,
      };
    });

    const doc = purchaseRepo.nextReturnNumber();
    const ret = purchaseRepo.createReturn({
      returnNumber: doc,
      supplierId: data.supplierId,
      billId: data.billId || null,
      returnDate: data.returnDate || new Date().toISOString().slice(0, 10),
      warehouseId: data.warehouseId || null,
      subtotal: round2(subtotal),
      gstAmount: round2(gstAmount),
      grandTotal: round2(subtotal + gstAmount),
      notes: data.notes || null,
      createdBy: actor.user.id,
    }, items);

    supplierRepo.adjustPayable(data.supplierId, -ret.grandTotal);

    for (const line of items) {
      inventoryMovementService.createMovement({
        movementType: MOVEMENT_TYPES.PURCHASE_RETURN,
        productId: line.productId,
        warehouseId: data.warehouseId,
        quantity: line.quantity,
        referenceType: 'purchase_return',
        referenceId: ret.id,
        reason: `Purchase return ${ret.returnNumber}`,
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
