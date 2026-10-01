import { getDatabase } from '../../database/connection.js';

function num(v) {
  return Math.round((Number(v || 0) + Number.EPSILON) * 100) / 100;
}

function round2(v) {
  return Math.round((Number(v || 0) + Number.EPSILON) * 100) / 100;
}

/**
 * Build optional filter SQL fragments for CEO aggregates.
 * Filters attach to aliases: s=pos_sales, p=products, i=sale items when joined.
 */
function saleFilters(filters = {}, { saleAlias = 's', productAlias = 'p' } = {}) {
  const clauses = [];
  const params = [];
  if (filters.warehouseId) {
    clauses.push(`${saleAlias}.warehouse_id = ?`);
    params.push(filters.warehouseId);
  }
  if (filters.salespersonId) {
    clauses.push(`${saleAlias}.created_by = ?`);
    params.push(filters.salespersonId);
  }
  if (filters.categoryId) {
    clauses.push(`${productAlias}.category_id = ?`);
    params.push(filters.categoryId);
  }
  if (filters.brandId) {
    clauses.push(`${productAlias}.brand_id = ?`);
    params.push(filters.brandId);
  }
  return {
    sql: clauses.length ? ` AND ${clauses.join(' AND ')}` : '',
    params,
  };
}

/**
 * Read-only CEO metrics from existing transactional tables.
 * Aggregates at query time — no duplicate fact tables.
 */
export class CeoDashboardRepository {
  getSettingNumber(key, fallback) {
    const row = getDatabase().prepare('SELECT value FROM system_settings WHERE key = ?').get(key);
    if (!row) return fallback;
    const n = Number(row.value);
    return Number.isFinite(n) ? n : fallback;
  }

  getCeoSettings() {
    return {
      deadStockDays: this.getSettingNumber('ceo.dead_stock_days', 90),
      slowMovingMaxQty: this.getSettingNumber('ceo.slow_moving_max_qty', 2),
      minMarginPercent: this.getSettingNumber('ceo.min_margin_percent', 10),
      unusualDiscountPercent: this.getSettingNumber('ceo.unusual_discount_percent', 25),
      overdueReceivableAlertAmount: this.getSettingNumber('ceo.overdue_receivable_alert_amount', 50000),
      costingMethod: (() => {
        const row = getDatabase().prepare('SELECT value FROM system_settings WHERE key = ?').get('ceo.costing_method');
        return row?.value || 'purchase_price';
      })(),
      refreshSeconds: this.getSettingNumber('ceo.refresh_seconds', 60),
      healthWeights: {
        salesTrend: this.getSettingNumber('ceo.health.weight.sales_trend', 20),
        grossProfit: this.getSettingNumber('ceo.health.weight.gross_profit', 20),
        cashFlow: this.getSettingNumber('ceo.health.weight.cash_flow', 15),
        receivables: this.getSettingNumber('ceo.health.weight.receivables', 15),
        payables: this.getSettingNumber('ceo.health.weight.payables', 10),
        inventory: this.getSettingNumber('ceo.health.weight.inventory', 20),
      },
    };
  }

  listFilterOptions() {
    const db = getDatabase();
    return {
      companies: db.prepare(`
        SELECT id, business_name as name FROM companies ORDER BY created_at ASC
      `).all(),
      warehouses: db.prepare(`
        SELECT id, code, name FROM warehouses WHERE is_active = 1 ORDER BY name
      `).all(),
      categories: db.prepare(`
        SELECT id, name FROM categories WHERE is_active = 1 ORDER BY name
      `).all(),
      brands: db.prepare(`
        SELECT id, name FROM brands WHERE is_active = 1 ORDER BY name
      `).all(),
      salespersons: db.prepare(`
        SELECT DISTINCT u.id, u.full_name as name
        FROM users u
        INNER JOIN pos_sales s ON s.created_by = u.id
        WHERE u.is_active = 1
        ORDER BY u.full_name
      `).all(),
      salesAgents: (() => {
        try {
          return db.prepare(`
            SELECT id, name, agent_code as code FROM sales_agents WHERE status = 'active' ORDER BY name
          `).all();
        } catch {
          return [];
        }
      })(),
      branches: [], // reserved — no branch table yet
      firms: db.prepare(`
        SELECT id, business_name as name FROM companies ORDER BY created_at ASC
      `).all(),
    };
  }

  salesTotals(dateFrom, dateTo, filters = {}) {
    const needsProduct = Boolean(filters.categoryId || filters.brandId);
    const f = saleFilters(filters);
    let sql;
    let params;
    if (needsProduct) {
      sql = `
        SELECT
          COUNT(DISTINCT s.id) as invoice_count,
          COALESCE(SUM(DISTINCT s.id || ':' || s.grand_total), 0) as _skip,
          COALESCE(SUM(s.grand_total), 0) as sales_total,
          COALESCE(SUM(s.taxable_amount), 0) as taxable_total,
          COALESCE(SUM(s.gst_amount), 0) as gst_total,
          COALESCE(SUM(s.amount_paid), 0) as collected_total,
          COALESCE(SUM(s.amount_credit), 0) as credit_total,
          COALESCE(SUM(s.item_discount_total + s.invoice_discount), 0) as discount_total
        FROM pos_sales s
        WHERE s.id IN (
          SELECT DISTINCT s2.id
          FROM pos_sales s2
          INNER JOIN pos_sale_items i ON i.sale_id = s2.id
          INNER JOIN products p ON p.id = i.product_id
          WHERE s2.status != 'voided'
            AND s2.created_at >= ? AND s2.created_at < ?
            ${saleFilters(filters, { saleAlias: 's2' }).sql}
        )
      `;
      // Cleaner approach — aggregate from filtered sale ids
      const idSql = `
        SELECT DISTINCT s.id
        FROM pos_sales s
        INNER JOIN pos_sale_items i ON i.sale_id = s.id
        INNER JOIN products p ON p.id = i.product_id
        WHERE s.status != 'voided'
          AND s.created_at >= ? AND s.created_at < ?
          ${f.sql}
      `;
      const ids = getDatabase().prepare(idSql).all(dateFrom, dateTo, ...f.params).map((r) => r.id);
      if (!ids.length) {
        return {
          invoiceCount: 0, salesTotal: 0, taxableTotal: 0, gstTotal: 0,
          collectedTotal: 0, creditTotal: 0, discountTotal: 0, grossSales: 0, netSales: 0,
        };
      }
      const placeholders = ids.map(() => '?').join(',');
      const row = getDatabase().prepare(`
        SELECT
          COUNT(*) as invoice_count,
          COALESCE(SUM(grand_total), 0) as sales_total,
          COALESCE(SUM(taxable_amount), 0) as taxable_total,
          COALESCE(SUM(gst_amount), 0) as gst_total,
          COALESCE(SUM(amount_paid), 0) as collected_total,
          COALESCE(SUM(amount_credit), 0) as credit_total,
          COALESCE(SUM(item_discount_total + invoice_discount), 0) as discount_total,
          COALESCE(SUM(subtotal), 0) as gross_sales
        FROM pos_sales
        WHERE id IN (${placeholders})
      `).get(...ids);
      const returns = this.salesReturnsTotals(dateFrom, dateTo, filters);
      const grossSales = num(row?.gross_sales || row?.sales_total);
      const salesTotal = num(row?.sales_total);
      return {
        invoiceCount: num(row?.invoice_count),
        salesTotal,
        taxableTotal: num(row?.taxable_total),
        gstTotal: num(row?.gst_total),
        collectedTotal: num(row?.collected_total),
        creditTotal: num(row?.credit_total),
        discountTotal: num(row?.discount_total),
        grossSales,
        returnsTotal: returns.returnsTotal,
        netSales: round2(salesTotal - returns.returnsTotal),
      };
    }

    const wh = [];
    const p = [dateFrom, dateTo];
    if (filters.warehouseId) {
      wh.push('AND warehouse_id = ?');
      p.push(filters.warehouseId);
    }
    if (filters.salespersonId) {
      wh.push('AND created_by = ?');
      p.push(filters.salespersonId);
    }
    const row = getDatabase().prepare(`
      SELECT
        COUNT(*) as invoice_count,
        COALESCE(SUM(grand_total), 0) as sales_total,
        COALESCE(SUM(taxable_amount), 0) as taxable_total,
        COALESCE(SUM(gst_amount), 0) as gst_total,
        COALESCE(SUM(amount_paid), 0) as collected_total,
        COALESCE(SUM(amount_credit), 0) as credit_total,
        COALESCE(SUM(item_discount_total + invoice_discount), 0) as discount_total,
        COALESCE(SUM(subtotal), 0) as gross_sales
      FROM pos_sales
      WHERE status != 'voided'
        AND created_at >= ? AND created_at < ?
        ${wh.join(' ')}
    `).get(...p);
    const returns = this.salesReturnsTotals(dateFrom, dateTo, filters);
    const salesTotal = num(row?.sales_total);
    return {
      invoiceCount: num(row?.invoice_count),
      salesTotal,
      taxableTotal: num(row?.taxable_total),
      gstTotal: num(row?.gst_total),
      collectedTotal: num(row?.collected_total),
      creditTotal: num(row?.credit_total),
      discountTotal: num(row?.discount_total),
      grossSales: num(row?.gross_sales || salesTotal),
      returnsTotal: returns.returnsTotal,
      netSales: round2(salesTotal - returns.returnsTotal),
    };
  }

