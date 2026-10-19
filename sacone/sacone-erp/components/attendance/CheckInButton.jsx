'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { apiRequest } from '../../lib/api';
import { useAuth } from '../../lib/auth-context';
import { hours, time12, useWorkedMinutes } from './attendance-shared';

/** Header pill: Check in → Checked in 9:42 AM · Check out → Done 8h 12m. */
export default function CheckInButton() {
  const { checkPermission, session } = useAuth();
  const allowed = Boolean(session?.firm) && checkPermission('attendance.self.create');
  const [today, setToday] = useState(undefined);
  const [busy, setBusy] = useState(false);
  const worked = useWorkedMinutes(today);

  const load = useCallback(async () => {
    try { setToday((await apiRequest('/api/attendance/me')).today); } catch { setToday(undefined); }
  }, []);
  useEffect(() => {
    if (!allowed) return undefined;
    load();
    // The Attendance page and the register announce changes so this pill stays current.
    window.addEventListener('attendance-changed', load);
    return () => window.removeEventListener('attendance-changed', load);
  }, [allowed, load]);

  if (!allowed || today === undefined) return null;
  const punch = async (action) => {
    setBusy(true);
    try {
      setToday(await apiRequest(`/api/attendance/${action}`, { method: 'POST' }));
      window.dispatchEvent(new Event('attendance-changed'));
    } catch (err) { window.alert(err.message); await load(); } finally { setBusy(false); }
  };

  if (!today?.checkIn) {
    return (
      <button type="button" disabled={busy} onClick={() => punch('check-in')}
        className="inline-flex items-center gap-1.5 rounded-full bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-emerald-700">
        <span className="h-2 w-2 rounded-full bg-white/80" /> Check in
      </button>
    );
  }
  if (!today.checkOut) {
    return (
      <div className="inline-flex items-center gap-1 rounded-full bg-emerald-50 py-1 pl-3 pr-1 text-xs ring-1 ring-emerald-200">
        <Link href="/business/attendance" className="hidden font-medium text-emerald-800 sm:inline">In {time12(today.inTime)} · {hours(worked)}</Link>
        <button type="button" disabled={busy} onClick={() => { if (window.confirm('Check out now?')) punch('check-out'); }}
          className="rounded-full bg-white px-2.5 py-1 font-semibold text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50">Check out</button>
      </div>
    );
  }
  return (
    <Link href="/business/attendance" className="hidden rounded-full bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-600 sm:inline-flex">
      ✓ Done today · {hours(today.minutes)}
    </Link>
  );
}
