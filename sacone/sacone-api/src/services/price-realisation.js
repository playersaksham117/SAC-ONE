import { AppError } from '../core/http.js';
import { getDatabase } from '../database/connection.js';
import { withFinancialYear } from '../database/context.js';
import { authService } from './index.js';

/**
 * Price realisation: every invoice line compared with the product's base selling price.
 *
 * Both sides are before GST. "Sold at" is what the line really earned per unit after its own
 * discount and its share of any bill discount (taxable ÷ quantity). Only the quantity the
 * customer kept counts (sold − returned). Lines made before the base price was recorded use
 * today's base price and are marked so.
 */

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TOLERANCE = 0.005;
const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const round3 = (n) => Math.round((Number(n) + Number.EPSILON) * 1000) / 1000;

function linesFor({ dateFrom, dateTo, productId, staffId, search }) {
  const where = ["s.status != 'voided'"];
  const params = [];
  if (dateFrom) { where.push('s.created_at >= ?'); params.push(dateFrom); }
  if (dateTo) { where.push("s.created_at < date(?, '+1 day')"); params.push(dateTo); }
  if (productId) { where.push('si.product_id = ?'); params.push(productId); }
  if (staffId) { where.push('s.created_by = ?'); params.push(staffId); }
  if (search) {
    where.push('(LOWER(si.product_name) LIKE ? OR LOWER(COALESCE(si.sku, \'\')) LIKE ? OR LOWER(s.invoice_number) LIKE ? OR LOWER(COALESCE(c.name, \'\')) LIKE ?)');
    const like = `%${String(search).toLowerCase()}%`;
    params.push(like, like, like, like);
  }
  return getDatabase().prepare(`
    SELECT si.id, si.sale_id, s.invoice_number, s.created_at, c.name AS customer_name, c.is_walk_in,
           s.created_by, u.full_name AS staff_name, sa.name AS agent_name,
           si.product_id, si.product_name, si.sku, si.quantity, si.quantity_returned,
           si.unit_price, si.taxable_amount, si.base_price, p.selling_price AS price_today
    FROM pos_sale_items si
    JOIN pos_sales s ON s.id = si.sale_id
    LEFT JOIN products p ON p.id = si.product_id
    LEFT JOIN customers c ON c.id = s.customer_id
    LEFT JOIN users u ON u.id = s.created_by
    LEFT JOIN sales_agents sa ON sa.id = s.sales_agent_id
    WHERE ${where.join(' AND ')}
    ORDER BY s.created_at DESC, si.sort_order ASC
  `).all(...params);
}

function analyse(row) {
  const kept = round3(Number(row.quantity) - Number(row.quantity_returned || 0));
  if (kept <= 0) return null;
  const recorded = row.base_price !== null && row.base_price !== undefined;
  const base = round2(recorded ? row.base_price : (row.price_today ?? 0));
  const soldAt = round2(Number(row.taxable_amount) / Number(row.quantity));
  const perUnit = round2(soldAt - base);
  const status = perUnit > TOLERANCE ? 'above' : perUnit < -TOLERANCE ? 'below' : 'at';
  return {
    id: row.id,
    saleId: row.sale_id,
    invoiceNumber: row.invoice_number,
    date: row.created_at,
    customerName: row.is_walk_in ? 'Walk-in' : (row.customer_name || 'Walk-in'),
    staffId: row.created_by,
    staffName: row.staff_name || '—',
    agentName: row.agent_name || null,
    productId: row.product_id,
    productName: row.product_name,
    sku: row.sku,
    quantity: kept,
    basePrice: base,
    basePriceSource: recorded ? 'at_sale' : 'today',
    billedPrice: round2(row.unit_price),
    soldAt,
    differencePerUnit: perUnit,
    baseValue: round2(base * kept),
    soldValue: round2(soldAt * kept),
    difference: round2(perUnit * kept),
    status,
  };
}

function totalsOf(lines) {
  const t = lines.reduce((acc, l) => {
    acc.lines += 1;
    acc.quantity += l.quantity;
    acc.baseValue += l.baseValue;
    acc.soldValue += l.soldValue;
    if (l.status === 'above') { acc.aboveLines += 1; acc.extra += l.difference; }
    if (l.status === 'below') { acc.belowLines += 1; acc.short += l.difference; }
    if (l.status === 'at') acc.atLines += 1;
    return acc;
  }, { lines: 0, quantity: 0, baseValue: 0, soldValue: 0, aboveLines: 0, atLines: 0, belowLines: 0, extra: 0, short: 0 });
  return {
    ...t,
    quantity: round3(t.quantity),
    baseValue: round2(t.baseValue),
    soldValue: round2(t.soldValue),
    extra: round2(t.extra),
    short: round2(t.short),
    net: round2(t.soldValue - t.baseValue),
    upliftPercent: t.baseValue > 0 ? round2(((t.soldValue - t.baseValue) / t.baseValue) * 100) : 0,
  };
}

function groupBy(lines, keyOf, labelOf, { withSku = false } = {}) {
  const groups = new Map();
  for (const l of lines) {
    const key = keyOf(l);
    if (!groups.has(key)) groups.set(key, { key, label: labelOf(l), lines: [] });
    groups.get(key).lines.push(l);
  }
  return [...groups.values()]
    .map((g) => {
      const t = totalsOf(g.lines);
      return {
        key: g.key,
        label: g.label,
        ...(withSku ? { sku: g.lines[0].sku } : {}),
        ...t,
        avgBasePrice: t.quantity ? round2(t.baseValue / t.quantity) : 0,
        avgSoldAt: t.quantity ? round2(t.soldValue / t.quantity) : 0,
      };
    })
    .sort((a, b) => b.extra - a.extra || b.net - a.net);
}

export const priceRealisationService = {
  report(query = {}, actor) {
    authService.checkPermission(actor.permissions, 'pos.sales.view');
    const q = withFinancialYear(query);
    for (const k of ['dateFrom', 'dateTo']) {
      if (q[k] && !DATE.test(q[k])) throw new AppError(`${k} must be YYYY-MM-DD`, 400);
    }
    const show = ['above', 'below', 'at', 'all'].includes(query.show) ? query.show : 'above';
    const all = linesFor({ dateFrom: q.dateFrom, dateTo: q.dateTo, productId: query.productId, staffId: query.staffId, search: query.search })
      .map(analyse)
      .filter(Boolean);
    const shown = show === 'all' ? all : all.filter((l) => l.status === show);
    const limit = Math.min(Math.max(parseInt(query.limit, 10) || 500, 1), 5000);
    return {
      period: { dateFrom: q.dateFrom || null, dateTo: q.dateTo || null },
      show,
      totals: totalsOf(all),
      byProduct: groupBy(all, (l) => l.productId, (l) => l.productName, { withSku: true }),
      byStaff: groupBy(all, (l) => l.staffId || '—', (l) => l.staffName),
      lines: shown.slice(0, limit),
      lineCount: shown.length,
      usesTodaysPrice: all.some((l) => l.basePriceSource === 'today'),
    };
  },
};