  salesReturnsTotals(dateFrom, dateTo, filters = {}) {
    const wh = [];
    const p = [dateFrom, dateTo];
    // returns don't always have warehouse; join via sale when filtering
    if (filters.warehouseId || filters.salespersonId) {
      if (filters.warehouseId) {
        wh.push('AND s.warehouse_id = ?');
        p.push(filters.warehouseId);
      }
      if (filters.salespersonId) {
        wh.push('AND s.created_by = ?');
        p.push(filters.salespersonId);
      }
      const row = getDatabase().prepare(`
        SELECT COUNT(*) as return_count, COALESCE(SUM(r.grand_total), 0) as returns_total
        FROM pos_sales_returns r
        INNER JOIN pos_sales s ON s.id = r.sale_id
        WHERE r.status = 'completed'
          AND r.created_at >= ? AND r.created_at < ?
          ${wh.join(' ')}
      `).get(...p);
      return { returnCount: num(row?.return_count), returnsTotal: num(row?.returns_total) };
    }
    const row = getDatabase().prepare(`
      SELECT COUNT(*) as return_count, COALESCE(SUM(grand_total), 0) as returns_total
      FROM pos_sales_returns
      WHERE status = 'completed'
        AND created_at >= ? AND created_at < ?
    `).get(dateFrom, dateTo);
    return { returnCount: num(row?.return_count), returnsTotal: num(row?.returns_total) };
  }

  purchasesTotals(dateFrom, dateTo, filters = {}) {
    // Supplier bills are not warehouse-scoped in current schema
    void filters;
    const row = getDatabase().prepare(`
      SELECT
        COUNT(*) as bill_count,
        COALESCE(SUM(grand_total), 0) as purchase_total
      FROM supplier_bills
      WHERE status != 'cancelled'
        AND datetime(COALESCE(bill_date || 'T00:00:00.000Z', created_at)) >= datetime(?)
        AND datetime(COALESCE(bill_date || 'T00:00:00.000Z', created_at)) < datetime(?)
    `).get(dateFrom, dateTo);
    return {
      billCount: num(row?.bill_count),
      purchaseTotal: num(row?.purchase_total),
    };
  }

  estimatedGrossProfit(dateFrom, dateTo, filters = {}) {
    const f = saleFilters(filters);
    const needsJoin = Boolean(filters.categoryId || filters.brandId || filters.warehouseId || filters.salespersonId);
    const row = getDatabase().prepare(`
      SELECT
        COALESCE(SUM(i.taxable_amount), 0) as revenue,
        COALESCE(SUM(i.quantity * COALESCE(p.purchase_price, 0)), 0) as cogs,
        COALESCE(SUM(i.discount_amount), 0) as discount_total
      FROM pos_sale_items i
      INNER JOIN pos_sales s ON s.id = i.sale_id
      LEFT JOIN products p ON p.id = i.product_id
      WHERE s.status != 'voided'
        AND s.created_at >= ? AND s.created_at < ?
        ${needsJoin || true ? f.sql : ''}
    `).get(dateFrom, dateTo, ...f.params);
    const revenue = num(row?.revenue);
    const cogs = num(row?.cogs);
    const gp = round2(revenue - cogs);
    const margin = revenue > 0 ? round2((gp / revenue) * 100) : 0;
    return {
      revenue,
      estimatedCogs: cogs,
      estimatedGrossProfit: gp,
      grossMarginPercent: margin,
      discountTotal: num(row?.discount_total),
      costingMethod: 'purchase_price',
      costingNote: 'Estimated COGS uses current products.purchase_price (configured costing method). Not historical FIFO/WAC.',
    };
  }

  cashCollections(dateFrom, dateTo, filters = {}) {
    const wh = [];
    const p = [dateFrom, dateTo];
    if (filters.warehouseId) {
      wh.push('AND s.warehouse_id = ?');
      p.push(filters.warehouseId);
    }
    if (filters.salespersonId) {
      wh.push('AND s.created_by = ?');
      p.push(filters.salespersonId);
    }
    const rows = getDatabase().prepare(`
      SELECT pay.method, COALESCE(SUM(pay.amount), 0) as total, COUNT(*) as txn_count
      FROM pos_payments pay
      INNER JOIN pos_sales s ON s.id = pay.sale_id
      WHERE s.status != 'voided'
        AND pay.method IN ('cash', 'upi', 'bank')
        AND pay.created_at >= ? AND pay.created_at < ?
        ${wh.join(' ')}
      GROUP BY pay.method
    `).all(...p);
    const byMethod = { cash: 0, upi: 0, bank: 0 };
    const counts = { cash: 0, upi: 0, bank: 0 };
    for (const r of rows) {
      byMethod[r.method] = num(r.total);
      counts[r.method] = num(r.txn_count);
    }
    const total = round2(byMethod.cash + byMethod.upi + byMethod.bank);
    return { total, byMethod, counts };
  }

  supplierPaymentsByMethod(dateFrom, dateTo) {
    const rows = getDatabase().prepare(`
      SELECT method, COALESCE(SUM(amount), 0) as total, COUNT(*) as txn_count
      FROM supplier_payments
      WHERE datetime(COALESCE(payment_date || 'T00:00:00.000Z', created_at)) >= datetime(?)
        AND datetime(COALESCE(payment_date || 'T00:00:00.000Z', created_at)) < datetime(?)
      GROUP BY method
    `).all(dateFrom, dateTo);
    const byMethod = { cash: 0, upi: 0, bank: 0, cheque: 0, other: 0, card: 0 };
    const counts = { cash: 0, upi: 0, bank: 0, cheque: 0, other: 0, card: 0 };
    for (const r of rows) {
      const m = r.method || 'other';
      byMethod[m] = (byMethod[m] || 0) + num(r.total);
      counts[m] = (counts[m] || 0) + num(r.txn_count);
    }

    // Include posted supplier payment vouchers
    try {
      const pvRows = getDatabase().prepare(`
        SELECT payment_mode as method, COALESCE(SUM(amount), 0) as total, COUNT(*) as txn_count
        FROM supplier_payment_vouchers
        WHERE status = 'posted'
          AND payment_date >= date(?)
          AND payment_date < date(?)
        GROUP BY payment_mode
      `).all(String(dateFrom).slice(0, 10), String(dateTo).slice(0, 10));
      for (const r of pvRows) {
        const m = r.method || 'other';
        byMethod[m] = (byMethod[m] || 0) + num(r.total);
        counts[m] = (counts[m] || 0) + num(r.txn_count);
      }
    } catch {
      // migration not applied
    }

    return { byMethod, counts, total: round2(Object.values(byMethod).reduce((a, b) => a + b, 0)) };
  }

  customerReceiptsByMethod(dateFrom, dateTo) {
    try {
      const rows = getDatabase().prepare(`
        SELECT payment_mode as method, COALESCE(SUM(amount), 0) as total, COUNT(*) as txn_count
        FROM customer_receipts
        WHERE status = 'posted'
          AND receipt_date >= date(?)
          AND receipt_date < date(?)
        GROUP BY payment_mode
      `).all(String(dateFrom).slice(0, 10), String(dateTo).slice(0, 10));
      const byMethod = { cash: 0, upi: 0, bank: 0, cheque: 0, card: 0, other: 0 };
      const counts = { cash: 0, upi: 0, bank: 0, cheque: 0, card: 0, other: 0 };
      for (const r of rows) {
        const m = r.method || 'other';
        byMethod[m] = num(r.total);
        counts[m] = num(r.txn_count);
      }
      return { byMethod, counts, total: round2(Object.values(byMethod).reduce((a, b) => a + b, 0)) };
    } catch {
      return { byMethod: { cash: 0, upi: 0, bank: 0 }, counts: {}, total: 0 };
    }
  }

