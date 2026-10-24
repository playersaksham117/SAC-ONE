'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiRequest } from '../../../../lib/api';
import { useAuth, RequirePermission } from '../../../../lib/auth-context';
import { useLiveRefresh } from '../../../../lib/live';
import { money } from '../../../../lib/bill-document';
import { downloadCsv, toCsv } from '../../../../lib/csv';
import { loadCreditNote, loadDebitNote } from '../../../../lib/note-documents';
import PageHeader, { Alert, LoadingState } from '../../../../components/ui';
import { EmptyPanel, StatCard } from '../../../../components/module-ui';
import DocumentDialog from '../../../../components/documents/DocumentDialog';
import CreditNoteDialog from '../../../../components/notes/CreditNoteDialog';
import DebitNoteDialog from '../../../../components/notes/DebitNoteDialog';

const day = (d) => (d ? new Date(d).toLocaleDateString('en-IN') : '—');
const fyLabel = (code) => `FY ${code}`;
const SETTLED = { credit_note: 'Customer credit', cash: 'Cash refund', upi: 'UPI refund', bank: 'Bank refund' };
/** How a credit note was settled: kept as credit, set against the invoice due, refunded, or both. */
const settledBy = (n) => {
  if (n.refundMethod === 'credit_note') return SETTLED.credit_note;
  if (n.refundAmount > 0 && n.adjustedAmount > 0) return `Invoice due + ${SETTLED[n.refundMethod] || n.refundMethod}`;
  if (n.refundAmount > 0) return SETTLED[n.refundMethod] || n.refundMethod;
  return 'Invoice due';
};

const KINDS = {
  credit: {
    label: 'Credit Notes',
    one: 'Credit Note',
    permission: 'pos.returns.view',
    createPermission: 'pos.returns.create',
    path: '/api/notes/credit',
    load: loadCreditNote,
    help: 'Issued when a customer returns goods — from SAC-POS or from an invoice here. They reduce output GST and the customer’s dues.',
    columns: [
      { label: 'Credit note', value: (n) => n.noteNumber },
      { label: 'Date', value: (n) => String(n.createdAt || '').slice(0, 10) },
      { label: 'Financial year', value: (n) => n.financialYear },
      { label: 'Against invoice', value: (n) => n.invoiceNumber },
      { label: 'Invoice date', value: (n) => String(n.invoiceDate || '').slice(0, 10) },
      { label: 'Customer', value: (n) => (n.customerIsWalkIn ? 'Walk-in' : n.customerName) },
      { label: 'Taxable value', value: (n) => n.subtotal },
      { label: 'CGST', value: (n) => n.cgstAmount },
      { label: 'SGST', value: (n) => n.sgstAmount },
      { label: 'IGST', value: (n) => n.igstAmount },
      { label: 'GST', value: (n) => n.gstAmount },
      { label: 'Net amount', value: (n) => n.grandTotal },
      { label: 'Set against dues', value: (n) => n.adjustedAmount },
      { label: 'Refunded', value: (n) => n.refundAmount },
      { label: 'Settled by', value: (n) => settledBy(n) },
      { label: 'Reason', value: (n) => n.reason },
      { label: 'Return ref', value: (n) => n.returnNumber },
    ],
  },
  debit: {
    label: 'Debit Notes',
    one: 'Debit Note',
    permission: 'purchases.returns.view',
    createPermission: 'purchases.returns.create',
    path: '/api/notes/debit',
    load: loadDebitNote,
    help: 'Issued when you return goods to a supplier. They reduce input GST and what you owe on the bill.',
    columns: [
      { label: 'Debit note', value: (n) => n.noteNumber },
      { label: 'Date', value: (n) => n.returnDate },
      { label: 'Financial year', value: (n) => n.financialYear },
      { label: 'Against bill', value: (n) => n.billNumber },
      { label: 'Supplier invoice', value: (n) => n.supplierInvoiceNumber },
      { label: 'Supplier', value: (n) => n.supplierName },
      { label: 'Taxable value', value: (n) => n.taxableAmount ?? n.subtotal },
      { label: 'CGST', value: (n) => n.cgstAmount },
      { label: 'SGST', value: (n) => n.sgstAmount },
      { label: 'IGST', value: (n) => n.igstAmount },
      { label: 'GST', value: (n) => n.gstAmount },
      { label: 'Net amount', value: (n) => n.grandTotal },
      { label: 'Set against bill', value: (n) => n.adjustedAmount },
      { label: 'Reason', value: (n) => n.reason },
      { label: 'Return ref', value: (n) => n.returnNumber },
    ],
  },
};

