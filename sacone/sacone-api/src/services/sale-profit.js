import { AppError } from '../core/http.js';
import { getDatabase } from '../database/connection.js';
import { withFinancialYear } from '../database/context.js';
import { authService } from './index.js';

/**
 * Profit / loss per sale: what each invoice earned over what its items cost to buy. Both sides are
 * before GST (GST is collected for the government, not profit) and nothing else is deducted.
 *
 * Sale side: the line's taxable value (after line and bill discounts) for the quantity the customer
 * kept (sold − returned). Cost side, per unit, chosen by `basis`:
 *   avg    — weighted average of the item's purchase-bill rates up to the sale date (default)
 *   last   — the rate on the item's latest purchase bill up to the sale date
 *   master — the purchase price in the Product Master today
 * A purchase-bill rate is the bill line's taxable value ÷ quantity. When an item has no purchase
 * bill up to the sale date, the Product Master price is used and the line is marked so.
 */

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const BASES = ['avg', 'last', 'master'];
const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const round3 = (n) => Math.round((Number(n) + Number.EPSILON) * 1000) / 1000;
const pct = (profit, revenue) => (revenue > 0 ? round2((profit / revenue) * 100) : 0);

function saleLines({ dateFrom, dateTo, search }) {
  const where = ["s.status != 'voided'"];
  const params = [];
  if (dateFrom) { where.push('s.created_at >= ?'); params.push(dateFrom); }
  if (dateTo) { where.push("s.created_at < date(?, '+1 day')"); params.push(dateTo); }
  if (search) {
    where.push('(LOWER(si.product_name) LIKE ? OR LOWER(COALESCE(si.sku, \'\')) LIKE ? OR LOWER(s.invoice_number) LIKE ? OR LOWER(COALESCE(c.name, \'\')) LIKE ?)');
    const like = `%${String(search).toLowerCase()}%`;
    params.push(like, like, like, like);
  }
  return getDatabase().prepare(`
    SELECT si.id, si.sale_id, s.invoice_number, s.created_at, c.name AS customer_name, c.is_walk_in,
           u.full_name AS staff_name, si.product_id, si.product_name, si.sku, si.quantity, si.quantity_returned,
           si.taxable_amount, p.purchase_price AS master_price, COALESCE(p.item_type, 'goods') AS item_type
    FROM pos_sale_items si
    JOIN pos_sales s ON s.id = si.sale_id
    LEFT JOIN products p ON p.id = si.product_id
    LEFT JOIN customers c ON c.id = s.customer_id
    LEFT JOIN users u ON u.id = s.created_by
    WHERE ${where.join(' AND ')}
    ORDER BY s.created_at DESC, si.sort_order ASC
  `).all(...params);
}

/** Purchase-bill rates per product, oldest first, with running quantity and cost for averages. */
function purchaseHistory(productIds) {
  const byProduct = new Map();
  if (!productIds.length) return byProduct;
  const rows = getDatabase().prepare(`
    SELECT bi.product_id, b.bill_date, b.bill_number, bi.quantity, bi.unit_price, bi.discount_percent, bi.taxable_amount
    FROM supplier_bill_items bi
    JOIN supplier_bills b ON b.id = bi.bill_id
    WHERE b.status != 'cancelled' AND bi.quantity > 0
      AND bi.product_id IN (SELECT value FROM json_each(?))
    ORDER BY b.bill_date ASC, b.created_at ASC, bi.sort_order ASC
  `).all(JSON.stringify(productIds));
  for (const r of rows) {
    const qty = Number(r.quantity);
    const value = Number(r.taxable_amount) > 0
      ? Number(r.taxable_amount)
      : Number(r.unit_price) * qty * (1 - Number(r.discount_percent || 0) / 100);
    const list = byProduct.get(r.product_id) || [];
    const prev = list[list.length - 1];
    list.push({
      date: String(r.bill_date).slice(0, 10),
      billNumber: r.bill_number,
      rate: value / qty,
      cumQty: (prev?.cumQty || 0) + qty,
      cumValue: (prev?.cumValue || 0) + value,
    });
    byProduct.set(r.product_id, list);
  }
  return byProduct;
}

/** Last purchase on or before `date` (binary search over the date-sorted list). */
function upTo(list, date) {
  let lo = 0; let hi = list.length - 1; let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (list[mid].date <= date) { found = mid; lo = mid + 1; } else hi = mid - 1;
  }
  return found >= 0 ? list[found] : null;
}

function unitCost(row, basis, history) {
  const master = Number(row.master_price || 0);
  if (basis !== 'master') {
    const p = upTo(history.get(row.product_id) || [], String(row.created_at).slice(0, 10));
    if (p) {
      return basis === 'last'
        ? { cost: p.rate, source: 'last', note: `bill ${p.billNumber}` }
        : { cost: p.cumValue / p.cumQty, source: 'avg', note: `${round3(p.cumQty)} bought` };
    }
  }
  if (master > 0) return { cost: master, source: 'master', note: basis === 'master' ? null : 'no purchase bill yet' };
  if (row.item_type === 'service') return { cost: 0, source: 'service', note: 'service, no cost' };
  return { cost: 0, source: 'none', note: 'no purchase rate' };
}