  cashBookFlows(dateFrom, dateTo) {
    try {
      const rows = getDatabase().prepare(`
        SELECT a.account_type, e.direction, COALESCE(SUM(e.amount), 0) as total
        FROM cash_book_entries e
        JOIN financial_payment_accounts a ON a.id = e.payment_account_id
        WHERE e.status = 'posted'
          AND e.entry_date >= date(?)
          AND e.entry_date < date(?)
        GROUP BY a.account_type, e.direction
      `).all(String(dateFrom).slice(0, 10), String(dateTo).slice(0, 10));
      const out = {
        cash: { in: 0, out: 0 },
        bank: { in: 0, out: 0 },
        upi: { in: 0, out: 0 },
      };
      for (const r of rows) {
        const key = out[r.account_type] ? r.account_type : null;
        if (!key) continue;
        if (r.direction === 'in') out[key].in = num(r.total);
        else out[key].out = num(r.total);
      }
      return out;
    } catch {
      return { cash: { in: 0, out: 0 }, bank: { in: 0, out: 0 }, upi: { in: 0, out: 0 } };
    }
  }

  cashFlowSummary(dateFrom, dateTo, filters = {}) {
    const collections = this.cashCollections(dateFrom, dateTo, filters);
    const supplier = this.supplierPaymentsByMethod(dateFrom, dateTo);
    const receipts = this.customerReceiptsByMethod(dateFrom, dateTo);
    const book = this.cashBookFlows(dateFrom, dateTo);
    const cashIn = {
      cashSales: collections.byMethod.cash,
      customerCashPayments: receipts.byMethod.cash || 0,
      otherCashReceipts: book.cash.in,
      total: round2(collections.byMethod.cash + (receipts.byMethod.cash || 0)),
    };
    const cashOut = {
      supplierCashPayments: supplier.byMethod.cash || 0,
      cashBookOut: book.cash.out,
      expenses: 0,
      otherCashPayments: 0,
      total: round2((supplier.byMethod.cash || 0) + book.cash.out),
    };
    const openingCash = null;
    const closingCash = null;
    return {
      openingCash,
      cashIn,
      cashOut,
      closingCash,
      periodNetCash: round2(cashIn.total - cashOut.total),
      receiptsTotal: receipts.total,
      supplierPaymentsTotal: supplier.total,
      cashBook: book,
      note: 'Includes POS cash tenders, posted customer receipts (RV), supplier payments (legacy + PV), and cash_book_entries.',
    };
  }

  upiFlowSummary(dateFrom, dateTo, filters = {}) {
    const collections = this.cashCollections(dateFrom, dateTo, filters);
    const supplier = this.supplierPaymentsByMethod(dateFrom, dateTo);
    const received = collections.byMethod.upi;
    const paid = supplier.byMethod.upi || 0;
    return {
      upiReceived: received,
      upiPaid: paid,
      netUpiFlow: round2(received - paid),
      receivedCount: collections.counts.upi,
      paidCount: supplier.counts.upi || 0,
      transactionCount: (collections.counts.upi || 0) + (supplier.counts.upi || 0),
    };
  }

  recentUpiTransactions(limit = 20) {
    const db = getDatabase();
    const inflows = db.prepare(`
      SELECT 'in' as direction, pay.amount, pay.reference, pay.created_at as at,
             s.invoice_number as reference_doc, 'POS sale' as label, c.name as party_name
      FROM pos_payments pay
      INNER JOIN pos_sales s ON s.id = pay.sale_id
      LEFT JOIN customers c ON c.id = s.customer_id
      WHERE s.status != 'voided' AND pay.method = 'upi'
      ORDER BY pay.created_at DESC LIMIT ?
    `).all(limit);
    const outflows = db.prepare(`
      SELECT 'out' as direction, amount, reference, COALESCE(payment_date, created_at) as at,
             COALESCE(reference, id) as reference_doc, 'Supplier payment' as label,
             (SELECT name FROM suppliers WHERE id = supplier_id) as party_name
      FROM supplier_payments
      WHERE method = 'upi'
      ORDER BY created_at DESC LIMIT ?
    `).all(limit);
    return [...inflows, ...outflows]
      .sort((a, b) => (a.at < b.at ? 1 : -1))
      .slice(0, limit)
      .map((r) => ({
        direction: r.direction,
        amount: num(r.amount),
        reference: r.reference,
        referenceDoc: r.reference_doc,
        label: r.label,
        partyName: r.party_name,
        at: r.at,
      }));
  }

  inventoryValue(filters = {}) {
    const wh = [];
    const p = [];
    if (filters.warehouseId) {
      wh.push('AND s.warehouse_id = ?');
      p.push(filters.warehouseId);
    }
    if (filters.categoryId) {
      wh.push('AND p.category_id = ?');
      p.push(filters.categoryId);
    }
    if (filters.brandId) {
      wh.push('AND p.brand_id = ?');
      p.push(filters.brandId);
    }
    const row = getDatabase().prepare(`
      SELECT
        COALESCE(SUM(s.quantity_on_hand * COALESCE(p.purchase_price, 0)), 0) as at_cost,
        COALESCE(SUM(s.quantity_on_hand * COALESCE(p.selling_price, 0)), 0) as at_selling,
        COALESCE(SUM(s.quantity_on_hand), 0) as units,
        COALESCE(SUM(s.quantity_available), 0) as available,
        COALESCE(SUM(s.quantity_reserved), 0) as reserved,
        COUNT(DISTINCT s.product_id) as sku_count
      FROM stock_levels s
      INNER JOIN products p ON p.id = s.product_id
      WHERE s.quantity_on_hand != 0 AND p.is_active = 1
        ${wh.join(' ')}
    `).get(...p);
    return {
      atCost: num(row?.at_cost),
      atSelling: num(row?.at_selling),
      units: num(row?.units),
      available: num(row?.available),
      reserved: num(row?.reserved),
      skuCount: num(row?.sku_count),
    };
  }

  inventoryByDimension(dimension = 'category', filters = {}) {
    const joinCol = dimension === 'brand' ? 'b' : dimension === 'warehouse' ? 'w' : 'c';
    let selectName;
    let join;
    let group;
    if (dimension === 'brand') {
      selectName = 'b.name';
      join = 'LEFT JOIN brands b ON b.id = p.brand_id';
      group = 'b.id, b.name';
    } else if (dimension === 'warehouse') {
      selectName = 'w.name';
      join = 'INNER JOIN warehouses w ON w.id = s.warehouse_id';
      group = 'w.id, w.name';
    } else {
      selectName = 'c.name';
      join = 'LEFT JOIN categories c ON c.id = p.category_id';
      group = 'c.id, c.name';
    }
    const wh = [];
    const params = [];
    if (filters.warehouseId && dimension !== 'warehouse') {
      wh.push('AND s.warehouse_id = ?');
      params.push(filters.warehouseId);
    }
    return getDatabase().prepare(`
      SELECT
        COALESCE(${selectName}, 'Unassigned') as name,
        COALESCE(SUM(s.quantity_on_hand * COALESCE(p.purchase_price, 0)), 0) as value,
        COALESCE(SUM(s.quantity_on_hand), 0) as units
      FROM stock_levels s
      INNER JOIN products p ON p.id = s.product_id
      ${join}
      WHERE p.is_active = 1 AND s.quantity_on_hand > 0
        ${wh.join(' ')}
      GROUP BY ${group}
      ORDER BY value DESC
      LIMIT 12
    `).all(...params).map((r) => ({
      name: r.name,
      value: num(r.value),
      units: num(r.units),
    }));
  }

