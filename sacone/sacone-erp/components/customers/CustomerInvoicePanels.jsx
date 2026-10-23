'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiRequest } from '../../lib/api';
import { useLiveRefresh } from '../../lib/live';
import { LoadingState } from '../ui';

/**
 * Party screen panels (CRM → customer or supplier): Invoices / Bills with balance left, Payments with
 * the document's balance after each one, History (what happened to the documents, not the ledger)
 * and Returns. `party` is 'customer' or 'supplier'; supplier API rows are mapped to the same shape.
 */

const WORDS = {
  customer: { doc: 'Invoice', docs: 'invoices', in: 'Received', voucher: 'Receipt', atDoc: 'Paid at billing', note: 'credit note' },
  supplier: { doc: 'Bill', docs: 'bills', in: 'Paid', voucher: 'Voucher', atDoc: 'Direct payment', note: 'debit note' },
};
const PATHS = {
  customer: { list: 'invoice-balances', payments: 'payment-history', history: 'invoice-history' },
  supplier: { list: 'bill-balances', payments: 'payment-history', history: 'bill-history' },
};
/** Supplier rows → the customer shape the panels render. */
const FROM_SUPPLIER = {
  list: (d) => ({
    items: d.items.map((b) => ({ ...b, invoiceNumber: b.billNumber, received: b.paid, theirNumber: b.supplierInvoiceNumber })),
    totals: { ...d.totals, invoices: d.totals.bills, received: d.totals.paid },
  }),
  payments: (d) => ({
    items: d.items.map((x) => ({ ...x, source: x.source === 'Voucher' ? 'Receipt' : 'At billing', receiptNumber: x.voucherNumber, invoiceId: x.billId, invoiceNumber: x.billNumber, invoiceTotal: x.billTotal })),
    totals: { ...d.totals, received: d.totals.paid },
  }),
  history: (d) => ({ items: d.items.map((e) => ({ ...e, invoiceId: e.billId, invoiceNumber: e.billNumber, receiptNumber: e.voucherNumber })) }),
};
const LIVE_TABLES = {
  customer: ['pos_sales', 'pos_payments', 'pos_sales_returns', 'customer_receipts', 'customer_receipt_allocations'],
  supplier: ['supplier_bills', 'supplier_payments', 'supplier_payment_vouchers', 'supplier_payment_allocations', 'purchase_returns'],
};

const money = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const day = (iso) => (iso ? new Date(String(iso).length === 10 ? `${iso}T00:00:00` : iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');
const time = (iso) => (iso && String(iso).length > 10 ? new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '');

const STATUS_TONE = {
  Paid: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  'Part paid': 'bg-amber-50 text-amber-800 ring-amber-200',
  Unpaid: 'bg-slate-100 text-slate-700 ring-slate-200',
  Overdue: 'bg-rose-50 text-rose-700 ring-rose-200',
  Returned: 'bg-sky-50 text-sky-700 ring-sky-200',
};

function usePartyData(party, id, what, query = '') {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const path = `/api/${party}s/${id}/${PATHS[party][what]}${query}`;
  const load = useCallback(async () => {
    try {
      const raw = await apiRequest(path);
      setData(party === 'supplier' ? FROM_SUPPLIER[what](raw) : raw);
      setError('');
    } catch (e) {
      setError(e.message);
    }
  }, [path, party, what]);
  useEffect(() => { setData(null); load(); }, [load]);
  useLiveRefresh(load, { tables: LIVE_TABLES[party] });
  return { data, error };
}

function Figure({ label, value, tone = 'text-slate-900', hint }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
      <div className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`text-base font-semibold ${tone}`}>{value}</div>
      {hint && <div className="text-[11px] text-slate-400">{hint}</div>}
    </div>
  );
}

const Empty = ({ text }) => <div className="rounded-xl border border-dashed border-slate-200 px-4 py-10 text-center text-sm text-slate-500">{text}</div>;
const Problem = ({ text }) => <div className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{text}</div>;

/* ───────────── Invoices ───────────── */

