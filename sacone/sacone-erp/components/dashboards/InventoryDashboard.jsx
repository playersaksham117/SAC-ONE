'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { apiRequest } from '../../lib/api';
import { useLiveRefresh } from '../../lib/live';
import { Alert } from '../ui';
import {
  COLORS, ChartCard, ChartTooltip, DashboardSkeleton, DonutLegend, Empty, Kpi, RangeBar, inr, inr2, inrShort, qtyFmt, useStoredRange,
} from './DashboardKit';

const HEALTH_COLORS = { 'In stock': '#10b981', 'Low stock': '#f59e0b', 'Out of stock': '#94a3b8', Negative: '#e11d48' };
const day = (iso) => (iso ? new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' }) : 'Never sold');

/** Inventory dashboard: stock value and health, category / warehouse split, flow, movers, alerts. */
export default function InventoryDashboard({ warehouses: givenWarehouses }) {
  const [range, setRange] = useStoredRange('sacone.dash.inventory');
  const [warehouses, setWarehouses] = useState(givenWarehouses || []);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (givenWarehouses?.length) { setWarehouses(givenWarehouses); return; }
    apiRequest('/api/inventory/warehouses').then((w) => setWarehouses(Array.isArray(w) ? w : w.items || [])).catch(() => {});
  }, [givenWarehouses]);

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const q = new URLSearchParams({ dateFrom: range.from, dateTo: range.to });
      if (range.warehouseId) q.set('warehouseId', range.warehouseId);
      setData(await apiRequest(`/api/dashboards/inventory?${q}`));
      setError('');
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [range.from, range.to, range.warehouseId]);

  useEffect(() => { load(); }, [load]);
  useLiveRefresh(() => load(true), { tables: ['stock_levels', 'inventory_movements', 'products'] });

  const k = data?.kpis;
  const health = (data?.health || []).filter((h) => h.value > 0).map((h) => ({ ...h, color: HEALTH_COLORS[h.name] }));
  const cats = (data?.byCategory || []).slice(0, 8);
  const hasFlow = data?.flow?.some((f) => f.inValue || f.outValue);
  const stocked = (data?.byWarehouse || []).filter((w) => w.units > 0);

  return (
    <div className="space-y-4" data-testid="inventory-dashboard">
      <RangeBar value={range} onChange={setRange} warehouses={warehouses} onRefresh={() => load()} loading={loading} />
      <Alert message={error} />

      {!data && loading ? <DashboardSkeleton /> : data && (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <div className="col-span-2"><Kpi label="Stock value (cost)" value={inr(k.costValue)} sub={`${qtyFmt(k.units)} units in ${k.inStock} items`} tone="indigo" icon="📦" /></div>
            <div className="col-span-2"><Kpi label="Stock value (selling)" value={inr(k.saleValue)} sub={`${inrShort(k.potentialMargin)} margin on hand`} tone="emerald" icon="🏷" /></div>
            <Kpi label="Sold (units)" value={qtyFmt(k.soldUnits)} sub="in the period" tone="sky" icon="🛒" />
            <Kpi label="Low stock" value={qtyFmt(k.lowStock)} sub="at or below reorder" tone="amber" icon="⚠" />
            <Kpi label="Out of stock" value={qtyFmt(k.outOfStock)} sub={k.negative ? `${k.negative} negative` : `of ${k.items} items`} tone="rose" icon="⛔" />
            <Kpi label="Dead stock" value={inr(k.deadValue)} sub={`${k.deadStock} items · no sale 90 days`} tone="slate" icon="🕸" />
          </div>
          {k.pendingAdjustments > 0 && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800">
              {k.pendingAdjustments} stock adjustment{k.pendingAdjustments === 1 ? ' is' : 's are'} waiting for approval (Pending Adjustments tab).
            </div>
          )}

          <div className="grid gap-4 lg:grid-cols-3">
            <ChartCard className="lg:col-span-2" title="Stock in and out" subtitle={`${data.range.bucket === 'month' ? 'Monthly' : 'Daily'} value moved, at purchase price`}>
              <div className="h-72">
                {hasFlow ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={data.flow} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                      <defs>
                        <linearGradient id="inFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#10b981" stopOpacity={0.35} /><stop offset="100%" stopColor="#10b981" stopOpacity={0} /></linearGradient>
                        <linearGradient id="outFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#6366f1" stopOpacity={0.35} /><stop offset="100%" stopColor="#6366f1" stopOpacity={0} /></linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" vertical={false} />
                      <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={false} minTickGap={12} />
                      <YAxis tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={false} tickFormatter={inrShort} width={56} />
                      <Tooltip content={<ChartTooltip fmt={(v, n, p) => `${inr2(v)} · ${qtyFmt(n === 'Stock in' ? p.inQty : p.outQty)} units`} />} />
                      <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                      <Area type="linear" dataKey="inValue" name="Stock in" stroke="#10b981" strokeWidth={2} fill="url(#inFill)" />
                      <Area type="linear" dataKey="outValue" name="Stock out" stroke="#6366f1" strokeWidth={2} fill="url(#outFill)" />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : <Empty text="No stock moved in this period" />}
              </div>
            </ChartCard>

            <ChartCard title="Stock health" subtitle={`${k.items} active goods`}>
              {health.length ? (
                <div className="grid items-center gap-3 sm:grid-cols-2 lg:grid-cols-1 2xl:grid-cols-2">
                  <div className="relative h-44">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={health} dataKey="value" nameKey="name" innerRadius="60%" outerRadius="92%" paddingAngle={2} stroke="none">
                          {health.map((h) => <Cell key={h.name} fill={h.color} />)}
                        </Pie>
                        <Tooltip content={<ChartTooltip fmt={(v) => `${qtyFmt(v)} items`} />} />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                      <span className="text-2xl font-black text-slate-900">{k.items ? Math.round((k.inStock / k.items) * 100) : 0}%</span>
                      <span className="text-[11px] text-slate-500">in stock</span>
                    </div>
                  </div>
                  <DonutLegend data={health} fmt={qtyFmt} />
                </div>
              ) : <Empty />}
            </ChartCard>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <ChartCard title="Stock value by category" subtitle="At purchase price">
              {cats.length ? (
                <div style={{ height: Math.max(180, cats.length * 36) }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={cats} layout="vertical" margin={{ top: 0, right: 12, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" horizontal={false} />
                      <XAxis type="number" tick={{ fontSize: 11, fill: '#64748b' }} tickFormatter={inrShort} tickLine={false} axisLine={false} />
                      <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 11, fill: '#334155' }} tickLine={false} axisLine={false} tickFormatter={(v) => (v.length > 16 ? `${v.slice(0, 15)}…` : v)} />
                      <Tooltip content={<ChartTooltip fmt={(v, n, p) => `${inr2(v)} · ${qtyFmt(p.units)} units · ${p.items} items`} />} cursor={{ fill: '#f8fafc' }} />
                      <Bar dataKey="value" name="Value" radius={[0, 6, 6, 0]} maxBarSize={22}>
                        {cats.map((c, i) => <Cell key={c.name} fill={COLORS[i % COLORS.length]} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : <Empty text="No stock on hand" />}
            </ChartCard>

            <ChartCard title="Movements by type" subtitle="Units in and out in the period">
              {data.byType.length ? (
                <div style={{ height: Math.max(180, data.byType.length * 38) }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data.byType} layout="vertical" margin={{ top: 0, right: 12, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" horizontal={false} />
                      <XAxis type="number" tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={false} />
                      <YAxis type="category" dataKey="label" width={120} tick={{ fontSize: 11, fill: '#334155' }} tickLine={false} axisLine={false} />
                      <Tooltip content={<ChartTooltip fmt={(v) => `${qtyFmt(v)} units`} />} cursor={{ fill: '#f8fafc' }} />
                      <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                      <Bar dataKey="in" name="In" stackId="a" fill="#10b981" radius={[0, 0, 0, 0]} maxBarSize={20} />
                      <Bar dataKey="out" name="Out" stackId="a" fill="#6366f1" radius={[0, 6, 6, 0]} maxBarSize={20} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : <Empty text="No movements in this period" />}
            </ChartCard>
          </div>

          {stocked.length > 1 && (
            <ChartCard title="By warehouse" subtitle="Stock value at purchase price">
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {stocked.map((w, i) => {
                  const total = stocked.reduce((s, x) => s + x.value, 0) || 1;
                  return (
                    <div key={w.id} className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                      <div className="flex items-center justify-between gap-2"><span className="truncate text-sm font-semibold text-slate-800">{w.name}</span><span className="text-xs text-slate-500">{Math.round((w.value / total) * 100)}%</span></div>
                      <div className="mt-1 text-lg font-black tabular-nums">{inr(w.value)}</div>
                      <div className="text-xs text-slate-500">{qtyFmt(w.units)} units · {w.items} items</div>
                      <div className="mt-2 h-1.5 rounded-full bg-white"><div className="h-1.5 rounded-full" style={{ width: `${(w.value / total) * 100}%`, background: COLORS[i % COLORS.length] }} /></div>
                    </div>
                  );
                })}
              </div>
            </ChartCard>
          )}

          <div className="grid gap-4 xl:grid-cols-3">
            <ChartCard title="Fast movers" subtitle="Most sold in the period · days of stock left">
              <ul className="space-y-2.5">
                {data.fastMovers.map((m) => {
                  const cover = m.daysCover;
                  const tone = cover === null ? 'bg-slate-300' : cover <= 7 ? 'bg-rose-500' : cover <= 30 ? 'bg-amber-500' : 'bg-emerald-500';
                  return (
                    <li key={m.id}>
                      <div className="flex justify-between gap-2 text-sm"><span className="truncate font-medium text-slate-800">{m.name}</span><b className="whitespace-nowrap tabular-nums">{qtyFmt(m.sold)} sold</b></div>
                      <div className="mt-1 flex items-center gap-2">
                        <div className="h-1.5 flex-1 rounded-full bg-slate-100"><div className={`h-1.5 rounded-full ${tone}`} style={{ width: `${Math.min(100, ((cover ?? 0) / 60) * 100)}%` }} /></div>
                        <span className="w-28 text-right text-xs text-slate-500">{qtyFmt(m.qty)} left · {cover === null ? '—' : `${cover}d`}</span>
                      </div>
                    </li>
                  );
                })}
                {!data.fastMovers.length && <Empty text="Nothing sold in this period" />}
              </ul>
            </ChartCard>

            <ChartCard title="Low stock · reorder" subtitle="At or below the reorder level">
              {data.lowStock.length ? (
                <div className="-mx-4 overflow-x-auto px-4">
                  <table className="w-full table-fixed text-sm">
                    <thead className="text-left text-[11px] uppercase tracking-wide text-slate-500">
                      <tr><th className="py-1.5 pr-2">Item</th><th className="w-14 py-1.5 pr-2 text-right">Have</th><th className="w-14 py-1.5 pr-2 text-right">Min</th><th className="w-14 py-1.5 text-right">Short</th></tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {data.lowStock.map((l) => (
                        <tr key={l.id}>
                          <td className="py-1.5 pr-2"><div className="truncate font-medium text-slate-800" title={l.name}>{l.name}</div><div className="text-[11px] text-slate-400">{l.sku}{l.sold ? ` · ${qtyFmt(l.sold)} sold` : ''}</div></td>
                          <td className={`py-1.5 pr-2 text-right font-semibold tabular-nums ${l.qty <= 0 ? 'text-rose-600' : 'text-amber-700'}`}>{qtyFmt(l.qty)}</td>
                          <td className="py-1.5 pr-2 text-right tabular-nums text-slate-500">{qtyFmt(l.level)}</td>
                          <td className="py-1.5 text-right font-semibold tabular-nums">{qtyFmt(l.short)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : <Empty text="Nothing below its reorder level" />}
            </ChartCard>

            <ChartCard title="Dead stock" subtitle="In stock, no sale in 90 days · by value">
              <ul className="divide-y divide-slate-100">
                {data.deadStock.map((d) => (
                  <li key={d.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                    <span className="min-w-0"><span className="block truncate font-medium text-slate-800">{d.name}</span><span className="block text-[11px] text-slate-400">{qtyFmt(d.qty)} units · last sold {day(d.lastSale)}</span></span>
                    <b className="whitespace-nowrap tabular-nums">{inr(d.value)}</b>
                  </li>
                ))}
                {!data.deadStock.length && <Empty text="No dead stock" />}
              </ul>
            </ChartCard>
          </div>
          <p className="text-xs text-slate-400">Stock is today&apos;s; sold units, flow and movements are for the chosen dates. Values use each item&apos;s purchase price; selling value uses its retail price.</p>
        </>
      )}
    </div>
  );
}