  inventoryHealthCounts(settings, filters = {}) {
    const db = getDatabase();
    const deadDays = settings.deadStockDays || 90;
    const wh = filters.warehouseId ? 'AND s.warehouse_id = ?' : '';
    const params = filters.warehouseId ? [filters.warehouseId] : [];

    const lowStock = db.prepare(`
      SELECT COUNT(*) as count FROM (
        SELECT p.id
        FROM products p
        LEFT JOIN stock_levels s ON s.product_id = p.id ${filters.warehouseId ? 'AND s.warehouse_id = ?' : ''}
        WHERE p.is_active = 1
        GROUP BY p.id
        HAVING COALESCE(SUM(s.quantity_available), 0) <= CASE
          WHEN p.reorder_level > 0 THEN p.reorder_level
          ELSE COALESCE(p.minimum_stock, 0)
        END
      )
    `).get(...params)?.count || 0;

    const outOfStock = db.prepare(`
      SELECT COUNT(*) as count FROM (
        SELECT p.id
        FROM products p
        LEFT JOIN stock_levels s ON s.product_id = p.id ${filters.warehouseId ? 'AND s.warehouse_id = ?' : ''}
        WHERE p.is_active = 1
        GROUP BY p.id
        HAVING COALESCE(SUM(s.quantity_available), 0) <= 0
      )
    `).get(...params)?.count || 0;

    const negativeStock = db.prepare(`
      SELECT COUNT(*) as count FROM stock_levels s
      INNER JOIN products p ON p.id = s.product_id
      WHERE p.is_active = 1 AND s.quantity_on_hand < -0.001
        ${wh}
    `).get(...params)?.count || 0;

    const deadStock = db.prepare(`
      SELECT COUNT(*) as count FROM (
        SELECT p.id
        FROM products p
        INNER JOIN stock_levels s ON s.product_id = p.id
        LEFT JOIN (
          SELECT product_id, MAX(created_at) as last_sale_at
          FROM inventory_movements
          WHERE movement_type = 'pos_sale' AND status = 'completed'
          GROUP BY product_id
        ) m ON m.product_id = p.id
        WHERE p.is_active = 1 ${wh}
        GROUP BY p.id
        HAVING SUM(s.quantity_on_hand) > 0.001
          AND (m.last_sale_at IS NULL OR m.last_sale_at < datetime('now', ?))
      )
    `).get(...params, `-${deadDays} days`)?.count || 0;

    return {
      lowStock: num(lowStock),
      outOfStock: num(outOfStock),
      negativeStock: num(negativeStock),
      deadStock: num(deadStock),
      stockAccuracyNote: 'Accuracy requires completed stock counts; open counts shown in alerts.',
    };
  }

  receivables() {
    const row = getDatabase().prepare(`
      SELECT
        COALESCE(SUM(outstanding_balance), 0) as total,
        COUNT(*) as customer_count
      FROM customers
      WHERE is_active = 1 AND outstanding_balance > 0.001 AND is_walk_in = 0
    `).get();
    return { total: num(row?.total), customerCount: num(row?.customer_count) };
  }

  payables() {
    const row = getDatabase().prepare(`
      SELECT
        COALESCE(SUM(outstanding_payable), 0) as total,
        COUNT(*) as supplier_count
      FROM suppliers
      WHERE is_active = 1 AND outstanding_payable > 0.001
    `).get();
    return { total: num(row?.total), supplierCount: num(row?.supplier_count) };
  }

  /**
   * AR aging from open credit balances by due_date (fallback invoice date).
   * Buckets: current, 1-30, 31-60, 61-90, 91-180, 180+
   */
  receivablesAging() {
    const rows = getDatabase().prepare(`
      SELECT
        CASE
          WHEN julianday('now') - julianday(COALESCE(due_date, date(COALESCE(completed_at, created_at)))) <= 0 THEN 'current'
          WHEN julianday('now') - julianday(COALESCE(due_date, date(COALESCE(completed_at, created_at)))) <= 30 THEN '1-30'
          WHEN julianday('now') - julianday(COALESCE(due_date, date(COALESCE(completed_at, created_at)))) <= 60 THEN '31-60'
          WHEN julianday('now') - julianday(COALESCE(due_date, date(COALESCE(completed_at, created_at)))) <= 90 THEN '61-90'
          WHEN julianday('now') - julianday(COALESCE(due_date, date(COALESCE(completed_at, created_at)))) <= 180 THEN '91-180'
          ELSE '180+'
        END as bucket,
        COALESCE(SUM(amount_credit), 0) as amount,
        COUNT(*) as invoice_count
      FROM pos_sales
      WHERE status != 'voided' AND amount_credit > 0.001
      GROUP BY bucket
    `).all();
    const buckets = { current: 0, '1-30': 0, '31-60': 0, '61-90': 0, '91-180': 0, '180+': 0 };
    const counts = { current: 0, '1-30': 0, '31-60': 0, '61-90': 0, '91-180': 0, '180+': 0 };
    // legacy keys for older UI
    const legacy = { '0-30': 0, '31-60': 0, '61-90': 0, '90+': 0 };
    for (const r of rows) {
      if (buckets[r.bucket] != null) {
        buckets[r.bucket] = num(r.amount);
        counts[r.bucket] = num(r.invoice_count);
      }
    }
    legacy['0-30'] = round2(buckets.current + buckets['1-30']);
    legacy['31-60'] = buckets['31-60'];
    legacy['61-90'] = buckets['61-90'];
    legacy['90+'] = round2(buckets['91-180'] + buckets['180+']);
    const overdue = round2(buckets['1-30'] + buckets['31-60'] + buckets['61-90'] + buckets['91-180'] + buckets['180+']);
    return {
      buckets: { ...legacy, ...buckets },
      counts,
      total: round2(Object.values(buckets).reduce((a, b) => a + b, 0)),
      overdue,
      dueToday: buckets.current,
      upcoming: buckets.current,
      note: 'Aging from due_date (or invoice date). Open amount_credit only.',
    };
  }

  payablesAging() {
    const rows = getDatabase().prepare(`
      SELECT
        CASE
          WHEN due_date IS NOT NULL AND date(due_date) < date('now') THEN
            CASE
              WHEN julianday('now') - julianday(due_date) <= 30 THEN '0-30'
              WHEN julianday('now') - julianday(due_date) <= 60 THEN '31-60'
              WHEN julianday('now') - julianday(due_date) <= 90 THEN '61-90'
              ELSE '90+'
            END
          WHEN due_date IS NOT NULL AND date(due_date) = date('now') THEN '0-30'
          WHEN due_date IS NOT NULL AND date(due_date) > date('now') THEN '0-30'
          ELSE
            CASE
              WHEN julianday('now') - julianday(COALESCE(bill_date, created_at)) <= 30 THEN '0-30'
              WHEN julianday('now') - julianday(COALESCE(bill_date, created_at)) <= 60 THEN '31-60'
              WHEN julianday('now') - julianday(COALESCE(bill_date, created_at)) <= 90 THEN '61-90'
              ELSE '90+'
            END
        END as bucket,
        COALESCE(SUM(amount_payable), 0) as amount,
        COUNT(*) as bill_count,
        SUM(CASE WHEN due_date IS NOT NULL AND date(due_date) = date('now') THEN amount_payable ELSE 0 END) as due_today,
        SUM(CASE WHEN due_date IS NOT NULL AND date(due_date) > date('now') AND date(due_date) <= date('now', '+7 days') THEN amount_payable ELSE 0 END) as upcoming
      FROM supplier_bills
      WHERE status != 'cancelled' AND amount_payable > 0.001
      GROUP BY bucket
    `).all();
    const buckets = { '0-30': 0, '31-60': 0, '61-90': 0, '90+': 0 };
    const counts = { '0-30': 0, '31-60': 0, '61-90': 0, '90+': 0 };
    let dueToday = 0;
    let upcoming = 0;
    for (const r of rows) {
      buckets[r.bucket] = num(r.amount);
      counts[r.bucket] = num(r.bill_count);
      dueToday += num(r.due_today);
      upcoming += num(r.upcoming);
    }
    const overdueRow = getDatabase().prepare(`
      SELECT COALESCE(SUM(amount_payable), 0) as amount
      FROM supplier_bills
      WHERE status != 'cancelled' AND amount_payable > 0.001
        AND due_date IS NOT NULL AND date(due_date) < date('now')
    `).get();
    return {
      buckets,
      counts,
      total: round2(Object.values(buckets).reduce((a, b) => a + b, 0)),
      overdue: num(overdueRow?.amount),
      dueToday: round2(dueToday),
      upcoming: round2(upcoming),
    };
  }

  listReceivableCustomers({ bucket, limit = 50 } = {}) {
    // List customers with outstanding; optional bucket filter via their open credit invoices
    if (!bucket) {
      return getDatabase().prepare(`
        SELECT id, code, name, outstanding_balance, credit_limit, phone
        FROM customers
        WHERE is_active = 1 AND is_walk_in = 0 AND outstanding_balance > 0.001
        ORDER BY outstanding_balance DESC
        LIMIT ?
      `).all(limit).map((r) => ({
        id: r.id,
        code: r.code,
        name: r.name,
        outstanding: num(r.outstanding_balance),
        creditLimit: num(r.credit_limit),
        phone: r.phone,
      }));
    }
    return getDatabase().prepare(`
      SELECT c.id, c.code, c.name,
             COALESCE(SUM(s.amount_credit), 0) as outstanding,
             c.credit_limit, c.phone
      FROM pos_sales s
      INNER JOIN customers c ON c.id = s.customer_id
      WHERE s.status != 'voided' AND s.amount_credit > 0.001 AND c.is_walk_in = 0
        AND CASE
          WHEN julianday('now') - julianday(COALESCE(s.completed_at, s.created_at)) <= 30 THEN '0-30'
          WHEN julianday('now') - julianday(COALESCE(s.completed_at, s.created_at)) <= 60 THEN '31-60'
          WHEN julianday('now') - julianday(COALESCE(s.completed_at, s.created_at)) <= 90 THEN '61-90'
          ELSE '90+'
        END = ?
      GROUP BY c.id
      ORDER BY outstanding DESC
      LIMIT ?
    `).all(bucket, limit).map((r) => ({
      id: r.id,
      code: r.code,
      name: r.name,
      outstanding: num(r.outstanding),
      creditLimit: num(r.credit_limit),
      phone: r.phone,
    }));
  }

