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

const BASES = [
  ['avg', 'Average purchase rate'],
  ['last', 'Last purchase rate'],
  ['master', 'Product Master purchase price'],
];
const BASIS_HELP = {
  avg: 'Cost = weighted average of all purchase-bill rates for the item up to the sale date.',
  last: 'Cost = rate on the item’s latest purchase bill up to the sale date.',
  master: 'Cost = purchase price in the Product Master today (each new purchase bill updates it).',
};
const SOURCE = { avg: null, last: null, master: 'master', service: 'service cost not entered', none: 'no cost', entered: null };

const INVOICE_COLUMNS = [
  { label: 'Date', value: (i) => day(i.date) },
  { label: 'Invoice', value: (i) => i.invoiceNumber },
  { label: 'Customer', value: (i) => i.customerName },
  { label: 'Sale value (ex-GST)', value: (i) => i.revenue },
  { label: 'Purchase cost (ex-GST)', value: (i) => i.cost },
  { label: 'Profit / loss', value: (i) => i.profit },
  { label: 'Margin %', value: (i) => i.marginPercent },
  { label: 'Billed by', value: (i) => i.staffName },
];
const LINE_COLUMNS = [
  { label: 'Date', value: (l) => day(l.date) },
  { label: 'Invoice', value: (l) => l.invoiceNumber },
  { label: 'Item', value: (l) => l.productName },
  { label: 'SKU', value: (l) => l.sku },
  { label: 'Qty kept', value: (l) => l.quantity },
  { label: 'Sold at (ex-GST)', value: (l) => l.soldAt },
  { label: 'Cost per unit', value: (l) => l.unitCost },
  { label: 'Cost from', value: (l) => l.costNote || l.costSource },
  { label: 'Sale value', value: (l) => l.revenue },
  { label: 'Cost', value: (l) => l.cost },
  { label: 'Profit / loss', value: (l) => l.profit },
  { label: 'Margin %', value: (l) => l.marginPercent },
];
const PRODUCT_COLUMNS = [
  { label: 'Item', value: (g) => g.label },
  { label: 'SKU', value: (g) => g.sku },
  { label: 'Qty kept', value: (g) => g.quantity },
  { label: 'Avg sold at', value: (g) => g.avgSoldAt },
  { label: 'Avg cost', value: (g) => g.avgCost },
  { label: 'Sale value', value: (g) => g.revenue },
  { label: 'Cost', value: (g) => g.cost },
  { label: 'Profit / loss', value: (g) => g.profit },
  { label: 'Margin %', value: (g) => g.marginPercent },
];

/** The cost of one bill line (a service job) typed here; blank clears it back to purchase rates. */
function LineCost({ saleId, line, onSaved }) {
  const [value, setValue] = useState(line.enteredCost ?? '');
  const [state, setState] = useState('');
  useEffect(() => { setValue(line.enteredCost ?? ''); }, [line.enteredCost]);
  const save = async () => {
    const next = value === '' ? null : Number(value);
    if (next === (line.enteredCost ?? null)) return;
    if (next !== null && !(next >= 0)) { setState('invalid'); return; }
    setState('saving');
    try {
      await apiRequest(`/api/pos/sales/${saleId}/items/${line.id}`, { method: 'PUT', body: JSON.stringify({ costAmount: next }) });
      setState('saved');
      onSaved();
    } catch (e) {
      setState(e.message);
    }
  };
  return (
    <span className="ml-2 inline-flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
      <span className={line.isService && line.enteredCost == null ? 'font-medium text-amber-700' : 'text-slate-400'}>{line.isService ? 'job cost ₹' : 'cost ₹'}</span>
      <input type="number" min="0" step="0.01" className="input-field !min-h-0 w-24 !py-0.5 text-xs" value={value} placeholder={line.isService ? 'enter' : 'auto'}
        aria-label={`Cost of ${line.productName} on this bill`} onChange={(e) => setValue(e.target.value)} onBlur={save} onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }} />
      {state === 'saving' && <span className="text-slate-400">…</span>}
      {state && !['saving', 'saved'].includes(state) && <span className="text-rose-700">{state}</span>}
    </span>
  );
}

function PL({ value }) {
  const tone = value > 0.004 ? 'text-emerald-700' : value < -0.004 ? 'text-rose-700' : 'text-slate-500';
  return <span className={`font-semibold ${tone}`}>{signed(value)}</span>;
}

