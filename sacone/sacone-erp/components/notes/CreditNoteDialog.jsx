'use client';

import { useEffect, useState } from 'react';
import { apiRequest } from '../../lib/api';
import { money } from '../../lib/bill-document';
import { Alert, LoadingState, Modal } from '../ui';

const r2 = (n) => Math.round((Number(n || 0) + Number.EPSILON) * 100) / 100;
const qtyText = (n) => Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 3 });

const SETTLE = [
  { value: 'credit_note', label: 'Keep as customer credit', hint: 'Clears the invoice due first; any extra stays on the customer account for future bills.' },
  { value: 'cash', label: 'Refund cash', hint: 'Clears the invoice due first; the rest is paid back in cash.' },
  { value: 'upi', label: 'Refund UPI', hint: 'Clears the invoice due first; the rest is paid back by UPI.' },
  { value: 'bank', label: 'Refund bank', hint: 'Clears the invoice due first; the rest is paid back to the bank account.' },
];

/**
 * Customer return → GST credit note, against one sales invoice.
 * With `saleId` the invoice is fixed; without it the user searches for the invoice first.
 * onCreated(note) gets the new credit note (with its number).
 */
export default function CreditNoteDialog({ saleId: fixedSaleId, onClose, onCreated }) {
  const [saleId, setSaleId] = useState(fixedSaleId || '');
  const [search, setSearch] = useState('');
  const [matches, setMatches] = useState([]);
  const [sale, setSale] = useState(null);
  const [qty, setQty] = useState({});
  const [method, setMethod] = useState('credit_note');
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (fixedSaleId || search.trim().length < 2) { setMatches([]); return undefined; }
    const t = setTimeout(() => {
      apiRequest(`/api/pos/sales?search=${encodeURIComponent(search.trim())}&limit=10&allYears=true`)
        .then((d) => setMatches((d.items || []).filter((s) => ['completed', 'partially_returned'].includes(s.status))))
        .catch(() => setMatches([]));
    }, 250);
    return () => clearTimeout(t);
  }, [search, fixedSaleId]);

  useEffect(() => {
    if (!saleId) { setSale(null); return; }
    setError('');
    apiRequest(`/api/pos/sales/${saleId}`)
      .then((s) => { setSale(s); setQty({}); })
      .catch((e) => setError(e.message));
  }, [saleId]);

  const lines = (sale?.items || []).map((item) => {
    const remaining = r2(item.quantity - (item.quantityReturned || 0));
    const q = Math.min(Math.max(Number(qty[item.id] || 0), 0), remaining);
    const ratio = item.quantity ? q / item.quantity : 0;
    return { item, remaining, q, value: r2(item.lineTotal * ratio), gst: r2(item.gstAmount * ratio) };
  });
  const total = r2(lines.reduce((s, l) => s + l.value, 0));
  const gst = r2(lines.reduce((s, l) => s + l.gst, 0));
  const due = Math.max(0, Number(sale?.amountCredit || 0));
  const againstDue = r2(Math.min(total, due));
  const refund = method === 'credit_note' ? 0 : r2(total - againstDue);
  const keptCredit = method === 'credit_note' ? r2(total - againstDue) : 0;
  const canReturn = sale && ['completed', 'partially_returned'].includes(sale.status);

  const save = async () => {
    const items = lines.filter((l) => l.q > 0).map((l) => ({ saleItemId: l.item.id, quantity: l.q }));
    if (!items.length) { setError('Enter the quantity being returned on at least one line.'); return; }
    setSaving(true);
    setError('');
    try {
      const note = await apiRequest('/api/pos/returns', {
        method: 'POST',
        body: JSON.stringify({ saleId: sale.id, refundMethod: method, reason: reason.trim() || null, items }),
      });
      onCreated?.(note);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      size="xl"
      title={sale ? `Credit note · return against ${sale.invoiceNumber}` : 'New credit note'}
      onClose={onClose}
      footer={(
        <>
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          <button type="button" className="btn-primary" onClick={save} disabled={saving || !canReturn || total <= 0}>
            {saving ? 'Issuing…' : `Issue credit note${total > 0 ? ` · ${money(total)}` : ''}`}
          </button>
        </>
      )}
    >
      <div className="space-y-4">
        <Alert message={error} />

        {!fixedSaleId && (
          <div>
            <label className="label">Original invoice *</label>
            <input
              className="input-field"
              placeholder="Type invoice number, customer name or phone"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setSaleId(''); }}
            />
            {!saleId && matches.length > 0 && (
              <div className="mt-2 divide-y divide-slate-100 rounded-lg border border-slate-200">
                {matches.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => { setSaleId(s.id); setSearch(s.invoiceNumber); }}
                    className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-slate-50"
                  >
                    <span><span className="font-mono text-xs font-semibold">{s.invoiceNumber}</span> · {s.customerIsWalkIn ? 'Walk-in' : s.customerName}</span>
                    <span className="text-slate-500">{new Date(s.createdAt).toLocaleDateString('en-IN')} · {money(s.grandTotal)}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {saleId && !sale && !error && <LoadingState />}

        {sale && (
          <>
            <div className="grid grid-cols-2 gap-3 rounded-xl bg-slate-50 p-3 text-sm sm:grid-cols-4">
              <div><div className="text-xs text-slate-500">Invoice</div><div className="font-mono text-xs font-semibold">{sale.invoiceNumber}</div></div>
              <div><div className="text-xs text-slate-500">Date</div><div>{new Date(sale.createdAt).toLocaleDateString('en-IN')}</div></div>
              <div><div className="text-xs text-slate-500">Customer</div><div>{sale.customerIsWalkIn ? 'Walk-in' : sale.customerName}</div></div>
              <div><div className="text-xs text-slate-500">Invoice due</div><div className={due > 0 ? 'font-semibold text-amber-700' : ''}>{due > 0 ? money(due) : 'Paid'}</div></div>
            </div>

            {!canReturn ? (
              <p className="text-sm text-slate-600">This invoice is {String(sale.status).replace(/_/g, ' ')} and cannot take another return.</p>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-3 py-2">Item</th>
                      <th className="px-3 py-2 text-right">Sold</th>
                      <th className="px-3 py-2 text-right">Already returned</th>
                      <th className="px-3 py-2 text-right">Return qty</th>
                      <th className="px-3 py-2 text-right">Value incl. GST</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {lines.map(({ item, remaining, value }) => (
                      <tr key={item.id}>
                        <td className="px-3 py-2">
                          <div className="font-medium">{item.productName}</div>
                          <div className="text-xs text-slate-500">{item.hsnCode ? `HSN/SAC ${item.hsnCode} · ` : ''}{money(item.unitPrice)} · GST {item.gstPercentage}%</div>
                        </td>
                        <td className="px-3 py-2 text-right">{qtyText(item.quantity)}</td>
                        <td className="px-3 py-2 text-right text-slate-500">{item.quantityReturned ? qtyText(item.quantityReturned) : '—'}</td>
                        <td className="px-3 py-2 text-right">
                          {remaining > 0 ? (
                            <div className="flex items-center justify-end gap-1">
                              <input
                                type="number"
                                inputMode="decimal"
                                min="0"
                                max={remaining}
                                step="any"
                                className="input-field w-24 text-right"
                                value={qty[item.id] ?? ''}
                                placeholder="0"
                                onChange={(e) => setQty({ ...qty, [item.id]: e.target.value })}
                              />
                              <button type="button" className="text-xs font-medium text-brand-700 hover:underline" onClick={() => setQty({ ...qty, [item.id]: remaining })}>
                                all {qtyText(remaining)}
                              </button>
                            </div>
                          ) : <span className="text-xs text-slate-400">fully returned</span>}
                        </td>
                        <td className="px-3 py-2 text-right font-medium">{value > 0 ? money(value) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {canReturn && (
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="label">Settle the credit note by</label>
                  <div className="space-y-2">
                    {SETTLE.map((m) => (
                      <label key={m.value} className={`flex cursor-pointer gap-2 rounded-lg border p-2 text-sm ${method === m.value ? 'border-brand-500 bg-brand-50' : 'border-slate-200'}`}>
                        <input type="radio" name="settle" checked={method === m.value} onChange={() => setMethod(m.value)} />
                        <span><span className="font-medium">{m.label}</span><span className="block text-xs text-slate-500">{m.hint}</span></span>
                      </label>
                    ))}
                  </div>
                  <label className="label mt-3">Reason</label>
                  <input className="input-field" placeholder="e.g. Damaged, wrong size, defective" value={reason} onChange={(e) => setReason(e.target.value)} />
                </div>
                <div className="rounded-xl border border-slate-200 p-3 text-sm">
                  <div className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">Credit note</div>
                  <div className="flex justify-between"><span>Value (incl. GST)</span><span className="font-semibold">{money(total)}</span></div>
                  <div className="flex justify-between text-slate-500"><span>of which GST</span><span>{money(gst)}</span></div>
                  <hr className="my-2" />
                  <div className="flex justify-between"><span>Set against invoice due</span><span>{money(againstDue)}</span></div>
                  {method === 'credit_note'
                    ? <div className="flex justify-between"><span>Kept as customer credit</span><span>{money(keptCredit)}</span></div>
                    : <div className="flex justify-between font-semibold"><span>Pay back now ({method.toUpperCase()})</span><span>{money(refund)}</span></div>}
                  <p className="mt-2 text-xs text-slate-500">Stock comes back for goods; services have no stock. The note gets the next credit note number for this financial year.</p>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}
