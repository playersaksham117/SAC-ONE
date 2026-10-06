'use client';

import { Fragment, useCallback, useEffect, useState } from 'react';
import { apiRequest } from '../../lib/api';
import { useLiveRefresh } from '../../lib/live';
import { downloadCsv, toCsv } from '../../lib/csv';
import { Alert, LoadingState } from '../ui';
import { StatCard, Toolbar } from '../module-ui';

const money = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const qty = (n) => Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 3 });
const monthStart = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`; };
const today = () => new Date().toISOString().slice(0, 10);

/** Quantity and value pair; OUT is shown with a minus sign. */
function QtyValue({ q, v, sign = '' }) {
  const tone = sign === '+' ? 'text-emerald-700' : sign === '−' ? 'text-rose-700' : 'text-slate-900';
  const zero = !q && !v;
  return (
    <div className={`text-right ${zero ? 'text-slate-300' : tone}`}>
      <div className="font-medium">{zero ? '—' : `${sign}${qty(q)}`}</div>
      {!zero && <div className="text-xs opacity-80">{sign}{money(v)}</div>}
    </div>
  );
}

const CSV_COLUMNS = [
  { label: 'HSN', value: (r) => r.hsn },
  { label: 'Product', value: (r) => r.name ?? '(HSN total)' },
  { label: 'SKU', value: (r) => r.sku ?? '' },
  { label: 'Cost', value: (r) => r.cost ?? '' },
  { label: 'Opening qty', value: (r) => r.openingQty },
  { label: 'Opening value', value: (r) => r.openingValue },
  { label: 'In qty (+)', value: (r) => r.inQty },
  { label: 'In value (+)', value: (r) => r.inValue },
  { label: 'Out qty (−)', value: (r) => -r.outQty },
  { label: 'Out value (−)', value: (r) => -r.outValue },
  { label: 'Closing qty', value: (r) => r.closingQty },
  { label: 'Closing value', value: (r) => r.closingValue },
];

export default function HsnSummary({ warehouses = [] }) {
  const [filters, setFilters] = useState({ dateFrom: monthStart(), dateTo: today(), warehouseId: '' });
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [open, setOpen] = useState({});

  const load = useCallback(async () => {
    try {
      const q = new URLSearchParams(Object.entries(filters).filter(([, v]) => v));
      setData(await apiRequest(`/api/inventory/hsn-summary?${q}`));
      setError('');
    } catch (e) { setError(e.message); }
  }, [filters]);
  useEffect(() => { load(); }, [load]);
  useLiveRefresh(load, { tables: ['inventory_movements', 'stock_levels', 'products'] });

  const exportCsv = () => {
    const lines = [];
    for (const g of data.rows) {
      lines.push({ ...g, name: null });
      for (const item of g.items) lines.push({ ...item, hsn: g.hsn });
    }
    lines.push({ hsn: 'TOTAL', name: null, ...data.totals });
    downloadCsv(`hsn-stock-summary-${filters.dateFrom || 'start'}-to-${filters.dateTo || 'today'}.csv`, toCsv(lines, CSV_COLUMNS));
  };

  const t = data?.totals;
  return (
    <div className="space-y-4">
      <Toolbar>
        <label className="text-sm text-slate-500">From <input type="date" className="input-field ml-1 w-auto" value={filters.dateFrom} onChange={(e) => setFilters((f) => ({ ...f, dateFrom: e.target.value }))} /></label>
        <label className="text-sm text-slate-500">To <input type="date" className="input-field ml-1 w-auto" value={filters.dateTo} onChange={(e) => setFilters((f) => ({ ...f, dateTo: e.target.value }))} /></label>
        <select className="input-field w-auto" value={filters.warehouseId} onChange={(e) => setFilters((f) => ({ ...f, warehouseId: e.target.value }))}>
          <option value="">All warehouses</option>
          {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
        </select>
        <button type="button" className="btn-secondary ml-auto" onClick={exportCsv} disabled={!data?.rows.length}>⬇ Export CSV</button>
      </Toolbar>
      <Alert message={error} />

      {!data ? <LoadingState /> : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard compact label="Opening value" value={money(t.openingValue)} hint={`${qty(t.openingQty)} units`} />
            <StatCard compact tone="success" label="In (+)" value={`+${money(t.inValue)}`} hint={`+${qty(t.inQty)} units`} />
            <StatCard compact tone="danger" label="Out (−)" value={`−${money(t.outValue)}`} hint={`−${qty(t.outQty)} units`} />
            <StatCard compact tone="info" label="Closing value" value={money(t.closingValue)} hint={`${qty(t.closingQty)} units · ${data.rows.length} HSN`} />
          </div>

          <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3 text-left">HSN</th>
                  <th className="px-4 py-3 text-right">Opening</th>
                  <th className="px-4 py-3 text-right">In (+)</th>
                  <th className="px-4 py-3 text-right">Out (−)</th>
                  <th className="px-4 py-3 text-right">Closing</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.rows.map((g) => (
                  <Fragment key={g.hsn}>
                    <tr className="cursor-pointer hover:bg-slate-50" onClick={() => setOpen((o) => ({ ...o, [g.hsn]: !o[g.hsn] }))}>
                      <td className="px-4 py-3">
                        <div className="font-mono font-semibold text-slate-900">{open[g.hsn] ? '▾' : '▸'} {g.hsn}</div>
                        <div className="text-xs text-slate-500">{g.products} product{g.products === 1 ? '' : 's'}</div>
                      </td>
                      <td className="px-4 py-3"><QtyValue q={g.openingQty} v={g.openingValue} /></td>
                      <td className="px-4 py-3"><QtyValue q={g.inQty} v={g.inValue} sign="+" /></td>
                      <td className="px-4 py-3"><QtyValue q={g.outQty} v={g.outValue} sign="−" /></td>
                      <td className="px-4 py-3"><QtyValue q={g.closingQty} v={g.closingValue} /></td>
                    </tr>
                    {open[g.hsn] && (
                      <>
                        {Object.keys(g.byType).length > 0 && (
                          <tr className="bg-slate-50/60">
                            <td colSpan={5} className="px-6 py-2 text-xs text-slate-600">
                              {Object.values(g.byType).map((b) => (
                                <span key={b.label} className="mr-4 inline-block">
                                  {b.label}: {b.inQty ? <span className="text-emerald-700">+{qty(b.inQty)} ({money(b.inValue)})</span> : null}
                                  {b.outQty ? <span className="text-rose-700"> −{qty(b.outQty)} ({money(b.outValue)})</span> : null}
                                </span>
                              ))}
                            </td>
                          </tr>
                        )}
                        {g.items.map((p) => (
                          <tr key={p.productId} className="bg-slate-50/40 text-xs">
                            <td className="px-4 py-2 pl-10">
                              <div className="font-medium text-slate-800">{p.name}</div>
                              <div className="text-slate-500">{p.sku} · cost {money(p.cost)}</div>
                            </td>
                            <td className="px-4 py-2"><QtyValue q={p.openingQty} v={p.openingValue} /></td>
                            <td className="px-4 py-2"><QtyValue q={p.inQty} v={p.inValue} sign="+" /></td>
                            <td className="px-4 py-2"><QtyValue q={p.outQty} v={p.outValue} sign="−" /></td>
                            <td className="px-4 py-2"><QtyValue q={p.closingQty} v={p.closingValue} /></td>
                          </tr>
                        ))}
                      </>
                    )}
                  </Fragment>
                ))}
                {!data.rows.length && <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-400">No stock movements up to this date.</td></tr>}
              </tbody>
              {data.rows.length > 0 && (
                <tfoot className="border-t-2 border-slate-300 bg-slate-50 font-semibold">
                  <tr>
                    <td className="px-4 py-3">Total</td>
                    <td className="px-4 py-3"><QtyValue q={t.openingQty} v={t.openingValue} /></td>
                    <td className="px-4 py-3"><QtyValue q={t.inQty} v={t.inValue} sign="+" /></td>
                    <td className="px-4 py-3"><QtyValue q={t.outQty} v={t.outValue} sign="−" /></td>
                    <td className="px-4 py-3"><QtyValue q={t.closingQty} v={t.closingValue} /></td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
          <p className="text-xs text-slate-500">Value = quantity × the product&apos;s purchase price. Tap an HSN to see its products and the movement types (purchase, POS sale, returns, adjustments, transfers…).</p>
        </>
      )}
    </div>
  );
}
