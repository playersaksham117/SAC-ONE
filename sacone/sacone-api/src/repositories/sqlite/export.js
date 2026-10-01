import { getDatabase } from '../../database/connection.js';
import { generateId, nowIso, toJson, parseJson } from '../../core/utils.js';
import crypto from 'crypto';

function rowsToObjects(stmt, params = []) {
  return getDatabase().prepare(stmt).all(...params);
}

function dateClause(column, dateFrom, dateTo, params) {
  let sql = '';
  if (dateFrom) {
    sql += ` AND ${column} >= ?`;
    params.push(dateFrom);
  }
  if (dateTo) {
    // inclusive end-of-day if date-only
    const end = dateTo.length <= 10 ? `${dateTo}T23:59:59.999Z` : dateTo;
    sql += ` AND ${column} <= ?`;
    params.push(end);
  }
  return sql;
}

/**
 * Read-only extractors. Never mutate SQLite business tables.
 */
export class ExportDataRepository {
  getCompanyId() {
    const row = getDatabase().prepare('SELECT id FROM companies ORDER BY created_at ASC LIMIT 1').get();
    return row?.id || null;
  }

  fetchCompany() {
    const companies = rowsToObjects(`
      SELECT id, business_name, legal_name, address_line1, address_line2, city, state, country,
             postal_code, gst_number, gst_state_code, pan_number, phone, email, website, logo_url,
             is_setup_complete, firm_prefix, firm_prefix_manual, document_number_format,
             simple_number_format, number_padding, fy_reset_numbering, authorized_signatory,
             document_stamp_url, created_at, updated_at, created_by
      FROM companies ORDER BY created_at ASC
    `);
    return { companies };
  }

  fetchProducts() {
    const categories = rowsToObjects(`
      SELECT id, name, code, description, is_active, created_at, updated_at, created_by
      FROM categories ORDER BY name
    `);
    const brands = rowsToObjects(`
      SELECT id, name, code, description, is_active, created_at, updated_at, created_by
      FROM brands ORDER BY name
    `);
    const units = rowsToObjects(`
      SELECT id, name, abbreviation, description, is_active, created_at, updated_at, created_by
      FROM units ORDER BY name
    `);
    let products;
    try {
      products = rowsToObjects(`
        SELECT id, name, sku, barcode, category_id, brand_id, unit_id, model_variant, attributes, hsn_code, gst_percentage,
               mrp, selling_price, purchase_price, reorder_level, minimum_stock, image_url, description,
               is_active, web_store_published, created_at, updated_at, created_by
        FROM products ORDER BY sku
      `);
    } catch {
      products = rowsToObjects(`
        SELECT id, name, sku, barcode, category_id, brand_id, unit_id, hsn_code, gst_percentage,
               mrp, selling_price, purchase_price, reorder_level, minimum_stock, image_url, description,
               is_active, web_store_published, created_at, updated_at, created_by
        FROM products ORDER BY sku
      `);
    }
    return { categories, brands, units, products };
  }

  fetchCustomers() {
    const customers = rowsToObjects(`
      SELECT id, code, name, phone, email, gst_number, gst_state_code, address, city, state,
             credit_limit, outstanding_balance, is_walk_in, is_active, source_channel, notes,
             created_at, updated_at, created_by
      FROM customers ORDER BY code
    `);
    return { customers };
  }

  fetchSuppliers() {
    const suppliers = rowsToObjects(`
      SELECT id, code, name, contact_name, phone, email, gst_number, gst_state_code,
             address, city, state, payment_terms, outstanding_payable, is_active, notes,
             created_at, updated_at, created_by
      FROM suppliers ORDER BY code
    `);
    return { suppliers };
  }

  fetchWarehouses() {
    const warehouses = rowsToObjects(`
      SELECT id, code, name, address, city, state, is_default, is_active,
             created_at, updated_at, created_by
      FROM warehouses ORDER BY code
    `);
    const warehouse_locations = rowsToObjects(`
      SELECT id, warehouse_id, parent_id, code, name, location_type, full_code, qr_payload,
             capacity, is_default, is_active, sort_order, created_at, updated_at, created_by
      FROM warehouse_locations ORDER BY warehouse_id, full_code
    `);
    return { warehouses, warehouse_locations };
  }

  fetchInventoryMovements({ dateFrom, dateTo } = {}) {
    const params = [];
    const where = `WHERE 1=1${dateClause('created_at', dateFrom, dateTo, params)}`;
    const inventory_movements = rowsToObjects(`
      SELECT id, product_id, warehouse_id, source_location_id, destination_location_id,
             movement_type, quantity_in, quantity_out, reference_type, reference_id,
             reason, notes, status, requires_approval, approved_by, approved_at,
             rejection_reason, created_by, created_at
      FROM inventory_movements
      ${where}
      ORDER BY created_at ASC
    `, params);
    return { inventory_movements };
  }