  listPayableSuppliers({ bucket, limit = 50 } = {}) {
    if (!bucket) {
      return getDatabase().prepare(`
        SELECT id, code, name, outstanding_payable, payment_terms, phone
        FROM suppliers
        WHERE is_active = 1 AND outstanding_payable > 0.001
        ORDER BY outstanding_payable DESC
        LIMIT ?
      `).all(limit).map((r) => ({
        id: r.id,
        code: r.code,
        name: r.name,
        outstanding: num(r.outstanding_payable),
        paymentTerms: r.payment_terms,
        phone: r.phone,
      }));
    }
    return getDatabase().prepare(`
      SELECT sp.id, sp.code, sp.name,
             COALESCE(SUM(b.amount_payable), 0) as outstanding,
             sp.payment_terms, sp.phone
      FROM supplier_bills b
      INNER JOIN suppliers sp ON sp.id = b.supplier_id
      WHERE b.status != 'cancelled' AND b.amount_payable > 0.001
        AND CASE
          WHEN b.due_date IS NOT NULL AND date(b.due_date) < date('now') THEN
            CASE
              WHEN julianday('now') - julianday(b.due_date) <= 30 THEN '0-30'
              WHEN julianday('now') - julianday(b.due_date) <= 60 THEN '31-60'
              WHEN julianday('now') - julianday(b.due_date) <= 90 THEN '61-90'
              ELSE '90+'
            END
          WHEN julianday('now') - julianday(COALESCE(b.bill_date, b.created_at)) <= 30 THEN '0-30'
          WHEN julianday('now') - julianday(COALESCE(b.bill_date, b.created_at)) <= 60 THEN '31-60'
          WHEN julianday('now') - julianday(COALESCE(b.bill_date, b.created_at)) <= 90 THEN '61-90'
          ELSE '90+'
        END = ?
      GROUP BY sp.id
      ORDER BY outstanding DESC
      LIMIT ?
    `).all(bucket, limit).map((r) => ({
      id: r.id,
      code: r.code,
      name: r.name,
      outstanding: num(r.outstanding),
      paymentTerms: r.payment_terms,
      phone: r.phone,
    }));
  }

  profitabilityByInvoice(dateFrom, dateTo, filters = {}, { limit = 50, sort = 'profit' } = {}) {
    const f = saleFilters(filters);
    const settings = this.getCeoSettings();
    const minMargin = settings.minMarginPercent;
    const rows = getDatabase().prepare(`
      SELECT
        s.id as sale_id,
        s.invoice_number,
        s.created_at,
        s.customer_id,
        c.name as customer_name,
        c.code as customer_code,
        s.grand_total,
        s.taxable_amount,
        (s.item_discount_total + s.invoice_discount) as discount_amount,
        COALESCE(SUM(i.taxable_amount), 0) as net_revenue,
        COALESCE(SUM(i.quantity * COALESCE(p.purchase_price, 0)), 0) as product_cost,
        COALESCE(SUM(i.discount_amount), 0) as item_discount
      FROM pos_sales s
      LEFT JOIN customers c ON c.id = s.customer_id
      INNER JOIN pos_sale_items i ON i.sale_id = s.id
      LEFT JOIN products p ON p.id = i.product_id
      WHERE s.status != 'voided'
        AND s.created_at >= ? AND s.created_at < ?
        ${f.sql}
      GROUP BY s.id
      ORDER BY s.created_at DESC
      LIMIT ?
    `).all(dateFrom, dateTo, ...f.params, Math.max(limit * 3, 150));

    const mapped = rows.map((r) => {
      const netRevenue = num(r.net_revenue);
      const productCost = num(r.product_cost);
      const grossProfit = round2(netRevenue - productCost);
      const margin = netRevenue > 0 ? round2((grossProfit / netRevenue) * 100) : 0;
      let classification = 'profitable';
      if (grossProfit < 0) classification = 'loss';
      else if (margin < minMargin) classification = 'low_margin';
      return {
        saleId: r.sale_id,
        invoiceNumber: r.invoice_number,
        date: r.created_at,
        customerId: r.customer_id,
        customerName: r.customer_name || 'Walk-in',
        customerCode: r.customer_code,
        sellingAmount: num(r.grand_total),
        discount: num(r.discount_amount),
        netRevenue,
        productCost,
        grossProfit,
        grossMarginPercent: margin,
        classification,
      };
    });

    const sorter = {
      profit: (a, b) => b.grossProfit - a.grossProfit,
      loss: (a, b) => a.grossProfit - b.grossProfit,
      margin: (a, b) => a.grossMarginPercent - b.grossMarginPercent,
      recent: (a, b) => (a.date < b.date ? 1 : -1),
    }[sort] || ((a, b) => b.grossProfit - a.grossProfit);

    const sorted = [...mapped].sort(sorter).slice(0, limit);
    return {
      items: sorted,
      summary: {
        profitable: mapped.filter((x) => x.classification === 'profitable').length,
        lowMargin: mapped.filter((x) => x.classification === 'low_margin').length,
        lossMaking: mapped.filter((x) => x.classification === 'loss').length,
        topProfit: [...mapped].sort((a, b) => b.grossProfit - a.grossProfit).slice(0, 5),
        topLoss: [...mapped].sort((a, b) => a.grossProfit - b.grossProfit).filter((x) => x.grossProfit < 0).slice(0, 5),
      },
    };
  }

  profitabilityByLine(dateFrom, dateTo, filters = {}, { limit = 100 } = {}) {
    const f = saleFilters(filters);
    const settings = this.getCeoSettings();
    return getDatabase().prepare(`
      SELECT
        s.id as sale_id,
        s.invoice_number,
        s.created_at,
        c.name as customer_name,
        i.product_id,
        i.product_name,
        i.sku,
        i.quantity,
        i.unit_price,
        i.discount_amount,
        i.taxable_amount as net_revenue,
        (i.quantity * COALESCE(p.purchase_price, 0)) as product_cost,
        i.line_total
      FROM pos_sale_items i
      INNER JOIN pos_sales s ON s.id = i.sale_id
      LEFT JOIN customers c ON c.id = s.customer_id
      LEFT JOIN products p ON p.id = i.product_id
      WHERE s.status != 'voided'
        AND s.created_at >= ? AND s.created_at < ?
        ${f.sql}
      ORDER BY s.created_at DESC
      LIMIT ?
    `).all(dateFrom, dateTo, ...f.params, limit).map((r) => {
      const netRevenue = num(r.net_revenue);
      const productCost = num(r.product_cost);
      const grossProfit = round2(netRevenue - productCost);
      const margin = netRevenue > 0 ? round2((grossProfit / netRevenue) * 100) : 0;
      return {
        saleId: r.sale_id,
        invoiceNumber: r.invoice_number,
        date: r.created_at,
        customerName: r.customer_name || 'Walk-in',
        productId: r.product_id,
        productName: r.product_name,
        sku: r.sku,
        quantity: num(r.quantity),
        sellingAmount: num(r.line_total),
        discount: num(r.discount_amount),
        netRevenue,
        productCost,
        grossProfit,
        grossMarginPercent: margin,
        classification: grossProfit < 0 ? 'loss' : margin < settings.minMarginPercent ? 'low_margin' : 'profitable',
      };
    });
  }

