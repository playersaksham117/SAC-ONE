'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiRequest } from '../../lib/api';
import { useLiveRefresh } from '../../lib/live';
import { documentHtml, saleDocument } from '../../lib/bill-document';
import { downloadCsv, toCsv } from '../../lib/csv';
import PageHeader, { Alert, LoadingState } from '../ui';
import DocumentDialog from '../documents/DocumentDialog';
import { EmptyPanel, StatCard, Toolbar } from '../module-ui';

const money = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const day = (iso) => (iso ? new Date(iso).toLocaleDateString('en-IN') : '');
const today = () => new Date().toISOString().slice(0, 10);

const INVOICE_COLUMNS = [
  { label: 'Invoice', value: (s) => s.invoiceNumber },
  { label: 'Date', value: (s) => s.createdAt },
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
  { label: 'Total', value: (s) => s.grandTotal },
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

      <Toolbar>
        <input
          className="input-field w-full sm:w-64"
          placeholder="Invoice, customer or phone"
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

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Invoices" value={data.total} compact />
        <StatCard label="Sales (shown)" value={money(sum('grandTotal'))} compact />
        <StatCard label="GST (shown)" value={money(sum('gstAmount'))} compact />
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
                <th className="px-4 py-3 text-right">Total</th>
                <th className="px-4 py-3 text-right">Due</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((s) => (
                <tr key={s.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-mono text-xs font-semibold">{s.invoiceNumber}</td>
                  <td className="px-4 py-3 text-slate-500">{day(s.createdAt)}</td>
                  <td className="px-4 py-3">{s.customerIsWalkIn ? 'Walk-in' : s.customerName}</td>
                  <td className="px-4 py-3 capitalize text-slate-600">{(s.paymentStatus || '').replace(/_/g, ' ')}{s.status !== 'completed' ? ` · ${s.status.replace(/_/g, ' ')}` : ''}</td>
                  <td className="px-4 py-3 text-right font-semibold">{money(s.grandTotal)}</td>
                  <td className={`px-4 py-3 text-right ${s.amountCredit > 0 ? 'text-amber-700' : 'text-slate-400'}`}>{s.amountCredit > 0 ? money(s.amountCredit) : '—'}</td>
                  <td className="px-4 py-3 text-right">
                    <button type="button" className="btn-secondary !min-h-0 whitespace-nowrap !px-3 !py-1.5 text-xs" onClick={() => setOpenId(s.id)}>Print / PDF</button>
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

      {openId && <DocumentDialog title="Invoice" load={() => loadInvoice(openId)} onClose={() => setOpenId(null)} />}
    </div>
  );
}

/** Everything the document dialog needs for one sales invoice. */
async function loadInvoice(saleId) {
  const [sale, company] = await Promise.all([apiRequest(`/api/pos/sales/${saleId}`), apiRequest('/api/company').catch(() => null)]);
  const customer = sale.customerId && !sale.customerIsWalkIn
    ? await apiRequest(`/api/customers/${sale.customerId}`).catch(() => null)
    : null;
  const model = saleDocument(sale, customer);
  return {
    summary: [
      ['Invoice', sale.invoiceNumber],
      ['Date', new Date(sale.createdAt).toLocaleString('en-IN')],
      ['Customer', sale.customerIsWalkIn ? 'Walk-in' : sale.customerName],
      ['Total', money(sale.grandTotal)],
    ],
    html: (size) => documentHtml(model, company, size),
    items: sale.items,
    csvName: sale.invoiceNumber,
  };
}
