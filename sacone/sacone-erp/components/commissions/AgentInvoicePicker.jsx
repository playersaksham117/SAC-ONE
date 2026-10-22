'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiRequest } from '../../lib/api';
import { Modal } from '../ui';

const money = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const day = (iso) => (iso ? new Date(iso).toLocaleDateString('en-IN') : '');
const r2 = (n) => Math.round((Number(n || 0) + Number.EPSILON) * 100) / 100;

const METHODS = [
  ['percent_taxable', '% of taxable value (before GST)'],
  ['percent_sales_value', '% of invoice total (with GST)'],
  ['percent_gross_profit', '% of gross profit'],
  ['fixed_per_invoice', 'Fixed ₹ per invoice'],
];

/** What a custom rate gives on one invoice (same sums as the server). */
function customAmount(inv, form) {
  const rate = Number(form.rate || 0) / 100;
  if (form.calculationMethod === 'fixed_per_invoice') return r2(form.fixedAmount);
  if (form.calculationMethod === 'percent_sales_value') return r2(inv.grandTotal * rate);
  if (form.calculationMethod === 'percent_gross_profit') return r2(Math.max(0, inv.grossProfit) * rate);
  return r2(inv.taxableAmount * rate);
}

/**
 * Sales Agents → Select invoices: tick the invoices an agent gets commission on, by their plan or
 * a rate chosen here. Invoices already commissioned are hidden unless "Show all" is on.
 */
