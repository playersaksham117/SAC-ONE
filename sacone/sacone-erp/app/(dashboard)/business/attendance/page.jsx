'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiRequest } from '../../../../lib/api';
import { useLiveRefresh } from '../../../../lib/live';
import { useAuth } from '../../../../lib/auth-context';
import PageHeader, { Alert, LoadingState } from '../../../../components/ui';
import { ModuleTabs, SectionCard } from '../../../../components/module-ui';
import {
  MonthPicker, STATUS, STATUS_ORDER, StatusChip, WEEKDAYS, hours, istMonth, monthLabel, time12, useWorkedMinutes,
} from '../../../../components/attendance/attendance-shared';

const istDay = (plus = 0) => new Date(Date.now() + 330 * 60000 + plus * 86400000).toISOString().slice(0, 10);
const shiftDay = (date, by) => new Date(Date.parse(`${date}T00:00:00Z`) + by * 86400000).toISOString().slice(0, 10);
const announce = () => window.dispatchEvent(new Event('attendance-changed'));

/* ───────────── My attendance ───────────── */

function MyAttendance({ canPunch }) {
  const [month, setMonth] = useState(istMonth());
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const worked = useWorkedMinutes(data?.today);

  const load = useCallback(async () => {
    try { setData(await apiRequest(`/api/attendance/me?month=${month}`)); } catch (err) { setError(err.message); }
  }, [month]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    window.addEventListener('attendance-changed', load);
    return () => window.removeEventListener('attendance-changed', load);
  }, [load]);

  const punch = async (action) => {
    setBusy(true);
    setError('');
    try { await apiRequest(`/api/attendance/${action}`, { method: 'POST' }); announce(); } catch (err) { setError(err.message); } finally { setBusy(false); }
  };

  if (!data) return error ? <Alert message={error} /> : <LoadingState />;
  const t = data.today;
  const byDate = new Map(data.records.map((r) => [r.date, r]));
  const [y, m] = month.split('-').map(Number);
  const firstDow = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
  const count = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const cells = [...Array(firstDow).fill(null), ...Array.from({ length: count }, (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`)];

  return (
    <div className="grid gap-5 lg:grid-cols-[22rem_1fr]">
      <div className="space-y-4">
        <Alert message={error} />
        <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-white to-slate-50 p-5 text-center shadow-sm">
          <div className="text-sm text-slate-500">{new Date(`${data.date}T00:00:00`).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}</div>
          <div className="mt-4 text-4xl font-bold tabular-nums text-slate-900">{t?.checkIn ? hours(worked) : '0h 00m'}</div>
          <div className="mt-1 text-xs text-slate-500">worked today</div>
          <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
            <div className="rounded-xl bg-white p-2 ring-1 ring-slate-200"><div className="text-xs text-slate-500">In</div><div className="font-semibold">{time12(t?.inTime)}</div></div>
            <div className="rounded-xl bg-white p-2 ring-1 ring-slate-200"><div className="text-xs text-slate-500">Out</div><div className="font-semibold">{time12(t?.outTime)}</div></div>
          </div>
          {t?.late && <div className="mt-3 text-xs font-medium text-amber-700">Late arrival (office opens {time12(data.settings.startTime)})</div>}
          {t && !t.checkIn && <div className="mt-3"><StatusChip status={t.status} /></div>}
          {canPunch && (
            <div className="mt-5">
              {!t?.checkIn && <button type="button" disabled={busy} onClick={() => punch('check-in')} className="w-full rounded-xl bg-emerald-600 py-3 text-base font-semibold text-white shadow hover:bg-emerald-700">Check in</button>}
              {t?.checkIn && !t.checkOut && <button type="button" disabled={busy} onClick={() => punch('check-out')} className="w-full rounded-xl bg-slate-900 py-3 text-base font-semibold text-white shadow hover:bg-slate-800">Check out</button>}
              {t?.checkOut && <div className="rounded-xl bg-emerald-50 py-3 text-sm font-medium text-emerald-800">✓ Day complete · <StatusChip status={t.status} /></div>}
            </div>
          )}
        </div>
        <div className="grid grid-cols-3 gap-2 text-center text-sm">
          {[['Present', data.totals.present], ['Half days', data.totals.half_day], ['Leave', data.totals.leave], ['Absent', data.totals.absent], ['Late', data.totals.late], ['Hours', hours(data.totals.minutes)]].map(([label, value]) => (
            <div key={label} className="rounded-xl bg-white p-2 ring-1 ring-slate-200"><div className="text-xs text-slate-500">{label}</div><div className="font-semibold">{value}</div></div>
          ))}
        </div>
      </div>

      <SectionCard title="My month" action={<MonthPicker month={month} onChange={setMonth} />}>
        <div className="grid grid-cols-7 gap-1.5 text-center">
          {WEEKDAYS.map((d) => <div key={d} className="pb-1 text-xs font-medium text-slate-400">{d}</div>)}
          {cells.map((date, i) => {
            if (!date) return <div key={`b${i}`} />;
            const r = byDate.get(date);
            const off = data.settings.weekOff.includes(new Date(`${date}T00:00:00Z`).getUTCDay());
            const future = date > data.date;
            return (
              <div key={date} title={r ? `${STATUS[r.status].label}${r.inTime ? ` · ${time12(r.inTime)}–${time12(r.outTime)}` : ''}${r.note ? ` · ${r.note}` : ''}` : ''}
                className={`flex aspect-square flex-col items-center justify-center rounded-xl text-sm ${r ? STATUS[r.status].cell : off ? 'bg-slate-100 text-slate-400' : future ? 'text-slate-300' : 'bg-white text-slate-500 ring-1 ring-slate-200'} ${date === data.date ? 'ring-2 ring-brand-500' : ''}`}>
                <span className="font-semibold">{Number(date.slice(8))}</span>
                {r && <span className="text-[10px] opacity-90">{r.inTime ? time12(r.inTime).replace(' ', '') : STATUS[r.status].short}</span>}
                {r?.late && <span className="text-[9px]">late</span>}
              </div>
            );
          })}
        </div>
        <div className="mt-4 flex flex-wrap gap-2 text-xs">
          {STATUS_ORDER.map((s) => <span key={s} className="inline-flex items-center gap-1"><span className={`h-3 w-3 rounded ${STATUS[s].cell}`} />{STATUS[s].label}</span>)}
        </div>
      </SectionCard>
    </div>
  );
}

/* ───────────── Daily register ───────────── */

function Register({ canEdit }) {
  const [date, setDate] = useState(istDay());
  const [data, setData] = useState(null);
  const [draft, setDraft] = useState({});
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setError('');
    try {
      const d = await apiRequest(`/api/attendance/register?date=${date}`);
      setData(d);
      setDraft(Object.fromEntries(d.rows.map((r) => [r.userId, {
        status: r.record?.status || '', inTime: r.record?.inTime || '', outTime: r.record?.outTime || '', note: r.record?.note || '',
      }])));
    } catch (err) { setError(err.message); }
  }, [date]);
  useEffect(() => { setMessage(''); load(); }, [load]);
  useLiveRefresh(() => { if (!saving && !dirty) load(); }, { tables: ['attendance'] });

  const original = useMemo(() => Object.fromEntries((data?.rows || []).map((r) => [r.userId, JSON.stringify({
    status: r.record?.status || '', inTime: r.record?.inTime || '', outTime: r.record?.outTime || '', note: r.record?.note || '',
  })])), [data]);
  const changed = Object.keys(draft).filter((id) => JSON.stringify(draft[id]) !== original[id]);
  const dirty = changed.length > 0;
  const set = (id, patch) => setDraft((d) => ({ ...d, [id]: { ...d[id], ...patch } }));
  const markAll = (status) => setDraft((d) => Object.fromEntries(Object.entries(d).map(([id, v]) => [id, v.status ? v : { ...v, status }])));

  const save = async () => {
    setSaving(true);
    setError('');
    try {
      const res = await apiRequest('/api/attendance/register', { method: 'PUT', body: JSON.stringify({ date, entries: changed.map((userId) => ({ userId, ...draft[userId] })) }) });
      setMessage(`Saved ${res.saved} change${res.saved === 1 ? '' : 's'}.`);
      announce();
      await load();
    } catch (err) { setError(err.message); } finally { setSaving(false); }
  };

  const counts = STATUS_ORDER.map((s) => [s, Object.values(draft).filter((v) => v.status === s).length]);
  const unmarked = Object.values(draft).filter((v) => !v.status).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex items-center gap-1 rounded-xl bg-white p-1 ring-1 ring-slate-200">
          <button type="button" className="rounded-lg px-2.5 py-1 hover:bg-slate-100" onClick={() => setDate(shiftDay(date, -1))} aria-label="Previous day">‹</button>
          <input type="date" className="rounded-lg border-0 px-1 py-1 text-sm font-semibold focus:ring-0" max={istDay()} value={date} onChange={(e) => e.target.value && setDate(e.target.value)} />
          <button type="button" className="rounded-lg px-2.5 py-1 hover:bg-slate-100 disabled:opacity-30" disabled={date >= istDay()} onClick={() => setDate(shiftDay(date, 1))} aria-label="Next day">›</button>
        </div>
        {date !== istDay() && <button type="button" className="text-sm font-medium text-brand-600" onClick={() => setDate(istDay())}>Today</button>}
        {data?.isWeekOff && <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">Weekly off</span>}
        <div className="ml-auto flex flex-wrap gap-2 text-xs">
          {counts.filter(([, c]) => c).map(([s, c]) => <span key={s} className={`rounded-full px-2 py-1 font-medium ${STATUS[s].tone}`}>{STATUS[s].label} {c}</span>)}
          {unmarked > 0 && <span className="rounded-full bg-white px-2 py-1 font-medium text-slate-500 ring-1 ring-slate-200">Not marked {unmarked}</span>}
        </div>
      </div>
      <Alert message={error} />
      <Alert type="success" message={message} />
      {!data ? <LoadingState /> : (
        <SectionCard noPadding
          title={`${new Date(`${date}T00:00:00`).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}`}
          action={canEdit && (
            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn-secondary !min-h-0 !py-1.5 text-xs" onClick={() => markAll(data.isWeekOff ? 'week_off' : 'present')}>Fill rest as {data.isWeekOff ? 'Week off' : 'Present'}</button>
              <button type="button" className="btn-primary !min-h-0 !py-1.5 text-xs" disabled={!dirty || saving} onClick={save}>{saving ? 'Saving…' : dirty ? `Save ${changed.length} change${changed.length === 1 ? '' : 's'}` : 'Saved'}</button>
            </div>
          )}>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                <tr><th className="px-4 py-2.5">Staff</th><th className="px-4 py-2.5">Status</th><th className="px-4 py-2.5">In</th><th className="px-4 py-2.5">Out</th><th className="px-4 py-2.5">Hours</th><th className="px-4 py-2.5">Note</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.rows.map((r) => {
                  const v = draft[r.userId] || {};
                  const working = ['present', 'half_day'].includes(v.status);
                  const isChanged = JSON.stringify(v) !== original[r.userId];
                  return (
                    <tr key={r.userId} className={isChanged ? 'bg-amber-50/60' : ''}>
                      <td className="px-4 py-2.5">
                        <div className="font-medium text-slate-900">{r.fullName}</div>
                        <div className="text-xs text-slate-500">{r.roleName}{r.record?.source === 'pos' ? ' · via SAC-POS' : r.record?.source === 'erp' ? ' · self check-in' : ''}{r.record?.late ? ' · late' : ''}</div>
                      </td>
                      <td className="px-4 py-2.5">
                        {canEdit ? (
                          <div className="flex gap-1">
                            {STATUS_ORDER.map((s) => (
                              <button key={s} type="button" title={STATUS[s].label} onClick={() => set(r.userId, { status: v.status === s ? '' : s })}
                                className={`min-w-[2.25rem] rounded-lg px-2 py-1 text-xs font-semibold ${v.status === s ? STATUS[s].cell : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>
                                {STATUS[s].short}
                              </button>
                            ))}
                          </div>
                        ) : <StatusChip status={v.status} />}
                      </td>
                      <td className="px-4 py-2.5">{canEdit && working ? <input type="time" className="input-field !min-h-0 w-28 !py-1" value={v.inTime} onChange={(e) => set(r.userId, { inTime: e.target.value })} /> : time12(working ? v.inTime : '')}</td>
                      <td className="px-4 py-2.5">{canEdit && working ? <input type="time" className="input-field !min-h-0 w-28 !py-1" value={v.outTime} onChange={(e) => set(r.userId, { outTime: e.target.value })} /> : time12(working ? v.outTime : '')}</td>
                      <td className="px-4 py-2.5 text-xs text-slate-600">{r.record?.checkIn && !r.record.checkOut ? 'Working…' : r.record?.minutes ? hours(r.record.minutes) : '—'}</td>
                      <td className="px-4 py-2.5">{canEdit ? <input className="input-field !min-h-0 w-40 !py-1" placeholder="—" value={v.note} onChange={(e) => set(r.userId, { note: e.target.value })} /> : (v.note || '—')}</td>
                    </tr>
                  );
                })}
                {!data.rows.length && <tr><td colSpan={6} className="px-4 py-10 text-center text-slate-400">No active users in this firm. Add staff in User Management.</td></tr>}
              </tbody>
            </table>
          </div>
        </SectionCard>
      )}
      {canEdit && <p className="text-xs text-slate-500">P Present · H Half day · A Absent · L Leave · Hol Holiday · Off Week off. Tap a status again to clear it. Changes are highlighted until saved.</p>}
    </div>
  );
}