  fetchSales({ dateFrom, dateTo } = {}) {
    const params = [];
    const where = `WHERE 1=1${dateClause('created_at', dateFrom, dateTo, params)}`;
    const sales = rowsToObjects(`
      SELECT id, invoice_number, warehouse_id, customer_id, status, payment_status,
             subtotal, item_discount_total, invoice_discount, taxable_amount,
             cgst_amount, sgst_amount, igst_amount, gst_amount, grand_total,
             amount_paid, amount_credit, notes, held_bill_id, created_by, created_at, completed_at
      FROM pos_sales
      ${where}
      ORDER BY created_at ASC
    `, params);
    return { sales };
  }

  fetchSalesItems({ dateFrom, dateTo } = {}) {
    const params = [];
    let joinFilter = '';
    if (dateFrom || dateTo) {
      joinFilter = 'INNER JOIN pos_sales s ON s.id = i.sale_id';
      const saleParams = [];
      const clause = dateClause('s.created_at', dateFrom, dateTo, saleParams);
      params.push(...saleParams);
      const sales_items = rowsToObjects(`
        SELECT i.id, i.sale_id, i.product_id, i.product_name, i.sku, i.hsn_code,
               i.quantity, i.unit_price, i.discount_amount, i.discount_percent, i.gst_percentage,
               i.taxable_amount, i.gst_amount, i.line_total, i.quantity_returned, i.movement_id, i.sort_order
        FROM pos_sale_items i
        ${joinFilter}
        WHERE 1=1${clause}
        ORDER BY i.sale_id, i.sort_order
      `, params);
      return { sales_items };
    }
    const sales_items = rowsToObjects(`
      SELECT id, sale_id, product_id, product_name, sku, hsn_code,
             quantity, unit_price, discount_amount, discount_percent, gst_percentage,
             taxable_amount, gst_amount, line_total, quantity_returned, movement_id, sort_order
      FROM pos_sale_items
      ORDER BY sale_id, sort_order
    `);
    return { sales_items };
  }

  fetchPayments({ dateFrom, dateTo } = {}) {
    const params = [];
    const where = `WHERE 1=1${dateClause('created_at', dateFrom, dateTo, params)}`;
    const payments = rowsToObjects(`
      SELECT id, sale_id, method, amount, reference, notes, created_by, created_at
      FROM pos_payments
      ${where}
      ORDER BY created_at ASC
    `, params);
    return { payments };
  }

  fetchStockLevels() {
    const stock_levels = rowsToObjects(`
      SELECT id, product_id, warehouse_id, quantity_on_hand, quantity_reserved, quantity_available,
             last_movement_id, last_movement_at, created_at, updated_at
      FROM stock_levels ORDER BY product_id, warehouse_id
    `);
    let location_stock_levels = [];
    try {
      location_stock_levels = rowsToObjects(`
        SELECT id, product_id, location_id, quantity_on_hand, updated_at
        FROM location_stock_levels ORDER BY product_id, location_id
      `);
    } catch {
      location_stock_levels = [];
    }
    return { stock_levels, location_stock_levels };
  }

  fetchSupplierBills({ dateFrom, dateTo } = {}) {
    const params = [];
    const where = `WHERE 1=1${dateClause('bill_date', dateFrom, dateTo, params)}`;
    const supplier_bills = rowsToObjects(`
      SELECT id, bill_number, supplier_id, supplier_invoice_number, bill_date, due_date,
             warehouse_id, purchase_order_id, subtotal, gst_amount, cgst_amount, sgst_amount, igst_amount,
             grand_total, amount_paid, amount_payable, status, reference_type, reference_id,
             stock_posted, notes, created_by, created_at, updated_at
      FROM supplier_bills
      ${where}
      ORDER BY bill_date ASC, created_at ASC
    `, params);
    let supplier_bill_items = [];
    try {
      supplier_bill_items = rowsToObjects(`
        SELECT id, bill_id, product_id, product_name, sku, hsn_code, quantity, unit_price,
               discount_percent, gst_percentage, taxable_amount, gst_amount, cgst_amount, sgst_amount,
               igst_amount, line_total, sort_order
        FROM supplier_bill_items
        ORDER BY bill_id, sort_order
      `);
    } catch {
      supplier_bill_items = [];
    }
    return { supplier_bills, supplier_bill_items };
  }

  fetchSupplierPayments({ dateFrom, dateTo } = {}) {
    const params = [];
    const where = `WHERE 1=1${dateClause('payment_date', dateFrom, dateTo, params)}`;
    const supplier_payments = rowsToObjects(`
      SELECT id, supplier_id, bill_id, payment_date, method, amount, reference, notes, created_by, created_at
      FROM supplier_payments
      ${where}
      ORDER BY payment_date ASC, created_at ASC
    `, params);
    return { supplier_payments };
  }

