'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiRequest } from '../../lib/api';
import { useAuth } from '../../lib/auth-context';
import { useLiveRefresh } from '../../lib/live';
import { documentHtml, saleDocument } from '../../lib/bill-document';
import { downloadCsv, toCsv } from '../../lib/csv';
import PageHeader, { Alert, LoadingState } from '../ui';
import DocumentDialog from '../documents/DocumentDialog';
import EditInvoiceDialog from './EditInvoiceDialog';
import ShortDescriptionDialog from './ShortDescriptionDialog';
import CreditNoteDialog from '../notes/CreditNoteDialog';
import { loadCreditNote } from '../../lib/note-documents';
import { EmptyPanel, StatCard, Toolbar } from '../module-ui';

const money = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const day = (iso) => (iso ? new Date(iso).toLocaleDateString('en-IN') : '');
const today = () => new Date().toISOString().slice(0, 10);

const INVOICE_COLUMNS = [
  { label: 'Invoice', value: (s) => s.invoiceNumber },
  { label: 'Date', value: (s) => s.createdAt },
  { label: 'Customer PO no.', value: (s) => s.customerPoNumber },
  { label: 'Customer PO date', value: (s) => s.customerPoDate },
  { label: 'Customer', value: (s) => s.customerName || 'Walk-in' },
  { label: 'Phone', value: (s) => s.customerPhone },
  { label: 'Warehouse', value: (s) => s.warehouseName },
  { label: 'Status', value: (s) => s.status },
  { label: 'Payment', value: (s) => s.paymentStatus },
  { label: 'Subtotal', value: (s) => s.subtotal },
  { label: 'Discount', value: (s) => (s.itemDiscountTotal || 0) + (s.invoiceDiscount || 0) },
  { label: 'Taxable', value: (s) => s.taxableAmount },
  { label: 'CGST', value: (s) => s.cgstAmount },
  { label: 'SGST', value: (s) => s.sgstAmount },
  { label: 'IGST', value: (s) => s.igstAmount },
  { label: 'GST', value: (s) => s.gstAmount },
  { label: 'Net amount', value: (s) => s.grandTotal },
  { label: 'Paid', value: (s) => s.amountPaid },
  { label: 'Due', value: (s) => s.amountCredit },
  { label: 'Cashier', value: (s) => s.createdByName },
];

function queryString(filters, limit) {
  const q = new URLSearchParams({ limit: String(limit) });
  if (filters.search) q.set('search', filters.search);
  if (filters.dateFrom) q.set('dateFrom', filters.dateFrom);
  if (filters.dateTo) q.set('dateTo', filters.dateTo);
  return q.toString();
}