/* ───────────── Monthly summary ───────────── */

function Summary() {
  const [month, setMonth] = useState(istMonth());
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    setData(null);
    apiRequest(`/api/attendance/summary?month=${month}`).then(setData).catch((e) => setError(e.message));
  }, [month]);

  const exportCsv = () => {
    const head = ['Staff', 'Role', 'Present', 'Half days', 'Days worked', 'Absent', 'Leave', 'Holiday', 'Week off', 'Not marked', 'Late', 'Hours'];
    const lines = data.rows.map((r) => [r.fullName, r.roleName, r.present, r.half_day, r.days, r.absent, r.leave, r.holiday, r.week_off, r.notMarked, r.late, (r.minutes / 60).toFixed(2)]);
    const csv = [head, ...lines].map((row) => row.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([`﻿${csv}`], { type: 'text/csv' }));
    a.download = `attendance-${month}.csv`;
    a.click();
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <MonthPicker month={month} onChange={setMonth} />
        {data && <span className="text-sm text-slate-500">{data.workingDays} working day{data.workingDays === 1 ? '' : 's'} so far</span>}
        {data?.rows.length > 0 && <button type="button" className="btn-secondary ml-auto text-sm" onClick={exportCsv}>⬇ Export CSV</button>}
      </div>
      <Alert message={error} />
      {!data ? <LoadingState /> : (
        <SectionCard noPadding title={`Attendance · ${monthLabel(month)}`}>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-2.5 text-left">Staff</th>
                  <th className="px-3 py-2.5 text-right">Days worked</th>
                  <th className="px-3 py-2.5 text-right">Present</th>
                  <th className="px-3 py-2.5 text-right">Half</th>
                  <th className="px-3 py-2.5 text-right">Absent</th>
                  <th className="px-3 py-2.5 text-right">Leave</th>
                  <th className="px-3 py-2.5 text-right">Hol / Off</th>
                  <th className="px-3 py-2.5 text-right">Not marked</th>
                  <th className="px-3 py-2.5 text-right">Late</th>
                  <th className="px-4 py-2.5 text-right">Hours</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.rows.map((r) => (
                  <tr key={r.userId}>
                    <td className="px-4 py-2.5"><div className="font-medium">{r.fullName}</div><div className="text-xs text-slate-500">{r.roleName}</div></td>
                    <td className="px-3 py-2.5 text-right text-base font-semibold">{r.days}</td>
                    <td className="px-3 py-2.5 text-right">{r.present}</td>
                    <td className="px-3 py-2.5 text-right">{r.half_day}</td>
                    <td className={`px-3 py-2.5 text-right ${r.absent ? 'font-semibold text-rose-600' : ''}`}>{r.absent}</td>
                    <td className="px-3 py-2.5 text-right">{r.leave}</td>
                    <td className="px-3 py-2.5 text-right text-slate-500">{r.holiday + r.week_off}</td>
                    <td className={`px-3 py-2.5 text-right ${r.notMarked ? 'text-amber-600' : 'text-slate-400'}`}>{r.notMarked}</td>
                    <td className={`px-3 py-2.5 text-right ${r.late ? 'text-amber-700' : ''}`}>{r.late}</td>
                    <td className="px-4 py-2.5 text-right">{hours(r.minutes)}</td>
                  </tr>
                ))}
                {!data.rows.length && <tr><td colSpan={10} className="px-4 py-10 text-center text-slate-400">No active users in this firm.</td></tr>}
              </tbody>
            </table>
          </div>
        </SectionCard>
      )}
      <p className="text-xs text-slate-500">Days worked = present + half days ÷ 2. “Not marked” counts past working days (weekly offs excluded, from the day attendance started being used) with no check-in and nothing marked in the register.</p>
    </div>
  );
}

