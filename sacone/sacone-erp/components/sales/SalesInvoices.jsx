'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiRequest } from '../../lib/api';
import { useLiveRefresh } from '../../lib/live';
import { billHtml, PDF_SIZES, PRINT_SIZES, printHtml } from '../../lib/bill-document';
import { downloadCsv, toCsv } from '../../lib/csv';
import PageHeader, { Alert, LoadingState, Modal } from '../ui';
import { EmptyPanel, StatCard, Toolbar } from '../module-ui';

const money = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const day = (iso) => (iso ? new Date(iso).toLocaleDateString('en-IN') : '');
const today = () => new Date().toISOString().slice(0, 10);

/** Per-browser remembered choice (paper size), guarded because storage can be unavailable. */
function useStoredChoice(key, fallback, allowed) {
  const [value, setValue] = useState(fallback);
  useEffect(() => {
    try {
      const saved = localStorage.getItem(key);
      if (saved && allowed.includes(saved)) setValue(saved);
    } catch { /* storage unavailable */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const update = (next) => {
    setValue(next);
    try { localStorage.setItem(key, next); } catch { /* storage unavailable */ }
  };
  return [value, update];
}

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

const ITEM_COLUMNS = [
  { label: '#', value: (l) => l.index },
  { label: 'Item', value: (l) => l.productName },
  { label: 'SKU', value: (l) => l.sku },
  { label: 'HSN', value: (l) => l.hsnCode },
  { label: 'Qty', value: (l) => l.quantity },
  { label: 'Rate', value: (l) => l.unitPrice },
  { label: 'Discount', value: (l) => l.discountAmount },
  { label: 'Taxable', value: (l) => l.taxableAmount },
  { label: 'GST %', value: (l) => l.gstPercentage },
  { label: 'GST', value: (l) => l.gstAmount },
  { label: 'Amount', value: (l) => l.lineTotal },
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

      {openId && <InvoiceDialog saleId={openId} onClose={() => setOpenId(null)} />}
    </div>
  );
}

function InvoiceDialog({ saleId, onClose }) {
  const [sale, setSale] = useState(null);
  const [company, setCompany] = useState(null);
  const [customer, setCustomer] = useState(null);
  const [error, setError] = useState('');
  const [printSize, setPrintSize] = useStoredChoice('sacone.printSize', 'A4', PRINT_SIZES.map((p) => p.value));
  const [pdfSize, setPdfSize] = useStoredChoice('sacone.pdfSize', 'A4', PDF_SIZES.map((p) => p.value));

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [s, c] = await Promise.all([apiRequest(`/api/pos/sales/${saleId}`), apiRequest('/api/company').catch(() => null)]);
        if (cancelled) return;
        setSale(s);
        setCompany(c);
        if (s.customerId && !s.customerIsWalkIn) {
          const cust = await apiRequest(`/api/customers/${s.customerId}`).catch(() => null);
          if (!cancelled) setCustomer(cust);
        }
      } catch (e) {
        if (!cancelled) setError(e.message);
      }
    })();
    return () => { cancelled = true; };
  }, [saleId]);

  const html = (size) => billHtml(sale, company, customer, size);
  const itemsCsv = () => downloadCsv(
    `${sale.invoiceNumber}-items.csv`,
    toCsv((sale.items || []).map((l, i) => ({ ...l, index: i + 1 })), ITEM_COLUMNS),
  );

  return (
    <Modal open title={sale ? `Invoice ${sale.invoiceNumber}` : 'Invoice'} onClose={onClose} size="lg">
      <Alert message={error} />
      {!sale ? <LoadingState /> : (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            <div><div className="text-xs text-slate-500">Date</div><div className="font-medium">{new Date(sale.createdAt).toLocaleString('en-IN')}</div></div>
            <div><div className="text-xs text-slate-500">Customer</div><div className="font-medium">{sale.customerIsWalkIn ? 'Walk-in' : sale.customerName}</div></div>
            <div><div className="text-xs text-slate-500">Items</div><div className="font-medium">{sale.items?.length || 0}</div></div>
            <div><div className="text-xs text-slate-500">Total</div><div className="font-semibold">{money(sale.grandTotal)}</div></div>
          </div>

          <section className="rounded-xl border border-slate-200 p-4">
            <h4 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">Print</h4>
            <div className="flex flex-wrap gap-2">
              {PRINT_SIZES.map((p) => (
                <button
                  key={p.value}
                  type="button"
                  onClick={() => setPrintSize(p.value)}
                  className={`rounded-lg px-3 py-2 text-sm font-medium ring-1 transition ${printSize === p.value ? 'bg-brand-600 text-white ring-brand-600' : 'bg-white text-slate-700 ring-slate-300 hover:bg-slate-50'}`}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <button type="button" className="btn-primary mt-3 w-full sm:w-auto" onClick={() => printHtml(html(printSize))}>
              🖨 Print {PRINT_SIZES.find((p) => p.value === printSize)?.label} {printSize.endsWith('mm') ? 'receipt' : 'invoice'}
            </button>
            {printSize.endsWith('mm') && (
              <p className="mt-2 text-xs text-slate-500">Choose your thermal printer and its {printSize} paper in the print dialog.</p>
            )}
          </section>

          <section className="rounded-xl border border-slate-200 p-4">
            <h4 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">PDF</h4>
            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex rounded-lg bg-slate-100 p-1">
                {PDF_SIZES.map((p) => (
                  <button
                    key={p.value}
                    type="button"
                    onClick={() => setPdfSize(p.value)}
                    className={`rounded-md px-4 py-1.5 text-sm font-medium ${pdfSize === p.value ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
              <button type="button" className="btn-secondary" onClick={() => printHtml(html(pdfSize))}>📄 Save PDF</button>
            </div>
            <p className="mt-2 text-xs text-slate-500">In the dialog that opens, pick <b>Save as PDF</b> as the destination.</p>
          </section>

          <section className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 p-4">
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wide text-slate-500">CSV</h4>
              <p className="text-xs text-slate-500">Line items with HSN, quantity, rate, discount and GST.</p>
            </div>
            <button type="button" className="btn-secondary" onClick={itemsCsv}>⬇ Items CSV</button>
          </section>
        </div>
      )}
    </Modal>
  );
}
