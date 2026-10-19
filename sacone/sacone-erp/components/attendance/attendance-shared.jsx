'use client';

import { useEffect, useState } from 'react';

export const STATUS = {
  present: { label: 'Present', short: 'P', tone: 'bg-emerald-100 text-emerald-800', cell: 'bg-emerald-500 text-white' },
  half_day: { label: 'Half day', short: 'H', tone: 'bg-amber-100 text-amber-800', cell: 'bg-amber-400 text-white' },
  absent: { label: 'Absent', short: 'A', tone: 'bg-rose-100 text-rose-700', cell: 'bg-rose-500 text-white' },
  leave: { label: 'Leave', short: 'L', tone: 'bg-sky-100 text-sky-800', cell: 'bg-sky-500 text-white' },
  holiday: { label: 'Holiday', short: 'Hol', tone: 'bg-violet-100 text-violet-800', cell: 'bg-violet-400 text-white' },
  week_off: { label: 'Week off', short: 'Off', tone: 'bg-slate-200 text-slate-700', cell: 'bg-slate-300 text-slate-700' },
};
export const STATUS_ORDER = ['present', 'half_day', 'absent', 'leave', 'holiday', 'week_off'];
export const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function StatusChip({ status }) {
  const s = STATUS[status];
  if (!s) return <span className="text-xs text-slate-400">Not marked</span>;
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${s.tone}`}>{s.label}</span>;
}

export const hours = (minutes) => {
  const m = Math.max(0, Math.round(Number(minutes) || 0));
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`;
};

/** 12-hour time from 'HH:MM'. */
export const time12 = (hhmm) => {
  if (!hhmm) return '—';
  const [h, m] = hhmm.split(':').map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
};

export const istMonth = (plus = 0) => {
  const d = new Date(Date.now() + 330 * 60000);
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + plus);
  return d.toISOString().slice(0, 7);
};
export const monthLabel = (month) => new Date(`${month}-01T00:00:00`).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
export const shiftMonth = (month, by) => {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + by, 1));
  return d.toISOString().slice(0, 7);
};

/** Minutes worked so far today (ticks every 30 s while checked in). */
export function useWorkedMinutes(record) {
  const [, tick] = useState(0);
  useEffect(() => {
    if (!record?.checkIn || record.checkOut) return undefined;
    const t = setInterval(() => tick((n) => n + 1), 30000);
    return () => clearInterval(t);
  }, [record?.checkIn, record?.checkOut]);
  if (!record?.checkIn) return 0;
  if (record.checkOut) return record.minutes;
  return Math.round((Date.now() - new Date(record.checkIn).getTime()) / 60000);
}

export function MonthPicker({ month, onChange, max = istMonth() }) {
  return (
    <div className="inline-flex items-center gap-1 rounded-xl bg-white p-1 ring-1 ring-slate-200">
      <button type="button" className="rounded-lg px-2.5 py-1 text-sm hover:bg-slate-100" onClick={() => onChange(shiftMonth(month, -1))} aria-label="Previous month">‹</button>
      <span className="min-w-[8.5rem] text-center text-sm font-semibold">{monthLabel(month)}</span>
      <button type="button" className="rounded-lg px-2.5 py-1 text-sm hover:bg-slate-100 disabled:opacity-30" disabled={month >= max} onClick={() => onChange(shiftMonth(month, 1))} aria-label="Next month">›</button>
    </div>
  );
}
