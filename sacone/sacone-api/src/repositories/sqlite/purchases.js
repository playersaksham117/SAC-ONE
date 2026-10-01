import { getDatabase } from '../../database/connection.js';
import { generateId, nowIso } from '../../core/utils.js';

function round2(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

function mapPoItem(row) {
  return {
    id: row.id,
    purchaseOrderId: row.purchase_order_id,
    productId: row.product_id,
    productName: row.product_name,
    sku: row.sku,
    hsnCode: row.hsn_code,
    quantity: Number(row.quantity || 0),
    unitPrice: Number(row.unit_price || 0),
    discountPercent: Number(row.discount_percent || 0),
    gstPercentage: Number(row.gst_percentage || 0),
    taxableAmount: Number(row.taxable_amount || 0),
    gstAmount: Number(row.gst_amount || 0),
    lineTotal: Number(row.line_total || 0),
    receivedQty: Number(row.received_qty || 0),
    sortOrder: row.sort_order || 0,
  };
}

function mapPo(row, items = []) {
  if (!row) return null;
  return {
    id: row.id,
    poNumber: row.po_number,
    supplierId: row.supplier_id,
    supplierName: row.supplier_name || null,
    orderDate: row.order_date,
    expectedDate: row.expected_date,
    warehouseId: row.warehouse_id,
    warehouseName: row.warehouse_name || null,
    status: row.status,
    subtotal: Number(row.subtotal || 0),
    gstAmount: Number(row.gst_amount || 0),
    cgstAmount: Number(row.cgst_amount || 0),
    sgstAmount: Number(row.sgst_amount || 0),
    igstAmount: Number(row.igst_amount || 0),
    grandTotal: Number(row.grand_total || 0),
    priceListId: row.price_list_id,
    notes: row.notes,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    items,
  };
}

function mapBillItem(row) {
  return {
    id: row.id,
    billId: row.bill_id,
    productId: row.product_id,
    productName: row.product_name,
    sku: row.sku,
    hsnCode: row.hsn_code,
    quantity: Number(row.quantity || 0),
    unitPrice: Number(row.unit_price || 0),
    discountPercent: Number(row.discount_percent || 0),
    gstPercentage: Number(row.gst_percentage || 0),
    taxableAmount: Number(row.taxable_amount || 0),
    gstAmount: Number(row.gst_amount || 0),
    cgstAmount: Number(row.cgst_amount || 0),
    sgstAmount: Number(row.sgst_amount || 0),
    igstAmount: Number(row.igst_amount || 0),
    lineTotal: Number(row.line_total || 0),
    sortOrder: row.sort_order || 0,
  };
}

function mapBill(row, items = []) {
  if (!row) return null;
  return {
    id: row.id,
    billNumber: row.bill_number,
    supplierId: row.supplier_id,
    supplierName: row.supplier_name || null,
    supplierInvoiceNumber: row.supplier_invoice_number,
    billDate: row.bill_date,
    dueDate: row.due_date,
    warehouseId: row.warehouse_id,
    warehouseName: row.warehouse_name || null,
    purchaseOrderId: row.purchase_order_id,
    poNumber: row.po_number || null,
    subtotal: Number(row.subtotal || 0),
    gstAmount: Number(row.gst_amount || 0),
    cgstAmount: Number(row.cgst_amount || 0),
    sgstAmount: Number(row.sgst_amount || 0),
    igstAmount: Number(row.igst_amount || 0),
    grandTotal: Number(row.grand_total || 0),
    amountPaid: Number(row.amount_paid || 0),
    amountPayable: Number(row.amount_payable || 0),
    status: row.status,
    stockPosted: Boolean(row.stock_posted),
    referenceType: row.reference_type,
    referenceId: row.reference_id,
    notes: row.notes,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    items,
  };
}

function mapPriceList(row, items = []) {
  if (!row) return null;
  return {
    id: row.id,
    supplierId: row.supplier_id,
    supplierName: row.supplier_name || null,
    name: row.name,
    effectiveDate: row.effective_date,
    sourceFilename: row.source_filename,
    status: row.status,
    rowCount: row.row_count || 0,
    matchedCount: row.matched_count || 0,
    notes: row.notes,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    items,
  };
}

function mapPriceListItem(row) {
  return {
    id: row.id,
    priceListId: row.price_list_id,
    rowNumber: row.row_number,
    supplierSku: row.supplier_sku,
    supplierName: row.supplier_name,
    supplierBarcode: row.supplier_barcode,
    rate: row.rate != null ? Number(row.rate) : null,
    mrp: row.mrp != null ? Number(row.mrp) : null,
    discountPercent: row.discount_percent != null ? Number(row.discount_percent) : null,
    gstPercentage: row.gst_percentage != null ? Number(row.gst_percentage) : null,
    packSize: row.pack_size,
    unit: row.unit,
    matchedProductId: row.matched_product_id,
    matchedProductName: row.matched_product_name || null,
    matchedSku: row.matched_sku || null,
    matchMethod: row.match_method,
    matchConfidence: row.match_confidence != null ? Number(row.match_confidence) : null,
    rawLine: row.raw_line,
  };
}

function mapReturn(row, items = []) {
  if (!row) return null;
  return {
    id: row.id,
    returnNumber: row.return_number,
    supplierId: row.supplier_id,
    supplierName: row.supplier_name || null,
    billId: row.bill_id,
    billNumber: row.bill_number || null,
    returnDate: row.return_date,
    warehouseId: row.warehouse_id,
    subtotal: Number(row.subtotal || 0),
    gstAmount: Number(row.gst_amount || 0),
    grandTotal: Number(row.grand_total || 0),
    status: row.status,
    notes: row.notes,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    items,
  };
}

const PO_SELECT = `
  SELECT po.*, s.name as supplier_name, w.name as warehouse_name
  FROM purchase_orders po
  LEFT JOIN suppliers s ON s.id = po.supplier_id
  LEFT JOIN warehouses w ON w.id = po.warehouse_id
`;

const BILL_SELECT = `
  SELECT b.*, s.name as supplier_name, w.name as warehouse_name, po.po_number
  FROM supplier_bills b
  LEFT JOIN suppliers s ON s.id = b.supplier_id
  LEFT JOIN warehouses w ON w.id = b.warehouse_id
  LEFT JOIN purchase_orders po ON po.id = b.purchase_order_id
`;

export class PurchaseRepository {
  listOrders(filters = {}) {
    const db = getDatabase();
    const { supplierId = '', status = '', search = '', limit = 100, offset = 0 } = filters;
    const conditions = [];
    const params = [];
    if (supplierId) { conditions.push('po.supplier_id = ?'); params.push(supplierId); }
    if (status) { conditions.push('po.status = ?'); params.push(status); }
    if (search) {
      conditions.push('(po.po_number LIKE ? OR s.name LIKE ?)');
      const like = `%${search}%`;
      params.push(like, like);
    }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const countParams = [...params];
    params.push(limit, offset);
    const items = db.prepare(`
      ${PO_SELECT} ${where}
      ORDER BY po.order_date DESC, po.created_at DESC
      LIMIT ? OFFSET ?
    `).all(...params).map((row) => mapPo(row));
    const total = db.prepare(`
      SELECT COUNT(*) as count FROM purchase_orders po
      LEFT JOIN suppliers s ON s.id = po.supplier_id
      ${where}
    `).get(...countParams).count;
    return { items, total, limit, offset };
  }

  findOrderById(id) {
    const db = getDatabase();
    const row = db.prepare(`${PO_SELECT} WHERE po.id = ?`).get(id);
    if (!row) return null;
    const items = db.prepare(`
      SELECT * FROM purchase_order_items WHERE purchase_order_id = ? ORDER BY sort_order ASC
    `).all(id).map(mapPoItem);
    return mapPo(row, items);
  }

  createOrder(data, items) {
    const db = getDatabase();
    const id = generateId();
    const now = nowIso();
    const tx = db.transaction(() => {
      db.prepare(`
        INSERT INTO purchase_orders (
          id, po_number, supplier_id, order_date, expected_date, warehouse_id, status,
          subtotal, gst_amount, cgst_amount, sgst_amount, igst_amount, grand_total,
          price_list_id, notes, created_by, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id, data.poNumber, data.supplierId, data.orderDate, data.expectedDate || null,
        data.warehouseId || null, data.status || 'draft',
        data.subtotal, data.gstAmount, data.cgstAmount, data.sgstAmount, data.igstAmount, data.grandTotal,
        data.priceListId || null, data.notes || null, data.createdBy || null, now, now
      );
      const insertItem = db.prepare(`
        INSERT INTO purchase_order_items (
          id, purchase_order_id, product_id, product_name, sku, hsn_code, quantity, unit_price,
          discount_percent, gst_percentage, taxable_amount, gst_amount, line_total, received_qty, sort_order
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)
      `);
      items.forEach((item, idx) => {
        insertItem.run(
          generateId(), id, item.productId, item.productName, item.sku || null, item.hsnCode || null,
          item.quantity, item.unitPrice, item.discountPercent || 0, item.gstPercentage || 0,
          item.taxableAmount, item.gstAmount, item.lineTotal, idx
        );
      });
    });
    tx();
    return this.findOrderById(id);
  }

  updateOrder(id, data, items) {
    const db = getDatabase();
    const now = nowIso();
    const tx = db.transaction(() => {
      db.prepare(`
        UPDATE purchase_orders SET
          supplier_id = ?, order_date = ?, expected_date = ?, warehouse_id = ?, status = ?,
          subtotal = ?, gst_amount = ?, cgst_amount = ?, sgst_amount = ?, igst_amount = ?, grand_total = ?,
          notes = ?, updated_at = ?
        WHERE id = ?
      `).run(
        data.supplierId, data.orderDate, data.expectedDate || null, data.warehouseId || null, data.status,
        data.subtotal, data.gstAmount, data.cgstAmount, data.sgstAmount, data.igstAmount, data.grandTotal,
        data.notes || null, now, id
      );
      db.prepare('DELETE FROM purchase_order_items WHERE purchase_order_id = ?').run(id);
      const insertItem = db.prepare(`
        INSERT INTO purchase_order_items (
          id, purchase_order_id, product_id, product_name, sku, hsn_code, quantity, unit_price,
          discount_percent, gst_percentage, taxable_amount, gst_amount, line_total, received_qty, sort_order
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)
      `);
      items.forEach((item, idx) => {
        insertItem.run(
          generateId(), id, item.productId, item.productName, item.sku || null, item.hsnCode || null,
          item.quantity, item.unitPrice, item.discountPercent || 0, item.gstPercentage || 0,
          item.taxableAmount, item.gstAmount, item.lineTotal, idx
        );
      });
    });
    tx();
    return this.findOrderById(id);
  }

  setOrderStatus(id, status) {
    getDatabase().prepare(`
      UPDATE purchase_orders SET status = ?, updated_at = ? WHERE id = ?
    `).run(status, nowIso(), id);
    return this.findOrderById(id);
  }

  addReceivedQty(poId, productId, qty) {
    getDatabase().prepare(`
      UPDATE purchase_order_items SET received_qty = received_qty + ? 
      WHERE purchase_order_id = ? AND product_id = ?
    `).run(qty, poId, productId);
  }

  listBills(filters = {}) {
    const db = getDatabase();
    const { supplierId = '', status = '', search = '', limit = 100, offset = 0 } = filters;
    const conditions = ["b.reference_type IN ('purchase', 'purchase_bill', 'manual') OR b.reference_type IS NULL"];
    const params = [];
    if (supplierId) { conditions.push('b.supplier_id = ?'); params.push(supplierId); }
    if (status) { conditions.push('b.status = ?'); params.push(status); }
    if (search) {
      conditions.push('(b.bill_number LIKE ? OR b.supplier_invoice_number LIKE ? OR s.name LIKE ?)');
      const like = `%${search}%`;
      params.push(like, like, like);
    }
    const where = `WHERE ${conditions.join(' AND ')}`;
    const countParams = [...params];
    params.push(limit, offset);
    const items = db.prepare(`
      ${BILL_SELECT} ${where}
      ORDER BY b.bill_date DESC, b.created_at DESC
      LIMIT ? OFFSET ?
    `).all(...params).map((row) => mapBill(row));
    const total = db.prepare(`
      SELECT COUNT(*) as count FROM supplier_bills b
      LEFT JOIN suppliers s ON s.id = b.supplier_id
      ${where}
    `).get(...countParams).count;
    return { items, total, limit, offset };
  }

  findBillById(id) {
    const db = getDatabase();
    const row = db.prepare(`${BILL_SELECT} WHERE b.id = ?`).get(id);
    if (!row) return null;
    const items = db.prepare(`
      SELECT * FROM supplier_bill_items WHERE bill_id = ? ORDER BY sort_order ASC
    `).all(id).map(mapBillItem);
    return mapBill(row, items);
  }

  createBillWithItems(data, items) {
    const db = getDatabase();
    const id = generateId();
    const now = nowIso();
    const tx = db.transaction(() => {
      db.prepare(`
        INSERT INTO supplier_bills (
          id, bill_number, supplier_id, supplier_invoice_number, bill_date, due_date,
          warehouse_id, purchase_order_id, subtotal, gst_amount, cgst_amount, sgst_amount, igst_amount,
          grand_total, amount_paid, amount_payable, status, reference_type, reference_id,
          stock_posted, notes, created_by, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, 'open', 'purchase_bill', ?, ?, ?, ?, ?, ?)
      `).run(
        id, data.billNumber, data.supplierId, data.supplierInvoiceNumber || null,
        data.billDate, data.dueDate || null, data.warehouseId || null, data.purchaseOrderId || null,
        data.subtotal, data.gstAmount, data.cgstAmount, data.sgstAmount, data.igstAmount, data.grandTotal,
        data.grandTotal, data.purchaseOrderId || null, data.stockPosted ? 1 : 0,
        data.notes || null, data.createdBy || null, now, now
      );
      const insertItem = db.prepare(`
        INSERT INTO supplier_bill_items (
          id, bill_id, product_id, product_name, sku, hsn_code, quantity, unit_price,
          discount_percent, gst_percentage, taxable_amount, gst_amount, cgst_amount, sgst_amount, igst_amount,
          line_total, sort_order
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      items.forEach((item, idx) => {
        insertItem.run(
          generateId(), id, item.productId, item.productName, item.sku || null, item.hsnCode || null,
          item.quantity, item.unitPrice, item.discountPercent || 0, item.gstPercentage || 0,
          item.taxableAmount, item.gstAmount, item.cgstAmount || 0, item.sgstAmount || 0, item.igstAmount || 0,
          item.lineTotal, idx
        );
      });
    });
    tx();
    return this.findBillById(id);
  }

  markBillStockPosted(id) {
    getDatabase().prepare(`
      UPDATE supplier_bills SET stock_posted = 1, updated_at = ? WHERE id = ?
    `).run(nowIso(), id);
  }

  createPriceList(data, items) {
    const db = getDatabase();
    const id = generateId();
    const now = nowIso();
    const matched = items.filter((i) => i.matchedProductId).length;
    const tx = db.transaction(() => {
      db.prepare(`
        INSERT INTO supplier_price_lists (
          id, supplier_id, name, effective_date, source_filename, status,
          row_count, matched_count, notes, created_by, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id, data.supplierId, data.name, data.effectiveDate || null, data.sourceFilename || null,
        data.status || 'processed', items.length, matched, data.notes || null,
        data.createdBy || null, now, now
      );
      const insert = db.prepare(`
        INSERT INTO supplier_price_list_items (
          id, price_list_id, row_number, supplier_sku, supplier_name, supplier_barcode,
          rate, mrp, discount_percent, gst_percentage, pack_size, unit,
          matched_product_id, match_method, match_confidence, raw_line
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      items.forEach((item, idx) => {
        insert.run(
          generateId(), id, idx + 1, item.supplierSku || null, item.supplierName || null,
          item.supplierBarcode || null, item.rate ?? null, item.mrp ?? null,
          item.discountPercent ?? null, item.gstPercentage ?? null, item.packSize || null, item.unit || null,
          item.matchedProductId || null, item.matchMethod || null, item.matchConfidence ?? null,
          item.rawLine || null
        );
      });
    });
    tx();
    return this.findPriceListById(id);
  }

  listPriceLists(filters = {}) {
    const db = getDatabase();
    const { supplierId = '', limit = 50, offset = 0 } = filters;
    const conditions = [];
    const params = [];
    if (supplierId) { conditions.push('pl.supplier_id = ?'); params.push(supplierId); }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const countParams = [...params];
    params.push(limit, offset);
    const items = db.prepare(`
      SELECT pl.*, s.name as supplier_name
      FROM supplier_price_lists pl
      LEFT JOIN suppliers s ON s.id = pl.supplier_id
      ${where}
      ORDER BY pl.created_at DESC
      LIMIT ? OFFSET ?
    `).all(...params).map((row) => mapPriceList(row));
    const total = db.prepare(`
      SELECT COUNT(*) as count FROM supplier_price_lists pl ${where}
    `).get(...countParams).count;
    return { items, total, limit, offset };
  }

  findPriceListById(id) {
    const db = getDatabase();
    const row = db.prepare(`
      SELECT pl.*, s.name as supplier_name
      FROM supplier_price_lists pl
      LEFT JOIN suppliers s ON s.id = pl.supplier_id
      WHERE pl.id = ?
    `).get(id);
    if (!row) return null;
    const items = db.prepare(`
      SELECT pli.*, p.name as matched_product_name, p.sku as matched_sku
      FROM supplier_price_list_items pli
      LEFT JOIN products p ON p.id = pli.matched_product_id
      WHERE pli.price_list_id = ?
      ORDER BY pli.row_number ASC
    `).all(id).map(mapPriceListItem);
    return mapPriceList(row, items);
  }

  listReturns(filters = {}) {
    const db = getDatabase();
    const { supplierId = '', limit = 50, offset = 0 } = filters;
    const conditions = [];
    const params = [];
    if (supplierId) { conditions.push('pr.supplier_id = ?'); params.push(supplierId); }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const countParams = [...params];
    params.push(limit, offset);
    const items = db.prepare(`
      SELECT pr.*, s.name as supplier_name, b.bill_number
      FROM purchase_returns pr
      LEFT JOIN suppliers s ON s.id = pr.supplier_id
      LEFT JOIN supplier_bills b ON b.id = pr.bill_id
      ${where}
      ORDER BY pr.return_date DESC
      LIMIT ? OFFSET ?
    `).all(...params).map((row) => mapReturn(row));
    const total = db.prepare(`
      SELECT COUNT(*) as count FROM purchase_returns pr ${where}
    `).get(...countParams).count;
    return { items, total, limit, offset };
  }

  findReturnById(id) {
    const db = getDatabase();
    const row = db.prepare(`
      SELECT pr.*, s.name as supplier_name, b.bill_number
      FROM purchase_returns pr
      LEFT JOIN suppliers s ON s.id = pr.supplier_id
      LEFT JOIN supplier_bills b ON b.id = pr.bill_id
      WHERE pr.id = ?
    `).get(id);
    if (!row) return null;
    const items = db.prepare(`
      SELECT * FROM purchase_return_items WHERE return_id = ?
    `).all(id).map((r) => ({
      id: r.id,
      productId: r.product_id,
      productName: r.product_name,
      sku: r.sku,
      quantity: Number(r.quantity),
      unitPrice: Number(r.unit_price),
      gstPercentage: Number(r.gst_percentage),
      lineTotal: Number(r.line_total),
    }));
    return mapReturn(row, items);
  }

  nextReturnNumber() {
    const count = getDatabase().prepare('SELECT COUNT(*) as count FROM purchase_returns').get().count;
    return `PR-${String(count + 1).padStart(5, '0')}`;
  }

  createReturn(data, items) {
    const db = getDatabase();
    const id = generateId();
    const now = nowIso();
    const tx = db.transaction(() => {
      db.prepare(`
        INSERT INTO purchase_returns (
          id, return_number, supplier_id, bill_id, return_date, warehouse_id,
          subtotal, gst_amount, grand_total, status, notes, created_by, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'completed', ?, ?, ?, ?)
      `).run(
        id, data.returnNumber, data.supplierId, data.billId || null, data.returnDate,
        data.warehouseId || null, data.subtotal, data.gstAmount, data.grandTotal,
        data.notes || null, data.createdBy || null, now, now
      );
      const insert = db.prepare(`
        INSERT INTO purchase_return_items (
          id, return_id, product_id, product_name, sku, quantity, unit_price, gst_percentage, line_total
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      items.forEach((item) => {
        insert.run(
          generateId(), id, item.productId, item.productName, item.sku || null,
          item.quantity, item.unitPrice, item.gstPercentage || 0, item.lineTotal
        );
      });
    });
    tx();
    return this.findReturnById(id);
  }

  getDashboardStats() {
    const db = getDatabase();
    const openPos = db.prepare(`
      SELECT COUNT(*) as count FROM purchase_orders WHERE status IN ('draft','sent','partial')
    `).get().count;
    const pendingBills = db.prepare(`
      SELECT COUNT(*) as count, COALESCE(SUM(amount_payable),0) as payable
      FROM supplier_bills WHERE status IN ('open','partial')
    `).get();
    const monthPurchases = db.prepare(`
      SELECT COALESCE(SUM(grand_total),0) as total
      FROM supplier_bills
      WHERE status != 'cancelled' AND bill_date >= date('now','start of month')
    `).get().total;
    const priceLists = db.prepare(`
      SELECT COUNT(*) as count FROM supplier_price_lists WHERE status = 'processed'
    `).get().count;
    const returns = db.prepare(`
      SELECT COUNT(*) as count, COALESCE(SUM(grand_total),0) as total
      FROM purchase_returns WHERE status = 'completed'
        AND return_date >= date('now','start of month')
    `).get();
    return {
      openPurchaseOrders: openPos,
      pendingBills: pendingBills.count,
      pendingPayable: round2(pendingBills.payable),
      monthPurchaseTotal: round2(monthPurchases),
      processedPriceLists: priceLists,
      monthReturns: returns.count,
      monthReturnTotal: round2(returns.total),
    };
  }

  getReportsSummary({ dateFrom = '', dateTo = '' } = {}) {
    const db = getDatabase();
    const params = [];
    let dateFilter = '';
    if (dateFrom) { dateFilter += ' AND bill_date >= ?'; params.push(dateFrom); }
    if (dateTo) { dateFilter += ' AND bill_date <= ?'; params.push(dateTo); }

    const bySupplier = db.prepare(`
      SELECT s.id, s.name, s.code, COUNT(b.id) as bill_count,
             COALESCE(SUM(b.grand_total),0) as purchase_total,
             COALESCE(SUM(b.amount_payable),0) as payable_total
      FROM suppliers s
      LEFT JOIN supplier_bills b ON b.supplier_id = s.id AND b.status != 'cancelled' ${dateFilter.replace(/bill_date/g, 'b.bill_date')}
      GROUP BY s.id
      HAVING bill_count > 0
      ORDER BY purchase_total DESC
      LIMIT 20
    `).all(...params);

    const totals = db.prepare(`
      SELECT COUNT(*) as bill_count, COALESCE(SUM(grand_total),0) as purchase_total,
             COALESCE(SUM(gst_amount),0) as gst_total
      FROM supplier_bills WHERE status != 'cancelled' ${dateFilter}
    `).get(...params);

    return {
      totals: {
        billCount: totals.bill_count,
        purchaseTotal: round2(totals.purchase_total),
        gstTotal: round2(totals.gst_total),
      },
      bySupplier: bySupplier.map((r) => ({
        id: r.id,
        name: r.name,
        code: r.code,
        billCount: r.bill_count,
        purchaseTotal: round2(r.purchase_total),
        payableTotal: round2(r.payable_total),
      })),
    };
  }
}