function sum(list, key) {
  return round2(list.reduce((s, x) => s + x[key], 0));
}

export const saleProfitService = {
  report(query = {}, actor) {
    authService.checkPermission(actor.permissions, 'pos.sales.view');
    authService.checkPermission(actor.permissions, 'purchases.bills.view');
    const q = withFinancialYear(query);
    for (const k of ['dateFrom', 'dateTo']) {
      if (q[k] && !DATE.test(q[k])) throw new AppError(`${k} must be YYYY-MM-DD`, 400);
    }
    const basis = BASES.includes(query.basis) ? query.basis : 'avg';
    const show = ['all', 'profit', 'loss'].includes(query.show) ? query.show : 'all';

    const rows = saleLines({ dateFrom: q.dateFrom, dateTo: q.dateTo, search: query.search });
    const history = basis === 'master' ? new Map() : purchaseHistory([...new Set(rows.map((r) => r.product_id))]);

    const invoices = new Map();
    for (const r of rows) {
      const kept = round3(Number(r.quantity) - Number(r.quantity_returned || 0));
      if (!invoices.has(r.sale_id)) {
        invoices.set(r.sale_id, {
          saleId: r.sale_id,
          invoiceNumber: r.invoice_number,
          date: r.created_at,
          customerName: r.is_walk_in ? 'Walk-in' : (r.customer_name || 'Walk-in'),
          staffName: r.staff_name || '—',
          lines: [],
        });
      }
      if (kept <= 0) continue;
      const c = unitCost(r, basis, history);
      const soldAt = Number(r.quantity) ? Number(r.taxable_amount) / Number(r.quantity) : 0;
      const revenue = round2(soldAt * kept);
      const cost = round2(c.cost * kept);
      invoices.get(r.sale_id).lines.push({
        id: r.id,
        productId: r.product_id,
        productName: r.product_name,
        sku: r.sku,
        quantity: kept,
        soldAt: round2(soldAt),
        unitCost: round2(c.cost),
        costSource: c.source,
        costNote: c.note,
        revenue,
        cost,
        profit: round2(revenue - cost),
        marginPercent: pct(revenue - cost, revenue),
      });
    }

    const all = [...invoices.values()]
      .filter((i) => i.lines.length)
      .map((i) => {
        const revenue = sum(i.lines, 'revenue');
        const cost = sum(i.lines, 'cost');
        const profit = round2(revenue - cost);
        return { ...i, revenue, cost, profit, marginPercent: pct(profit, revenue), missingCost: i.lines.some((l) => l.costSource === 'none') };
      });

    const byProduct = new Map();
    for (const l of all.flatMap((i) => i.lines)) {
      const g = byProduct.get(l.productId) || { key: l.productId, label: l.productName, sku: l.sku, quantity: 0, revenue: 0, cost: 0 };
      g.quantity += l.quantity; g.revenue += l.revenue; g.cost += l.cost;
      byProduct.set(l.productId, g);
    }

    const revenue = sum(all, 'revenue');
    const cost = sum(all, 'cost');
    const shown = show === 'all' ? all : all.filter((i) => (show === 'loss' ? i.profit < 0 : i.profit >= 0));
    const limit = Math.min(Math.max(parseInt(query.limit, 10) || 1000, 1), 5000);
    return {
      period: { dateFrom: q.dateFrom || null, dateTo: q.dateTo || null },
      basis,
      show,
      totals: {
        invoices: all.length,
        revenue,
        cost,
        profit: round2(revenue - cost),
        marginPercent: pct(revenue - cost, revenue),
        lossInvoices: all.filter((i) => i.profit < 0).length,
        lossAmount: round2(all.filter((i) => i.profit < 0).reduce((s, i) => s + i.profit, 0)),
        missingCostLines: all.flatMap((i) => i.lines).filter((l) => l.costSource === 'none').length,
        masterPriceLines: basis === 'master' ? 0 : all.flatMap((i) => i.lines).filter((l) => l.costSource === 'master').length,
      },
      invoices: shown.slice(0, limit),
      invoiceCount: shown.length,
      byProduct: [...byProduct.values()]
        .map((g) => {
          const profit = round2(g.revenue - g.cost);
          return {
            ...g, quantity: round3(g.quantity), revenue: round2(g.revenue), cost: round2(g.cost), profit,
            marginPercent: pct(profit, g.revenue),
            avgSoldAt: g.quantity ? round2(g.revenue / g.quantity) : 0,
            avgCost: g.quantity ? round2(g.cost / g.quantity) : 0,
          };
        })
        .sort((a, b) => a.profit - b.profit),
    };
  },
};
