import { getDatabase } from '../../database/connection.js';
import { generateId, nowIso } from '../../core/utils.js';

function mapCustomer(row) {
  if (!row) return null;
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    businessName: row.business_name,
    contactPerson: row.contact_person,
    phone: row.phone,
    email: row.email,
    gstNumber: row.gst_number,
    gstStateCode: row.gst_state_code,
    address: row.address,
    city: row.city,
    state: row.state,
    postalCode: row.postal_code,
    shippingAddress: row.shipping_address,
    shippingCity: row.shipping_city,
    shippingState: row.shipping_state,
    shippingPostal: row.shipping_postal_code,
    creditLimit: Number(row.credit_limit || 0),
    outstandingBalance: Number(row.outstanding_balance || 0),
    isWalkIn: Boolean(row.is_walk_in),
    isActive: Boolean(row.is_active),
    primarySalesAgentId: row.primary_sales_agent_id || null,
    sourceChannel: row.source_channel || 'manual',
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    createdBy: row.created_by,
  };
}

function mapSupplier(row) {
  if (!row) return null;
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    contactName: row.contact_name,
    phone: row.phone,
    email: row.email,
    gstNumber: row.gst_number,
    gstStateCode: row.gst_state_code,
    address: row.address,
    city: row.city,
    state: row.state,
    paymentTerms: row.payment_terms,
    outstandingPayable: Number(row.outstanding_payable || 0),
    isActive: Boolean(row.is_active),
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    createdBy: row.created_by,
  };
}

