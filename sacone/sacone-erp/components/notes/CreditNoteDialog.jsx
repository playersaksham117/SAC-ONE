'use client';

import { useEffect, useState } from 'react';
import { apiRequest } from '../../lib/api';
import { money } from '../../lib/bill-document';
import { LoadingState } from '../ui';
import { NoteCard, NotePage, SumRow } from './NotePage';

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
 * With `editNote` (admin) it edits that note: same invoice and number, its quantities filled in.
 */
export default function CreditNoteDialog({ saleId: givenSaleId, editNote = null, onClose, onCreated }) {
  const fixedSaleId = editNote?.saleId || givenSaleId;
  // This note's own quantities count as not yet returned while editing it.
  const mine = (saleItemId) => (editNote?.items || []).filter((i) => i.saleItemId === saleItemId).reduce((s, i) => s + Number(i.quantity), 0);
  const [saleId, setSaleId] = useState(fixedSaleId || '');
  const [search, setSearch] = useState('');
  const [matches, setMatches] = useState([]);
  const [sale, setSale] = useState(null);
  const [qty, setQty] = useState({});
  const [method, setMethod] = useState(editNote?.refundMethod || 'credit_note');
  const [reason, setReason] = useState(editNote?.reason || '');
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
      .then((s) => {
        setSale(s);
        setQty(editNote ? Object.fromEntries(s.items.filter((i) => mine(i.id) > 0).map((i) => [i.id, mine(i.id)])) : {});
      })
      .catch((e) => setError(e.message));
  }, [saleId]);

  const lines = (sale?.items || []).map((item) => {
    const remaining = r2(item.quantity - ((item.quantityReturned || 0) - mine(item.id)));
    const q = Math.min(Math.max(Number(qty[item.id] || 0), 0), remaining);
    const ratio = item.quantity ? q / item.quantity : 0;
    return { item, remaining, q, value: r2(item.lineTotal * ratio), gst: r2(item.gstAmount * ratio) };
  });
  const total = Math.round(r2(lines.reduce((s, l) => s + l.value, 0))); // whole rupees, like the note
  const gst = r2(lines.reduce((s, l) => s + l.gst, 0));
  const due = Math.max(0, Number(sale?.amountCredit || 0) + Number(editNote?.againstInvoice || 0));
  const againstDue = r2(Math.min(total, due));
  const refund = method === 'credit_note' ? 0 : r2(total - againstDue);
  const keptCredit = method === 'credit_note' ? r2(total - againstDue) : 0;
  const canReturn = sale && (editNote ? true : ['completed', 'partially_returned'].includes(sale.status));

  const save = async () => {
    const items = lines.filter((l) => l.q > 0).map((l) => ({ saleItemId: l.item.id, quantity: l.q }));
    if (!items.length) { setError('Enter the quantity being returned on at least one line.'); return; }
    setSaving(true);
    setError('');
    try {
      const note = await apiRequest(editNote ? `/api/pos/returns/${editNote.id}` : '/api/pos/returns', {
        method: editNote ? 'PUT' : 'POST',
        body: JSON.stringify({ saleId: sale.id, refundMethod: method, reason: reason.trim() || null, items }),
      });
      onCreated?.(note);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const igst = Number(sale?.igstAmount || 0) > 0;
  const taxable = r2(lines.reduce((s, l) => s + l.value - l.gst, 0));
  const returning = lines.filter((l) => l.q > 0);

  const main = (
    <>
      <div className="grid gap-4 lg:grid-cols-5">
        <NoteCard className="lg:col-span-3" title="Against invoice">
          {!fixedSaleId && (
            <div className="relative">
              <input
                className="input-field"
                autoFocus
                placeholder="Type invoice number, customer name or phone"
                value={search}
                onChange={(e) => { setSearch(e.target.value); setSaleId(''); }}
                data-testid="cn-invoice-search"
              />
              {!saleId && matches.length > 0 && (
                <div className="absolute z-30 mt-1 max-h-80 w-full divide-y divide-slate-100 overflow-auto rounded-xl border border-slate-200 bg-white shadow-lg">
                  {matches.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => { setSaleId(s.id); setSearch(s.invoiceNumber); }}
                      className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-slate-50"
                    >
                      <span><span className="font-mono text-xs font-semibold">{s.invoiceNumber}</span> · {s.customerIsWalkIn ? 'Walk-in' : s.customerName}</span>
                      <span className="whitespace-nowrap text-slate-500">{new Date(s.createdAt).toLocaleDateString('en-IN')} · {money(s.grandTotal)}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          {saleId && !sale && !error && <LoadingState />}
          {sale ? (
            <div className={fixedSaleId ? '' : 'mt-3'}>
              <div className="text-lg font-bold text-slate-900">{sale.customerIsWalkIn ? 'Walk-in customer' : sale.customerName}</div>
              <div className="text-sm text-slate-500">{[sale.customerPhone, sale.customerGstin ? `GSTIN ${sale.customerGstin}` : null].filter(Boolean).join(' · ')}</div>
              <div className="mt-2 flex flex-wrap gap-2 text-xs">
                <span className="rounded-full bg-slate-100 px-2.5 py-0.5 font-mono font-semibold text-slate-700">{sale.invoiceNumber}</span>
                <span className="rounded-full bg-slate-100 px-2.5 py-0.5 font-semibold text-slate-600">{new Date(sale.createdAt).toLocaleDateString('en-IN')}</span>
                <span className="rounded-full bg-slate-100 px-2.5 py-0.5 font-semibold text-slate-600">Invoice {money(sale.grandTotal)}</span>
                <span className={`rounded-full px-2.5 py-0.5 font-semibold ${due > 0 ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'}`}>{due > 0 ? `Due ${money(due)}` : 'Paid'}</span>
              </div>
            </div>
          ) : !saleId && (
            <p className="mt-2 text-sm text-slate-500">Find the sales invoice the goods were sold on: the rates and GST of the return come from it.</p>
          )}
        </NoteCard>
        <NoteCard className="lg:col-span-2" title="Note details">
          <SumRow label="Credit note no." value={editNote ? (editNote.noteNumber || editNote.returnNumber) : 'Given on save'} muted />
          <SumRow label="Date" value={new Date(editNote?.createdAt || Date.now()).toLocaleDateString('en-IN')} muted />
          <SumRow label="GST" value={!sale ? '—' : igst ? 'IGST (other state)' : 'CGST + SGST (same state)'} muted />
          <label className="label mt-2">Reason</label>
          <input className="input-field" placeholder="e.g. Damaged, wrong size, defective" value={reason} onChange={(e) => setReason(e.target.value)} data-testid="cn-reason" />
        </NoteCard>
      </div>

      {sale && (
        <NoteCard title={`Items returned · ${returning.length} line${returning.length === 1 ? '' : 's'}`}>
          {!canReturn ? (
            <p className="text-sm text-slate-600">This invoice is {String(sale.status).replace(/_/g, ' ')} and cannot take another return.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="border-b-2 border-slate-200 text-left text-[11px] uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="w-8 py-2 pr-2">#</th>
                    <th className="min-w-[180px] py-2 pr-2">Item</th>
                    <th className="py-2 pr-2">HSN/SAC</th>
                    <th className="py-2 pr-2 text-right">Rate ₹</th>
                    <th className="py-2 pr-2 text-right">Sold</th>
                    <th className="py-2 pr-2 text-right">Returned</th>
                    <th className="py-2 pr-2 text-right">Return qty</th>
                    <th className="py-2 pr-2 text-right">GST</th>
                    <th className="py-2 pr-2 text-right">Tax ₹</th>
                    <th className="py-2 text-right">Amount ₹</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {lines.map(({ item, remaining, value, gst: tax }, i) => (
                    <tr key={item.id} className={value > 0 ? 'bg-brand-50/40' : ''}>
                      <td className="py-2 pr-2 text-slate-400">{i + 1}</td>
                      <td className="py-2 pr-2"><div className="font-semibold text-slate-900">{item.productName}</div>{item.shortDescription && <div className="text-xs text-slate-500">{item.shortDescription}</div>}</td>
                      <td className="py-2 pr-2 font-mono text-xs">{item.hsnCode || '—'}</td>
                      <td className="py-2 pr-2 text-right tabular-nums">{money(item.unitPrice)}</td>
                      <td className="py-2 pr-2 text-right">{qtyText(item.quantity)}</td>
                      <td className="py-2 pr-2 text-right text-slate-500">{item.quantityReturned - mine(item.id) > 0 ? qtyText(item.quantityReturned - mine(item.id)) : '—'}</td>
                      <td className="py-2 pr-2 text-right">
                        {remaining > 0 ? (
                          <div className="flex items-center justify-end gap-1">
                            <input
                              type="number" inputMode="decimal" min="0" max={remaining} step="any" placeholder="0"
                              className="input-field !min-h-0 w-24 !py-1.5 text-right"
                              value={qty[item.id] ?? ''}
                              onChange={(e) => setQty({ ...qty, [item.id]: e.target.value })}
                              aria-label={`Return quantity of ${item.productName}`}
                              data-testid={`cn-qty-${i}`}
                            />
                            <button type="button" className="whitespace-nowrap text-xs font-medium text-brand-700 hover:underline" onClick={() => setQty({ ...qty, [item.id]: remaining })}>
                              all {qtyText(remaining)}
                            </button>
                          </div>
                        ) : <span className="text-xs text-slate-400">fully returned</span>}
                      </td>
                      <td className="py-2 pr-2 text-right text-slate-600">{item.gstPercentage}%</td>
                      <td className="py-2 pr-2 text-right tabular-nums text-slate-500">{tax > 0 ? money(tax) : '—'}</td>
                      <td className="py-2 text-right font-semibold tabular-nums">{value > 0 ? money(value) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-2 text-xs text-slate-400">Rates, discounts and GST are the invoice&apos;s. Stock comes back for goods; services have no stock.</p>
            </div>
          )}
        </NoteCard>
      )}
    </>
  );

  const summary = (
    <>
      <SumRow label="Taxable value" value={money(taxable)} />
      {igst ? <SumRow label="IGST" value={money(gst)} muted /> : (
        <>
          <SumRow label="CGST" value={money(r2(gst / 2))} muted />
          <SumRow label="SGST" value={money(r2(gst - r2(gst / 2)))} muted />
        </>
      )}
      {canReturn && (
        <div className="mt-3">
          <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Settle by</div>
          <div className="space-y-1.5">
            {SETTLE.map((m) => (
              <label key={m.value} title={m.hint} className={`flex cursor-pointer items-center gap-2 rounded-lg border px-2.5 py-1.5 text-sm ${method === m.value ? 'border-brand-500 bg-brand-50' : 'border-slate-200'}`}>
                <input type="radio" name="settle" checked={method === m.value} onChange={() => setMethod(m.value)} />
                <span className="font-medium">{m.label}</span>
              </label>
            ))}
          </div>
          <div className="mt-2 border-t border-slate-100 pt-2">
            <SumRow label="Set against invoice due" value={money(againstDue)} />
            {method === 'credit_note'
              ? <SumRow label="Kept as customer credit" value={money(keptCredit)} />
              : <SumRow label={`Pay back now (${method.toUpperCase()})`} value={money(refund)} strong />}
          </div>
        </div>
      )}
    </>
  );

  return (
    <NotePage
      testId="credit-note-page"
      title={editNote ? `Edit credit note ${editNote.noteNumber || editNote.returnNumber}` : sale ? `Credit note · return against ${sale.invoiceNumber}` : 'New credit note'}
      subtitle="Customer return: reduces output GST and what the customer owes. Esc back · Ctrl+S save"
      error={error}
      main={main}
      summary={summary}
      total={total}
      totalLabel="Credit note total (incl. GST)"
      actionLabel={editNote ? 'Save credit note' : 'Issue credit note'}
      onAction={save}
      actionDisabled={!canReturn || total <= 0}
      saving={saving}
      onClose={onClose}
      footnote={editNote ? 'Saving undoes the old note (stock, invoice due, customer balance) and books this one under the same number.' : 'The note gets the next credit note number for this financial year.'}
    />
  );
}