/* ───────────── Settings ───────────── */

function AttendanceSettings({ canEdit }) {
  const [form, setForm] = useState(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  useEffect(() => { apiRequest('/api/attendance/settings').then(setForm).catch((e) => setError(e.message)); }, []);
  const save = async (e) => {
    e.preventDefault();
    setError('');
    setMessage('');
    try { setForm(await apiRequest('/api/attendance/settings', { method: 'PUT', body: JSON.stringify(form) })); setMessage('Attendance settings saved.'); } catch (err) { setError(err.message); }
  };
  if (!form) return error ? <Alert message={error} /> : <LoadingState />;
  return (
    <form onSubmit={save} className="max-w-xl space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <Alert message={error} />
      <Alert type="success" message={message} />
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="text-sm"><span className="label">Office opens</span><input type="time" className="input-field" disabled={!canEdit} value={form.startTime} onChange={(e) => setForm({ ...form, startTime: e.target.value })} /></label>
        <label className="text-sm"><span className="label">Late after (min)</span><input type="number" min="0" max="240" className="input-field" disabled={!canEdit} value={form.graceMinutes} onChange={(e) => setForm({ ...form, graceMinutes: e.target.value })} /></label>
        <label className="text-sm"><span className="label">Half day below (hours)</span><input type="number" min="0" max="12" step="0.5" className="input-field" disabled={!canEdit} value={form.halfDayHours} onChange={(e) => setForm({ ...form, halfDayHours: e.target.value })} /></label>
      </div>
      <div>
        <span className="label">Weekly off</span>
        <div className="flex flex-wrap gap-1.5">
          {WEEKDAYS.map((d, i) => (
            <button key={d} type="button" disabled={!canEdit} onClick={() => setForm({ ...form, weekOff: form.weekOff.includes(i) ? form.weekOff.filter((x) => x !== i) : [...form.weekOff, i] })}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${form.weekOff.includes(i) ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600'}`}>{d}</button>
          ))}
        </div>
      </div>
      <p className="text-xs text-slate-500">A check-in after {time12(form.startTime)} + {form.graceMinutes || 0} min is marked late. A day with less than {form.halfDayHours || 0} hours between check-in and check-out becomes a half day (0 = never).</p>
      {canEdit && <div className="flex justify-end"><button type="submit" className="btn-primary">Save settings</button></div>}
    </form>
  );
}

export default function AttendancePage() {
  const { checkPermission } = useAuth();
  const tabs = [
    checkPermission('attendance.self.view') && { id: 'me', label: 'My attendance' },
    checkPermission('attendance.register.view') && { id: 'register', label: 'Daily register' },
    (checkPermission('attendance.reports.view') || checkPermission('attendance.register.view')) && { id: 'summary', label: 'Monthly summary' },
    checkPermission('attendance.register.edit') && { id: 'settings', label: 'Settings' },
  ].filter(Boolean);
  const [picked, setTab] = useState(null);
  const tab = tabs.some((t) => t.id === picked) ? picked : tabs[0]?.id;

  if (!tabs.length) return <Alert message="You do not have access to attendance." />;
  return (
    <>
      <PageHeader title="Attendance" description="Staff check in and out from the ERP or SAC-POS; managers mark the daily register and see the monthly summary. Staff are the users in User Management." />
      <div className="mb-5"><ModuleTabs active={tab} onChange={setTab} tabs={tabs} /></div>
      {tab === 'me' && <MyAttendance canPunch={checkPermission('attendance.self.create')} />}
      {tab === 'register' && <Register canEdit={checkPermission('attendance.register.edit')} />}
      {tab === 'summary' && <Summary />}
      {tab === 'settings' && <AttendanceSettings canEdit={checkPermission('attendance.register.edit')} />}
    </>
  );
}