function mapBill(row) {
  if (!row) return null;
  return {
    id: row.id,
    billNumber: row.bill_number,
    supplierId: row.supplier_id,
    supplierName: row.supplier_name || null,
    billDate: row.bill_date,
    dueDate: row.due_date,
    subtotal: Number(row.subtotal || 0),
    gstAmount: Number(row.gst_amount || 0),
    grandTotal: Number(row.grand_total || 0),
    amountPaid: Number(row.amount_paid || 0),
    amountPayable: Number(row.amount_payable || 0),
    status: row.status,
    referenceType: row.reference_type,
    referenceId: row.reference_id,
    notes: row.notes,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapSupplierPayment(row) {
  if (!row) return null;
  return {
    id: row.id,
    supplierId: row.supplier_id,
    billId: row.bill_id,
    billNumber: row.bill_number || null,
    paymentDate: row.payment_date,
    method: row.method,
    amount: Number(row.amount || 0),
    reference: row.reference,
    notes: row.notes,
    createdBy: row.created_by,
    createdAt: row.created_at,
  };
}

export class CustomerRepository {
  findAll({ search = '', includeInactive = false, limit = 100, offset = 0 } = {}) {
    const db = getDatabase();
    const where = [];
    const params = [];
    if (!includeInactive) where.push('is_active = 1');
    if (search) {
      where.push('(name LIKE ? OR code LIKE ? OR phone LIKE ? OR email LIKE ? OR gst_number LIKE ?)');
      const q = `%${search}%`;
      params.push(q, q, q, q, q);
    }
    const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const items = db.prepare(`
      SELECT * FROM customers ${clause}
      ORDER BY is_walk_in DESC, name ASC
      LIMIT ? OFFSET ?
    `).all(...params, limit, offset).map(mapCustomer);
    const total = db.prepare(`SELECT COUNT(*) as count FROM customers ${clause}`).get(...params).count;
    return { items, total, limit, offset };
  }

  /** Fast lookup for POS / web store — active customers only */
  lookup(query, { limit = 20 } = {}) {
    const q = String(query || '').trim();
    if (!q) return [];
    const like = `%${q}%`;
    return getDatabase().prepare(`
      SELECT * FROM customers
      WHERE is_active = 1
        AND (
          LOWER(code) = LOWER(?)
          OR LOWER(phone) = LOWER(?)
          OR name LIKE ? OR code LIKE ? OR phone LIKE ? OR email LIKE ?
        )
      ORDER BY
        CASE
          WHEN LOWER(code) = LOWER(?) THEN 0
          WHEN LOWER(phone) = LOWER(?) THEN 1
          ELSE 2
        END,
        name ASC
      LIMIT ?
    `).all(q, q, like, like, like, like, q, q, limit).map(mapCustomer);
  }

  findById(id) {
    return mapCustomer(getDatabase().prepare('SELECT * FROM customers WHERE id = ?').get(id));
  }

  findWalkIn() {
    return mapCustomer(
      getDatabase().prepare('SELECT * FROM customers WHERE is_walk_in = 1 AND is_active = 1 LIMIT 1').get()
    );
  }

  codeExists(code, excludeId = null) {
    const row = getDatabase().prepare(`
      SELECT id FROM customers WHERE LOWER(code) = LOWER(?) AND (? IS NULL OR id != ?)
    `).get(code, excludeId, excludeId);
    return Boolean(row);
  }

  nextCode() {
    const count = getDatabase().prepare('SELECT COUNT(*) as count FROM customers').get().count;
    return `CUST-${String(count + 1).padStart(4, '0')}`;
  }

  create(data) {
    const id = generateId();
    const now = nowIso();
    getDatabase().prepare(`
      INSERT INTO customers (
        id, code, name, phone, email, gst_number, gst_state_code, address, city, state,
        credit_limit, outstanding_balance, is_walk_in, is_active, source_channel, notes,
        created_at, updated_at, created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, 1, ?, ?, ?, ?, ?)
    `).run(
      id,
      data.code,
      data.name,
      data.phone || null,
      data.email || null,
      data.gstNumber || null,
      data.gstStateCode || null,
      data.address || null,
      data.city || null,
      data.state || null,
      Number(data.creditLimit || 0),
      data.isWalkIn ? 1 : 0,
      data.sourceChannel || 'manual',
      data.notes || null,
      now,
      now,
      data.createdBy || null
    );
    return this.findById(id);
  }

  update(id, data) {
    const existing = this.findById(id);
    if (!existing) return null;
    getDatabase().prepare(`
      UPDATE customers SET
        code = ?, name = ?, phone = ?, email = ?, gst_number = ?, gst_state_code = ?,
        address = ?, city = ?, state = ?, credit_limit = ?, is_active = ?,
        source_channel = ?, notes = ?, primary_sales_agent_id = ?, updated_at = ?
      WHERE id = ?
    `).run(
      data.code ?? existing.code,
      data.name ?? existing.name,
      data.phone !== undefined ? data.phone : existing.phone,
      data.email !== undefined ? data.email : existing.email,
      data.gstNumber !== undefined ? data.gstNumber : existing.gstNumber,
      data.gstStateCode !== undefined ? data.gstStateCode : existing.gstStateCode,
      data.address !== undefined ? data.address : existing.address,
      data.city !== undefined ? data.city : existing.city,
      data.state !== undefined ? data.state : existing.state,
      data.creditLimit !== undefined ? Number(data.creditLimit) : existing.creditLimit,
      data.isActive !== undefined ? (data.isActive ? 1 : 0) : (existing.isActive ? 1 : 0),
      data.sourceChannel !== undefined ? data.sourceChannel : existing.sourceChannel,
      data.notes !== undefined ? data.notes : existing.notes,
      data.primarySalesAgentId !== undefined ? data.primarySalesAgentId : existing.primarySalesAgentId,
      nowIso(),
      id
    );
    return this.findById(id);
  }

  adjustOutstanding(id, delta) {
    getDatabase().prepare(`
      UPDATE customers SET outstanding_balance = outstanding_balance + ?, updated_at = ? WHERE id = ?
    `).run(Number(delta), nowIso(), id);
    return this.findById(id);
  }

  getSummary(id) {
    const db = getDatabase();
    const sales = db.prepare(`
      SELECT
        COUNT(*) as invoice_count,
        COALESCE(SUM(grand_total), 0) as sales_total,
        COALESCE(SUM(amount_paid), 0) as paid_total,
        COALESCE(SUM(amount_credit), 0) as credit_total
      FROM pos_sales
      WHERE customer_id = ? AND status != 'voided'
    `).get(id);
    const returns = db.prepare(`
      SELECT COUNT(*) as return_count, COALESCE(SUM(grand_total), 0) as return_total
      FROM pos_sales_returns WHERE customer_id = ? AND status = 'completed'
    `).get(id);
    return {
      invoiceCount: sales?.invoice_count || 0,
      salesTotal: Number(sales?.sales_total || 0),
      paidTotal: Number(sales?.paid_total || 0),
      creditTotal: Number(sales?.credit_total || 0),
      returnCount: returns?.return_count || 0,
      returnTotal: Number(returns?.return_total || 0),
    };
  }

  listSales(customerId, { limit = 50, offset = 0 } = {}) {
    const db = getDatabase();
    const items = db.prepare(`
      SELECT s.id, s.invoice_number, s.status, s.payment_status, s.grand_total,
             s.amount_paid, s.amount_credit, s.gst_amount, s.due_date, s.created_at, s.completed_at
      FROM pos_sales s
      WHERE s.customer_id = ?
      ORDER BY s.created_at DESC
      LIMIT ? OFFSET ?
    `).all(customerId, limit, offset).map((row) => {
      const today = new Date().toISOString().slice(0, 10);
      const due = Number(row.amount_credit || 0);
      const isOverdue = due > 0.001 && row.due_date && row.due_date < today;
      let displayStatus = 'Paid';
      if (due > 0.001) {
        if (isOverdue) displayStatus = 'Overdue';
        else if (row.payment_status === 'partial') displayStatus = 'Partially Paid';
        else displayStatus = 'Unpaid';
      }
      return {
        id: row.id,
        invoiceNumber: row.invoice_number,
        status: row.status,
        paymentStatus: row.payment_status,
        displayStatus,
        isOverdue,
        grandTotal: Number(row.grand_total || 0),
        amountPaid: Number(row.amount_paid || 0),
        amountCredit: due,
        dueAmount: due,
        dueDate: row.due_date || null,
        gstAmount: Number(row.gst_amount || 0),
        createdAt: row.created_at,
        completedAt: row.completed_at,
      };
    });
    const total = db.prepare('SELECT COUNT(*) as count FROM pos_sales WHERE customer_id = ?')
      .get(customerId).count;
    return { items, total, limit, offset };
  }

  listPayments(customerId, { limit = 100, offset = 0 } = {}) {
    const db = getDatabase();
    const items = db.prepare(`
      SELECT p.id, p.sale_id, p.method, p.amount, p.reference, p.notes, p.created_at,
             s.invoice_number
      FROM pos_payments p
      INNER JOIN pos_sales s ON s.id = p.sale_id
      WHERE s.customer_id = ?
      ORDER BY p.created_at DESC
      LIMIT ? OFFSET ?
    `).all(customerId, limit, offset).map((row) => ({
      id: row.id,
      saleId: row.sale_id,
      invoiceNumber: row.invoice_number,
      method: row.method,
      amount: Number(row.amount || 0),
      reference: row.reference,
      notes: row.notes,
      createdAt: row.created_at,
    }));
    const total = db.prepare(`
      SELECT COUNT(*) as count FROM pos_payments p
      INNER JOIN pos_sales s ON s.id = p.sale_id
      WHERE s.customer_id = ?
    `).get(customerId).count;
    return { items, total, limit, offset };
  }

  buildStatement(customerId, { dateFrom = '', dateTo = '' } = {}) {
    const db = getDatabase();
    const params = [customerId];
    let saleDateFilter = '';
    let returnDateFilter = '';
    if (dateFrom) {
      saleDateFilter += ' AND s.created_at >= ?';
      returnDateFilter += ' AND r.created_at >= ?';
      params.push(dateFrom);
    }
    if (dateTo) {
      saleDateFilter += ' AND s.created_at <= ?';
      returnDateFilter += ' AND r.created_at <= ?';
      params.push(dateTo);
    }

    const sales = db.prepare(`
      SELECT s.id, s.invoice_number, s.grand_total, s.amount_paid, s.amount_credit, s.created_at
      FROM pos_sales s
      WHERE s.customer_id = ? AND s.status != 'voided' ${saleDateFilter}
      ORDER BY s.created_at ASC
    `).all(...params);

    const returnParams = [customerId];
    if (dateFrom) returnParams.push(dateFrom);
    if (dateTo) returnParams.push(dateTo);
    const returns = db.prepare(`
      SELECT r.id, r.return_number, r.grand_total, r.created_at, s.invoice_number
      FROM pos_sales_returns r
      LEFT JOIN pos_sales s ON s.id = r.sale_id
      WHERE r.customer_id = ? AND r.status = 'completed' ${returnDateFilter}
      ORDER BY r.created_at ASC
    `).all(...returnParams);

    const lines = [];
    for (const s of sales) {
      lines.push({
        date: s.created_at,
        type: 'invoice',
        reference: s.invoice_number,
        description: `Invoice ${s.invoice_number}`,
        debit: Number(s.grand_total || 0),
        credit: Number(s.amount_paid || 0),
        recordId: s.id,
      });
    }
    for (const r of returns) {
      lines.push({
        date: r.created_at,
        type: 'return',
        reference: r.return_number,
        description: `Return ${r.return_number}${r.invoice_number ? ` (${r.invoice_number})` : ''}`,
        debit: 0,
        credit: Number(r.grand_total || 0),
        recordId: r.id,
      });
    }

    lines.sort((a, b) => (a.date < b.date ? -1 : 1));
    let balance = 0;
    const withBalance = lines.map((line) => {
      balance += line.debit - line.credit;
      return { ...line, balance: Math.round((balance + Number.EPSILON) * 100) / 100 };
    });

    return {
      lines: withBalance,
      closingBalance: Math.round((balance + Number.EPSILON) * 100) / 100,
    };
  }
}

export class SupplierRepository {
  findAll({ search = '', includeInactive = false, limit = 100, offset = 0 } = {}) {
    const db = getDatabase();
    const where = [];
    const params = [];
    if (!includeInactive) where.push('is_active = 1');
    if (search) {
      where.push('(name LIKE ? OR code LIKE ? OR phone LIKE ? OR email LIKE ? OR contact_name LIKE ? OR gst_number LIKE ?)');
      const q = `%${search}%`;
      params.push(q, q, q, q, q, q);
    }
    const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const items = db.prepare(`
      SELECT * FROM suppliers ${clause} ORDER BY name ASC LIMIT ? OFFSET ?
    `).all(...params, limit, offset).map(mapSupplier);
    const total = db.prepare(`SELECT COUNT(*) as count FROM suppliers ${clause}`).get(...params).count;
    return { items, total, limit, offset };
  }

  lookup(query, { limit = 20 } = {}) {
    const q = String(query || '').trim();
    if (!q) return [];
    const like = `%${q}%`;
    return getDatabase().prepare(`
      SELECT * FROM suppliers
      WHERE is_active = 1
        AND (LOWER(code) = LOWER(?) OR name LIKE ? OR phone LIKE ? OR gst_number LIKE ?)
      ORDER BY name ASC
      LIMIT ?
    `).all(q, like, like, like, limit).map(mapSupplier);
  }

  findById(id) {
    return mapSupplier(getDatabase().prepare('SELECT * FROM suppliers WHERE id = ?').get(id));
  }

  codeExists(code, excludeId = null) {
    const row = getDatabase().prepare(`
      SELECT id FROM suppliers WHERE LOWER(code) = LOWER(?) AND (? IS NULL OR id != ?)
    `).get(code, excludeId, excludeId);
    return Boolean(row);
  }

  nextCode() {
    const count = getDatabase().prepare('SELECT COUNT(*) as count FROM suppliers').get().count;
    return `SUP-${String(count + 1).padStart(4, '0')}`;
  }

  create(data) {
    const id = generateId();
    const now = nowIso();
    getDatabase().prepare(`
      INSERT INTO suppliers (
        id, code, name, contact_name, phone, email, gst_number, gst_state_code,
        address, city, state, payment_terms, outstanding_payable, is_active, notes,
        created_at, updated_at, created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 1, ?, ?, ?, ?)
    `).run(
      id,
      data.code,
      data.name,
      data.contactName || null,
      data.phone || null,
      data.email || null,
      data.gstNumber || null,
      data.gstStateCode || null,
      data.address || null,
      data.city || null,
      data.state || null,
      data.paymentTerms || null,
      data.notes || null,
      now,
      now,
      data.createdBy || null
    );
    return this.findById(id);
  }

  update(id, data) {
    const existing = this.findById(id);
    if (!existing) return null;
    getDatabase().prepare(`
      UPDATE suppliers SET
        code = ?, name = ?, contact_name = ?, phone = ?, email = ?, gst_number = ?, gst_state_code = ?,
        address = ?, city = ?, state = ?, payment_terms = ?, is_active = ?, notes = ?, updated_at = ?
      WHERE id = ?
    `).run(
      data.code ?? existing.code,
      data.name ?? existing.name,
      data.contactName !== undefined ? data.contactName : existing.contactName,
      data.phone !== undefined ? data.phone : existing.phone,
      data.email !== undefined ? data.email : existing.email,
      data.gstNumber !== undefined ? data.gstNumber : existing.gstNumber,
      data.gstStateCode !== undefined ? data.gstStateCode : existing.gstStateCode,
      data.address !== undefined ? data.address : existing.address,
      data.city !== undefined ? data.city : existing.city,
      data.state !== undefined ? data.state : existing.state,
      data.paymentTerms !== undefined ? data.paymentTerms : existing.paymentTerms,
      data.isActive !== undefined ? (data.isActive ? 1 : 0) : (existing.isActive ? 1 : 0),
      data.notes !== undefined ? data.notes : existing.notes,
      nowIso(),
      id
    );
    return this.findById(id);
  }

  adjustPayable(id, delta) {
    getDatabase().prepare(`
      UPDATE suppliers SET outstanding_payable = outstanding_payable + ?, updated_at = ? WHERE id = ?
    `).run(Number(delta), nowIso(), id);
    return this.findById(id);
  }

  getSummary(id) {
    const db = getDatabase();
    const bills = db.prepare(`
      SELECT COUNT(*) as bill_count,
             COALESCE(SUM(grand_total), 0) as purchase_total,
             COALESCE(SUM(amount_payable), 0) as payable_total
      FROM supplier_bills
      WHERE supplier_id = ? AND status != 'cancelled'
    `).get(id);
    const payments = db.prepare(`
      SELECT COUNT(*) as payment_count, COALESCE(SUM(amount), 0) as payment_total
      FROM supplier_payments WHERE supplier_id = ?
    `).get(id);
    return {
      billCount: bills?.bill_count || 0,
      purchaseTotal: Number(bills?.purchase_total || 0),
      payableTotal: Number(bills?.payable_total || 0),
      paymentCount: payments?.payment_count || 0,
      paymentTotal: Number(payments?.payment_total || 0),
    };
  }
}

export class SupplierBillRepository {
  nextBillNumber() {
    const count = getDatabase().prepare('SELECT COUNT(*) as count FROM supplier_bills').get().count;
    return `BILL-${String(count + 1).padStart(5, '0')}`;
  }

  findById(id) {
    return mapBill(getDatabase().prepare(`
      SELECT b.*, s.name as supplier_name
      FROM supplier_bills b
      LEFT JOIN suppliers s ON s.id = b.supplier_id
      WHERE b.id = ?
    `).get(id));
  }

  listBySupplier(supplierId, { limit = 50, offset = 0 } = {}) {
    const db = getDatabase();
    const items = db.prepare(`
      SELECT b.*, s.name as supplier_name
      FROM supplier_bills b
      LEFT JOIN suppliers s ON s.id = b.supplier_id
      WHERE b.supplier_id = ?
      ORDER BY b.bill_date DESC, b.created_at DESC
      LIMIT ? OFFSET ?
    `).all(supplierId, limit, offset).map(mapBill);
    const total = db.prepare('SELECT COUNT(*) as count FROM supplier_bills WHERE supplier_id = ?')
      .get(supplierId).count;
    return { items, total, limit, offset };
  }

  create(data) {
    const id = generateId();
    const now = nowIso();
    const billNumber = data.billNumber || this.nextBillNumber();
    const grandTotal = Number(data.grandTotal || 0);
    getDatabase().prepare(`
      INSERT INTO supplier_bills (
        id, bill_number, supplier_id, bill_date, due_date, subtotal, gst_amount, grand_total,
        amount_paid, amount_payable, status, reference_type, reference_id, notes,
        created_by, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, 'open', ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      billNumber,
      data.supplierId,
      data.billDate || now.slice(0, 10),
      data.dueDate || null,
      Number(data.subtotal || grandTotal),
      Number(data.gstAmount || 0),
      grandTotal,
      grandTotal,
      data.referenceType || null,
      data.referenceId || null,
      data.notes || null,
      data.createdBy || null,
      now,
      now
    );
    return this.findById(id);
  }

  applyPayment(billId, amount) {
    const bill = this.findById(billId);
    if (!bill) return null;
    const amountPaid = Math.round((bill.amountPaid + amount + Number.EPSILON) * 100) / 100;
    const amountPayable = Math.max(0, Math.round((bill.grandTotal - amountPaid + Number.EPSILON) * 100) / 100);
    let status = 'open';
    if (amountPayable <= 0.001) status = 'paid';
    else if (amountPaid > 0) status = 'partial';
    getDatabase().prepare(`
      UPDATE supplier_bills SET amount_paid = ?, amount_payable = ?, status = ?, updated_at = ? WHERE id = ?
    `).run(amountPaid, amountPayable, status, nowIso(), billId);
    return this.findById(billId);
  }
}

export class SupplierPaymentRepository {
  listBySupplier(supplierId, { limit = 100, offset = 0 } = {}) {
    const db = getDatabase();
    const items = db.prepare(`
      SELECT p.*, b.bill_number
      FROM supplier_payments p
      LEFT JOIN supplier_bills b ON b.id = p.bill_id
      WHERE p.supplier_id = ?
      ORDER BY p.payment_date DESC, p.created_at DESC
      LIMIT ? OFFSET ?
    `).all(supplierId, limit, offset).map(mapSupplierPayment);
    const total = db.prepare('SELECT COUNT(*) as count FROM supplier_payments WHERE supplier_id = ?')
      .get(supplierId).count;
    return { items, total, limit, offset };
  }

  create(data) {
    const id = generateId();
    const now = nowIso();
    getDatabase().prepare(`
      INSERT INTO supplier_payments (
        id, supplier_id, bill_id, payment_date, method, amount, reference, notes, created_by, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      data.supplierId,
      data.billId || null,
      data.paymentDate || now.slice(0, 10),
      data.method,
      Number(data.amount),
      data.reference || null,
      data.notes || null,
      data.createdBy || null,
      now
    );
    return mapSupplierPayment(getDatabase().prepare(`
      SELECT p.*, b.bill_number FROM supplier_payments p
      LEFT JOIN supplier_bills b ON b.id = p.bill_id WHERE p.id = ?
    `).get(id));
  }

  buildStatement(supplierId, { dateFrom = '', dateTo = '' } = {}) {
    const db = getDatabase();
    const billParams = [supplierId];
    const payParams = [supplierId];
    let billFilter = '';
    let payFilter = '';
    if (dateFrom) {
      billFilter += ' AND bill_date >= ?';
      payFilter += ' AND payment_date >= ?';
      billParams.push(dateFrom);
      payParams.push(dateFrom);
    }
    if (dateTo) {
      billFilter += ' AND bill_date <= ?';
      payFilter += ' AND payment_date <= ?';
      billParams.push(dateTo);
      payParams.push(dateTo);
    }

    const bills = db.prepare(`
      SELECT id, bill_number, grand_total, bill_date, created_at
      FROM supplier_bills
      WHERE supplier_id = ? AND status != 'cancelled' ${billFilter}
      ORDER BY bill_date ASC
    `).all(...billParams);

    const payments = db.prepare(`
      SELECT id, amount, payment_date, method, reference, created_at, bill_id
      FROM supplier_payments
      WHERE supplier_id = ? ${payFilter}
      ORDER BY payment_date ASC
    `).all(...payParams);

    const lines = [];
    for (const b of bills) {
      lines.push({
        date: b.bill_date || b.created_at,
        type: 'bill',
        reference: b.bill_number,
        description: `Purchase bill ${b.bill_number}`,
        debit: Number(b.grand_total || 0),
        credit: 0,
        recordId: b.id,
      });
    }
    for (const p of payments) {
      lines.push({
        date: p.payment_date || p.created_at,
        type: 'payment',
        reference: p.reference || p.method,
        description: `Payment (${p.method})`,
        debit: 0,
        credit: Number(p.amount || 0),
        recordId: p.id,
      });
    }
    lines.sort((a, b) => (a.date < b.date ? -1 : 1));
    let balance = 0;
    const withBalance = lines.map((line) => {
      balance += line.debit - line.credit;
      return { ...line, balance: Math.round((balance + Number.EPSILON) * 100) / 100 };
    });
    return {
      lines: withBalance,
      closingBalance: Math.round((balance + Number.EPSILON) * 100) / 100,
    };
  }
}
