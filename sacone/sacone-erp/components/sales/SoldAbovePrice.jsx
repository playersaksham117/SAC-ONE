'use client';

import { Fragment, useCallback, useEffect, useState } from 'react';
import { apiRequest } from '../../lib/api';
import { useAuth } from '../../lib/auth-context';
import { downloadCsv, toCsv } from '../../lib/csv';
import { useLiveRefresh } from '../../lib/live';
import PageHeader, { Alert, LoadingState } from '../ui';
import { EmptyPanel, ModuleTabs, StatCard, Toolbar } from '../module-ui';

const money = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const signed = (n) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${money(Math.abs(n))}`;
const day = (iso) => (iso ? new Date(iso).toLocaleDateString('en-IN') : '');
const qty = (n) => Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 3 });

const SHOW = [
  ['above', 'Sold above base price'],
  ['all', 'All lines'],
  ['at', 'Sold at base price'],
  ['below', 'Sold below base price'],
];

const LINE_COLUMNS = [
  { label: 'Date', value: (l) => day(l.date) },
  { label: 'Invoice', value: (l) => l.invoiceNumber },
  { label: 'Customer', value: (l) => l.customerName },
  { label: 'Item', value: (l) => l.productName },
  { label: 'SKU', value: (l) => l.sku },
  { label: 'Qty kept', value: (l) => l.quantity },
  { label: 'Base price', value: (l) => l.basePrice },
  { label: 'Base price from', value: (l) => (l.basePriceSource === 'today' ? 'today (older bill)' : 'time of sale') },
  { label: 'Billed price', value: (l) => l.billedPrice },
  { label: 'Sold at (after discounts)', value: (l) => l.soldAt },
  { label: 'Difference per unit', value: (l) => l.differencePerUnit },
  { label: 'Difference total', value: (l) => l.difference },
  { label: 'Billed by', value: (l) => l.staffName },
  { label: 'Sales agent', value: (l) => l.agentName },
];
const GROUP_COLUMNS = (label) => [
  { label, value: (g) => g.label },
  { label: 'Qty kept', value: (g) => g.quantity },
  { label: 'Lines', value: (g) => g.lines },
  { label: 'Lines above base', value: (g) => g.aboveLines },
  { label: 'Base value', value: (g) => g.baseValue },
  { label: 'Sold value', value: (g) => g.soldValue },
  { label: 'Extra above base', value: (g) => g.extra },
  { label: 'Below base', value: (g) => g.short },
  { label: 'Uplift %', value: (g) => g.upliftPercent },
];

function Delta({ value }) {
  const tone = value > 0 ? 'text-emerald-700' : value < 0 ? 'text-rose-700' : 'text-slate-500';
  return <span className={`font-semibold ${tone}`}>{value === 0 ? '—' : signed(value)}</span>;
}

/** Sales → Sold Above Price: every item sold against its base selling price, and how much extra it earned. */
export default function SoldAbovePrice() {
  const { session } = useAuth();
  const [filters, setFilters] = useState({ search: '', dateFrom: '', dateTo: '', show: 'above' });
  const [applied, setApplied] = useState(filters);
  const [data, setData] = useState(null);
  const [tab, setTab] = useState('lines');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async (silent = false) => {
    if (silent !== true) setLoading(true);
    try {
      const q = new URLSearchParams({ show: applied.show, limit: '2000' });
      if (applied.search) q.set('search', applied.search);
      if (applied.dateFrom) q.set('dateFrom', applied.dateFrom);
      if (applied.dateTo) q.set('dateTo', applied.dateTo);
      setData(await apiRequest(`/api/pos/reports/price-realisation?${q}`));
      setError('');
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [applied]);

  useEffect(() => { load(); }, [load]);
  useLiveRefresh(() => load(true), { tables: ['pos_sales', 'pos_sale_items', 'pos_sales_returns', 'products'] });

  const t = data?.totals;
  const period = data?.period?.dateFrom ? `${day(data.period.dateFrom)} – ${day(data.period.dateTo)}` : 'all dates';
  const exportCsv = () => {
    if (!data) return;
    const stamp = [data.period.dateFrom, data.period.dateTo].filter(Boolean).join('_to_') || 'all';
    if (tab === 'lines') downloadCsv(`sold-above-price-${data.show}-${stamp}.csv`, toCsv(data.lines, LINE_COLUMNS));
    if (tab === 'products') downloadCsv(`sold-above-price-by-product-${stamp}.csv`, toCsv(data.byProduct, GROUP_COLUMNS('Item')));
    if (tab === 'staff') downloadCsv(`sold-above-price-by-staff-${stamp}.csv`, toCsv(data.byStaff, GROUP_COLUMNS('Billed by')));
    if (tab === 'sales') downloadCsv(`sold-above-price-by-sale-${stamp}.csv`, toCsv(data.bySale || [], SALE_COLUMNS));
  };

  return (
      <div className="space-y-4">
        <PageHeader
          title="Sold Above Price"
          description="Every item sold, against its base selling price: what was sold above the base price and how much extra it earned. Prices before GST, after line and bill discounts; returned quantity is left out."
          actions={<button type="button" className="btn-secondary" onClick={exportCsv} disabled={!data}>⬇ Export CSV</button>}
        />
        <Alert message={error} />

        <Toolbar>
          <input
            className="input-field w-full sm:w-64"
            placeholder="Item, SKU, invoice or customer"
            value={filters.search}
            onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
            onKeyDown={(e) => { if (e.key === 'Enter') setApplied(filters); }}
          />
          <select className="input-field w-auto" value={filters.show} onChange={(e) => { const f = { ...filters, show: e.target.value }; setFilters(f); setApplied(f); }}>
            {SHOW.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <label className="flex items-center gap-2 text-sm text-slate-500">
            From <input type="date" className="input-field w-auto" value={filters.dateFrom} onChange={(e) => setFilters((f) => ({ ...f, dateFrom: e.target.value }))} />
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-500">
            To <input type="date" className="input-field w-auto" value={filters.dateTo} onChange={(e) => setFilters((f) => ({ ...f, dateTo: e.target.value }))} />
          </label>
          <button type="button" className="btn-primary" onClick={() => setApplied(filters)}>Apply</button>
          {(applied.search || applied.dateFrom || applied.dateTo) && (
            <button type="button" className="btn-secondary" onClick={() => { const f = { search: '', dateFrom: '', dateTo: '', show: applied.show }; setFilters(f); setApplied(f); }}>Clear</button>
          )}
        </Toolbar>

        {loading && !data ? <LoadingState /> : data && (
          <>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <StatCard label="Extra earned above base" value={money(t.extra)} hint={`${period}${session?.financialYear && !applied.dateFrom ? ` · FY ${session.financialYear.code}` : ''}`} tone={t.extra > 0 ? 'success' : 'default'} compact />
              <StatCard label="Lines sold above base" value={`${t.aboveLines} of ${t.lines}`} hint={`${t.atLines} at base · ${t.belowLines} below`} compact />
              <StatCard label="Sold value vs base value" value={money(t.soldValue)} hint={`base ${money(t.baseValue)}`} compact />
              <StatCard label="Overall uplift" value={`${t.upliftPercent > 0 ? '+' : ''}${t.upliftPercent}%`} hint={t.short ? `below base: ${signed(t.short)}` : 'nothing sold below base'} tone={t.short ? 'warning' : 'default'} compact />
            </div>

            {data.usesTodaysPrice && (
              <p className="rounded-xl bg-amber-50 px-4 py-2 text-xs text-amber-900">
                Bills made before this report existed did not record the base price at the time of sale; for them today&apos;s base price is used (marked “today”).
              </p>
            )}

            <ModuleTabs
              tabs={[
                { id: 'lines', label: 'Items sold', badge: data.lineCount },
                { id: 'products', label: 'By item', badge: data.byProduct.length },
                { id: 'sales', label: 'By sale', badge: data.saleCount ?? (data.bySale || []).length },
                { id: 'staff', label: 'By staff', badge: data.byStaff.length },
              ]}
              active={tab}
              onChange={setTab}
            />

            {tab === 'lines' && (data.lines.length === 0 ? (
              <EmptyPanel title="Nothing here" description={applied.show === 'above' ? 'No item was sold above its base selling price in this period.' : 'No sales match these filters.'} />
            ) : (
              <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-3 py-3">Date · Invoice</th>
                      <th className="px-3 py-3">Item</th>
                      <th className="px-3 py-3 text-right">Qty</th>
                      <th className="px-3 py-3 text-right">Base price</th>
                      <th className="px-3 py-3 text-right">Sold at</th>
                      <th className="px-3 py-3 text-right">Per unit</th>
                      <th className="px-3 py-3 text-right">Total</th>
                      <th className="px-3 py-3">Billed by</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {data.lines.map((l) => (
                      <tr key={l.id} className="hover:bg-slate-50">
                        <td className="px-3 py-2">
                          <div className="font-mono text-xs font-semibold">{l.invoiceNumber}</div>
                          <div className="text-xs text-slate-500">{day(l.date)} · {l.customerName}</div>
                        </td>
                        <td className="px-3 py-2">
                          <div className="font-medium text-slate-900">{l.productName}</div>
                          <div className="text-xs text-slate-400">{l.sku}</div>
                        </td>
                        <td className="px-3 py-2 text-right">{qty(l.quantity)}</td>
                        <td className="px-3 py-2 text-right">
                          {money(l.basePrice)}
                          {l.basePriceSource === 'today' && <div className="text-[10px] text-amber-700">today</div>}
                        </td>
                        <td className="px-3 py-2 text-right">
                          {money(l.soldAt)}
                          {Math.abs(l.billedPrice - l.soldAt) > 0.004 && <div className="text-[10px] text-slate-400">billed {money(l.billedPrice)}</div>}
                        </td>
                        <td className="px-3 py-2 text-right"><Delta value={l.differencePerUnit} /></td>
                        <td className="px-3 py-2 text-right"><Delta value={l.difference} /></td>
                        <td className="px-3 py-2 text-xs text-slate-600">
                          {l.staffName}
                          {l.agentName && <div className="text-slate-400">agent {l.agentName}</div>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {data.lineCount > data.lines.length && (
                  <p className="border-t border-slate-100 px-4 py-2 text-xs text-slate-500">Showing {data.lines.length} of {data.lineCount}. Narrow the dates or export CSV.</p>
                )}
              </div>
            ))}

            {tab === 'products' && <GroupTable rows={data.byProduct} label="Item" showSku />}
            {tab === 'staff' && <StaffTable rows={data.byStaff} />}
            {tab === 'sales' && <SaleTable sales={data.bySale || []} showStaff />}
          </>
        )}
      </div>
  );
}

const SALE_COLUMNS = [
  { label: 'Date', value: (s) => day(s.date) },
  { label: 'Invoice', value: (s) => s.invoiceNumber },
  { label: 'Customer', value: (s) => s.customerName },
  { label: 'Billed by', value: (s) => s.staffName },
  { label: 'Agent', value: (s) => s.agentName },
  { label: 'Lines above base', value: (s) => s.aboveLines },
  { label: 'Lines', value: (s) => s.lines },
  { label: 'Extra earned above base', value: (s) => s.extra },
  { label: 'Given below base', value: (s) => s.short },
  { label: 'Net vs base', value: (s) => s.net },
  { label: 'Items', value: (s) => s.items.map((i) => `${i.productName} ${qty(i.quantity)} × ${signed(i.differencePerUnit)} = ${signed(i.difference)}`).join('; ') },
];

/** Sales with something sold above (or below) base: open one to see the items and how much each earned. */
function SaleTable({ sales, showStaff, nested = false }) {
  const [open, setOpen] = useState(() => new Set());
  const toggle = (id) => setOpen((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  if (!sales.length) return <EmptyPanel title="Nothing here" description="No sale had an item sold above or below its base price in this period." />;
  return (
    <div className={nested ? '' : 'overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm'}>
      <table className="min-w-full text-sm">
        <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-3 py-2">Date · Invoice</th>
            <th className="px-3 py-2">Customer</th>
            {showStaff && <th className="px-3 py-2">Billed by</th>}
            <th className="px-3 py-2 text-right">Items above base</th>
            <th className="px-3 py-2 text-right">Extra earned</th>
            <th className="px-3 py-2 text-right">Net vs base</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {sales.map((s) => (
            <Fragment key={s.saleId}>
              <tr className="cursor-pointer hover:bg-slate-50" onClick={() => toggle(s.saleId)}>
                <td className="px-3 py-2">
                  <div className="font-mono text-xs font-semibold">{open.has(s.saleId) ? '▾' : '▸'} {s.invoiceNumber}</div>
                  <div className="text-xs text-slate-500">{day(s.date)}</div>
                </td>
                <td className="px-3 py-2 text-slate-700">{s.customerName}</td>
                {showStaff && <td className="px-3 py-2 text-xs text-slate-600">{s.staffName}{s.agentName && <div className="text-slate-400">agent {s.agentName}</div>}</td>}
                <td className="px-3 py-2 text-right text-slate-600">{s.aboveLines} of {s.lines}</td>
                <td className="px-3 py-2 text-right"><Delta value={s.extra} />{s.short ? <div className="text-[10px] text-rose-700">below {signed(s.short)}</div> : null}</td>
                <td className="px-3 py-2 text-right"><Delta value={s.net} /></td>
              </tr>
              {open.has(s.saleId) && s.items.map((i) => (
                <tr key={i.id} className="bg-slate-50/60 text-xs">
                  <td className="py-1.5 pl-8 pr-3" colSpan={showStaff ? 4 : 3}>
                    <span className="font-medium text-slate-800">{i.productName}</span>
                    <span className="text-slate-500"> · {qty(i.quantity)} × sold {money(i.soldAt)} vs base {money(i.basePrice)}{i.basePriceSource === 'today' ? ' (today)' : ''} = <Delta value={i.differencePerUnit} /> each</span>
                  </td>
                  <td className="px-3 py-1.5 text-right"><Delta value={i.difference} /></td>
                  <td />
                </tr>
              ))}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Per staff member: open a row to see their sales sold above base, each with its items. */
function StaffTable({ rows }) {
  const [open, setOpen] = useState(null);
  if (!rows.length) return <EmptyPanel title="Nothing here" description="No sales in this period." />;
  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
      <table className="min-w-full text-sm">
        <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-3 py-3">Billed by</th>
            <th className="px-3 py-3 text-right">Sales above base</th>
            <th className="px-3 py-3 text-right">Items above base</th>
            <th className="px-3 py-3 text-right">Qty</th>
            <th className="px-3 py-3 text-right">Extra earned</th>
            <th className="px-3 py-3 text-right">Uplift</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((g) => (
            <Fragment key={g.key}>
              <tr className="cursor-pointer hover:bg-slate-50" onClick={() => setOpen(open === g.key ? null : g.key)}>
                <td className="px-3 py-2 font-medium text-slate-900">{open === g.key ? '▾' : '▸'} {g.label}</td>
                <td className="px-3 py-2 text-right text-slate-600">{g.salesAbove ?? '—'}</td>
                <td className="px-3 py-2 text-right text-slate-600">{g.aboveLines} of {g.lines}</td>
                <td className="px-3 py-2 text-right">{qty(g.quantity)}</td>
                <td className="px-3 py-2 text-right"><Delta value={g.extra} />{g.short ? <div className="text-[10px] text-rose-700">below {signed(g.short)}</div> : null}</td>
                <td className="px-3 py-2 text-right text-slate-600">{g.upliftPercent > 0 ? '+' : ''}{g.upliftPercent}%</td>
              </tr>
              {open === g.key && (
                <tr>
                  <td colSpan={6} className="bg-slate-50 p-3">
                    <div className="rounded-xl border border-slate-200 bg-white">
                      <SaleTable sales={g.sales || []} nested />
                    </div>
                  </td>
                </tr>
              )}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function GroupTable({ rows, label, showSku }) {
  if (!rows.length) return <EmptyPanel title="Nothing here" description="No sales in this period." />;
  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
      <table className="min-w-full text-sm">
        <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-3 py-3">{label}</th>
            <th className="px-3 py-3 text-right">Qty</th>
            <th className="px-3 py-3 text-right">Above base</th>
            <th className="px-3 py-3 text-right">Avg base</th>
            <th className="px-3 py-3 text-right">Avg sold at</th>
            <th className="px-3 py-3 text-right">Extra earned</th>
            <th className="px-3 py-3 text-right">Uplift</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((g) => (
            <tr key={g.key} className="hover:bg-slate-50">
              <td className="px-3 py-2">
                <div className="font-medium text-slate-900">{g.label}</div>
                {showSku && g.sku && <div className="text-xs text-slate-400">{g.sku}</div>}
              </td>
              <td className="px-3 py-2 text-right">{qty(g.quantity)}</td>
              <td className="px-3 py-2 text-right text-slate-600">{g.aboveLines} of {g.lines}</td>
              <td className="px-3 py-2 text-right">{money(g.avgBasePrice)}</td>
              <td className="px-3 py-2 text-right">{money(g.avgSoldAt)}</td>
              <td className="px-3 py-2 text-right"><Delta value={g.extra} />{g.short ? <div className="text-[10px] text-rose-700">below {signed(g.short)}</div> : null}</td>
              <td className="px-3 py-2 text-right text-slate-600">{g.upliftPercent > 0 ? '+' : ''}{g.upliftPercent}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
