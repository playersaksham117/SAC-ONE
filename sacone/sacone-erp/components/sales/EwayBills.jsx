'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { apiRequest } from '../../lib/api';
import { useAuth } from '../../lib/auth-context';
import { useLiveRefresh } from '../../lib/live';
import PageHeader, { Alert, LoadingState } from '../ui';
import { EmptyPanel, StatCard, Toolbar } from '../module-ui';

const money = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const day = (iso) => (iso ? new Date(iso).toLocaleDateString('en-IN') : '');
const MODES = ['By Road', 'Rail', 'Air', 'Ship'];

const STATUS = {
  ready: ['Ready', 'bg-emerald-50 text-emerald-700 ring-emerald-200'],
  needs_details: ['Needs details', 'bg-amber-50 text-amber-800 ring-amber-200'],
  generated: ['EWB generated', 'bg-sky-50 text-sky-700 ring-sky-200'],
};

/** Download text as a file in the browser. */
function download(name, text) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** One invoice's editable e-way details; saves on blur / change. */
function Row({ item, picked, onPick, canEdit, onSaved, setError }) {
  const [t, setT] = useState(item.transport);
  const [saving, setSaving] = useState(false);
  // fields typed but not saved yet survive the row reloading after another field saves
  const dirty = useRef(new Set());
  useEffect(() => {
    setT((prev) => ({ ...item.transport, ...Object.fromEntries([...dirty.current].map((k) => [k, prev[k]])) }));
  }, [item.transport]);

  const save = async (patch) => {
    setT((prev) => ({ ...prev, ...patch }));
    Object.keys(patch).forEach((k) => dirty.current.delete(k));
    const changed = Object.keys(patch).some((k) => String(patch[k] ?? '') !== String(item.transport[k] ?? ''));
    if (!changed) return;
    setSaving(true);
    try {
      onSaved(await apiRequest(`/api/pos/eway-bills/${item.saleId}`, { method: 'PUT', body: JSON.stringify(patch) }));
      setError('');
    } catch (e) {
      setError(`${item.invoiceNumber}: ${e.message}`);
      setT((prev) => ({ ...prev, ...Object.fromEntries(Object.keys(patch).map((k) => [k, item.transport[k]])) }));
    } finally {
      setSaving(false);
    }
  };
  const input = (key, props) => (
    <input
      className="input-field !min-h-0 w-full !py-1 text-xs"
      value={t[key] ?? ''}
      disabled={!canEdit}
      onChange={(e) => { dirty.current.add(key); const v = e.target.value; setT((prev) => ({ ...prev, [key]: v })); }}
      onBlur={(e) => save({ [key]: e.target.value })}
      {...props}
    />
  );
  const [label, tone] = STATUS[item.status] || STATUS.needs_details;
  const selectable = item.status === 'ready';

  return (
    <tr className={`align-top ${picked ? 'bg-brand-50/50' : ''}`}>
      <td className="px-2 py-2"><input type="checkbox" disabled={!selectable} checked={picked} onChange={onPick} aria-label={`Select ${item.invoiceNumber}`} /></td>
      <td className="px-2 py-2">
        <div className="font-mono text-xs font-semibold">{item.invoiceNumber}</div>
        <div className="text-xs text-slate-500">{day(item.date)} · {item.customerName}</div>
        <div className="text-[11px] text-slate-400">{item.customerGstin === 'URP' ? 'Unregistered buyer' : item.customerGstin} · {item.interState ? 'inter-state' : 'within state'}</div>
      </td>
      <td className="px-2 py-2 text-right text-xs">
        <div className="font-semibold">{money(item.consignmentValue)}</div>
        {Math.abs(item.consignmentValue - item.grandTotal) > 0.5 && <div className="text-slate-400">invoice {money(item.grandTotal)}</div>}
      </td>
      <td className="w-24 px-2 py-2">{input('distanceKm', { inputMode: 'numeric', placeholder: 'km' })}</td>
      <td className="w-24 px-2 py-2">{input('deliveryPincode', { inputMode: 'numeric', placeholder: item.deliveryPincode ? String(item.deliveryPincode) : 'pincode', maxLength: 6 })}</td>
      <td className="w-32 px-2 py-2 space-y-1">
        <select className="input-field !min-h-0 w-full !py-1 text-xs" value={t.mode || ''} disabled={!canEdit} onChange={(e) => save({ mode: e.target.value })}>
          <option value="">Mode…</option>
          {MODES.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
        {input('vehicleNumber', { placeholder: 'Vehicle no.' })}
      </td>
      <td className="w-36 px-2 py-2 space-y-1">
        {input('transporter', { placeholder: 'Transporter' })}
        {input('transporterId', { placeholder: 'Transporter GSTIN', maxLength: 15 })}
      </td>
      <td className="px-2 py-2 text-xs">
        <span className={`rounded-full px-2 py-0.5 font-medium ring-1 ${tone}`}>{saving ? 'Saving…' : label}</span>
        {item.problems.map((p) => <div key={p} className="mt-1 text-rose-700">• {p}</div>)}
        {item.warnings.map((w) => <div key={w} className="mt-1 text-amber-700">• {w}</div>)}
      </td>
      <td className="w-36 px-2 py-2">{input('ewayBillNumber', { inputMode: 'numeric', placeholder: 'EWB no. (12 digits)', maxLength: 14 })}</td>
    </tr>
  );
}

/** Sales → E-way Bills: invoices above ₹50,000, the missing details, and the portal's bulk JSON. */
export default function EwayBills() {
  const { checkPermission } = useAuth();
  const canEdit = checkPermission('pos.sales.create');
  const [filters, setFilters] = useState({ search: '', dateFrom: '', dateTo: '', show: 'pending' });
  const [applied, setApplied] = useState(filters);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [picked, setPicked] = useState(() => new Set());
  const [exporting, setExporting] = useState(false);

  const load = useCallback(async () => {
    try {
      const q = new URLSearchParams({ show: applied.show });
      if (applied.search) q.set('search', applied.search);
      if (applied.dateFrom) q.set('dateFrom', applied.dateFrom);
      if (applied.dateTo) q.set('dateTo', applied.dateTo);
      setData(await apiRequest(`/api/pos/eway-bills?${q}`));
    } catch (e) {
      setError(e.message);
    }
  }, [applied]);
  useEffect(() => { load(); }, [load]);
  useLiveRefresh(load, { tables: ['pos_sales', 'pos_sale_items', 'customers', 'companies'] });

  const replace = (updated) => setData((d) => ({ ...d, items: d.items.map((i) => (i.saleId === updated.saleId ? updated : i)) }));
  const ready = (data?.items || []).filter((i) => i.status === 'ready');
  const chosen = ready.filter((i) => picked.has(i.saleId));
  const toggle = (id) => setPicked((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const exportJson = async () => {
    setExporting(true); setError(''); setMessage('');
    try {
      const res = await apiRequest('/api/pos/eway-bills/export', { method: 'POST', body: JSON.stringify({ saleIds: chosen.map((i) => i.saleId) }) });
      if (res.count) {
        download(`ewaybill-${new Date().toISOString().slice(0, 10)}-${res.count}.json`, JSON.stringify(res.json, null, 2));
        setMessage(`Exported ${res.count} e-way bill(s). Upload the file on the portal, then type each EWB number here.`);
      }
      if (res.skipped.length) setError(`Not exported: ${res.skipped.map((s) => `${s.invoiceNumber || ''} (${s.reason})`).join('; ')}`);
      setPicked(new Set());
    } catch (e) {
      setError(e.message);
    } finally {
      setExporting(false);
    }
  };

  const t = data?.totals;
  return (
    <div className="space-y-4">
      <PageHeader
        title="E-way Bills"
        description={`Invoices above ${money(data?.minValue ?? 50000)}: fill the distance, delivery pincode and vehicle, tick the ready ones and download the JSON for ewaybillgst.gov.in → e-Waybill → Generate Bulk.`}
        actions={<button type="button" className="btn-primary" disabled={!chosen.length || exporting} onClick={exportJson}>{exporting ? 'Exporting…' : `⬇ Export JSON for portal (${chosen.length})`}</button>}
      />
      <Alert type="error" message={error} />
      <Alert type="success" message={message} />

      <Toolbar>
        <input className="input-field w-full sm:w-56" placeholder="Invoice no. or customer" value={filters.search}
          onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))} onKeyDown={(e) => { if (e.key === 'Enter') setApplied(filters); }} />
        <select className="input-field w-auto" value={filters.show} onChange={(e) => { const f = { ...filters, show: e.target.value }; setFilters(f); setApplied(f); }}>
          <option value="pending">Without e-way bill</option>
          <option value="ready">Ready to export</option>
          <option value="needs_details">Needs details</option>
          <option value="generated">EWB generated</option>
          <option value="all">All above the limit</option>
        </select>
        <label className="flex items-center gap-2 text-sm text-slate-500">From <input type="date" className="input-field w-auto" value={filters.dateFrom} onChange={(e) => setFilters((f) => ({ ...f, dateFrom: e.target.value }))} /></label>
        <label className="flex items-center gap-2 text-sm text-slate-500">To <input type="date" className="input-field w-auto" value={filters.dateTo} onChange={(e) => setFilters((f) => ({ ...f, dateTo: e.target.value }))} /></label>
        <button type="button" className="btn-primary" onClick={() => setApplied(filters)}>Apply</button>
      </Toolbar>

      {!data ? <LoadingState /> : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard label="Invoices above limit" value={String(t.invoices)} compact />
            <StatCard label="Ready to export" value={String(t.ready)} tone={t.ready ? 'success' : 'default'} compact />
            <StatCard label="Need details" value={String(t.needsDetails)} tone={t.needsDetails ? 'warning' : 'default'} compact />
            <StatCard label="EWB generated" value={String(t.generated)} compact />
          </div>

          {data.items.length === 0 ? (
            <EmptyPanel title="Nothing here" description="No invoice in this range needs an e-way bill." />
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-left text-[11px] uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-2 py-2">
                      <input type="checkbox" aria-label="Select all ready" checked={ready.length > 0 && ready.every((i) => picked.has(i.saleId))}
                        onChange={(e) => setPicked(e.target.checked ? new Set(ready.map((i) => i.saleId)) : new Set())} />
                    </th>
                    <th className="px-2 py-2">Invoice</th>
                    <th className="px-2 py-2 text-right">Value</th>
                    <th className="px-2 py-2">Distance</th>
                    <th className="px-2 py-2">Deliver to PIN</th>
                    <th className="px-2 py-2">Mode / vehicle</th>
                    <th className="px-2 py-2">Transporter</th>
                    <th className="px-2 py-2">Status</th>
                    <th className="px-2 py-2">E-way bill no.</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.items.map((i) => (
                    <Row key={i.saleId} item={i} picked={picked.has(i.saleId)} onPick={() => toggle(i.saleId)} canEdit={canEdit} onSaved={replace} setError={setError} />
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-xs text-sky-900">
            <b>How to generate:</b> log in at ewaybillgst.gov.in → e-Waybill → Generate Bulk → choose the downloaded JSON → Upload → Generate.
            Then type each e-way bill number in the last column; it is saved on the invoice and prints on it.
            Value is goods only (taxable + GST, services left out). No vehicle yet makes Part A only — add the vehicle on the portal before dispatch.
          </div>
        </>
      )}
    </div>
  );
}
