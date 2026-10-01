'use client';

import { money, pct } from './formatters';

export function Panel({ title, children, action, id, subtitle }) {
  return (
    <section id={id} className="rounded-xl border border-slate-200/80 bg-white shadow-sm">
      <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-4 py-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
          {subtitle ? <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p> : null}
        </div>
        {action}
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

export function KpiCard({ kpi, format = 'money', onClick }) {
  if (!kpi) return null;
  const value = format === 'percent'
    ? `${Number(kpi.current || 0).toFixed(1)}%`
    : money(kpi.current);
  const trend = kpi.trend || 'flat';
  const trendColor = trend === 'up' ? 'text-emerald-600' : trend === 'down' ? 'text-rose-600' : 'text-slate-400';
  const arrow = trend === 'up' ? '↑' : trend === 'down' ? '↓' : '→';

  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-xl border border-slate-200/80 bg-white p-4 text-left shadow-sm transition hover:border-slate-300 hover:shadow ${
        onClick ? 'cursor-pointer' : 'cursor-default'
      }`}
    >
      <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
        {kpi.label}
      </div>
      <div className="mt-1 text-xl font-bold tabular-nums text-slate-900">{value}</div>
      {kpi.percentChange != null ? (
        <div className={`mt-1 text-xs font-medium ${trendColor}`}>
          {arrow} {pct(kpi.percentChange)} vs previous period
        </div>
      ) : (
        <div className="mt-1 text-xs text-slate-500">{kpi.hint || 'Current snapshot'}</div>
      )}
    </button>
  );
}

export function HealthScore({ health }) {
  if (!health) return null;
  const color = health.score >= 80 ? 'bg-emerald-500'
    : health.score >= 65 ? 'bg-sky-500'
      : health.score >= 40 ? 'bg-amber-500' : 'bg-rose-500';
  return (
    <div className="rounded-xl border border-slate-200/80 bg-gradient-to-br from-slate-900 to-slate-800 p-4 text-white shadow-sm">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-300">
        Business Health Score
      </div>
      <div className="mt-2 flex items-end gap-3">
        <div className="text-4xl font-bold tabular-nums">{health.score}</div>
        <div className="mb-1 text-sm font-medium text-slate-200">{health.category}</div>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-700">
        <div className={`h-full ${color}`} style={{ width: `${health.score}%` }} />
      </div>
      <p className="mt-2 text-[11px] text-slate-400">{health.disclaimer}</p>
      <ul className="mt-3 space-y-1">
        {health.factors?.map((f) => (
          <li key={f.key} className="flex justify-between text-xs text-slate-300">
            <span>{f.label}</span>
            <span className="tabular-nums">{f.score}/100 · w{f.weight}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function MiniTable({ columns, rows, empty = 'No data' }) {
  return (
    <div className="overflow-auto">
      <table className="min-w-full text-sm">
        <thead className="text-left text-[11px] uppercase tracking-wide text-slate-400">
          <tr>
            {columns.map((c) => (
              <th key={c.key} className={`pb-2 ${c.align === 'right' ? 'text-right' : ''}`}>{c.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows?.map((row, idx) => (
            <tr key={row.id || row.key || idx} className="border-t border-slate-50">
              {columns.map((c) => (
                <td key={c.key} className={`py-1.5 ${c.align === 'right' ? 'text-right tabular-nums' : ''}`}>
                  {c.render ? c.render(row) : row[c.key]}
                </td>
              ))}
            </tr>
          ))}
          {!rows?.length && (
            <tr><td colSpan={columns.length} className="py-4 text-slate-400">{empty}</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
