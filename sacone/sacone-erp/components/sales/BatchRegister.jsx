'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiRequest } from '../../lib/api';
import { useLiveRefresh } from '../../lib/live';
import { downloadCsv, toCsv } from '../../lib/csv';
import PageHeader, { Alert } from '../ui';
import { EmptyPanel, SkeletonGrid, StatCard } from '../module-ui';

const ddmmyyyy = (iso) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '—');
const FILTERS = [['', 'All'], ['registered', 'Registered'], ['in_stock', 'In stock'], ['unregistered', 'Not registered']];

/**
 * Batch Register: every batch received on purchase bills (registered) and every batch typed only on
 * sale bills (not registered), with quantity in, sold and left. A batch opens in Warranty Check.
 */
export default function BatchRegister() {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [applied, setApplied] = useState('');
  const [status, setStatus] = useState('');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      setData(await apiRequest(`/api/warranty/batches?${new URLSearchParams({ q: applied, status })}`));
      setError('');
    } catch (err) {
      setError(err.message);
    }
  }, [applied, status]);
  useEffect(() => { load(); }, [load]);
  useLiveRefresh(load, { tables: ['supplier_bills', 'pos_sales'] });

  const open = (b) => router.push(`/operations/sales?view=warranty&q=${encodeURIComponent(b.batchNumber)}`);
  const exportCsv = () => {
    const columns = [
      { label: 'Batch', value: (b) => b.batchNumber },
      { label: 'Product', value: (b) => b.productName },
      { label: 'SKU', value: (b) => b.sku },
      { label: 'Status', value: (b) => (b.registered ? 'Registered' : 'Not registered') },
      { label: 'First received', value: (b) => ddmmyyyy(b.firstReceived) },
      { label: 'Suppliers', value: (b) => [...new Set(b.bills.map((x) => x.supplierName))].join(' / ') },
      { label: 'Purchase bills', value: (b) => b.bills.map((x) => x.billNumber).join(' / ') },
      { label: 'Received', value: (b) => (b.registered ? b.received : '') },
      { label: 'Sold', value: (b) => b.sold },
      { label: 'Left', value: (b) => (b.registered ? b.balance : '') },
    ];
    downloadCsv(`batch-register-${new Date().toISOString().slice(0, 10)}.csv`, toCsv(data?.items || [], columns));
  };

  const s = data?.summary;
  return (
    <div>
      <PageHeader
        title="Batch Register"
        description="Batches received on purchase bills are registered; batches typed only on sale bills show as not registered. Click a batch to see the bills it was sold on in Warranty Check."
        actions={<button type="button" className="btn-secondary" onClick={exportCsv} disabled={!data?.items?.length}>⬇ CSV</button>}
      />
      <Alert message={error} />
      {s ? (
        <div className="mb-4 grid grid-cols-3 gap-3">
          <StatCard label="Batches" value={s.batches} icon="🏷️" compact />
          <StatCard label="Registered" value={s.registered} icon="✅" tone="success" compact />
          <StatCard label="Not registered" value={s.unregistered} icon="⚠️" tone={s.unregistered ? 'warning' : 'default'} compact />
        </div>
      ) : null}
      <form onSubmit={(e) => { e.preventDefault(); setApplied(q.trim()); }} className="mb-3 flex flex-wrap gap-2">
        <input className="input-field max-w-md" placeholder="Batch, product, purchase bill or supplier" value={q} onChange={(e) => setQ(e.target.value)} data-testid="batch-search" />
        <button type="submit" className="btn-primary">Search</button>
        <div className="flex flex-wrap gap-1">
          {FILTERS.map(([id, label]) => (
            <button key={id || 'all'} type="button" onClick={() => setStatus(id)}
              className={`rounded-lg px-3 py-2 text-sm font-medium ${status === id ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50'}`}>{label}</button>
          ))}
        </div>
      </form>

      {!data ? <SkeletonGrid count={3} /> : !data.items.length ? (
        <EmptyPanel title="No batches yet" description="Type a Batch No. on purchase bill lines (Purchases → Purchase Bill) to register batches, or on sale bill lines." />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Batch</th>
                <th className="px-4 py-3">Product</th>
                <th className="px-4 py-3">Received on</th>
                <th className="px-4 py-3 text-right">In</th>
                <th className="px-4 py-3 text-right">Sold</th>
                <th className="px-4 py-3 text-right">Left</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.items.map((b) => (
                <tr key={`${b.productId}-${b.batchNumber}`} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <button type="button" onClick={() => open(b)} className="font-mono font-semibold text-brand-700 hover:underline" title="Open in Warranty Check" data-testid={`batch-${b.batchNumber}`}>{b.batchNumber}</button>
                    <div className="mt-1">
                      {b.registered
                        ? <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-800 ring-1 ring-emerald-200">Registered</span>
                        : <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800">Not registered</span>}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-900">{b.productName}</div>
                    <div className="text-xs text-slate-500">{b.sku}</div>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-600">
                    {b.bills.length ? b.bills.map((x) => (
                      <div key={x.billId}>{ddmmyyyy(x.date)} · {x.billNumber} · {x.supplierName || 'Supplier'} <span className="text-slate-400">({x.quantity})</span></div>
                    )) : <span className="text-slate-400">Not on a purchase bill{b.lastSold ? ` · last sold ${ddmmyyyy(b.lastSold)}` : ''}</span>}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{b.registered ? b.received : '—'}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{b.sold}{b.saleBills ? <div className="text-[11px] text-slate-400">{b.saleBills} bill{b.saleBills === 1 ? '' : 's'}</div> : null}</td>
                  <td className={`px-4 py-3 text-right font-semibold tabular-nums ${b.registered && b.balance < 0 ? 'text-rose-600' : ''}`}>{b.registered ? b.balance : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
