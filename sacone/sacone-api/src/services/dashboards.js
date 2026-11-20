/**
 * Sales and inventory dashboards (read-only aggregates for the ERP's charts).
 * Days are Indian days: sale times are stored in UTC, so they are shifted by +5:30 first.
 */
import { getDatabase } from '../database/connection.js';
import { AppError } from '../core/http.js';
import { authService } from './index.js';

const IST = "'+330 minutes'";
const day = (col) => `date(${col}, ${IST})`;
const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const num = (n) => Number(n) || 0;
const COUNTED = "s.status IN ('completed','partially_returned','returned')";

function istToday() {
  return new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
}
function addDays(iso, n) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function daysBetween(a, b) {
  return Math.round((new Date(`${b}T00:00:00Z`) - new Date(`${a}T00:00:00Z`)) / 86_400_000) + 1;
}
const isDate = (v) => /^\d{4}-\d{2}-\d{2}$/.test(String(v || ''));

/** from/to (IST dates, inclusive); default the last 30 days. Also the period just before, as long. */
function range(query) {
  const to = isDate(query.dateTo) ? query.dateTo : istToday();
  const from = isDate(query.dateFrom) ? query.dateFrom : addDays(to, -29);
  if (from > to) throw new AppError('From date is after To date', 400);
  const days = daysBetween(from, to);
  if (days > 1100) throw new AppError('Choose at most 3 years', 400);
  return { from, to, days, prevFrom: addDays(from, -days), prevTo: addDays(from, -1) };
}
const change = (now, before) => (before ? r2(((now - before) / Math.abs(before)) * 100) : null);
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export class DashboardService {
  sales(query, actor) {
    authService.checkPermission(actor.permissions, 'pos.sales.view');
    const db = getDatabase();
    const { from, to, days, prevFrom, prevTo } = range(query);
    const wh = query.warehouseId ? ' AND s.warehouse_id = ?' : '';
    const whArgs = query.warehouseId ? [query.warehouseId] : [];
    const inRange = `${day('s.created_at')} BETWEEN ? AND ?`;

    const totals = (a, b) => {
      const s = db.prepare(`
        SELECT COUNT(*) bills, COALESCE(SUM(s.grand_total),0) gross, COALESCE(SUM(s.taxable_amount),0) taxable,
          COALESCE(SUM(s.gst_amount),0) gst, COALESCE(SUM(s.amount_credit),0) credit,
          COALESCE(SUM(s.item_discount_total + COALESCE(s.invoice_discount,0)),0) discount,
          COUNT(DISTINCT CASE WHEN c.is_walk_in = 0 THEN s.customer_id END) customers
        FROM pos_sales s LEFT JOIN customers c ON c.id = s.customer_id
        WHERE ${COUNTED} AND ${inRange}${wh}`).get(a, b, ...whArgs);
      const ret = db.prepare(`
        SELECT COUNT(*) n, COALESCE(SUM(r.grand_total),0) total, COALESCE(SUM(r.subtotal),0) taxable
        FROM pos_sales_returns r JOIN pos_sales s ON s.id = r.sale_id
        WHERE r.status != 'cancelled' AND ${day('r.created_at')} BETWEEN ? AND ?${wh}`).get(a, b, ...whArgs);
      const cost = db.prepare(`
        SELECT COALESCE(SUM(COALESCE(i.cost_amount, (i.quantity - COALESCE(i.quantity_returned,0)) * COALESCE(p.purchase_price,0))),0) cogs,
               COALESCE(SUM(i.taxable_amount * (CASE WHEN i.quantity > 0 THEN (i.quantity - COALESCE(i.quantity_returned,0)) / i.quantity ELSE 1 END)),0) netTaxable,
               COALESCE(SUM(i.quantity - COALESCE(i.quantity_returned,0)),0) units
        FROM pos_sale_items i JOIN pos_sales s ON s.id = i.sale_id LEFT JOIN products p ON p.id = i.product_id
        WHERE ${COUNTED} AND ${inRange}${wh}`).get(a, b, ...whArgs);
      const collected = db.prepare(`
        SELECT COALESCE(SUM(pp.amount),0) v FROM pos_payments pp JOIN pos_sales s ON s.id = pp.sale_id
        WHERE ${COUNTED} AND pp.method != 'credit' AND ${day('pp.created_at')} BETWEEN ? AND ?${wh}`).get(a, b, ...whArgs).v;
      const net = r2(num(s.gross) - num(ret.total));
      return {
        bills: num(s.bills),
        grossSales: r2(s.gross),
        returns: r2(ret.total),
        returnCount: num(ret.n),
        netSales: net,
        taxable: r2(s.taxable),
        gst: r2(s.gst),
        discount: r2(s.discount),
        credit: r2(s.credit),
        collected: r2(collected),
        customers: num(s.customers),
        units: r2(cost.units),
        avgBill: s.bills ? r2(num(s.gross) / num(s.bills)) : 0,
        grossProfit: r2(num(cost.netTaxable) - num(cost.cogs)),
        margin: num(cost.netTaxable) > 0 ? r2(((num(cost.netTaxable) - num(cost.cogs)) / num(cost.netTaxable)) * 100) : 0,
      };
    };
    const now = totals(from, to);
    const before = totals(prevFrom, prevTo);
    const kpis = {
      ...now,
      changes: Object.fromEntries(['netSales', 'bills', 'avgBill', 'grossProfit', 'gst', 'collected', 'returns', 'customers']
        .map((k) => [k, change(now[k], before[k])])),
    };

    // trend: daily up to 62 days, else monthly
    const monthly = days > 62;
    const bucket = monthly ? `strftime('%Y-%m', s.created_at, ${IST})` : day('s.created_at');
    const trendRows = db.prepare(`
      SELECT ${bucket} k, COUNT(*) bills, COALESCE(SUM(s.grand_total),0) sales, COALESCE(SUM(s.gst_amount),0) gst
      FROM pos_sales s WHERE ${COUNTED} AND ${inRange}${wh} GROUP BY k`).all(from, to, ...whArgs);
    const profitRows = db.prepare(`
      SELECT ${bucket} k, COALESCE(SUM(i.taxable_amount * (CASE WHEN i.quantity > 0 THEN (i.quantity - COALESCE(i.quantity_returned,0)) / i.quantity ELSE 1 END)
        - COALESCE(i.cost_amount, (i.quantity - COALESCE(i.quantity_returned,0)) * COALESCE(p.purchase_price,0))),0) profit
      FROM pos_sale_items i JOIN pos_sales s ON s.id = i.sale_id LEFT JOIN products p ON p.id = i.product_id
      WHERE ${COUNTED} AND ${inRange}${wh} GROUP BY k`).all(from, to, ...whArgs);
    const byKey = Object.fromEntries(trendRows.map((r) => [r.k, r]));
    const profitByKey = Object.fromEntries(profitRows.map((r) => [r.k, r.profit]));
    const keys = [];
    if (monthly) {
      for (let m = from.slice(0, 7); m <= to.slice(0, 7);) {
        keys.push(m);
        const [y, mo] = m.split('-').map(Number);
        m = mo === 12 ? `${y + 1}-01` : `${y}-${String(mo + 1).padStart(2, '0')}`;
      }
    } else {
      for (let d = from; d <= to; d = addDays(d, 1)) keys.push(d);
    }
    const trend = keys.map((k) => ({
      key: k,
      label: monthly
        ? new Date(`${k}-01T00:00:00Z`).toLocaleDateString('en-IN', { month: 'short', year: '2-digit', timeZone: 'UTC' })
        : new Date(`${k}T00:00:00Z`).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', timeZone: 'UTC' }),
      sales: r2(byKey[k]?.sales),
      bills: num(byKey[k]?.bills),
      gst: r2(byKey[k]?.gst),
      profit: r2(profitByKey[k]),
    }));

    const payments = db.prepare(`
      SELECT pp.method, COALESCE(SUM(pp.amount),0) amount, COUNT(*) n
      FROM pos_payments pp JOIN pos_sales s ON s.id = pp.sale_id
      WHERE ${COUNTED} AND ${day('pp.created_at')} BETWEEN ? AND ?${wh} GROUP BY pp.method ORDER BY amount DESC`).all(from, to, ...whArgs)
      .map((r) => ({ method: r.method, amount: r2(r.amount), count: num(r.n) }));

    const docTypes = db.prepare(`
      SELECT COALESCE(s.document_type,'tax_invoice') type, COUNT(*) n, COALESCE(SUM(s.grand_total),0) total
      FROM pos_sales s WHERE ${COUNTED} AND ${inRange}${wh} GROUP BY type ORDER BY total DESC`).all(from, to, ...whArgs)
      .map((r) => ({ type: r.type, count: num(r.n), total: r2(r.total) }));

    const lineNet = "(i.line_total * (CASE WHEN i.quantity > 0 THEN (i.quantity - COALESCE(i.quantity_returned,0)) / i.quantity ELSE 1 END))";
    const topProducts = db.prepare(`
      SELECT i.product_id id, MAX(i.product_name) name, MAX(i.sku) sku, SUM(i.quantity - COALESCE(i.quantity_returned,0)) qty,
        SUM(${lineNet}) revenue, COUNT(DISTINCT s.id) bills
      FROM pos_sale_items i JOIN pos_sales s ON s.id = i.sale_id
      WHERE ${COUNTED} AND ${inRange}${wh} GROUP BY i.product_id ORDER BY revenue DESC LIMIT 10`).all(from, to, ...whArgs)
      .map((r) => ({ ...r, qty: r2(r.qty), revenue: r2(r.revenue) }));

    const byCategory = db.prepare(`
      SELECT COALESCE(cat.name, 'Uncategorised') catName, SUM(${lineNet}) revenue, SUM(i.quantity - COALESCE(i.quantity_returned,0)) qty
      FROM pos_sale_items i JOIN pos_sales s ON s.id = i.sale_id
      LEFT JOIN products p ON p.id = i.product_id LEFT JOIN categories cat ON cat.id = p.category_id
      WHERE ${COUNTED} AND ${inRange}${wh} GROUP BY catName ORDER BY revenue DESC`).all(from, to, ...whArgs)
      .map((r) => ({ name: r.catName, revenue: r2(r.revenue), qty: r2(r.qty) }))
      .filter((r) => r.revenue > 0);

    const topCustomers = db.prepare(`
      SELECT c.id, c.name, c.city, c.code, COUNT(*) bills, COALESCE(SUM(s.grand_total),0) total, c.outstanding_balance due
      FROM pos_sales s JOIN customers c ON c.id = s.customer_id
      WHERE ${COUNTED} AND c.is_walk_in = 0 AND ${inRange}${wh} GROUP BY c.id ORDER BY total DESC LIMIT 10`).all(from, to, ...whArgs)
      .map((r) => ({ ...r, total: r2(r.total), due: r2(r.due) }));

    const walkIn = db.prepare(`
      SELECT COALESCE(SUM(CASE WHEN c.is_walk_in = 1 OR s.customer_id IS NULL THEN s.grand_total ELSE 0 END),0) walkIn,
             COALESCE(SUM(CASE WHEN c.is_walk_in = 0 THEN s.grand_total ELSE 0 END),0) registered
      FROM pos_sales s LEFT JOIN customers c ON c.id = s.customer_id WHERE ${COUNTED} AND ${inRange}${wh}`).get(from, to, ...whArgs);

    const byHourRows = db.prepare(`
      SELECT CAST(strftime('%H', s.created_at, ${IST}) AS INTEGER) h, COUNT(*) bills, COALESCE(SUM(s.grand_total),0) sales
      FROM pos_sales s WHERE ${COUNTED} AND ${inRange}${wh} GROUP BY h`).all(from, to, ...whArgs);
    const hourMap = Object.fromEntries(byHourRows.map((r) => [r.h, r]));
    const byHour = Array.from({ length: 24 }, (_, h) => ({ hour: h, label: `${String(h).padStart(2, '0')}:00`, bills: num(hourMap[h]?.bills), sales: r2(hourMap[h]?.sales) }))
      .filter((r, i, all) => {
        const first = all.findIndex((x) => x.bills > 0);
        const last = all.length - 1 - [...all].reverse().findIndex((x) => x.bills > 0);
        return first >= 0 && i >= Math.min(first, 9) && i <= Math.max(last, 20);
      });

    const byWeekdayRows = db.prepare(`
      SELECT CAST(strftime('%w', s.created_at, ${IST}) AS INTEGER) d, COUNT(*) bills, COALESCE(SUM(s.grand_total),0) sales
      FROM pos_sales s WHERE ${COUNTED} AND ${inRange}${wh} GROUP BY d`).all(from, to, ...whArgs);
    const wdMap = Object.fromEntries(byWeekdayRows.map((r) => [r.d, r]));
    const byWeekday = [1, 2, 3, 4, 5, 6, 0].map((d) => ({ day: WEEKDAYS[d], bills: num(wdMap[d]?.bills), sales: r2(wdMap[d]?.sales) }));

    const byStaff = db.prepare(`
      SELECT COALESCE(u.full_name, 'Unknown') staffName, COUNT(*) bills, COALESCE(SUM(s.grand_total),0) sales
      FROM pos_sales s LEFT JOIN users u ON u.id = s.created_by
      WHERE ${COUNTED} AND ${inRange}${wh} GROUP BY s.created_by ORDER BY sales DESC LIMIT 8`).all(from, to, ...whArgs)
      .map((r) => ({ name: r.staffName, bills: num(r.bills), sales: r2(r.sales) }));

    const recent = db.prepare(`
      SELECT s.id, s.invoice_number number, s.created_at at, s.grand_total total, s.payment_status payment, s.document_type type,
        CASE WHEN c.is_walk_in = 1 OR c.id IS NULL THEN 'Walk-in' ELSE c.name END customer
      FROM pos_sales s LEFT JOIN customers c ON c.id = s.customer_id
      WHERE ${COUNTED}${wh} ORDER BY s.created_at DESC LIMIT 8`).all(...whArgs)
      .map((r) => ({ ...r, total: r2(r.total) }));

    return {
      range: { from, to, days, prevFrom, prevTo, bucket: monthly ? 'month' : 'day' },
      kpis,
      trend,
      payments,
      docTypes,
      topProducts,
      byCategory,
      topCustomers,
      customerMix: [
        { name: 'Registered customers', value: r2(walkIn.registered) },
        { name: 'Walk-in', value: r2(walkIn.walkIn) },
      ],
      byHour,
      byWeekday,
      byStaff,
      recent,
    };
  }

  inventory(query, actor) {
    authService.checkPermission(actor.permissions, 'inventory.stock.view');
    const db = getDatabase();
    const { from, to } = range(query);
    const wh = query.warehouseId ? ' AND sl.warehouse_id = ?' : '';
    const whArgs = query.warehouseId ? [query.warehouseId] : [];
    const mwh = query.warehouseId ? ' AND m.warehouse_id = ?' : '';

    // stock per product (goods only), summed over the chosen warehouse(s)
    const stock = db.prepare(`
      SELECT p.id, p.name, p.sku, COALESCE(cat.name,'Uncategorised') category, COALESCE(b.name,'') brand,
        COALESCE(p.purchase_price,0) cost, COALESCE(p.selling_price,0) price, COALESCE(p.mrp,0) mrp,
        COALESCE(p.reorder_level,0) reorder, COALESCE(p.minimum_stock,0) minimum,
        COALESCE((SELECT SUM(sl.quantity_on_hand) FROM stock_levels sl WHERE sl.product_id = p.id${wh}),0) qty
      FROM products p LEFT JOIN categories cat ON cat.id = p.category_id LEFT JOIN brands b ON b.id = p.brand_id
      WHERE p.is_active = 1 AND COALESCE(p.item_type,'goods') != 'service'`).all(...whArgs);

    // units sold in the period (for fast movers and days of cover)
    const soldRows = db.prepare(`
      SELECT m.product_id id, SUM(m.quantity_out) - SUM(CASE WHEN m.movement_type = 'sales_return' THEN m.quantity_in ELSE 0 END) sold,
        MAX(CASE WHEN m.movement_type = 'pos_sale' THEN m.created_at END) lastSale
      FROM inventory_movements m
      WHERE m.status = 'completed' AND m.movement_type IN ('pos_sale','sales_return') AND ${day('m.created_at')} BETWEEN ? AND ?${mwh}
      GROUP BY m.product_id`).all(from, to, ...whArgs);
    const sold = Object.fromEntries(soldRows.map((r) => [r.id, r]));
    const lastSaleRows = db.prepare(`
      SELECT m.product_id id, MAX(m.created_at) last FROM inventory_movements m
      WHERE m.status = 'completed' AND m.movement_type = 'pos_sale'${mwh} GROUP BY m.product_id`).all(...whArgs);
    const lastSale = Object.fromEntries(lastSaleRows.map((r) => [r.id, r.last]));
    const periodDays = daysBetween(from, to);
    const deadSince = addDays(istToday(), -90);

    let units = 0; let costValue = 0; let saleValue = 0; let mrpValue = 0;
    let inStock = 0; let out = 0; let negative = 0; let low = 0;
    const catMap = {};
    const lowList = []; const dead = []; const movers = [];
    for (const p of stock) {
      const q = num(p.qty);
      const level = Math.max(num(p.reorder), num(p.minimum));
      if (q > 0) {
        inStock += 1;
        units += q;
        costValue += q * num(p.cost);
        saleValue += q * num(p.price);
        mrpValue += q * (num(p.mrp) || num(p.price));
        const c = (catMap[p.category] ||= { name: p.category, value: 0, units: 0, items: 0 });
        c.value += q * num(p.cost); c.units += q; c.items += 1;
      } else if (q < 0) negative += 1;
      else out += 1;
      const s = num(sold[p.id]?.sold);
      if (level > 0 && q <= level) {
        low += 1;
        lowList.push({ id: p.id, name: p.name, sku: p.sku, qty: r2(q), level, sold: r2(s), short: r2(level - q) });
      }
      const last = lastSale[p.id];
      if (q > 0 && (!last || String(last).slice(0, 10) < deadSince)) {
        dead.push({ id: p.id, name: p.name, sku: p.sku, qty: r2(q), value: r2(q * num(p.cost)), lastSale: last || null });
      }
      if (s > 0) {
        const perDay = s / periodDays;
        movers.push({ id: p.id, name: p.name, sku: p.sku, sold: r2(s), qty: r2(q), daysCover: perDay > 0 ? Math.max(0, Math.round(q / perDay)) : null });
      }
    }

    const byWarehouse = db.prepare(`
      SELECT w.id, w.name, COALESCE(SUM(CASE WHEN sl.quantity_on_hand > 0 THEN sl.quantity_on_hand * COALESCE(p.purchase_price,0) ELSE 0 END),0) value,
        COALESCE(SUM(CASE WHEN sl.quantity_on_hand > 0 THEN sl.quantity_on_hand ELSE 0 END),0) units,
        COUNT(DISTINCT CASE WHEN sl.quantity_on_hand > 0 THEN sl.product_id END) items
      FROM warehouses w LEFT JOIN stock_levels sl ON sl.warehouse_id = w.id LEFT JOIN products p ON p.id = sl.product_id AND p.is_active = 1
      WHERE w.is_active = 1 GROUP BY w.id ORDER BY value DESC`).all()
      .map((r) => ({ ...r, value: r2(r.value), units: r2(r.units) }));

    const flowRows = db.prepare(`
      SELECT ${day('m.created_at')} d,
        SUM(m.quantity_in * COALESCE(p.purchase_price,0)) inValue, SUM(m.quantity_out * COALESCE(p.purchase_price,0)) outValue,
        SUM(m.quantity_in) inQty, SUM(m.quantity_out) outQty
      FROM inventory_movements m LEFT JOIN products p ON p.id = m.product_id
      WHERE m.status = 'completed' AND ${day('m.created_at')} BETWEEN ? AND ?${mwh} GROUP BY d`).all(from, to, ...whArgs);
    const flowMap = Object.fromEntries(flowRows.map((r) => [r.d, r]));
    const monthly = periodDays > 62;
    let flow;
    if (monthly) {
      const m = {};
      for (const r of flowRows) {
        const k = r.d.slice(0, 7);
        const x = (m[k] ||= { key: k, inValue: 0, outValue: 0, inQty: 0, outQty: 0 });
        x.inValue += num(r.inValue); x.outValue += num(r.outValue); x.inQty += num(r.inQty); x.outQty += num(r.outQty);
      }
      flow = Object.values(m).sort((a, b) => a.key.localeCompare(b.key)).map((x) => ({
        ...x,
        label: new Date(`${x.key}-01T00:00:00Z`).toLocaleDateString('en-IN', { month: 'short', year: '2-digit', timeZone: 'UTC' }),
        inValue: r2(x.inValue), outValue: r2(x.outValue), inQty: r2(x.inQty), outQty: r2(x.outQty),
      }));
    } else {
      flow = [];
      for (let d = from; d <= to; d = addDays(d, 1)) {
        const r = flowMap[d];
        flow.push({
          key: d,
          label: new Date(`${d}T00:00:00Z`).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', timeZone: 'UTC' }),
          inValue: r2(r?.inValue), outValue: r2(r?.outValue), inQty: r2(r?.inQty), outQty: r2(r?.outQty),
        });
      }
    }

    const TYPE_LABELS = {
      pos_sale: 'Sales', sales_return: 'Sales returns', purchase: 'Purchases', purchase_return: 'Purchase returns',
      opening_stock: 'Opening stock', adjustment_increase: 'Adjustment +', adjustment_decrease: 'Adjustment −',
      transfer_in: 'Transfer in', transfer_out: 'Transfer out', damage: 'Damage', stock_count: 'Stock count',
    };
    const byType = db.prepare(`
      SELECT m.movement_type type, SUM(m.quantity_in) qin, SUM(m.quantity_out) qout, COUNT(*) n
      FROM inventory_movements m WHERE m.status = 'completed' AND ${day('m.created_at')} BETWEEN ? AND ?${mwh}
      GROUP BY m.movement_type ORDER BY (SUM(m.quantity_in) + SUM(m.quantity_out)) DESC`).all(from, to, ...whArgs)
      .map((r) => ({ type: r.type, label: TYPE_LABELS[r.type] || r.type.replace(/_/g, ' '), in: r2(r.qin), out: r2(r.qout), count: num(r.n) }));

    const pendingAdjustments = db.prepare(`SELECT COUNT(*) n FROM inventory_movements WHERE status = 'pending'`).get().n;

    return {
      range: { from, to, days: periodDays, bucket: monthly ? 'month' : 'day' },
      kpis: {
        items: stock.length,
        inStock,
        outOfStock: out,
        negative,
        lowStock: low,
        deadStock: dead.length,
        deadValue: r2(dead.reduce((s, d) => s + d.value, 0)),
        units: r2(units),
        costValue: r2(costValue),
        saleValue: r2(saleValue),
        mrpValue: r2(mrpValue),
        potentialMargin: r2(saleValue - costValue),
        pendingAdjustments: num(pendingAdjustments),
        soldUnits: r2(soldRows.reduce((s, r) => s + num(r.sold), 0)),
      },
      health: [
        { name: 'In stock', value: inStock },
        { name: 'Low stock', value: low },
        { name: 'Out of stock', value: out },
        { name: 'Negative', value: negative },
      ],
      byCategory: Object.values(catMap).map((c) => ({ ...c, value: r2(c.value), units: r2(c.units) })).sort((a, b) => b.value - a.value),
      byWarehouse,
      flow,
      byType,
      fastMovers: movers.sort((a, b) => b.sold - a.sold).slice(0, 10),
      lowStock: lowList.sort((a, b) => b.short - a.short).slice(0, 15),
      deadStock: dead.sort((a, b) => b.value - a.value).slice(0, 10),
    };
  }
}

export const dashboardService = new DashboardService();