export default function SalesInvoices() {
  const [filters, setFilters] = useState({ search: '', dateFrom: '', dateTo: '' });
  const [applied, setApplied] = useState(filters);
  const [data, setData] = useState({ items: [], total: 0 });
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState('');
  const [openId, setOpenId] = useState(null);
  const [editId, setEditId] = useState(null);
  const [returnId, setReturnId] = useState(null);
  const [noteId, setNoteId] = useState(null);
  const [message, setMessage] = useState('');
  const { session, checkPermission } = useAuth();
  const canReturn = checkPermission('pos.returns.create');
  const canDescribe = checkPermission('pos.sales.create');
  const [descId, setDescId] = useState(null);
  // Only the owner may change or delete a bill.
  const isOwner = ['owner_admin', 'firm_admin'].includes(session?.user?.roleSlug);

  const load = useCallback(async (silent = false) => {
    if (silent !== true) setLoading(true);
    try {
      setData(await apiRequest(`/api/pos/sales?${queryString(applied, 200)}`));
      setError('');
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [applied]);

  useEffect(() => { load(); }, [load]);
  useLiveRefresh(() => load(true), { tables: ['pos_sales', 'pos_payments', 'pos_sales_returns', 'customers'] });

  const exportCsv = async () => {
    setExporting(true);
    try {
      const all = await apiRequest(`/api/pos/sales?${queryString(applied, 5000)}`);
      const range = [applied.dateFrom, applied.dateTo].filter(Boolean).join('_to_') || today();
      downloadCsv(`sales-invoices-${range}.csv`, toCsv(all.items, INVOICE_COLUMNS));
    } catch (e) {
      setError(e.message);
    } finally {
      setExporting(false);
    }
  };

  const deleteInvoice = async (s) => {
    const reason = window.prompt(`Delete invoice ${s.invoiceNumber} (${money(s.grandTotal)})?
Its items go back to stock and any credit comes off the customer.

Reason (optional):`);
    if (reason === null) return;
    try {
      await apiRequest(`/api/pos/sales/${s.id}`, { method: 'DELETE', body: JSON.stringify({ reason }) });
      setMessage(`Invoice ${s.invoiceNumber} deleted; stock restored.`);
      setError('');
      load(true);
    } catch (e) {
      setError(e.message);
    }
  };

  const rows = data.items || [];
  const sum = (key) => rows.reduce((s, r) => s + Number(r[key] || 0), 0);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Sales Invoices"
        description="Bills from SAC-POS phones and the ERP. Print 58 mm / 80 mm receipts or A5 / A4 invoices, save PDFs and export CSV."
        actions={<button type="button" className="btn-secondary" onClick={exportCsv} disabled={exporting}>{exporting ? 'Exporting…' : '⬇ Export CSV'}</button>}
      />
      <Alert message={error} />
      <Alert type="success" message={message} />

      <Toolbar>
        <input
          className="input-field w-full sm:w-64"
          placeholder="Invoice, customer, phone or PO no."
          value={filters.search}
          onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
          onKeyDown={(e) => { if (e.key === 'Enter') setApplied(filters); }}
        />
        <label className="flex items-center gap-2 text-sm text-slate-500">
          From <input type="date" className="input-field w-auto" value={filters.dateFrom} onChange={(e) => setFilters((f) => ({ ...f, dateFrom: e.target.value }))} />
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-500">
          To <input type="date" className="input-field w-auto" value={filters.dateTo} onChange={(e) => setFilters((f) => ({ ...f, dateTo: e.target.value }))} />
        </label>
        <button type="button" className="btn-primary" onClick={() => setApplied(filters)}>Apply</button>
        {(applied.search || applied.dateFrom || applied.dateTo) && (
          <button type="button" className="btn-secondary" onClick={() => { const empty = { search: '', dateFrom: '', dateTo: '' }; setFilters(empty); setApplied(empty); }}>Clear</button>
        )}
      </Toolbar>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatCard label="Invoices" value={data.total} compact />
        <StatCard label="Taxable (shown)" value={money(sum('taxableAmount'))} compact />
        <StatCard label="GST (shown)" value={money(sum('gstAmount'))} compact />
        <StatCard label="Net sales (shown)" value={money(sum('grandTotal'))} compact />
        <StatCard label="Due (shown)" value={money(sum('amountCredit'))} tone={sum('amountCredit') > 0 ? 'warning' : 'default'} compact />
      </div>

      {loading ? <LoadingState /> : rows.length === 0 ? (
        <EmptyPanel title="No invoices" description="Sales made on SAC-POS phones appear here once they sync." />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Invoice</th>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Customer</th>
                <th className="px-4 py-3">Payment</th>
                <th className="px-4 py-3 text-right">Taxable value</th>
                <th className="px-4 py-3 text-right">GST</th>
                <th className="px-4 py-3 text-right">Net amount</th>
                <th className="px-4 py-3 text-right">Due</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((s) => (
                <tr key={s.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-mono text-xs font-semibold">
                    {s.invoiceNumber}
                    {s.customerPoNumber && (
                      <div className="font-sans text-[11px] font-normal text-slate-500">
                        PO {s.customerPoNumber}{s.customerPoDate ? ` · ${new Date(s.customerPoDate).toLocaleDateString('en-IN')}` : ''}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-500">{day(s.createdAt)}</td>
                  <td className="px-4 py-3">{s.customerIsWalkIn ? 'Walk-in' : s.customerName}</td>
                  <td className="px-4 py-3 capitalize text-slate-600">{(s.paymentStatus || '').replace(/_/g, ' ')}{s.status !== 'completed' ? ` · ${s.status.replace(/_/g, ' ')}` : ''}</td>
                  <td className="px-4 py-3 text-right text-slate-700">{money(s.taxableAmount)}</td>
                  <td className="px-4 py-3 text-right text-slate-700" title={s.igstAmount > 0 ? `IGST ${money(s.igstAmount)}` : `CGST ${money(s.cgstAmount)} + SGST ${money(s.sgstAmount)}`}>
                    {money(s.gstAmount)}
                    <div className="text-[11px] text-slate-400">{s.igstAmount > 0 ? 'IGST' : 'CGST + SGST'}</div>
                  </td>
                  <td className="px-4 py-3 text-right font-semibold">{money(s.grandTotal)}</td>
                  <td className={`px-4 py-3 text-right ${s.amountCredit > 0 ? 'text-amber-700' : 'text-slate-400'}`}>{s.amountCredit > 0 ? money(s.amountCredit) : '—'}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-2">
                      <button type="button" className="btn-secondary !min-h-0 whitespace-nowrap !px-3 !py-1.5 text-xs" onClick={() => setOpenId(s.id)}>Print / Share</button>
                      {canDescribe && s.status !== 'voided' && (
                        <button type="button" className="btn-secondary !min-h-0 whitespace-nowrap !px-3 !py-1.5 text-xs" onClick={() => { setMessage(''); setDescId(s.id); }}>Short description</button>
                      )}
                      {canReturn && ['completed', 'partially_returned'].includes(s.status) && (
                        <button type="button" className="btn-secondary !min-h-0 whitespace-nowrap !px-3 !py-1.5 text-xs" onClick={() => { setMessage(''); setReturnId(s.id); }}>Return</button>
                      )}
                      {isOwner && s.status === 'completed' && (
                        <>
                          <button type="button" className="btn-secondary !min-h-0 whitespace-nowrap !px-3 !py-1.5 text-xs" title="Admin only" onClick={() => { setMessage(''); setEditId(s.id); }}>✏ Edit bill</button>
                          <button type="button" className="btn-secondary !min-h-0 !px-3 !py-1.5 text-xs !text-red-600" onClick={() => deleteInvoice(s)}>Delete</button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {data.total > rows.length && (
            <p className="border-t border-slate-100 px-4 py-2 text-xs text-slate-500">Showing the latest {rows.length} of {data.total}. Narrow the dates to see older ones; Export CSV includes all matches.</p>
          )}
        </div>
      )}

      {descId && (
        <ShortDescriptionDialog
          saleId={descId}
          onClose={() => setDescId(null)}
          onSaved={(saved) => { setDescId(null); setMessage(`Short description saved on ${saved.invoiceNumber}.`); }}
        />
      )}
      {editId && (
        <EditInvoiceDialog
          saleId={editId}
          onClose={() => setEditId(null)}
          onSaved={(saved) => { setEditId(null); setMessage(`Invoice ${saved.invoiceNumber} updated; stock adjusted.`); load(true); }}
        />
      )}
      {openId && (
        <DocumentDialog
          title="Invoice"
          load={() => loadInvoice(openId)}
          onClose={() => setOpenId(null)}
          action={isOwner && rows.find((r) => r.id === openId)?.status === 'completed' && (
            <button type="button" className="btn-secondary text-sm" onClick={() => { setEditId(openId); setOpenId(null); setMessage(''); }}>✏ Edit bill</button>
          )}
        />
      )}
      {returnId && (
        <CreditNoteDialog
          saleId={returnId}
          onClose={() => setReturnId(null)}
          onCreated={(note) => {
            setReturnId(null);
            setMessage(`Credit note ${note.noteNumber} issued for ${money(note.grandTotal)}.`);
            load(true);
            setNoteId(note.id);
          }}
        />
      )}
      {noteId && <DocumentDialog title="Credit Note" documentLabel="credit note" load={() => loadCreditNote(noteId)} onClose={() => setNoteId(null)} />}
    </div>
  );
}

/** Everything the document dialog needs for one sales invoice. */
async function loadInvoice(saleId) {
  const [sale, company, invoice] = await Promise.all([
    apiRequest(`/api/pos/sales/${saleId}`),
    apiRequest('/api/company').catch(() => null),
    apiRequest('/api/settings/invoice').catch(() => ({})),
  ]);
  const customer = sale.customerId && !sale.customerIsWalkIn
    ? await apiRequest(`/api/customers/${sale.customerId}`).catch(() => null)
    : null;
  const model = saleDocument(sale, customer);
  return {
    summary: [
      ['Invoice', sale.invoiceNumber],
      ['Date', new Date(sale.createdAt).toLocaleString('en-IN')],
      ['Customer', sale.customerIsWalkIn ? 'Walk-in' : sale.customerName],
      ...(sale.customerPoNumber ? [['Customer PO', `${sale.customerPoNumber}${sale.customerPoDate ? ` · ${new Date(sale.customerPoDate).toLocaleDateString('en-IN')}` : ''}`]] : []),
      ['Total', money(sale.grandTotal)],
      ...(sale.notes ? [['Notes', sale.notes]] : []),
    ],
    html: (size, layout) => documentHtml(model, company, size, { layout, invoice }),
    defaultLayout: invoice.layout,
    items: sale.items,
    csvName: sale.invoiceNumber,
    share: {
      number: sale.invoiceNumber,
      amount: sale.grandTotal,
      links: {
        status: () => apiRequest(`/api/pos/sales/${saleId}/share-link`),
        create: () => apiRequest(`/api/pos/sales/${saleId}/share-link`, { method: 'POST' }),
        revoke: () => apiRequest(`/api/pos/sales/${saleId}/share-links`, { method: 'DELETE' }),
      },
    },
  };
}