export default function AgentInvoicePicker({ agent, onClose, onDone }) {
  const [filters, setFilters] = useState({ search: '', dateFrom: '', dateTo: '', show: 'open' });
  const [applied, setApplied] = useState(filters);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [picked, setPicked] = useState(() => new Set());
  const [form, setForm] = useState({ mode: 'plan', calculationMethod: 'percent_taxable', rate: '', fixedAmount: '' });
  const [allowShared, setAllowShared] = useState(false);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState(null);

  const load = useCallback(async () => {
    setError('');
    try {
      const q = new URLSearchParams({ show: applied.show });
      if (applied.search) q.set('search', applied.search);
      if (applied.dateFrom) q.set('dateFrom', applied.dateFrom);
      if (applied.dateTo) q.set('dateTo', applied.dateTo);
      setData(await apiRequest(`/api/sales-agents/${agent.id}/invoices?${q}`));
    } catch (e) {
      setError(e.message);
    }
  }, [agent.id, applied]);
  useEffect(() => { load(); }, [load]);

  const rows = useMemo(() => (data?.items || []).filter((i) => !i.hasMine), [data]);
  const amountFor = (inv) => (form.mode === 'plan' ? inv.planCommission : customAmount(inv, form));
  const chosen = rows.filter((i) => picked.has(i.saleId));
  const total = r2(chosen.reduce((s, i) => s + amountFor(i), 0));
  const allPicked = rows.length > 0 && rows.every((i) => picked.has(i.saleId));
  const toggle = (id) => setPicked((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const sharedPicked = chosen.some((i) => i.existingCommissions);

  const submit = async () => {
    setSaving(true); setError('');
    try {
      const body = { saleIds: chosen.map((i) => i.saleId), mode: form.mode, allowShared };
      if (form.mode === 'custom') Object.assign(body, { calculationMethod: form.calculationMethod, rate: Number(form.rate || 0), fixedAmount: Number(form.fixedAmount || 0) });
      const res = await apiRequest(`/api/sales-agents/${agent.id}/invoices`, { method: 'POST', body: JSON.stringify(body) });
      setResult(res);
      setPicked(new Set());
      await load();
      onDone?.(res);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open title={`Select invoices for ${agent.name}`} onClose={onClose} size="xl">
      <div className="space-y-3 text-sm">
        <div className="flex flex-wrap items-end gap-2">
          <input className="input-field w-full sm:w-56" placeholder="Invoice no. or customer" value={filters.search}
            onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))} onKeyDown={(e) => { if (e.key === 'Enter') setApplied(filters); }} />
          <label className="flex items-center gap-1 text-slate-500">From <input type="date" className="input-field w-auto" value={filters.dateFrom} onChange={(e) => setFilters((f) => ({ ...f, dateFrom: e.target.value }))} /></label>
          <label className="flex items-center gap-1 text-slate-500">To <input type="date" className="input-field w-auto" value={filters.dateTo} onChange={(e) => setFilters((f) => ({ ...f, dateTo: e.target.value }))} /></label>
          <select className="input-field w-auto" value={filters.show} onChange={(e) => { const f = { ...filters, show: e.target.value }; setFilters(f); setApplied(f); }}>
            <option value="open">Invoices with no commission yet</option>
            <option value="all">All invoices (incl. other agents’)</option>
          </select>
          <button type="button" className="btn-secondary" onClick={() => setApplied(filters)}>Search</button>
        </div>

        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
          <div className="flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-2"><input type="radio" checked={form.mode === 'plan'} onChange={() => setForm((f) => ({ ...f, mode: 'plan' }))} /> Agent’s plan / rules</label>
            <label className="flex items-center gap-2"><input type="radio" checked={form.mode === 'custom'} onChange={() => setForm((f) => ({ ...f, mode: 'custom' }))} /> Custom for these invoices</label>
          </div>
          {form.mode === 'custom' && (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <select className="input-field w-auto" value={form.calculationMethod} onChange={(e) => setForm((f) => ({ ...f, calculationMethod: e.target.value }))}>
                {METHODS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
              {form.calculationMethod === 'fixed_per_invoice'
                ? <input type="number" min="0" step="0.01" className="input-field w-32" placeholder="₹ per invoice" value={form.fixedAmount} onChange={(e) => setForm((f) => ({ ...f, fixedAmount: e.target.value }))} />
                : <input type="number" min="0" max="100" step="0.01" className="input-field w-28" placeholder="Rate %" value={form.rate} onChange={(e) => setForm((f) => ({ ...f, rate: e.target.value }))} />}
            </div>
          )}
        </div>

        {error && <div className="rounded-lg bg-rose-50 px-3 py-2 text-rose-700">{error}</div>}
        {result && (
          <div className="rounded-lg bg-emerald-50 px-3 py-2 text-emerald-800">
            Commission added on {result.created.length} invoice(s): {money(result.totalCommission)}.
            {result.skipped.length > 0 && <div className="mt-1 text-xs text-amber-800">Skipped: {result.skipped.map((s) => `${s.invoiceNumber || '—'} (${s.reason})`).join('; ')}</div>}
          </div>
        )}

        {!data ? <p className="py-6 text-center text-slate-500">Loading…</p> : rows.length === 0 ? (
          <p className="py-6 text-center text-slate-500">{applied.show === 'open' ? 'Every invoice in this range already has commission.' : 'No invoices match.'}</p>
        ) : (
          <div className="max-h-[24rem] overflow-auto rounded-xl border border-slate-200">
            <table className="min-w-full text-sm">
              <thead className="sticky top-0 bg-slate-50 text-left text-[11px] uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-2"><input type="checkbox" checked={allPicked} onChange={() => setPicked(allPicked ? new Set() : new Set(rows.map((i) => i.saleId)))} aria-label="Select all" /></th>
                  <th className="px-3 py-2">Invoice</th>
                  <th className="px-3 py-2">Customer</th>
                  <th className="px-3 py-2 text-right">Taxable</th>
                  <th className="px-3 py-2 text-right">Total</th>
                  <th className="px-3 py-2">Paid</th>
                  <th className="px-3 py-2 text-right">Commission</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((i) => (
                  <tr key={i.saleId} className={`cursor-pointer hover:bg-slate-50 ${picked.has(i.saleId) ? 'bg-brand-50/60' : ''}`} onClick={() => toggle(i.saleId)}>
                    <td className="px-3 py-2"><input type="checkbox" checked={picked.has(i.saleId)} onChange={() => toggle(i.saleId)} onClick={(e) => e.stopPropagation()} /></td>
                    <td className="px-3 py-2">
                      <div className="font-mono text-xs font-semibold">{i.invoiceNumber}</div>
                      <div className="text-xs text-slate-500">{day(i.date)}{i.billedAgent ? ` · billed with ${i.billedAgent}` : ''}</div>
                      {i.existingCommissions && <div className="text-[11px] text-amber-700">commission: {i.existingCommissions}</div>}
                    </td>
                    <td className="px-3 py-2">{i.customerName}</td>
                    <td className="px-3 py-2 text-right">{money(i.taxableAmount)}</td>
                    <td className="px-3 py-2 text-right">{money(i.grandTotal)}</td>
                    <td className="px-3 py-2 text-xs">{i.balance > 0.001 ? <span className="text-amber-700">due {money(i.balance)}</span> : <span className="text-emerald-700">paid</span>}</td>
                    <td className="px-3 py-2 text-right">
                      <div className="font-semibold">{money(amountFor(i))}</div>
                      {form.mode === 'plan' && <div className="text-[10px] text-slate-400">{i.planLabel}</div>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {sharedPicked && (
          <label className="flex items-center gap-2 text-amber-800">
            <input type="checkbox" checked={allowShared} onChange={(e) => setAllowShared(e.target.checked)} />
            Some selected invoices already pay another agent — give this agent commission on them too
          </label>
        )}
        <p className="text-xs text-slate-500">Commission becomes payable by the plan’s payment rule (e.g. as the customer pays). Invoices billed without an agent get this agent as their sales agent.</p>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3">
          <div className="text-slate-700">{chosen.length} selected · commission <b>{money(total)}</b></div>
          <div className="flex gap-2">
            <button type="button" className="btn-secondary" onClick={onClose}>Close</button>
            <button type="button" className="btn-primary" disabled={saving || !chosen.length || (form.mode === 'custom' && !(Number(form.calculationMethod === 'fixed_per_invoice' ? form.fixedAmount : form.rate) > 0))} onClick={submit}>
              {saving ? 'Saving…' : `Add commission (${chosen.length})`}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