  salesPurchaseTrend(dateFrom, dateTo, granularity = 'daily', filters = {}) {
    const fmt = granularity === 'monthly'
      ? `%Y-%m`
      : granularity === 'weekly'
        ? `%Y-W%W`
        : `%Y-%m-%d`;

    const wh = [];
    const p = [dateFrom, dateTo];
    if (filters.warehouseId) {
      wh.push('AND warehouse_id = ?');
      p.push(filters.warehouseId);
    }
    if (filters.salespersonId) {
      wh.push('AND created_by = ?');
      p.push(filters.salespersonId);
    }

    const sales = getDatabase().prepare(`
      SELECT strftime('${fmt}', created_at) as period,
             COALESCE(SUM(grand_total), 0) as sales,
             COALESCE(SUM(taxable_amount), 0) as taxable
      FROM pos_sales
      WHERE status != 'voided' AND created_at >= ? AND created_at < ?
        ${wh.join(' ')}
      GROUP BY period
      ORDER BY period
    `).all(...p);

    const purchases = getDatabase().prepare(`
      SELECT strftime('${fmt}', COALESCE(bill_date, substr(created_at, 1, 10))) as period,
             COALESCE(SUM(grand_total), 0) as purchases
      FROM supplier_bills
      WHERE status != 'cancelled'
        AND datetime(COALESCE(bill_date || 'T00:00:00.000Z', created_at)) >= datetime(?)
        AND datetime(COALESCE(bill_date || 'T00:00:00.000Z', created_at)) < datetime(?)
      GROUP BY period
      ORDER BY period
    `).all(dateFrom, dateTo);

    const profitRows = getDatabase().prepare(`
      SELECT strftime('${fmt}', s.created_at) as period,
             COALESCE(SUM(i.taxable_amount), 0) - COALESCE(SUM(i.quantity * COALESCE(p.purchase_price, 0)), 0) as profit
      FROM pos_sale_items i
      INNER JOIN pos_sales s ON s.id = i.sale_id
      LEFT JOIN products p ON p.id = i.product_id
      WHERE s.status != 'voided' AND s.created_at >= ? AND s.created_at < ?
        ${wh.join(' ').replace(/warehouse_id/g, 's.warehouse_id').replace(/created_by/g, 's.created_by')}
      GROUP BY period
      ORDER BY period
    `).all(...p);

    const map = new Map();
    for (const r of sales) {
      map.set(r.period, { period: r.period, sales: num(r.sales), purchases: 0, profit: 0 });
    }
    for (const r of purchases) {
      const cur = map.get(r.period) || { period: r.period, sales: 0, purchases: 0, profit: 0 };
      cur.purchases = num(r.purchases);
      map.set(r.period, cur);
    }
    for (const r of profitRows) {
      const cur = map.get(r.period) || { period: r.period, sales: 0, purchases: 0, profit: 0 };
      cur.profit = num(r.profit);
      map.set(r.period, cur);
    }
    return [...map.values()].sort((a, b) => (a.period < b.period ? -1 : 1));
  }

  dailyCashFlow(dateFrom, dateTo, filters = {}) {
    const collections = getDatabase().prepare(`
      SELECT strftime('%Y-%m-%d', pay.created_at) as day,
             COALESCE(SUM(CASE WHEN pay.method = 'cash' THEN pay.amount ELSE 0 END), 0) as cash_in,
             COALESCE(SUM(CASE WHEN pay.method = 'upi' THEN pay.amount ELSE 0 END), 0) as upi_in
      FROM pos_payments pay
      INNER JOIN pos_sales s ON s.id = pay.sale_id
      WHERE s.status != 'voided'
        AND pay.created_at >= ? AND pay.created_at < ?
        ${filters.warehouseId ? 'AND s.warehouse_id = ?' : ''}
      GROUP BY day
      ORDER BY day
    `).all(...[dateFrom, dateTo, ...(filters.warehouseId ? [filters.warehouseId] : [])]);

    const outflows = getDatabase().prepare(`
      SELECT strftime('%Y-%m-%d', COALESCE(payment_date, substr(created_at, 1, 10))) as day,
             COALESCE(SUM(CASE WHEN method = 'cash' THEN amount ELSE 0 END), 0) as cash_out,
             COALESCE(SUM(CASE WHEN method = 'upi' THEN amount ELSE 0 END), 0) as upi_out
      FROM supplier_payments
      WHERE datetime(COALESCE(payment_date || 'T00:00:00.000Z', created_at)) >= datetime(?)
        AND datetime(COALESCE(payment_date || 'T00:00:00.000Z', created_at)) < datetime(?)
      GROUP BY day
      ORDER BY day
    `).all(dateFrom, dateTo);

    const map = new Map();
    for (const r of collections) {
      map.set(r.day, {
        day: r.day,
        cashIn: num(r.cash_in),
        cashOut: 0,
        upiIn: num(r.upi_in),
        upiOut: 0,
      });
    }
    for (const r of outflows) {
      const cur = map.get(r.day) || { day: r.day, cashIn: 0, cashOut: 0, upiIn: 0, upiOut: 0 };
      cur.cashOut = num(r.cash_out);
      cur.upiOut = num(r.upi_out);
      map.set(r.day, cur);
    }
    return [...map.values()].sort((a, b) => (a.day < b.day ? -1 : 1));
  }

  lowStock(limit = 15, filters = {}) {
    const whJoin = filters.warehouseId ? 'AND s.warehouse_id = ?' : '';
    const params = [];
    if (filters.warehouseId) params.push(filters.warehouseId);
    if (filters.categoryId) params.push(filters.categoryId);
    if (filters.brandId) params.push(filters.brandId);
    params.push(limit);
    return getDatabase().prepare(`
      SELECT
        p.id as product_id,
        p.name as product_name,
        p.sku,
        p.reorder_level,
        p.minimum_stock,
        COALESCE(SUM(s.quantity_on_hand), 0) as quantity_on_hand,
        COALESCE(SUM(s.quantity_available), 0) as quantity_available
      FROM products p
      LEFT JOIN stock_levels s ON s.product_id = p.id ${whJoin}
      WHERE p.is_active = 1
        ${filters.categoryId ? 'AND p.category_id = ?' : ''}
        ${filters.brandId ? 'AND p.brand_id = ?' : ''}
      GROUP BY p.id
      HAVING quantity_available <= CASE
        WHEN p.reorder_level > 0 THEN p.reorder_level
        ELSE COALESCE(p.minimum_stock, 0)
      END
      ORDER BY quantity_available ASC, p.name ASC
      LIMIT ?
    `).all(...params).map((r) => ({
      productId: r.product_id,
      productName: r.product_name,
      sku: r.sku,
      quantityOnHand: num(r.quantity_on_hand),
      quantityAvailable: num(r.quantity_available),
      reorderLevel: num(r.reorder_level),
      minimumStock: num(r.minimum_stock),
    }));
  }

  deadStock(days = 90, limit = 15, filters = {}) {
    const wh = filters.warehouseId ? 'AND s.warehouse_id = ?' : '';
    return getDatabase().prepare(`
      SELECT
        p.id as product_id,
        p.name as product_name,
        p.sku,
        COALESCE(SUM(s.quantity_on_hand), 0) as quantity_on_hand,
        MAX(m.last_sale_at) as last_sale_at
      FROM products p
      INNER JOIN stock_levels s ON s.product_id = p.id
      LEFT JOIN (
        SELECT product_id, MAX(created_at) as last_sale_at
        FROM inventory_movements
        WHERE movement_type = 'pos_sale' AND status = 'completed'
        GROUP BY product_id
      ) m ON m.product_id = p.id
      WHERE p.is_active = 1 ${wh}
      GROUP BY p.id
      HAVING quantity_on_hand > 0.001
        AND (
          last_sale_at IS NULL
          OR last_sale_at < datetime('now', ?)
        )
      ORDER BY quantity_on_hand DESC
      LIMIT ?
    `).all(
      ...(filters.warehouseId ? [filters.warehouseId] : []),
      `-${days} days`,
      limit
    ).map((r) => ({
      productId: r.product_id,
      productName: r.product_name,
      sku: r.sku,
      quantityOnHand: num(r.quantity_on_hand),
      lastSaleAt: r.last_sale_at,
      daysWithoutSale: days,
    }));
  }

