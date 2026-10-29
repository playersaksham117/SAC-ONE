'use client';

const money = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Aging buckets: days past the due date (bill date + credit days). */
export const BUCKETS = [
  ['notDue', 'Not due', 'text-emerald-700 bg-emerald-50 border-emerald-200'],
  ['d1_30', '1–30 days', 'text-amber-700 bg-amber-50 border-amber-200'],
  ['d31_60', '31–60 days', 'text-orange-700 bg-orange-50 border-orange-200'],
  ['d61_90', '61–90 days', 'text-red-700 bg-red-50 border-red-200'],
  ['d90plus', '90+ days', 'text-red-800 bg-red-100 border-red-300'],
];

/**
 * Totals of what is owed by age, for the whole filtered list; click a bucket to show only the
 * parties with money in it (click again to clear).
 */
export default function AgingBar({ totals, due, onDue, label = 'Outstanding' }) {
  if (!totals) return null;
  const tile = (key, title, value, cls) => (
    <button
      key={key}
      type="button"
      onClick={() => onDue(due === key ? '' : key)}
      className={`rounded-lg border px-3 py-2 text-left ${cls} ${due === key ? 'ring-2 ring-slate-900' : ''}`}
    >
      <div className="text-[11px] font-semibold uppercase tracking-wide opacity-80">{title}</div>
      <div className="text-sm font-bold tabular-nums">{money(value)}</div>
    </button>
  );
  return (
    <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-7">
      {tile('dues', label, totals.balance, 'border-slate-200 bg-white text-slate-900')}
      {tile('overdue', 'Overdue', totals.overdue, 'border-red-200 bg-white text-red-700')}
      {BUCKETS.map(([key, title, cls]) => tile(key, title, totals[key], cls))}
    </div>
  );
}

/** One party's aging (detail panel). */
export function AgingDetail({ aging, creditDays }) {
  if (!aging) return null;
  return (
    <div className="col-span-2 rounded-lg border border-slate-100 p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
        <span className="font-semibold uppercase tracking-wide">Aging · credit {creditDays ?? 30} days</span>
        {aging.overdue > 0
          ? <span className="font-semibold text-red-700">Overdue {money(aging.overdue)} · oldest {aging.maxDaysOverdue} days late</span>
          : <span className="font-semibold text-emerald-700">Nothing overdue</span>}
      </div>
      <div className="grid grid-cols-5 gap-2 text-center text-xs">
        {BUCKETS.map(([key, title, cls]) => (
          <div key={key} className={`rounded-md border px-1 py-1.5 ${cls}`}>
            <div className="opacity-80">{title}</div>
            <div className="font-bold tabular-nums">{money(aging[key])}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