  fetchPurchaseOrders({ dateFrom, dateTo } = {}) {
    const params = [];
    const where = `WHERE 1=1${dateClause('order_date', dateFrom, dateTo, params)}`;
    let purchase_orders = [];
    let purchase_order_items = [];
    try {
      purchase_orders = rowsToObjects(`
        SELECT id, po_number, supplier_id, order_date, expected_date, warehouse_id, status,
               subtotal, gst_amount, cgst_amount, sgst_amount, igst_amount, grand_total,
               price_list_id, notes, created_by, created_at, updated_at
        FROM purchase_orders
        ${where}
        ORDER BY order_date ASC, created_at ASC
      `, params);
      purchase_order_items = rowsToObjects(`
        SELECT id, purchase_order_id, product_id, product_name, sku, hsn_code, quantity, unit_price,
               discount_percent, gst_percentage, taxable_amount, gst_amount, line_total, received_qty, sort_order
        FROM purchase_order_items
        ORDER BY purchase_order_id, sort_order
      `);
    } catch {
      purchase_orders = [];
      purchase_order_items = [];
    }
    return { purchase_orders, purchase_order_items };
  }

  fetchSystemSettings() {
    const rows = rowsToObjects(`
      SELECT key, value, description, updated_at, updated_by
      FROM system_settings
      WHERE LOWER(key) NOT LIKE '%secret%'
        AND LOWER(key) NOT LIKE '%password%'
        AND LOWER(key) NOT LIKE '%token%'
      ORDER BY key
    `);
    // Synthesize stable UUID-like ids (table uses key as PK)
    const system_settings = rows.map((row) => {
      const hex = crypto.createHash('sha1').update(`sacone:setting:${row.key}`).digest('hex');
      const id = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
      return { id, ...row };
    });
    return { system_settings };
  }

  /** Users without password_hash or other secrets */
  fetchUsers() {
    const roles = rowsToObjects(`
      SELECT id, name, slug, description, is_system, is_active, created_at, updated_at, created_by
      FROM roles ORDER BY name
    `);
    const users = rowsToObjects(`
      SELECT u.id, u.email, u.full_name, u.phone, u.role_id, r.slug as role_slug, r.name as role_name,
             u.is_active, u.last_login_at, u.created_at, u.updated_at, u.created_by
      FROM users u
      LEFT JOIN roles r ON r.id = u.role_id
      ORDER BY u.email
    `);
    return { roles, users };
  }
}

export class ExportLogRepository {
  nextNumber() {
    const count = getDatabase().prepare('SELECT COUNT(*) as count FROM export_logs').get().count;
    return `EXP-${String(count + 1).padStart(5, '0')}`;
  }

  create(entry) {
    const id = generateId();
    const exportNumber = entry.exportNumber || this.nextNumber();
    getDatabase().prepare(`
      INSERT INTO export_logs (
        id, export_number, export_type, datasets, date_from, date_to, status,
        file_count, record_count, output_dir, files_json, validation_ok,
        error_message, created_by, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      exportNumber,
      entry.exportType,
      toJson(entry.datasets),
      entry.dateFrom || null,
      entry.dateTo || null,
      entry.status || 'completed',
      entry.fileCount || 0,
      entry.recordCount || 0,
      entry.outputDir || null,
      toJson(entry.files || []),
      entry.validationOk ? 1 : 0,
      entry.errorMessage || null,
      entry.createdBy || null,
      nowIso()
    );
    return this.findById(id);
  }

  findById(id) {
    const row = getDatabase().prepare('SELECT * FROM export_logs WHERE id = ?').get(id);
    if (!row) return null;
    return {
      id: row.id,
      exportNumber: row.export_number,
      exportType: row.export_type,
      datasets: parseJson(row.datasets, []),
      dateFrom: row.date_from,
      dateTo: row.date_to,
      status: row.status,
      fileCount: row.file_count,
      recordCount: row.record_count,
      outputDir: row.output_dir,
      files: parseJson(row.files_json, []),
      validationOk: Boolean(row.validation_ok),
      errorMessage: row.error_message,
      createdBy: row.created_by,
      createdAt: row.created_at,
    };
  }

  list({ limit = 50, offset = 0 } = {}) {
    return getDatabase().prepare(`
      SELECT * FROM export_logs ORDER BY created_at DESC LIMIT ? OFFSET ?
    `).all(limit, offset).map((row) => ({
      id: row.id,
      exportNumber: row.export_number,
      exportType: row.export_type,
      datasets: parseJson(row.datasets, []),
      dateFrom: row.date_from,
      dateTo: row.date_to,
      status: row.status,
      fileCount: row.file_count,
      recordCount: row.record_count,
      outputDir: row.output_dir,
      files: parseJson(row.files_json, []),
      validationOk: Boolean(row.validation_ok),
      errorMessage: row.error_message,
      createdBy: row.created_by,
      createdAt: row.created_at,
    }));
  }
}