  productMovement(dateFrom, dateTo, { orderBy = 'qty', order = 'DESC', limit = 10 } = {}, filters = {}) {
    const sortCol = orderBy === 'revenue' ? 'revenue'
      : orderBy === 'profit' ? 'profit'
        : orderBy === 'margin' ? 'margin'
          : 'qty_sold';
    const dir = order === 'ASC' ? 'ASC' : 'DESC';
    const f = saleFilters(filters);
    return getDatabase().prepare(`
      SELECT
        i.product_id,
        i.product_name,
        i.sku,
        COALESCE(SUM(i.quantity), 0) as qty_sold,
        COALESCE(SUM(i.line_total), 0) as revenue,
        COALESCE(SUM(i.taxable_amount), 0) as net_revenue,
        COALESCE(SUM(i.quantity * COALESCE(p.purchase_price, 0)), 0) as cogs
      FROM pos_sale_items i
      INNER JOIN pos_sales s ON s.id = i.sale_id
      LEFT JOIN products p ON p.id = i.product_id
      WHERE s.status != 'voided'
        AND s.created_at >= ? AND s.created_at < ?
        ${f.sql}
      GROUP BY i.product_id
      ORDER BY ${sortCol === 'profit' || sortCol === 'margin' ? 'revenue' : sortCol} ${dir}
      LIMIT ?
    `).all(dateFrom, dateTo, ...f.params, limit * 2).map((r) => {
      const netRevenue = num(r.net_revenue);
      const cogs = num(r.cogs);
      const profit = round2(netRevenue - cogs);
      const margin = netRevenue > 0 ? round2((profit / netRevenue) * 100) : 0;
      return {
        productId: r.product_id,
        productName: r.product_name,
        sku: r.sku,
        quantitySold: num(r.qty_sold),
        revenue: num(r.revenue),
        profit,
        margin,
      };
    }).sort((a, b) => {
      const key = orderBy === 'profit' ? 'profit' : orderBy === 'margin' ? 'margin' : orderBy === 'revenue' ? 'revenue' : 'quantitySold';
      return order === 'ASC' ? a[key] - b[key] : b[key] - a[key];
    }).slice(0, limit);
  }

  slowMovingWithStock(dateFrom, dateTo, limit = 10, filters = {}, maxQty = 2) {
    const wh = filters.warehouseId ? 'AND s.warehouse_id = ?' : '';
    return getDatabase().prepare(`
      SELECT
        p.id as product_id,
        p.name as product_name,
        p.sku,
        COALESCE(SUM(s.quantity_on_hand), 0) as quantity_on_hand,
        COALESCE(sold.qty_sold, 0) as qty_sold,
        COALESCE(sold.revenue, 0) as revenue
      FROM products p
      INNER JOIN stock_levels s ON s.product_id = p.id
      LEFT JOIN (
        SELECT i.product_id,
               SUM(i.quantity) as qty_sold,
               SUM(i.line_total) as revenue
        FROM pos_sale_items i
        INNER JOIN pos_sales ps ON ps.id = i.sale_id
        WHERE ps.status != 'voided'
          AND ps.created_at >= ? AND ps.created_at < ?
        GROUP BY i.product_id
      ) sold ON sold.product_id = p.id
      WHERE p.is_active = 1 ${wh}
      GROUP BY p.id
      HAVING quantity_on_hand > 0.001 AND qty_sold <= ?
      ORDER BY qty_sold ASC, quantity_on_hand DESC
      LIMIT ?
    `).all(
      dateFrom,
      dateTo,
      ...(filters.warehouseId ? [filters.warehouseId] : []),
      maxQty,
      limit
    ).map((r) => ({
      productId: r.product_id,
      productName: r.product_name,
      sku: r.sku,
      quantityOnHand: num(r.quantity_on_hand),
      quantitySold: num(r.qty_sold),
      revenue: num(r.revenue),
    }));
  }

  highReturnProducts(dateFrom, dateTo, limit = 10) {
    return getDatabase().prepare(`
      SELECT
        ri.product_id,
        COALESCE(p.name, 'Product') as product_name,
        COALESCE(p.sku, '') as sku,
        COALESCE(SUM(ri.quantity), 0) as qty_returned,
        COALESCE(SUM(ri.line_total), 0) as return_value
      FROM pos_sales_return_items ri
      INNER JOIN pos_sales_returns r ON r.id = ri.return_id
      LEFT JOIN products p ON p.id = ri.product_id
      WHERE r.status = 'completed'
        AND r.created_at >= ? AND r.created_at < ?
      GROUP BY ri.product_id
      ORDER BY qty_returned DESC
      LIMIT ?
    `).all(dateFrom, dateTo, limit).map((r) => ({
      productId: r.product_id,
      productName: r.product_name,
      sku: r.sku,
      quantityReturned: num(r.qty_returned),
      returnValue: num(r.return_value),
    }));
  }

  topCustomers(dateFrom, dateTo, limit = 10, filters = {}) {
    const wh = [];
    const p = [dateFrom, dateTo];
    if (filters.warehouseId) {
      wh.push('AND s.warehouse_id = ?');
      p.push(filters.warehouseId);
    }
    if (filters.salespersonId) {
      wh.push('AND s.created_by = ?');
      p.push(filters.salespersonId);
    }
    return getDatabase().prepare(`
      SELECT
        c.id as customer_id,
        c.code,
        c.name,
        c.outstanding_balance,
        COUNT(s.id) as invoice_count,
        COALESCE(SUM(s.grand_total), 0) as sales_total,
        COALESCE(SUM(s.taxable_amount), 0) as taxable_total
      FROM pos_sales s
      INNER JOIN customers c ON c.id = s.customer_id
      WHERE s.status != 'voided'
        AND s.created_at >= ? AND s.created_at < ?
        AND c.is_walk_in = 0
        ${wh.join(' ')}
      GROUP BY c.id
      ORDER BY sales_total DESC
      LIMIT ?
    `).all(...p, limit).map((r) => ({
      customerId: r.customer_id,
      code: r.code,
      name: r.name,
      invoiceCount: num(r.invoice_count),
      salesTotal: num(r.sales_total),
      outstanding: num(r.outstanding_balance),
      purchaseFrequency: num(r.invoice_count),
    }));
  }

  topCustomersByProfit(dateFrom, dateTo, limit = 10, filters = {}) {
    const f = saleFilters(filters);
    return getDatabase().prepare(`
      SELECT
        c.id as customer_id,
        c.code,
        c.name,
        COUNT(DISTINCT s.id) as invoice_count,
        COALESCE(SUM(i.taxable_amount), 0) as revenue,
        COALESCE(SUM(i.quantity * COALESCE(p.purchase_price, 0)), 0) as cogs
      FROM pos_sale_items i
      INNER JOIN pos_sales s ON s.id = i.sale_id
      INNER JOIN customers c ON c.id = s.customer_id
      LEFT JOIN products p ON p.id = i.product_id
      WHERE s.status != 'voided'
        AND s.created_at >= ? AND s.created_at < ?
        AND c.is_walk_in = 0
        ${f.sql}
      GROUP BY c.id
      ORDER BY (revenue - cogs) DESC
      LIMIT ?
    `).all(dateFrom, dateTo, ...f.params, limit).map((r) => {
      const revenue = num(r.revenue);
      const cogs = num(r.cogs);
      return {
        customerId: r.customer_id,
        code: r.code,
        name: r.name,
        invoiceCount: num(r.invoice_count),
        salesTotal: revenue,
        profit: round2(revenue - cogs),
      };
    });
  }

  highestOutstandingCustomers(limit = 10) {
    return getDatabase().prepare(`
      SELECT id as customer_id, code, name, outstanding_balance, credit_limit
      FROM customers
      WHERE is_active = 1 AND is_walk_in = 0 AND outstanding_balance > 0.001
      ORDER BY outstanding_balance DESC
      LIMIT ?
    `).all(limit).map((r) => ({
      customerId: r.customer_id,
      code: r.code,
      name: r.name,
      outstanding: num(r.outstanding_balance),
      creditLimit: num(r.credit_limit),
    }));
  }

  topSuppliers(dateFrom, dateTo, limit = 10) {
    return getDatabase().prepare(`
      SELECT
        sp.id as supplier_id,
        sp.code,
        sp.name,
        sp.outstanding_payable,
        COUNT(b.id) as bill_count,
        COALESCE(SUM(b.grand_total), 0) as purchase_total
      FROM supplier_bills b
      INNER JOIN suppliers sp ON sp.id = b.supplier_id
      WHERE b.status != 'cancelled'
        AND datetime(COALESCE(b.bill_date || 'T00:00:00.000Z', b.created_at)) >= datetime(?)
        AND datetime(COALESCE(b.bill_date || 'T00:00:00.000Z', b.created_at)) < datetime(?)
      GROUP BY sp.id
      ORDER BY purchase_total DESC
      LIMIT ?
    `).all(dateFrom, dateTo, limit).map((r) => ({
      supplierId: r.supplier_id,
      code: r.code,
      name: r.name,
      billCount: num(r.bill_count),
      purchaseTotal: num(r.purchase_total),
      outstanding: num(r.outstanding_payable),
      purchaseFrequency: num(r.bill_count),
    }));
  }