/** Sales → Profit / Loss: each invoice's sale value against what its items cost to buy, both before GST. */
export default function SaleProfit() {
  const { session, checkPermission } = useAuth();
  const canSetCost = checkPermission('purchases.bills.view');
  const [filters, setFilters] = useState({ search: '', dateFrom: '', dateTo: '', show: 'all', basis: 'avg' });
  const [applied, setApplied] = useState(filters);
  const [data, setData] = useState(null);
  const [tab, setTab] = useState('invoices');
  const [open, setOpen] = useState(() => new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async (silent = false) => {
    if (silent !== true) setLoading(true);
    try {
      const q = new URLSearchParams({ show: applied.show, basis: applied.basis, limit: '2000' });
      if (applied.search) q.set('search', applied.search);
      if (applied.dateFrom) q.set('dateFrom', applied.dateFrom);
      if (applied.dateTo) q.set('dateTo', applied.dateTo);
      setData(await apiRequest(`/api/pos/reports/sale-profit?${q}`));
      setError('');
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [applied]);

  useEffect(() => { load(); }, [load]);
  useLiveRefresh(() => load(true), { tables: ['pos_sales', 'pos_sale_items', 'pos_sales_returns', 'supplier_bills', 'supplier_bill_items', 'products'] });

  const pick = (key, value) => { const f = { ...filters, [key]: value }; setFilters(f); setApplied(f); };
  const toggle = (id) => setOpen((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const t = data?.totals;
  const period = data?.period?.dateFrom ? `${day(data.period.dateFrom)} – ${day(data.period.dateTo)}` : 'all dates';
  const exportCsv = (what) => {
    if (!data) return;
    const stamp = [data.period.dateFrom, data.period.dateTo].filter(Boolean).join('_to_') || 'all';
    if (what === 'invoices') downloadCsv(`profit-per-sale-${data.basis}-${stamp}.csv`, toCsv(data.invoices, INVOICE_COLUMNS));
    if (what === 'lines') downloadCsv(`profit-per-item-line-${data.basis}-${stamp}.csv`, toCsv(data.invoices.flatMap((i) => i.lines.map((l) => ({ ...l, date: i.date, invoiceNumber: i.invoiceNumber }))), LINE_COLUMNS));
    if (what === 'products') downloadCsv(`profit-by-item-${data.basis}-${stamp}.csv`, toCsv(data.byProduct, PRODUCT_COLUMNS));
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Profit / Loss per Sale"
        description="Each invoice’s sale value against what its items cost to buy. Both before GST, after discounts; returned quantity is left out; no other expenses are deducted."
        actions={(
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn-secondary" onClick={() => exportCsv(tab === 'products' ? 'products' : 'invoices')} disabled={!data}>⬇ Export CSV</button>
            {tab === 'invoices' && <button type="button" className="btn-secondary" onClick={() => exportCsv('lines')} disabled={!data}>⬇ Item lines CSV</button>}
          </div>
        )}
      />
      <Alert message={error} />

      <Toolbar>
        <label className="flex items-center gap-2 text-sm text-slate-500">
          Purchase cost
          <select className="input-field w-auto" value={filters.basis} onChange={(e) => pick('basis', e.target.value)}>
            {BASES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </label>
        <select className="input-field w-auto" value={filters.show} onChange={(e) => pick('show', e.target.value)}>
          <option value="all">All sales</option>
          <option value="profit">Profit only</option>
          <option value="loss">Loss only</option>
        </select>
        <input
          className="input-field w-full sm:w-56"
          placeholder="Item, invoice or customer"
          value={filters.search}
          onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
          onKeyDown={(e) => { if (e.key === 'Enter') setApplied(filters); }}
        />
        <label className="flex items-center gap-2 text-sm text-slate-500">
          From <input type="date" className="input-field w-auto" value={filters.dateFrom} onChange={(e) => setFilters((f) => ({ ...f, dateFrom: e.target.value }))} />
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-500">
          To <input type="date" className="input-field w-auto" value={filters.dateTo} onChange={(e) => setFilters((f) => ({ ...f, dateTo: e.target.value }))} />
        </label>
        <button type="button" className="btn-primary" onClick={() => setApplied(filters)}>Apply</button>
      </Toolbar>
      <p className="text-xs text-slate-500">{BASIS_HELP[applied.basis]}</p>

      {loading && !data ? <LoadingState /> : data && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard label="Profit / loss" value={signed(t.profit)} hint={`${period}${session?.financialYear && !applied.dateFrom ? ` · FY ${session.financialYear.code}` : ''}`} tone={t.profit < 0 ? 'danger' : 'success'} compact />
            <StatCard label="Margin" value={`${t.marginPercent}%`} hint={`${t.invoices} sales`} compact />
            <StatCard label="Sale value vs cost" value={money(t.revenue)} hint={`cost ${money(t.cost)}`} compact />
            <StatCard label="Sales at a loss" value={String(t.lossInvoices)} hint={t.lossInvoices ? `lost ${signed(t.lossAmount)}` : 'none'} tone={t.lossInvoices ? 'warning' : 'default'} compact />
          </div>

          {t.serviceCostMissing > 0 && (
            <p className="rounded-xl bg-amber-50 px-4 py-2 text-xs text-amber-900">
              {t.serviceCostMissing} service line(s) have no job cost yet, so their whole sale value shows as profit. Open the sale (▸) and type what the job cost you — labour, parts, travel, sub-contractor — next to the line.
            </p>
          )}
          {(t.missingCostLines > 0 || t.masterPriceLines > 0) && (
            <p className="rounded-xl bg-amber-50 px-4 py-2 text-xs text-amber-900">
              {t.missingCostLines > 0 && <>{t.missingCostLines} item line(s) have no purchase rate and no Product Master purchase price, so their cost is taken as ₹0 (marked “no cost”). </>}
              {t.masterPriceLines > 0 && <>{t.masterPriceLines} line(s) had no purchase bill up to the sale date, so the Product Master purchase price is used (marked “master”).</>}
            </p>
          )}

          <ModuleTabs
            tabs={[
              { id: 'invoices', label: 'Per sale', badge: data.invoiceCount },
              { id: 'products', label: 'By item', badge: data.byProduct.length },
            ]}
            active={tab}
            onChange={setTab}
          />

          {tab === 'invoices' && (data.invoices.length === 0 ? (
            <EmptyPanel title="Nothing here" description={applied.show === 'loss' ? 'No sale made a loss in this period.' : 'No sales match these filters.'} />
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-3 py-3">Date · Invoice</th>
                    <th className="px-3 py-3">Customer</th>
                    <th className="px-3 py-3 text-right">Sale value</th>
                    <th className="px-3 py-3 text-right">Purchase cost</th>
                    <th className="px-3 py-3 text-right">Profit / loss</th>
                    <th className="px-3 py-3 text-right">Margin</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.invoices.map((i) => (
                    <Fragment key={i.saleId}>
                      <tr className={`cursor-pointer hover:bg-slate-50 ${i.profit < 0 ? 'bg-rose-50/40' : ''}`} onClick={() => toggle(i.saleId)}>
                        <td className="px-3 py-2">
                          <div className="font-mono text-xs font-semibold">{open.has(i.saleId) ? '▾' : '▸'} {i.invoiceNumber}</div>
                          <div className="text-xs text-slate-500">{day(i.date)} · {i.lines.length} item{i.lines.length === 1 ? '' : 's'}</div>
                        </td>
                        <td className="px-3 py-2 text-slate-700">{i.customerName}{i.missingCost && <span className="ml-2 text-[10px] text-amber-700">cost missing</span>}</td>
                        <td className="px-3 py-2 text-right">{money(i.revenue)}</td>
                        <td className="px-3 py-2 text-right text-slate-600">{money(i.cost)}</td>
                        <td className="px-3 py-2 text-right"><PL value={i.profit} /></td>
                        <td className={`px-3 py-2 text-right ${i.marginPercent < 0 ? 'text-rose-700' : 'text-slate-600'}`}>{i.marginPercent}%</td>
                      </tr>
                      {open.has(i.saleId) && i.lines.map((l) => (
                        <tr key={l.id} className="bg-slate-50/60 text-xs">
                          <td className="py-1.5 pl-8 pr-3" colSpan={2}>
                            <span className="font-medium text-slate-800">{l.productName}</span>
                            <span className="text-slate-500"> · {qty(l.quantity)} × {money(l.soldAt)} sold, cost {money(l.unitCost)}</span>
                            {SOURCE[l.costSource] && <span className="ml-1 text-amber-700">({SOURCE[l.costSource]})</span>}
                            {l.costNote && !SOURCE[l.costSource] && <span className="ml-1 text-slate-400">({l.costNote})</span>}
                            {canSetCost && <LineCost saleId={i.saleId} line={l} onSaved={() => load(true)} />}
                          </td>
                          <td className="px-3 py-1.5 text-right">{money(l.revenue)}</td>
                          <td className="px-3 py-1.5 text-right text-slate-600">{money(l.cost)}</td>
                          <td className="px-3 py-1.5 text-right"><PL value={l.profit} /></td>
                          <td className="px-3 py-1.5 text-right text-slate-600">{l.marginPercent}%</td>
                        </tr>
                      ))}
                    </Fragment>
                  ))}
                </tbody>
              </table>
              {data.invoiceCount > data.invoices.length && (
                <p className="border-t border-slate-100 px-4 py-2 text-xs text-slate-500">Showing {data.invoices.length} of {data.invoiceCount}. Narrow the dates or export CSV.</p>
              )}
            </div>
          ))}

          {tab === 'products' && (data.byProduct.length === 0 ? <EmptyPanel title="Nothing here" description="No sales in this period." /> : (
            <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-3 py-3">Item</th>
                    <th className="px-3 py-3 text-right">Qty</th>
                    <th className="px-3 py-3 text-right">Avg sold at</th>
                    <th className="px-3 py-3 text-right">Avg cost</th>
                    <th className="px-3 py-3 text-right">Profit / loss</th>
                    <th className="px-3 py-3 text-right">Margin</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.byProduct.map((g) => (
                    <tr key={g.key} className="hover:bg-slate-50">
                      <td className="px-3 py-2">
                        <div className="font-medium text-slate-900">{g.label}</div>
                        {g.sku && <div className="text-xs text-slate-400">{g.sku}</div>}
                      </td>
                      <td className="px-3 py-2 text-right">{qty(g.quantity)}</td>
                      <td className="px-3 py-2 text-right">{money(g.avgSoldAt)}</td>
                      <td className="px-3 py-2 text-right text-slate-600">{money(g.avgCost)}</td>
                      <td className="px-3 py-2 text-right"><PL value={g.profit} /></td>
                      <td className={`px-3 py-2 text-right ${g.marginPercent < 0 ? 'text-rose-700' : 'text-slate-600'}`}>{g.marginPercent}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
