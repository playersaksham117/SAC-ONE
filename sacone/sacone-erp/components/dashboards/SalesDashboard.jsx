'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Bar, BarChart, CartesianGrid, Cell, ComposedChart, Line, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { apiRequest } from '../../lib/api';
import { useLiveRefresh } from '../../lib/live';
import { Alert } from '../ui';
import {
  COLORS, ChartCard, ChartTooltip, DashboardSkeleton, DonutLegend, Empty, Kpi, RangeBar, inr, inr2, inrShort, qtyFmt, useStoredRange,
} from './DashboardKit';

const METHOD = { cash: 'Cash', upi: 'UPI', card: 'Card', bank: 'Bank', credit: 'Credit (due)', cheque: 'Cheque', other: 'Other' };
const DOC = { tax_invoice: 'GST invoice', cash_invoice: 'Cash invoice', quick_bill: 'Quick Bill' };
const when = (iso) => new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

/** Sales dashboard: KPIs vs the previous period, trend, payment mix, products, customers, hours. */
export default function SalesDashboard() {
  const [range, setRange] = useStoredRange('sacone.dash.sales');
  const [warehouses, setWarehouses] = useState([]);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    apiRequest('/api/inventory/warehouses').then((w) => setWarehouses(Array.isArray(w) ? w : w.items || [])).catch(() => {});
  }, []);

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const q = new URLSearchParams({ dateFrom: range.from, dateTo: range.to });
      if (range.warehouseId) q.set('warehouseId', range.warehouseId);
      setData(await apiRequest(`/api/dashboards/sales?${q}`));
      setError('');
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [range.from, range.to, range.warehouseId]);

  useEffect(() => { load(); }, [load]);
  useLiveRefresh(() => load(true), { tables: ['pos_sales', 'pos_payments', 'pos_sales_returns'] });

  const k = data?.kpis;
  const c = k?.changes || {};
  const vsText = data ? `vs ${new Date(data.range.prevFrom).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })} – ${new Date(data.range.prevTo).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}` : '';
  const hasSales = data?.trend?.some((t) => t.sales > 0);
  const payData = (data?.payments || []).map((p, i) => ({ name: METHOD[p.method] || p.method, value: p.amount, color: p.method === 'credit' ? '#f59e0b' : COLORS[i % COLORS.length] }));
  const catData = (data?.byCategory || []).slice(0, 8).map((x, i) => ({ name: x.name, value: x.revenue, color: COLORS[i % COLORS.length] }));
  const mix = (data?.customerMix || []).filter((m) => m.value > 0).map((m, i) => ({ ...m, color: i ? '#94a3b8' : '#4f46e5' }));

  return (
    <div className="space-y-4" data-testid="sales-dashboard">
      <RangeBar value={range} onChange={setRange} warehouses={warehouses} onRefresh={() => load()} loading={loading} />
      <Alert message={error} />

      {!data && loading ? <DashboardSkeleton /> : data && (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <div className="col-span-2"><Kpi label="Net sales" value={inr(k.netSales)} change={c.netSales} sub={vsText} tone="indigo" icon="₹" /></div>
            <Kpi label="Bills" value={qtyFmt(k.bills)} change={c.bills} sub={`${qtyFmt(k.units)} units`} tone="sky" icon="🧾" />
            <Kpi label="Avg. bill" value={inr(k.avgBill)} change={c.avgBill} tone="violet" icon="⌀" />
            <Kpi label="Est. gross profit" value={inr(k.grossProfit)} change={c.grossProfit} sub={`${k.margin}% margin`} tone="emerald" icon="📈" />
            <Kpi label="GST collected" value={inr(k.gst)} change={c.gst} sub={`on ${inrShort(k.taxable)} taxable`} tone="teal" icon="%" />
            <Kpi label="Received" value={inr(k.collected)} change={c.collected} sub={k.credit > 0 ? `${inrShort(k.credit)} on credit` : 'no credit'} tone="sky" icon="💰" />
            <Kpi label="Returns" value={inr(k.returns)} change={c.returns} goodWhenUp={false} sub={`${k.returnCount} credit note${k.returnCount === 1 ? '' : 's'}`} tone="rose" icon="↩" />
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <ChartCard className="lg:col-span-2" title="Sales trend" subtitle={`${data.range.bucket === 'month' ? 'Monthly' : 'Daily'} sales (bars), estimated profit and bills`}>
              <div className="h-72">
                {hasSales ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={data.trend} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
                      <defs>
                        <linearGradient id="salesFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#4f46e5" stopOpacity={0.9} /><stop offset="100%" stopColor="#6366f1" stopOpacity={0.55} /></linearGradient>
                        <linearGradient id="profitFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#10b981" stopOpacity={0.25} /><stop offset="100%" stopColor="#10b981" stopOpacity={0} /></linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" vertical={false} />
                      <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={false} minTickGap={12} />
                      <YAxis yAxisId="v" tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={false} tickFormatter={inrShort} width={56} />
                      <YAxis yAxisId="n" orientation="right" tick={{ fontSize: 11, fill: '#94a3b8' }} tickLine={false} axisLine={false} allowDecimals={false} width={28} />
                      <Tooltip content={<ChartTooltip fmt={(v, n) => (n === 'Bills' ? qtyFmt(v) : inr2(v))} />} cursor={{ fill: '#f1f5f9' }} />
                      
                      <Bar yAxisId="v" dataKey="sales" name="Sales" fill="url(#salesFill)" radius={[6, 6, 0, 0]} maxBarSize={36} />
                      <Line yAxisId="v" type="linear" dataKey="profit" name="Est. profit" stroke="#10b981" strokeWidth={2.5} dot={false} activeDot={{ r: 4 }} />
                      <Line yAxisId="n" type="linear" dataKey="bills" name="Bills" stroke="#f59e0b" strokeWidth={1.5} strokeDasharray="4 3" dot={false} activeDot={{ r: 4 }} />
                    </ComposedChart>
                  </ResponsiveContainer>
                ) : <Empty />}
              </div>
            </ChartCard>

            <ChartCard title="How customers paid" subtitle="Money in by mode; credit is still due">
              {payData.length ? (
                <div className="grid items-center gap-3 sm:grid-cols-2 lg:grid-cols-1 2xl:grid-cols-2">
                  <div className="h-44">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={payData} dataKey="value" nameKey="name" innerRadius="58%" outerRadius="92%" paddingAngle={2} stroke="none">
                          {payData.map((d) => <Cell key={d.name} fill={d.color} />)}
                        </Pie>
                        <Tooltip content={<ChartTooltip />} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <DonutLegend data={payData} />
                </div>
              ) : <Empty />}
            </ChartCard>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <ChartCard className="lg:col-span-2" title="Top products" subtitle="By sales value after returns (incl. GST)">
              {data.topProducts.length ? (
                <div style={{ height: Math.max(180, data.topProducts.length * 34) }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data.topProducts} layout="vertical" margin={{ top: 0, right: 12, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" horizontal={false} />
                      <XAxis type="number" tick={{ fontSize: 11, fill: '#64748b' }} tickFormatter={inrShort} tickLine={false} axisLine={false} />
                      <YAxis type="category" dataKey="name" width={150} tick={{ fontSize: 11, fill: '#334155' }} tickLine={false} axisLine={false}
                        tickFormatter={(v) => (v.length > 22 ? `${v.slice(0, 21)}…` : v)} />
                      <Tooltip content={<ChartTooltip fmt={(v, n, p) => `${inr2(v)} · ${qtyFmt(p.qty)} sold`} />} cursor={{ fill: '#f8fafc' }} />
                      <Bar dataKey="revenue" name="Sales" radius={[0, 6, 6, 0]} maxBarSize={22}>
                        {data.topProducts.map((p, i) => <Cell key={p.id} fill={COLORS[i % COLORS.length]} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : <Empty />}
            </ChartCard>

            <ChartCard title="Sales by category">
              {catData.length ? (
                <div className="space-y-3">
                  <div className="h-40">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={catData} dataKey="value" nameKey="name" outerRadius="95%" stroke="#fff" strokeWidth={2}>
                          {catData.map((d) => <Cell key={d.name} fill={d.color} />)}
                        </Pie>
                        <Tooltip content={<ChartTooltip />} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <DonutLegend data={catData} />
                </div>
              ) : <Empty />}
            </ChartCard>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <ChartCard title="Busy hours" subtitle="Bills by hour of the day">
              <div className="h-52">
                {data.byHour.length ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data.byHour} margin={{ top: 4, right: 4, left: -18, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" vertical={false} />
                      <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#64748b' }} tickLine={false} axisLine={false} tickFormatter={(v) => v.slice(0, 2)} />
                      <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} tickLine={false} axisLine={false} allowDecimals={false} />
                      <Tooltip content={<ChartTooltip fmt={(v, n, p) => `${qtyFmt(v)} bills · ${inr(p.sales)}`} />} cursor={{ fill: '#f8fafc' }} />
                      <Bar dataKey="bills" name="Bills" fill="#0ea5e9" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : <Empty />}
              </div>
            </ChartCard>

            <ChartCard title="Sales by weekday">
              <div className="h-52">
                {hasSales ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data.byWeekday} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" vertical={false} />
                      <XAxis dataKey="day" tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={false} />
                      <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} tickLine={false} axisLine={false} tickFormatter={inrShort} width={52} />
                      <Tooltip content={<ChartTooltip fmt={(v, n, p) => `${inr2(v)} · ${p.bills} bills`} />} cursor={{ fill: '#f8fafc' }} />
                      <Bar dataKey="sales" name="Sales" fill="#8b5cf6" radius={[6, 6, 0, 0]} maxBarSize={40} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : <Empty />}
              </div>
            </ChartCard>

            <ChartCard title="Customers & bill types" className="md:col-span-2 xl:col-span-1">
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
                <div>
                  <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Who bought</div>
                  {mix.length ? (
                    <>
                      <div className="mb-2 flex h-3 overflow-hidden rounded-full bg-slate-100">
                        {mix.map((m) => <div key={m.name} style={{ width: `${(m.value / mix.reduce((s, x) => s + x.value, 0)) * 100}%`, background: m.color }} />)}
                      </div>
                      <DonutLegend data={mix} />
                      <p className="mt-1 text-xs text-slate-500">{k.customers} registered customer{k.customers === 1 ? '' : 's'} bought</p>
                    </>
                  ) : <Empty />}
                </div>
                <div>
                  <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Bill types</div>
                  <ul className="space-y-2">
                    {data.docTypes.map((d, i) => {
                      const max = Math.max(...data.docTypes.map((x) => x.total), 1);
                      return (
                        <li key={d.type}>
                          <div className="flex justify-between text-sm"><span className="text-slate-700">{DOC[d.type] || d.type} <span className="text-xs text-slate-400">· {d.count}</span></span><b className="tabular-nums">{inr(d.total)}</b></div>
                          <div className="mt-1 h-1.5 rounded-full bg-slate-100"><div className="h-1.5 rounded-full" style={{ width: `${(d.total / max) * 100}%`, background: COLORS[(i + 2) % COLORS.length] }} /></div>
                        </li>
                      );
                    })}
                    {!data.docTypes.length && <Empty />}
                  </ul>
                </div>
              </div>
            </ChartCard>
          </div>

          <div className="grid gap-4 xl:grid-cols-3">
            <ChartCard className="xl:col-span-2" title="Top customers" subtitle="Registered customers by sales in the period">
              {data.topCustomers.length ? (
                <div className="-mx-4 overflow-x-auto px-4">
                  <table className="min-w-full text-sm">
                    <thead className="text-left text-[11px] uppercase tracking-wide text-slate-500">
                      <tr><th className="py-2 pr-3">#</th><th className="py-2 pr-3">Customer</th><th className="py-2 pr-3 text-right">Bills</th><th className="py-2 pr-3 text-right">Sales</th><th className="py-2 text-right">Due now</th></tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {data.topCustomers.map((cu, i) => (
                        <tr key={cu.id}>
                          <td className="py-2 pr-3 text-slate-400">{i + 1}</td>
                          <td className="py-2 pr-3"><div className="font-semibold text-slate-900">{cu.name}</div><div className="text-xs text-slate-500">{[cu.city, cu.code].filter(Boolean).join(' · ')}</div></td>
                          <td className="py-2 pr-3 text-right tabular-nums">{cu.bills}</td>
                          <td className="py-2 pr-3 text-right font-semibold tabular-nums">{inr(cu.total)}</td>
                          <td className={`py-2 text-right tabular-nums ${cu.due > 0 ? 'font-semibold text-amber-700' : 'text-slate-400'}`}>{cu.due > 0 ? inr(cu.due) : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : <Empty text="No registered customers bought in this period" />}
            </ChartCard>

            <div className="space-y-4">
              <ChartCard title="By staff">
                <ul className="space-y-2">
                  {data.byStaff.map((s, i) => {
                    const max = Math.max(...data.byStaff.map((x) => x.sales), 1);
                    return (
                      <li key={s.name}>
                        <div className="flex justify-between gap-2 text-sm"><span className="truncate text-slate-700">{s.name} <span className="text-xs text-slate-400">· {s.bills}</span></span><b className="whitespace-nowrap tabular-nums">{inr(s.sales)}</b></div>
                        <div className="mt-1 h-1.5 rounded-full bg-slate-100"><div className="h-1.5 rounded-full" style={{ width: `${(s.sales / max) * 100}%`, background: COLORS[i % COLORS.length] }} /></div>
                      </li>
                    );
                  })}
                  {!data.byStaff.length && <Empty />}
                </ul>
              </ChartCard>
              <ChartCard title="Latest bills">
                <ul className="divide-y divide-slate-100">
                  {data.recent.map((r) => (
                    <li key={r.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                      <span className="min-w-0"><span className="block truncate font-mono text-xs font-semibold text-slate-800">{r.number}</span><span className="block truncate text-xs text-slate-500">{r.customer} · {when(r.at)}</span></span>
                      <span className="text-right"><b className="block tabular-nums">{inr(r.total)}</b><span className={`text-[11px] font-semibold capitalize ${r.payment === 'credit' ? 'text-amber-700' : r.payment === 'partial' ? 'text-sky-700' : 'text-emerald-700'}`}>{String(r.payment || '').replace(/_/g, ' ')}</span></span>
                    </li>
                  ))}
                  {!data.recent.length && <Empty />}
                </ul>
              </ChartCard>
            </div>
          </div>
          <p className="text-xs text-slate-400">Net sales = bills (incl. GST) − credit notes in the period. Profit is estimated from each item&apos;s purchase price (or the cost entered on the bill). Changes compare with the same number of days just before.</p>
        </>
      )}
    </div>
  );
}
