'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiRequest } from '../../lib/api';
import { useLiveRefresh } from '../../lib/live';
import { documentHtml, money as moneyFmt, quotationDocument } from '../../lib/bill-document';
import DocumentDialog from '../documents/DocumentDialog';
import EditQuotationDialog from './EditQuotationDialog';
import { useAuth } from '../../lib/auth-context';
import { downloadCsv, toCsv } from '../../lib/csv';
import { Alert, LoadingState } from '../ui';
import { EmptyPanel } from '../module-ui';

const money = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const day = (d) => (d ? new Date(d).toLocaleDateString('en-IN') : '—');
const STATUS = {
  draft: 'bg-slate-100 text-slate-600', sent: 'bg-blue-50 text-blue-700', accepted: 'bg-indigo-50 text-indigo-700',
  converted: 'bg-emerald-50 text-emerald-700', cancelled: 'bg-slate-100 text-slate-400', expired: 'bg-amber-50 text-amber-700',
};
const CSV_COLUMNS = [
  { label: 'Quotation', value: (q) => q.quotationNumber },
  { label: 'Date', value: (q) => q.quotationDate },
  { label: 'Valid until', value: (q) => q.validUntil },
  { label: 'Customer', value: (q) => q.customerSnapshot?.name || q.customerName },
  { label: 'Customer PO', value: (q) => q.customerPoNumber },
  { label: 'Status', value: (q) => q.status },
  { label: 'Taxable', value: (q) => q.taxableAmount },
  { label: 'GST', value: (q) => q.gstAmount },
  { label: 'Total', value: (q) => q.grandTotal },
  { label: 'Invoice', value: (q) => q.convertedInvoiceNumber },
];

/** Quotations (made on SAC-POS with the Sale / Quotation toggle, or in the ERP): search, print, CSV. */
export default function SalesQuotations() {
  const [search, setSearch] = useState('');
  const [applied, setApplied] = useState('');
  const [status, setStatus] = useState('');
  const [data, setData] = useState({ items: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [editId, setEditId] = useState(null);
  const { checkPermission } = useAuth();
  const canEdit = checkPermission('pos.quotations.edit');

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const q = new URLSearchParams({ limit: '500' });
      if (applied) q.set('search', applied);
      if (status) q.set('status', status);
      setData(await apiRequest(`/api/pos/quotations?${q}`));
      setError('');
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [applied, status]);

  useEffect(() => { load(); }, [load]);
  useLiveRefresh(() => load(true), { tables: ['pos_quotations'] });

  const rows = data.items || [];
  const [openId, setOpenId] = useState(null);

  return (
    <div className="space-y-4">
      <form className="flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); setApplied(search.trim()); }}>
        <input className="input-field max-w-md flex-1" placeholder="Quotation no., customer, phone or PO no." value={search} onChange={(e) => setSearch(e.target.value)} />
        <select className="input-field max-w-[11rem]" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status">
          <option value="">All statuses</option>
          {['sent', 'draft', 'accepted', 'converted', 'cancelled'].map((s) => <option key={s} value={s} className="capitalize">{s}</option>)}
        </select>
        <button type="submit" className="btn-secondary">Search</button>
        <button type="button" className="btn-secondary" disabled={!rows.length} onClick={() => downloadCsv('quotations.csv', toCsv(rows, CSV_COLUMNS))}>⬇ CSV</button>
      </form>
      <Alert message={error} />
      <Alert type="success" message={message} />
      {loading ? <LoadingState /> : rows.length === 0 ? (
        <EmptyPanel title="No quotations" description="On SAC-POS, switch the Sell screen to Quotation, add items and save. Quotations sync here." />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Quotation</th>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Customer</th>
                <th className="px-4 py-3">Valid until</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Total</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((q) => (
                <tr key={q.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-mono text-xs font-semibold">
                    {q.quotationNumber}
                    {q.customerPoNumber && <div className="font-sans text-[11px] font-normal text-slate-500">PO {q.customerPoNumber}</div>}
                  </td>
                  <td className="px-4 py-3 text-slate-500">{day(q.quotationDate || q.createdAt)}</td>
                  <td className="px-4 py-3">{q.customerSnapshot?.name || q.customerName || 'Walk-in'}</td>
                  <td className="px-4 py-3 text-slate-500">{day(q.validUntil)}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${STATUS[q.status] || STATUS.draft}`}>{q.status}</span>
                    {q.convertedInvoiceNumber && <div className="mt-1 font-mono text-[11px] text-slate-500">{q.convertedInvoiceNumber}</div>}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold">{money(q.grandTotal)}</td>
                  <td className="px-4 py-3 text-right">
                    {canEdit && ['draft', 'sent'].includes(q.status) && (
                      <button type="button" className="btn-secondary !min-h-0 mr-2 whitespace-nowrap !px-3 !py-1.5 text-xs" onClick={() => { setMessage(''); setEditId(q.id); }}>✏ Edit</button>
                    )}
                    <button type="button" className="btn-secondary !min-h-0 whitespace-nowrap !px-3 !py-1.5 text-xs" onClick={() => setOpenId(q.id)}>Print / Share</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {editId && (
        <EditQuotationDialog
          quotationId={editId}
          onClose={() => setEditId(null)}
          onSaved={(q) => { setEditId(null); setMessage(`Quotation ${q.quotationNumber} updated.`); load(true); }}
        />
      )}
      {openId && <DocumentDialog title="Quotation" documentLabel="quotation" load={() => loadQuotation(openId)} onClose={() => setOpenId(null)} />}
    </div>
  );
}

async function loadQuotation(id) {
  const [quote, company, invoice] = await Promise.all([
    apiRequest(`/api/pos/quotations/${id}`),
    apiRequest('/api/company').catch(() => null),
    apiRequest('/api/settings/invoice').catch(() => ({})),
  ]);
  const model = quotationDocument(quote);
  return {
    summary: [
      ['Quotation', quote.quotationNumber],
      ['Date', new Date(quote.quotationDate || quote.createdAt).toLocaleDateString('en-IN')],
      ['Customer', quote.customerSnapshot?.name || 'Walk-in'],
      ...(quote.validUntil ? [['Valid until', new Date(quote.validUntil).toLocaleDateString('en-IN')]] : []),
      ...(quote.customerPoNumber ? [['Customer PO', quote.customerPoNumber]] : []),
      ['Total', moneyFmt(quote.grandTotal)],
    ],
    html: (size, layout) => documentHtml(model, company, size, { layout, invoice }),
    defaultLayout: invoice.layout,
    items: quote.items,
    csvName: quote.quotationNumber,
    share: { number: quote.quotationNumber, amount: quote.grandTotal, label: 'Quotation' },
  };
}