  recentActivity(limit = 20) {
    const db = getDatabase();
    const sales = db.prepare(`
      SELECT 'sale' as type, invoice_number as reference, grand_total as amount,
             created_at as at, 'POS sale' as label, customer_id as party_id, id as record_id
      FROM pos_sales WHERE status != 'voided'
      ORDER BY created_at DESC LIMIT ?
    `).all(limit);

    const returns = db.prepare(`
      SELECT 'return' as type, return_number as reference, grand_total as amount,
             created_at as at, 'Sales return' as label, customer_id as party_id, id as record_id
      FROM pos_sales_returns WHERE status = 'completed'
      ORDER BY created_at DESC LIMIT ?
    `).all(limit);

    const bills = db.prepare(`
      SELECT 'purchase' as type, bill_number as reference, grand_total as amount,
             created_at as at, 'Supplier bill' as label, supplier_id as party_id, id as record_id
      FROM supplier_bills WHERE status != 'cancelled'
      ORDER BY created_at DESC LIMIT ?
    `).all(limit);

    const payments = db.prepare(`
      SELECT 'supplier_payment' as type, COALESCE(reference, method) as reference, amount,
             created_at as at, 'Supplier payment' as label, supplier_id as party_id, id as record_id
      FROM supplier_payments
      ORDER BY created_at DESC LIMIT ?
    `).all(limit);

    return [...sales, ...returns, ...bills, ...payments]
      .sort((a, b) => (a.at < b.at ? 1 : -1))
      .slice(0, limit)
      .map((r) => ({
        type: r.type,
        reference: r.reference,
        amount: num(r.amount),
        at: r.at,
        label: r.label,
        partyId: r.party_id,
        recordId: r.record_id,
        href: r.type === 'sale' ? `/operations/pos?sale=${r.record_id}`
          : r.type === 'return' ? `/operations/pos?return=${r.record_id}`
            : r.type === 'purchase' || r.type === 'supplier_payment' ? `/business/crm?tab=suppliers`
              : null,
      }));
  }

  alerts(settings = {}) {
    const db = getDatabase();
    const minMargin = settings.minMarginPercent ?? 10;
    const unusualDiscount = settings.unusualDiscountPercent ?? 25;
    const overdueAmt = settings.overdueReceivableAlertAmount ?? 50000;
    const deadDays = settings.deadStockDays ?? 90;

    const lowStockCount = db.prepare(`
      SELECT COUNT(*) as count FROM (
        SELECT p.id
        FROM products p
        LEFT JOIN stock_levels s ON s.product_id = p.id
        WHERE p.is_active = 1
        GROUP BY p.id
        HAVING COALESCE(SUM(s.quantity_available), 0) <= CASE
          WHEN p.reorder_level > 0 THEN p.reorder_level
          ELSE COALESCE(p.minimum_stock, 0)
        END
      )
    `).get()?.count || 0;

    const negativeStock = db.prepare(`
      SELECT COUNT(*) as count FROM stock_levels WHERE quantity_on_hand < -0.001
    `).get()?.count || 0;

    const pendingAdjustments = db.prepare(`
      SELECT COUNT(*) as count FROM inventory_movements
      WHERE status = 'pending'
        AND movement_type IN ('adjustment_increase', 'adjustment_decrease')
    `).get()?.count || 0;

    const pendingTransfers = db.prepare(`
      SELECT COUNT(*) as count FROM warehouse_transfers WHERE status = 'pending_approval'
    `).get()?.count || 0;

    const overCredit = db.prepare(`
      SELECT COUNT(*) as count FROM customers
      WHERE is_active = 1 AND is_walk_in = 0 AND credit_limit > 0
        AND outstanding_balance > credit_limit + 0.001
    `).get()?.count || 0;

    const openCounts = db.prepare(`
      SELECT COUNT(*) as count FROM stock_counts
      WHERE status IN ('in_progress', 'pending_approval', 'draft')
    `).get()?.count || 0;

    const lossSales = db.prepare(`
      SELECT COUNT(*) as count FROM (
        SELECT s.id
        FROM pos_sales s
        INNER JOIN pos_sale_items i ON i.sale_id = s.id
        LEFT JOIN products p ON p.id = i.product_id
        WHERE s.status != 'voided'
          AND s.created_at >= datetime('now', '-30 days')
        GROUP BY s.id
        HAVING SUM(i.taxable_amount) - SUM(i.quantity * COALESCE(p.purchase_price, 0)) < -0.01
      )
    `).get()?.count || 0;

    const lowMarginSales = db.prepare(`
      SELECT COUNT(*) as count FROM (
        SELECT s.id,
               SUM(i.taxable_amount) as rev,
               SUM(i.quantity * COALESCE(p.purchase_price, 0)) as cogs
        FROM pos_sales s
        INNER JOIN pos_sale_items i ON i.sale_id = s.id
        LEFT JOIN products p ON p.id = i.product_id
        WHERE s.status != 'voided'
          AND s.created_at >= datetime('now', '-30 days')
        GROUP BY s.id
        HAVING rev > 0 AND ((rev - cogs) * 100.0 / rev) < ?
      )
    `).get(minMargin)?.count || 0;

    const highDiscount = db.prepare(`
      SELECT COUNT(*) as count FROM pos_sales
      WHERE status != 'voided'
        AND created_at >= datetime('now', '-7 days')
        AND subtotal > 0
        AND ((item_discount_total + invoice_discount) * 100.0 / subtotal) >= ?
    `).get(unusualDiscount)?.count || 0;

    const highReceivable = db.prepare(`
      SELECT COUNT(*) as count FROM customers
      WHERE is_active = 1 AND is_walk_in = 0 AND outstanding_balance >= ?
    `).get(overdueAmt)?.count || 0;

    const deadStock = db.prepare(`
      SELECT COUNT(*) as count FROM (
        SELECT p.id
        FROM products p
        INNER JOIN stock_levels s ON s.product_id = p.id
        LEFT JOIN (
          SELECT product_id, MAX(created_at) as last_sale_at
          FROM inventory_movements
          WHERE movement_type = 'pos_sale' AND status = 'completed'
          GROUP BY product_id
        ) m ON m.product_id = p.id
        WHERE p.is_active = 1
        GROUP BY p.id
        HAVING SUM(s.quantity_on_hand) > 0.001
          AND (m.last_sale_at IS NULL OR m.last_sale_at < datetime('now', ?))
      )
    `).get(`-${deadDays} days`)?.count || 0;

    const items = [];
    const push = (severity, code, title, description, count, href) => {
      if (count > 0) {
        items.push({
          severity,
          code,
          title,
          description,
          message: description,
          count,
          relatedRecord: null,
          timestamp: new Date().toISOString(),
          actionHref: href,
        });
      }
    };

    push('critical', 'NEGATIVE_STOCK', 'Negative stock', `${negativeStock} location/product stock row(s) negative`, negativeStock, '/operations/inventory');
    push('critical', 'LOSS_SALES', 'Loss-making sales', `${lossSales} invoice(s) with negative estimated gross profit (30d)`, lossSales, '/business/reports?tab=dashboard#profitability');
    push('critical', 'CREDIT_LIMIT', 'Credit limit breached', `${overCredit} customer(s) over credit limit`, overCredit, '/business/crm');
    push('critical', 'HIGH_RECEIVABLE', 'High-value receivables', `${highReceivable} customer(s) with outstanding ≥ configured threshold`, highReceivable, '/business/crm');
    push('warning', 'LOW_STOCK', 'Low stock', `${lowStockCount} product(s) at or below reorder level`, lowStockCount, '/operations/inventory');
    push('warning', 'LOW_MARGIN', 'Low margin sales', `${lowMarginSales} invoice(s) below ${minMargin}% margin (30d)`, lowMarginSales, '/business/reports?tab=dashboard#profitability');
    push('warning', 'HIGH_DISCOUNT', 'Unusual discounts', `${highDiscount} sale(s) with discount ≥ ${unusualDiscount}% (7d)`, highDiscount, '/operations/pos');
    push('warning', 'DEAD_STOCK', 'Dead stock', `${deadStock} SKU(s) with no sale for ${deadDays}+ days`, deadStock, '/operations/products');
    push('warning', 'PENDING_ADJUSTMENTS', 'Pending adjustments', `${pendingAdjustments} stock adjustment(s) awaiting approval`, pendingAdjustments, '/operations/inventory');
    push('info', 'PENDING_TRANSFERS', 'Pending transfers', `${pendingTransfers} warehouse transfer(s) pending approval`, pendingTransfers, '/operations/warehouse');
    push('info', 'OPEN_STOCK_COUNTS', 'Open stock counts', `${openCounts} open stock count(s)`, openCounts, '/operations/warehouse');

    const severityRank = { critical: 0, warning: 1, info: 2 };
    return items.sort((a, b) => severityRank[a.severity] - severityRank[b.severity]);
  }
}