export default function NotesPage() {
  const { checkPermission, session } = useAuth();
  // Only the owner may change an issued note.
  const isOwner = ['owner_admin', 'firm_admin'].includes(session?.user?.roleSlug);
  const [editing, setEditing] = useState(null);
  const kinds = useMemo(() => Object.keys(KINDS).filter((k) => checkPermission(KINDS[k].permission)), [checkPermission]);
  const [kind, setKind] = useState(kinds[0] || 'credit');
  const [years, setYears] = useState(null);
  const [fy, setFy] = useState('');
  const [search, setSearch] = useState('');
  const [applied, setApplied] = useState('');
  const [data, setData] = useState({ items: [], total: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [openId, setOpenId] = useState(null);
  const [creating, setCreating] = useState(false);
  const spec = KINDS[kind];

  useEffect(() => {
    apiRequest('/api/notes/financial-years')
      .then((y) => { setYears(y); setFy((cur) => cur || y.current); })
      .catch((e) => setError(e.message));
  }, []);

  const load = useCallback(async (quiet = false) => {
    if (!fy) return;
    if (!quiet) setLoading(true);
    try {
      const q = new URLSearchParams({ financialYear: fy, limit: '5000' });
      if (applied) q.set('search', applied);
      setData(await apiRequest(`${spec.path}?${q}`));
      setError('');
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [spec.path, fy, applied]);

  useEffect(() => { load(); }, [load]);
  useLiveRefresh(() => load(true), { tables: ['pos_sales_returns', 'purchase_returns'] });

  const rows = data.items || [];
  const sum = (key) => rows.reduce((s, n) => s + Number(n[key] || 0), 0);
  const gst = rows.reduce((s, n) => s + Number(n.gstAmount || 0), 0);

  const exportCsv = () => downloadCsv(
    `${spec.label.replace(/\s+/g, '-')}-${fy === 'all' ? 'all-years' : `FY-${fy}`}.csv`,
    toCsv(rows, spec.columns),
  );

  const startEdit = async (n) => {
    setMessage('');
    try {
      const full = await apiRequest(kind === 'credit' ? `/api/pos/returns/${n.id}` : `/api/purchases/returns/${n.id}`);
      setEditing(full);
    } catch (e) {
      setError(e.message);
    }
  };
  const edited = (note) => {
    setEditing(null);
    setMessage(`${spec.one} ${note.noteNumber || note.returnNumber} updated: ${money(note.grandTotal)}.`);
    load(true);
  };

  const created = (note) => {
    setCreating(false);
    setMessage(`${spec.one} ${note.noteNumber} issued for ${money(note.grandTotal)}.`);
    load(true);
    setOpenId(note.id);
  };

  if (!kinds.length) {
    return <RequirePermission permissions={['pos.returns.view', 'purchases.returns.view']}><div /></RequirePermission>;
  }

  return (
    <RequirePermission permissions={['pos.returns.view', 'purchases.returns.view']}>
      <PageHeader
        title="Credit & Debit Notes"
        description="GST credit notes for customer returns and debit notes for returns to suppliers, numbered afresh each financial year."
        actions={(
          <>
            {checkPermission(spec.createPermission) && (
              <button type="button" className="btn-primary" onClick={() => { setMessage(''); setCreating(true); }}>+ {spec.one}</button>
            )}
            <button type="button" className="btn-secondary" onClick={exportCsv} disabled={!rows.length}>⬇ CSV</button>
          </>
        )}
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {kinds.map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => { setKind(k); setMessage(''); }}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition ${kind === k ? 'bg-brand-600 text-white' : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}
          >
            {KINDS[k].label}
          </button>
        ))}
        <select className="input-field ml-auto max-w-[11rem]" value={fy} onChange={(e) => setFy(e.target.value)} aria-label="Financial year">
          {(years?.years || []).map((y) => <option key={y} value={y}>{fyLabel(y)}</option>)}
          <option value="all">All years</option>
        </select>
      </div>

      <form className="mb-4 flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); setApplied(search.trim()); }}>
        <input
          className="input-field max-w-md flex-1"
          placeholder={kind === 'credit' ? 'Search note no., invoice no., customer or phone' : 'Search note no., bill no., supplier invoice or supplier'}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button type="submit" className="btn-secondary">Search</button>
        {applied && <button type="button" className="btn-secondary" onClick={() => { setSearch(''); setApplied(''); }}>Clear</button>}
      </form>

      <p className="mb-4 text-sm text-slate-500">{spec.help}</p>
      <Alert message={error} />
      <Alert type="success" message={message} />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Notes" value={String(rows.length)} compact />
        <StatCard label="Taxable value" value={money(sum(kind === 'credit' ? 'subtotal' : 'taxableAmount'))} compact />
        <StatCard label="GST" value={money(gst)} compact />
        <StatCard label="Net amount" value={money(sum('grandTotal'))} compact />
      </div>

      {loading ? <LoadingState /> : rows.length === 0 ? (
        <EmptyPanel
          title={`No ${spec.label.toLowerCase()} in ${fy === 'all' ? 'any year' : fyLabel(fy)}`}
          description={kind === 'credit' ? 'Customer returns from SAC-POS or Sales → Return create credit notes here.' : 'Use “+ Debit Note” or Purchases → Returns to return goods to a supplier.'}
        />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">{spec.one}</th>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">{kind === 'credit' ? 'Against invoice' : 'Against bill'}</th>
                <th className="px-4 py-3">{kind === 'credit' ? 'Customer' : 'Supplier'}</th>
                <th className="px-4 py-3 text-right">Taxable value</th>
                <th className="px-4 py-3 text-right">GST</th>
                <th className="px-4 py-3 text-right">Net amount</th>
                <th className="px-4 py-3">{kind === 'credit' ? 'Settled by' : 'Off the bill'}</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((n) => (
                <tr key={n.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-mono text-xs font-semibold">{n.noteNumber}</td>
                  <td className="px-4 py-3 text-slate-500">{day(kind === 'credit' ? n.createdAt : n.returnDate)}</td>
                  <td className="px-4 py-3 font-mono text-xs">{(kind === 'credit' ? n.invoiceNumber : n.billNumber) || <span className="font-sans text-slate-400">direct</span>}</td>
                  <td className="px-4 py-3">{kind === 'credit' ? (n.customerIsWalkIn ? 'Walk-in' : n.customerName) : n.supplierName}</td>
                  <td className="px-4 py-3 text-right text-slate-700">{money(kind === 'credit' ? n.subtotal : (n.taxableAmount ?? n.subtotal))}</td>
                  <td className="px-4 py-3 text-right text-slate-700" title={n.igstAmount > 0 ? `IGST ${money(n.igstAmount)}` : `CGST ${money(n.cgstAmount)} + SGST ${money(n.sgstAmount)}`}>
                    {money(n.gstAmount)}
                    <div className="text-[11px] text-slate-400">{n.igstAmount > 0 ? 'IGST' : 'CGST + SGST'}</div>
                  </td>
                  <td className="px-4 py-3 text-right font-semibold">{money(n.grandTotal)}</td>
                  <td className="px-4 py-3 text-slate-600">
                    {kind === 'credit'
                      ? settledBy(n)
                      : (n.adjustedAmount > 0 ? money(n.adjustedAmount) : '—')}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {isOwner && n.status !== 'cancelled' && (
                      <button type="button" className="btn-secondary !min-h-0 mr-2 whitespace-nowrap !px-3 !py-1.5 text-xs" onClick={() => startEdit(n)}>✏ Edit</button>
                    )}
                    <button type="button" className="btn-secondary !min-h-0 whitespace-nowrap !px-3 !py-1.5 text-xs" onClick={() => setOpenId(n.id)}>Print / Share</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {openId && (
        <DocumentDialog
          title={spec.one}
          documentLabel={spec.one.toLowerCase()}
          load={() => spec.load(openId)}
          onClose={() => setOpenId(null)}
        />
      )}
      {editing && kind === 'credit' && <CreditNoteDialog editNote={editing} onClose={() => setEditing(null)} onCreated={edited} />}
      {editing && kind === 'debit' && <DebitNoteDialog editNote={editing} onClose={() => setEditing(null)} onCreated={edited} />}
      {creating && kind === 'credit' && <CreditNoteDialog onClose={() => setCreating(false)} onCreated={created} />}
      {creating && kind === 'debit' && <DebitNoteDialog onClose={() => setCreating(false)} onCreated={created} />}
    </RequirePermission>
  );
}
