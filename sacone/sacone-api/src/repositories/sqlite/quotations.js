import { getDatabase } from '../../database/connection.js';
import { generateId, nowIso } from '../../core/utils.js';

function mapQuotation(row) {
  if (!row) return null;
  return {
    id: row.id,
    quotationNumber: row.quotation_number,
    firmId: row.firm_id,
    warehouseId: row.warehouse_id,
    warehouseName: row.warehouse_name || null,
    customerId: row.customer_id,
    status: row.status,
    quotationDate: row.quotation_date,
    validUntil: row.valid_until,
    financialYear: row.financial_year,
    subtotal: Number(row.subtotal || 0),
    itemDiscountTotal: Number(row.item_discount_total || 0),
    invoiceDiscount: Number(row.invoice_discount || 0),
    taxableAmount: Number(row.taxable_amount || 0),
    cgstAmount: Number(row.cgst_amount || 0),
    sgstAmount: Number(row.sgst_amount || 0),
    igstAmount: Number(row.igst_amount || 0),
    gstAmount: Number(row.gst_amount || 0),
    grandTotal: Number(row.grand_total || 0),
    notes: row.notes,
    termsConditions: row.terms_conditions,
    customerSnapshot: {
      name: row.snap_customer_name,
      businessName: row.snap_business_name,
      contactPerson: row.snap_contact_person,
      phone: row.snap_phone,
      email: row.snap_email,
      gstNumber: row.snap_gst_number,
      billingAddress: row.snap_billing_address,
      billingCity: row.snap_billing_city,
      billingState: row.snap_billing_state,
      billingPostal: row.snap_billing_postal,
      shippingAddress: row.snap_shipping_address,
      shippingCity: row.snap_shipping_city,
      shippingState: row.snap_shipping_state,
      shippingPostal: row.snap_shipping_postal,
    },
    convertedSaleId: row.converted_sale_id,
    convertedInvoiceNumber: row.converted_invoice_number || null,
    sentAt: row.sent_at,
    createdBy: row.created_by,
    createdByName: row.created_by_name || null,
    updatedBy: row.updated_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapItem(row) {
  if (!row) return null;
  return {
    id: row.id,
    quotationId: row.quotation_id,
    productId: row.product_id,
    productName: row.product_name,
    sku: row.sku,
    hsnCode: row.hsn_code,
    unitAbbreviation: row.unit_abbreviation,
    quantity: Number(row.quantity || 0),
    unitPrice: Number(row.unit_price || 0),
    discountAmount: Number(row.discount_amount || 0),
    discountPercent: Number(row.discount_percent || 0),
    gstPercentage: Number(row.gst_percentage || 0),
    taxableAmount: Number(row.taxable_amount || 0),
    gstAmount: Number(row.gst_amount || 0),
    lineTotal: Number(row.line_total || 0),
    sortOrder: row.sort_order,
  };
}

const QUOTE_SELECT = `
  SELECT q.*,
    w.name as warehouse_name,
    u.full_name as created_by_name,
    s.invoice_number as converted_invoice_number
  FROM pos_quotations q
  LEFT JOIN warehouses w ON w.id = q.warehouse_id
  LEFT JOIN users u ON u.id = q.created_by
  LEFT JOIN pos_sales s ON s.id = q.converted_sale_id
`;

export class QuotationRepository {
  findById(id) {
    const quote = mapQuotation(getDatabase().prepare(`${QUOTE_SELECT} WHERE q.id = ?`).get(id));
    if (!quote) return null;
    quote.items = this.listItems(id);
    return quote;
  }

  findByNumber(number) {
    const row = getDatabase().prepare(`${QUOTE_SELECT} WHERE q.quotation_number = ?`).get(number);
    if (!row) return null;
    return this.findById(row.id);
  }

  listItems(quotationId) {
    return getDatabase().prepare(`
      SELECT * FROM pos_quotation_items WHERE quotation_id = ? ORDER BY sort_order ASC, product_name ASC
    `).all(quotationId).map(mapItem);
  }

  findAll({ search = '', status = '', customerId = '', limit = 50, offset = 0 } = {}) {
    const db = getDatabase();
    const where = [];
    const params = [];
    if (search) {
      where.push('(q.quotation_number LIKE ? OR q.snap_customer_name LIKE ? OR q.snap_phone LIKE ?)');
      const q = `%${search}%`;
      params.push(q, q, q);
    }
    if (status) {
      where.push('q.status = ?');
      params.push(status);
    }
    if (customerId) {
      where.push('q.customer_id = ?');
      params.push(customerId);
    }
    const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const items = db.prepare(`
      ${QUOTE_SELECT} ${clause}
      ORDER BY q.created_at DESC
      LIMIT ? OFFSET ?
    `).all(...params, limit, offset).map(mapQuotation);
    const total = db.prepare(`
      SELECT COUNT(*) as count FROM pos_quotations q ${clause}
    `).get(...params).count;
    return { items, total, limit, offset };
  }

  create({ header, items }) {
    const db = getDatabase();
    const id = generateId();
    const now = nowIso();
    const snap = header.customerSnapshot || {};

    const tx = db.transaction(() => {
      db.prepare(`
        INSERT INTO pos_quotations (
          id, quotation_number, firm_id, warehouse_id, customer_id, status,
          quotation_date, valid_until, financial_year,
          subtotal, item_discount_total, invoice_discount, taxable_amount,
          cgst_amount, sgst_amount, igst_amount, gst_amount, grand_total,
          notes, terms_conditions,
          snap_customer_name, snap_business_name, snap_contact_person,
          snap_phone, snap_email, snap_gst_number,
          snap_billing_address, snap_billing_city, snap_billing_state, snap_billing_postal,
          snap_shipping_address, snap_shipping_city, snap_shipping_state, snap_shipping_postal,
          created_by, updated_by, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id,
        header.quotationNumber,
        header.firmId,
        header.warehouseId || null,
        header.customerId || null,
        header.status || 'draft',
        header.quotationDate,
        header.validUntil || null,
        header.financialYear,
        header.subtotal,
        header.itemDiscountTotal,
        header.invoiceDiscount,
        header.taxableAmount,
        header.cgstAmount,
        header.sgstAmount,
        header.igstAmount,
        header.gstAmount,
        header.grandTotal,
        header.notes || null,
        header.termsConditions || null,
        snap.name || null,
        snap.businessName || null,
        snap.contactPerson || null,
        snap.phone || null,
        snap.email || null,
        snap.gstNumber || null,
        snap.billingAddress || null,
        snap.billingCity || null,
        snap.billingState || null,
        snap.billingPostal || null,
        snap.shippingAddress || null,
        snap.shippingCity || null,
        snap.shippingState || null,
        snap.shippingPostal || null,
        header.createdBy || null,
        header.createdBy || null,
        now,
        now,
      );

      const insertItem = db.prepare(`
        INSERT INTO pos_quotation_items (
          id, quotation_id, product_id, product_name, sku, hsn_code, unit_abbreviation,
          quantity, unit_price, discount_amount, discount_percent, gst_percentage,
          taxable_amount, gst_amount, line_total, sort_order
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      items.forEach((item, index) => {
        insertItem.run(
          item.id || generateId(),
          id,
          item.productId,
          item.productName,
          item.sku || null,
          item.hsnCode || null,
          item.unitAbbreviation || null,
          item.quantity,
          item.unitPrice,
          item.discountAmount || 0,
          item.discountPercent || 0,
          item.gstPercentage || 0,
          item.taxableAmount,
          item.gstAmount,
          item.lineTotal,
          index,
        );
      });
    });

    tx();
    return this.findById(id);
  }

  update(id, { header, items }) {
    const db = getDatabase();
    const existing = this.findById(id);
    if (!existing) return null;
    const now = nowIso();
    const snap = header.customerSnapshot || existing.customerSnapshot;

    const tx = db.transaction(() => {
      db.prepare(`
        UPDATE pos_quotations SET
          warehouse_id = COALESCE(?, warehouse_id),
          customer_id = COALESCE(?, customer_id),
          status = COALESCE(?, status),
          quotation_date = COALESCE(?, quotation_date),
          valid_until = COALESCE(?, valid_until),
          subtotal = ?, item_discount_total = ?, invoice_discount = ?,
          taxable_amount = ?, cgst_amount = ?, sgst_amount = ?, igst_amount = ?,
          gst_amount = ?, grand_total = ?,
          notes = ?, terms_conditions = ?,
          snap_customer_name = ?, snap_business_name = ?, snap_contact_person = ?,
          snap_phone = ?, snap_email = ?, snap_gst_number = ?,
          snap_billing_address = ?, snap_billing_city = ?, snap_billing_state = ?, snap_billing_postal = ?,
          snap_shipping_address = ?, snap_shipping_city = ?, snap_shipping_state = ?, snap_shipping_postal = ?,
          sent_at = COALESCE(?, sent_at),
          updated_by = ?, updated_at = ?
        WHERE id = ?
      `).run(
        header.warehouseId ?? existing.warehouseId,
        header.customerId ?? existing.customerId,
        header.status ?? existing.status,
        header.quotationDate ?? existing.quotationDate,
        header.validUntil ?? existing.validUntil,
        header.subtotal,
        header.itemDiscountTotal,
        header.invoiceDiscount,
        header.taxableAmount,
        header.cgstAmount,
        header.sgstAmount,
        header.igstAmount,
        header.gstAmount,
        header.grandTotal,
        header.notes ?? existing.notes,
        header.termsConditions ?? existing.termsConditions,
        snap.name,
        snap.businessName,
        snap.contactPerson,
        snap.phone,
        snap.email,
        snap.gstNumber,
        snap.billingAddress,
        snap.billingCity,
        snap.billingState,
        snap.billingPostal,
        snap.shippingAddress,
        snap.shippingCity,
        snap.shippingState,
        snap.shippingPostal,
        header.sentAt ?? null,
        header.updatedBy || null,
        now,
        id,
      );

      db.prepare('DELETE FROM pos_quotation_items WHERE quotation_id = ?').run(id);
      const insertItem = db.prepare(`
        INSERT INTO pos_quotation_items (
          id, quotation_id, product_id, product_name, sku, hsn_code, unit_abbreviation,
          quantity, unit_price, discount_amount, discount_percent, gst_percentage,
          taxable_amount, gst_amount, line_total, sort_order
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      items.forEach((item, index) => {
        insertItem.run(
          item.id || generateId(),
          id,
          item.productId,
          item.productName,
          item.sku || null,
          item.hsnCode || null,
          item.unitAbbreviation || null,
          item.quantity,
          item.unitPrice,
          item.discountAmount || 0,
          item.discountPercent || 0,
          item.gstPercentage || 0,
          item.taxableAmount,
          item.gstAmount,
          item.lineTotal,
          index,
        );
      });
    });

    tx();
    return this.findById(id);
  }

  updateStatus(id, status, extra = {}) {
    const db = getDatabase();
    const now = nowIso();
    db.prepare(`
      UPDATE pos_quotations SET
        status = ?,
        converted_sale_id = COALESCE(?, converted_sale_id),
        sent_at = COALESCE(?, sent_at),
        updated_by = COALESCE(?, updated_by),
        updated_at = ?
      WHERE id = ?
    `).run(
      status,
      extra.convertedSaleId ?? null,
      extra.sentAt ?? null,
      extra.updatedBy ?? null,
      now,
      id,
    );
    return this.findById(id);
  }
}