export function CustomerInvoices({ customerId, canEdit, onEdit, party = 'customer' }) {
  const w = WORDS[party];
  const [unpaidOnly, setUnpaidOnly] = useState(false);
  const { data, error } = usePartyData(party, customerId, 'list');
  if (error) return <Problem text={error} />;
  if (!data) return <LoadingState />;
  const t = data.totals;
  const rows = unpaidOnly ? data.items.filter((i) => i.balance > 0.001) : data.items;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Figure label="Billed" value={money(t.billed)} hint={`${t.invoices} ${t.invoices === 1 ? w.doc.toLowerCase() : w.docs}`} />
        <Figure label={w.in} value={money(t.received)} tone="text-emerald-700" />
        <Figure label={party === 'supplier' ? 'Returned (debit notes)' : 'Returned'} value={money(t.returned)} tone="text-sky-700" />
        <Figure label={party === 'supplier' ? 'Balance payable' : 'Balance due'} value={money(t.balance)} tone={t.balance > 0.001 ? 'text-amber-700' : 'text-emerald-700'} hint={t.unpaid ? `${t.unpaid} unpaid${t.overdue ? ` · ${t.overdue} overdue` : ''}` : 'all paid'} />
      </div>
      <label className="inline-flex items-center gap-2 text-sm text-slate-600">
        <input type="checkbox" checked={unpaidOnly} onChange={(e) => setUnpaidOnly(e.target.checked)} /> Show only {w.docs} with a balance
      </label>
      {!rows.length ? <Empty text={unpaidOnly ? 'Nothing outstanding.' : `No ${w.docs} yet.`} /> : (
        <div className="max-h-[28rem] overflow-auto rounded-xl border border-slate-200">
          <table className="min-w-full text-sm">
            <thead className="sticky top-0 bg-slate-50 text-left text-[11px] uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2">{w.doc}</th>
                <th className="px-3 py-2 text-right">Total</th>
                <th className="px-3 py-2 text-right">{w.in}</th>
                <th className="px-3 py-2 text-right">Returned</th>
                <th className="px-3 py-2 text-right">Balance</th>
                <th className="px-3 py-2">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((i) => (
                <tr key={i.id} className="hover:bg-slate-50">
                  <td className="px-3 py-2">
                    <div className="font-mono text-xs font-semibold text-slate-900">
                      {i.invoiceNumber}
                      {canEdit && i.canEdit && (
                        <button type="button" className="ml-2 font-sans text-xs font-medium text-brand-600 hover:underline" onClick={() => onEdit(i.id)}>✏ Edit</button>
                      )}
                    </div>
                    <div className="text-xs text-slate-500">
                      {day(i.date)}
                      {i.customerPoNumber && ` · PO ${i.customerPoNumber}`}
                      {i.theirNumber && ` · their no. ${i.theirNumber}`}
                      {i.dueDate && i.balance > 0.001 && ` · due ${day(i.dueDate)}`}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right">{money(i.total)}</td>
                  <td className="px-3 py-2 text-right text-emerald-700">{i.received ? money(i.received) : '—'}</td>
                  <td className="px-3 py-2 text-right text-sky-700">{i.returned ? money(i.returned) : '—'}</td>
                  <td className={`px-3 py-2 text-right font-semibold ${i.balance > 0.001 ? 'text-amber-700' : 'text-slate-400'}`}>{i.balance > 0.001 ? money(i.balance) : 'Nil'}</td>
                  <td className="px-3 py-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${STATUS_TONE[i.status] || STATUS_TONE.Unpaid}`}>{i.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ───────────── Payments ───────────── */

export function CustomerPayments({ customerId, party = 'customer' }) {
  const w = WORDS[party];
  const { data, error } = usePartyData(party, customerId, 'payments');
  if (error) return <Problem text={error} />;
  if (!data) return <LoadingState />;
  const t = data.totals;
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <Figure label={w.in} value={money(t.received)} tone="text-emerald-700" />
        <Figure label="On account (advance)" value={money(t.onAccount)} hint={`not set against ${party === 'supplier' ? 'a bill' : 'an invoice'}`} />
        <Figure label={party === 'supplier' ? 'Balance payable now' : 'Balance due now'} value={money(t.balance)} tone={t.balance > 0.001 ? 'text-amber-700' : 'text-emerald-700'} />
      </div>
      {!data.items.length ? <Empty text="No payments yet." /> : (
        <div className="max-h-[28rem] overflow-auto rounded-xl border border-slate-200">
          <table className="min-w-full text-sm">
            <thead className="sticky top-0 bg-slate-50 text-left text-[11px] uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2">Date</th>
                <th className="px-3 py-2">Payment</th>
                <th className="px-3 py-2 text-right">Amount</th>
                <th className="px-3 py-2">For {w.doc.toLowerCase()}</th>
                <th className="px-3 py-2 text-right">Balance left</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.items.map((p) => (
                <tr key={p.id} className={`hover:bg-slate-50 ${p.status !== 'posted' ? 'opacity-60' : ''}`}>
                  <td className="whitespace-nowrap px-3 py-2 text-slate-600">{day(p.date)}</td>
                  <td className="px-3 py-2">
                    <div className="font-medium text-slate-900">{p.mode}{p.reference ? <span className="font-normal text-slate-500"> · {p.reference}</span> : null}</div>
                    <div className="text-xs text-slate-500">
                      {p.source === 'Receipt' ? `${w.voucher} ${p.receiptNumber}` : w.atDoc}
                      {p.status === 'draft' && ' · draft, not posted yet'}
                      {p.status === 'cancelled' && ' · cancelled'}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right font-semibold text-emerald-700">{money(p.amount)}</td>
                  <td className="px-3 py-2">
                    {p.onAccount ? <span className="text-slate-500">On account (advance)</span> : (
                      <>
                        <div className="font-mono text-xs font-semibold">{p.invoiceNumber}</div>
                        {p.invoiceTotal != null && <div className="text-xs text-slate-500">of {money(p.invoiceTotal)}</div>}
                      </>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {p.onAccount || p.balanceAfter == null ? '—' : (
                      <>
                        <div className={p.balanceAfter > 0.001 ? 'font-semibold text-amber-700' : 'font-semibold text-emerald-700'}>{p.balanceAfter > 0.001 ? money(p.balanceAfter) : 'Cleared'}</div>
                        {p.balanceNow != null && Math.abs(p.balanceNow - p.balanceAfter) > 0.004 && <div className="text-[11px] text-slate-400">now {p.balanceNow > 0.001 ? money(p.balanceNow) : 'nil'}</div>}
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ───────────── Sales History (what happened to the invoices) ───────────── */

const EVENT = {
  billed: { icon: '🧾', label: 'Billed', tone: 'text-slate-900' },
  edited: { icon: '✏️', label: 'Edited', tone: 'text-indigo-700' },
  deleted: { icon: '🗑️', label: 'Deleted', tone: 'text-rose-700' },
  cancelled: { icon: '🗑️', label: 'Cancelled', tone: 'text-rose-700' },
  payment: { icon: '💰', label: 'Payment', tone: 'text-emerald-700' },
  payment_draft: { icon: '⏳', label: 'Payment (draft)', tone: 'text-slate-500' },
  payment_cancelled: { icon: '↩️', label: 'Payment cancelled', tone: 'text-rose-700' },
  returned: { icon: '📦', label: 'Returned', tone: 'text-sky-700' },
};

export function CustomerSalesHistory({ customerId, only, party = 'customer' }) {
  const w = WORDS[party];
  const { data, error } = usePartyData(party, customerId, 'history');
  if (error) return <Problem text={error} />;
  if (!data) return <LoadingState />;
  const items = only ? data.items.filter((e) => only.includes(e.type)) : data.items;
  if (!items.length) return <Empty text={only ? 'No returns.' : `Nothing has happened on these ${w.docs} yet.`} />;
  return (
    <ol className="max-h-[32rem] space-y-2 overflow-auto pr-1">
      {items.map((e, idx) => {
        const kind = party === 'supplier' && e.type === 'billed' ? { ...EVENT.billed, label: 'Bill recorded' } : (EVENT[e.type] || EVENT.billed);
        return (
          <li key={`${e.type}-${e.invoiceId || ''}-${e.at}-${idx}`} className="flex gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2">
            <div className="text-lg leading-6">{kind.icon}</div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                <div className={`text-sm font-semibold ${kind.tone}`}>
                  {kind.label}
                  {e.invoiceNumber && <span className="ml-2 font-mono text-xs font-semibold text-slate-700">{e.invoiceNumber}</span>}
                </div>
                <div className="text-xs text-slate-500">{day(e.date || e.at)}{time(e.at) && ` · ${time(e.at)}`}</div>
              </div>
              <div className="text-sm text-slate-600">
                {e.type === 'edited' && e.previous != null && e.previous !== e.amount
                  ? <>Total changed {money(e.previous)} → <b>{money(e.amount)}</b></>
                  : e.type === 'returned'
                    ? <>Goods worth <b>{money(e.amount)}</b> returned · {w.note} {e.noteNumber}{e.refundAmount ? ` · ${money(e.refundAmount)} refunded` : ''}</>
                    : e.type.startsWith('payment')
                      ? <><b>{money(e.amount)}</b> {e.mode ? `by ${e.mode}` : ''}{e.receiptNumber ? ` · ${w.voucher.toLowerCase()} ${e.receiptNumber}` : ''}{e.text?.includes('Advance') || e.onAccount ? ' · advance (on account)' : ''}</>
                      : e.type === 'cancelled'
                        ? <>Bill cancelled · was {money(e.amount)}</>
                      : e.type === 'deleted'
                        ? <>{e.text.replace(/^Invoice deleted:?\s*/, '') || 'Removed'}{e.amount ? ` · was ${money(e.amount)}` : ''}</>
                        : <>Amount <b>{money(e.amount)}</b>{e.supplierInvoiceNumber ? ` · their no. ${e.supplierInvoiceNumber}` : ''}</>}
                {e.balanceAfter != null && (e.type === 'payment' || e.type === 'returned') && (
                  <span className={`ml-2 text-xs font-medium ${e.balanceAfter > 0.001 ? 'text-amber-700' : 'text-emerald-700'}`}>
                    {e.balanceAfter > 0.001 ? `${money(e.balanceAfter)} left` : `${w.doc.toLowerCase()} cleared`}
                  </span>
                )}
              </div>
              {e.by && <div className="text-[11px] text-slate-400">by {e.by}</div>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
