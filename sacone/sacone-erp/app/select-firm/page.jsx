'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiRequest } from '../../lib/api';
import { useAuth } from '../../lib/auth-context';
import { Alert } from '../../components/ui';

/**
 * Choose the firm and financial year to work in. Shown after every sign-in and from the
 * header's "Switch" link. Each firm keeps fully separate books.
 */
export default function SelectFirmPage() {
  const { session, loading, selectFirm, logout } = useAuth();
  const router = useRouter();
  const [firms, setFirms] = useState(null);
  const [years, setYears] = useState({});
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (loading || !session) return;
    apiRequest('/api/auth/firms')
      .then((list) => {
        setFirms(list);
        // Default: the year already chosen for the current firm, otherwise each firm's latest year.
        setYears(Object.fromEntries(list.map((f) => [
          f.id,
          session.firm?.id === f.id && session.financialYear ? session.financialYear.code : f.financialYears[0]?.code,
        ])));
      })
      .catch((e) => setError(e.message));
  }, [loading, session?.token]); // eslint-disable-line react-hooks/exhaustive-deps

  const open = async (firm) => {
    setBusy(firm.id);
    setError('');
    try {
      await selectFirm(firm.id, years[firm.id]);
      router.replace('/dashboard');
    } catch (e) {
      setError(e.message);
      setBusy('');
    }
  };

  return (
    <div className="flex min-h-screen items-start justify-center bg-gradient-to-br from-slate-900 via-brand-900 to-slate-900 p-4 sm:items-center">
      <div className="w-full max-w-2xl py-8">
        <div className="mb-6 text-center text-white">
          <h1 className="text-3xl font-bold tracking-tight">SACONE</h1>
          <p className="mt-2 text-sm text-slate-300">
            {session?.user?.fullName ? `Welcome, ${session.user.fullName}. ` : ''}Choose the firm and financial year to work in.
          </p>
        </div>

        <div className="card">
          <Alert type="error" message={error} />
          {!firms && !error && <p className="py-6 text-center text-sm text-slate-500">Loading firms…</p>}
          {firms?.length === 0 && (
            <p className="py-6 text-center text-sm text-slate-600">No firm is assigned to you. Ask the owner to give you access.</p>
          )}
          <div className="space-y-3">
            {firms?.map((firm) => {
              const current = session?.firm?.id === firm.id;
              return (
                <div key={firm.id} className={`rounded-xl border p-4 ${current ? 'border-brand-500 ring-1 ring-brand-500' : 'border-slate-200'}`}>
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-semibold text-slate-900">
                        {firm.name}
                        {current && <span className="ml-2 rounded-full bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-700">current</span>}
                      </div>
                      <div className="truncate text-xs text-slate-500">
                        {[firm.gstNumber ? `GSTIN ${firm.gstNumber}` : 'No GSTIN yet', firm.city, firm.state].filter(Boolean).join(' · ')}
                      </div>
                    </div>
                    <label className="flex items-center gap-2 text-sm text-slate-600">
                      <span className="sr-only sm:not-sr-only">Year</span>
                      <select
                        className="input-field w-auto"
                        value={years[firm.id] || ''}
                        onChange={(e) => setYears((y) => ({ ...y, [firm.id]: e.target.value }))}
                        aria-label={`Financial year for ${firm.name}`}
                      >
                        {firm.financialYears.map((y) => <option key={y.code} value={y.code}>FY {y.code}</option>)}
                      </select>
                    </label>
                    <button type="button" className="btn-primary" disabled={Boolean(busy)} onClick={() => open(firm)}>
                      {busy === firm.id ? 'Opening…' : 'Open'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-5 flex items-center justify-between text-xs text-slate-500">
            <span>Each firm keeps separate books: products, parties, stock, bills and accounts.</span>
            <button type="button" className="font-medium text-slate-600 hover:underline" onClick={logout}>Sign out</button>
          </div>
        </div>
      </div>
    </div>
  );
}
