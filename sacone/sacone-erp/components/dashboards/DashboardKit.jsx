'use client';

import { useEffect, useState } from 'react';

/** Shared pieces of the Sales and Inventory dashboards: range bar, KPI tiles, chart cards. */

export const COLORS = ['#4f46e5', '#0d9488', '#f59e0b', '#e11d48', '#0284c7', '#7c3aed', '#16a34a', '#ea580c', '#64748b', '#db2777'];

export const inr = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
export const inr2 = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const qtyFmt = (n) => Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 });
/** ₹ in short Indian units for chart axes: 1.2K, 3.4L, 1.1Cr */
export function inrShort(n) {
  const v = Math.abs(Number(n || 0));
  const s = v >= 1e7 ? `${(v / 1e7).toFixed(1)}Cr` : v >= 1e5 ? `${(v / 1e5).toFixed(1)}L` : v >= 1e3 ? `${(v / 1e3).toFixed(1)}K` : `${Math.round(v)}`;
  return `${n < 0 ? '−' : ''}₹${s.replace('.0', '')}`;
}

const ist = () => new Date(Date.now() + 330 * 60_000);
const iso = (d) => d.toISOString().slice(0, 10);
const shift = (s, days) => { const d = new Date(`${s}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + days); return iso(d); };

export function presetRange(id) {
  const today = iso(ist());
  const y = Number(today.slice(0, 4)); const m = Number(today.slice(5, 7));
  switch (id) {
    case 'today': return { from: today, to: today };
    case '7d': return { from: shift(today, -6), to: today };
    case 'month': return { from: `${today.slice(0, 7)}-01`, to: today };
    case 'lastMonth': {
      const first = new Date(Date.UTC(m === 1 ? y - 1 : y, (m + 10) % 12, 1));
      const last = new Date(Date.UTC(y, m - 1, 0));
      return { from: iso(first), to: iso(last) };
    }
    case 'fy': return { from: `${m >= 4 ? y : y - 1}-04-01`, to: today };
    case '30d':
    default: return { from: shift(today, -29), to: today };
  }
}

const PRESETS = [['today', 'Today'], ['7d', '7 days'], ['30d', '30 days'], ['month', 'This month'], ['lastMonth', 'Last month'], ['fy', 'This FY']];

/** Date presets + custom dates + optional warehouse; calls onChange({ from, to, warehouseId }). */
export function RangeBar({ value, onChange, warehouses = [], onRefresh, loading }) {
  const [preset, setPreset] = useState(value.preset || '30d');
  const pick = (id) => { setPreset(id); onChange({ ...value, ...presetRange(id), preset: id }); };
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm xl:flex-row xl:items-center xl:justify-between">
      <div className="flex flex-wrap gap-1">
        {PRESETS.map(([id, label]) => (
          <button key={id} type="button" onClick={() => pick(id)}
            className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium transition ${preset === id ? 'bg-brand-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100'}`}>
            {label}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-nowrap sm:items-center">
        <input type="date" className="input-field !min-h-0 !py-1.5 text-sm sm:w-40" value={value.from} max={value.to}
          onChange={(e) => { setPreset('custom'); onChange({ ...value, from: e.target.value, preset: 'custom' }); }} aria-label="From date" />
        <input type="date" className="input-field !min-h-0 !py-1.5 text-sm sm:w-40" value={value.to} min={value.from}
          onChange={(e) => { setPreset('custom'); onChange({ ...value, to: e.target.value, preset: 'custom' }); }} aria-label="To date" />
        {warehouses.length > 1 && (
          <select className="input-field col-span-2 !min-h-0 !py-1.5 text-sm sm:w-48" value={value.warehouseId || ''} onChange={(e) => onChange({ ...value, warehouseId: e.target.value })} aria-label="Warehouse">
            <option value="">All warehouses</option>
            {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
        )}
        {onRefresh && (
          <button type="button" className="btn-secondary col-span-2 !min-h-0 whitespace-nowrap !py-1.5 text-sm sm:col-span-1" onClick={onRefresh} disabled={loading}>
            {loading ? 'Loading…' : '↻ Refresh'}
          </button>
        )}
      </div>
    </div>
  );
}

const TONES = {
  indigo: 'from-indigo-500/10 text-indigo-700',
  teal: 'from-teal-500/10 text-teal-700',
  amber: 'from-amber-500/10 text-amber-700',
  rose: 'from-rose-500/10 text-rose-700',
  sky: 'from-sky-500/10 text-sky-700',
  violet: 'from-violet-500/10 text-violet-700',
  emerald: 'from-emerald-500/10 text-emerald-700',
  slate: 'from-slate-500/10 text-slate-700',
};

