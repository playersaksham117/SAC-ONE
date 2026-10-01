'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiRequest } from '../../lib/api';
import { useLiveRefresh } from '../../lib/live';

function money(n) {
  return `₹${Number(n || 0).toFixed(2)}`;
}

const BUCKETS = ['current', '1-30', '31-60', '61-90', '91-180', '180+'];

export default function OutstandingPanel({ partyType = 'customer', partyId = '', onError }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (silent = false) => {
    if (silent !== true) setLoading(true);
    try {
      const base = partyType === 'customer' ? '/api/customers' : '/api/suppliers';
      const url = partyId ? `${base}/${partyId}/outstanding` : `${base}/outstanding`;
      setData(await apiRequest(url));
    } catch (e) {
      onError?.(e.message);
    } finally {
      setLoading(false);
    }
  }, [partyType, partyId, onError]);

  useLiveRefresh(() => load(true));
  useEffect(() => { load(); }, [load]);

  if (loading) return <p className="text-sm text-slate-500">Loading outstanding…</p>;
  if (!data) return null;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {BUCKETS.map((b) => (
          <div key={b} className="rounded-xl border border-slate-200 bg-white p-3">
            <div className="text-xs text-slate-500">{b === 'current' ? 'Current' : `${b} Days`}</div>
            <div className="mt-1 text-lg font-semibold">{money(data.buckets?.[b]?.amount)}</div>
            <div className="text-xs text-slate-400">{data.buckets?.[b]?.count || 0} docs</div>
          </div>
        ))}
      </div>
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm">
        Total due: <strong>{money(data.total)}</strong>
        {' · '}
        Overdue: <strong>{money(data.overdueTotal)}</strong>
      </div>
      <div className="overflow-auto rounded-xl border border-slate-200">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left">
            <tr>
              <th className="px-3 py-2">{partyType === 'customer' ? 'Invoice' : 'Bill'}</th>
              <th className="px-3 py-2">Party</th>
              <th className="px-3 py-2">Date</th>
              <th className="px-3 py-2">Due Date</th>
              <th className="px-3 py-2 text-right">Amount</th>
              <th className="px-3 py-2 text-right">Paid</th>
              <th className="px-3 py-2 text-right">Due</th>
              <th className="px-3 py-2">Ageing</th>
              <th className="px-3 py-2">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {(data.items || []).map((row) => (
              <tr key={row.id}>
                <td className="px-3 py-2 font-mono text-xs">{row.invoiceNumber || row.billNumber}</td>
                <td className="px-3 py-2">{row.customerName || row.supplierName}</td>
                <td className="px-3 py-2">{row.invoiceDate || row.billDate}</td>
                <td className="px-3 py-2">{row.dueDate || '—'}</td>
                <td className="px-3 py-2 text-right">{money(row.invoiceAmount || row.billAmount)}</td>
                <td className="px-3 py-2 text-right">{money(row.paidAmount)}</td>
                <td className="px-3 py-2 text-right">{money(row.dueAmount)}</td>
                <td className="px-3 py-2">{row.ageingBucket} ({row.daysOverdue}d)</td>
                <td className="px-3 py-2">{row.displayStatus}</td>
              </tr>
            ))}
            {!data.items?.length && (
              <tr><td colSpan={9} className="px-3 py-8 text-center text-slate-500">No outstanding documents</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