/** KPI tile: label, big value, optional % change vs the previous period (goodWhenUp decides the colour). */
export function Kpi({ label, value, sub, change, goodWhenUp = true, tone = 'indigo', icon }) {
  const has = change !== null && change !== undefined && Number.isFinite(change);
  const up = has && change >= 0;
  const good = has && (up === goodWhenUp);
  const pct = has ? (Math.abs(change) > 999 ? '>999' : Math.abs(change).toFixed(Math.abs(change) < 10 ? 1 : 0)) : '';
  return (
    <div className={`relative overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-br ${TONES[tone] || TONES.indigo} to-white p-4 shadow-sm`}>
      <div className="flex items-start justify-between gap-2">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</div>
        {icon && <span className="text-lg leading-none opacity-70" aria-hidden>{icon}</span>}
      </div>
      <div className="mt-1 truncate text-xl font-black tabular-nums text-slate-900 sm:text-2xl">{value}</div>
      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
        {has && (
          <span className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 font-semibold ${good ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
            {up ? '▲' : '▼'} {pct}%
          </span>
        )}
        {sub && <span className="text-slate-500">{sub}</span>}
      </div>
    </div>
  );
}

export function ChartCard({ title, subtitle, children, className = '', right }) {
  return (
    <section className={`min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm ${className}`}>
      <div className="mb-3 flex items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-bold text-slate-900">{title}</h3>
          {subtitle && <p className="text-xs text-slate-500">{subtitle}</p>}
        </div>
        {right}
      </div>
      {children}
    </section>
  );
}

export function Empty({ text = 'No data for this period' }) {
  return <div className="flex h-full min-h-[10rem] items-center justify-center rounded-xl border border-dashed border-slate-200 text-sm text-slate-400">{text}</div>;
}

/** Tooltip in the dashboards' style. `fmt(value, name)` formats each row. */
export function ChartTooltip({ active, payload, label, fmt = inr2 }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-slate-200 bg-white/95 px-3 py-2 text-xs shadow-lg backdrop-blur">
      {label !== undefined && <div className="mb-1 font-semibold text-slate-900">{label}</div>}
      {payload.map((p) => (
        <div key={p.dataKey || p.name} className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-1.5 text-slate-600"><span className="h-2 w-2 rounded-full" style={{ background: p.color || p.payload?.fill }} />{p.name}</span>
          <span className="font-semibold tabular-nums text-slate-900">{fmt(p.value, p.name, p.payload)}</span>
        </div>
      ))}
    </div>
  );
}

/** Legend list for donuts: colour, name, value and share. */
export function DonutLegend({ data, valueKey = 'value', nameKey = 'name', fmt = inr }) {
  const total = data.reduce((s, d) => s + Number(d[valueKey] || 0), 0);
  return (
    <ul className="space-y-1.5 text-sm">
      {data.map((d, i) => (
        <li key={d[nameKey]} className="flex items-center justify-between gap-3">
          <span className="flex min-w-0 items-center gap-2"><span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: d.color || COLORS[i % COLORS.length] }} /><span className="truncate text-slate-700">{d[nameKey]}</span></span>
          <span className="whitespace-nowrap tabular-nums text-slate-900"><b>{fmt(d[valueKey])}</b><span className="ml-1 text-xs text-slate-400">{total ? Math.round((Number(d[valueKey] || 0) / total) * 100) : 0}%</span></span>
        </li>
      ))}
    </ul>
  );
}

/** Small loading skeleton for the whole dashboard grid. */
export function DashboardSkeleton() {
  return (
    <div className="animate-pulse space-y-4" aria-busy="true">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">{Array.from({ length: 6 }, (_, i) => <div key={i} className="h-24 rounded-2xl bg-slate-100" />)}</div>
      <div className="grid gap-4 lg:grid-cols-3"><div className="h-80 rounded-2xl bg-slate-100 lg:col-span-2" /><div className="h-80 rounded-2xl bg-slate-100" /></div>
    </div>
  );
}

/** Remember the last range per dashboard in this browser. */
export function useStoredRange(key) {
  const [range, setRange] = useState(() => ({ ...presetRange('30d'), preset: '30d', warehouseId: '' }));
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(key) || 'null');
      if (saved?.preset && saved.preset !== 'custom') setRange({ ...presetRange(saved.preset), preset: saved.preset, warehouseId: saved.warehouseId || '' });
      else if (saved?.from && saved?.to) setRange(saved);
    } catch { /* ignore */ }
  }, [key]);
  const update = (r) => { setRange(r); try { localStorage.setItem(key, JSON.stringify(r)); } catch { /* ignore */ } };
  return [range, update];
}
