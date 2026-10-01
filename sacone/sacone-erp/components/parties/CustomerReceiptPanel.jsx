'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiRequest } from '../../lib/api';
import { useLiveRefresh } from '../../lib/live';
import { Modal } from '../ui';

function money(n) {
  return `₹${Number(n || 0).toFixed(2)}`;
}

const EMPTY = {
  customerId: '',
  receiptDate: new Date().toISOString().slice(0, 10),
  paymentMode: 'bank',
  paymentAccountId: '',
  amount: '',
  referenceNumber: '',
  utrNumber: '',
  transactionId: '',
  chequeNumber: '',
  chequeDate: '',
  chequeBank: '',
  remarks: '',
  allocate: 'auto',
  allocations: [],
};

export default function CustomerReceiptPanel({ customers = [], onMessage, onError }) {
  const [list, setList] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [openInvoices, setOpenInvoices] = useState([]);
  const [preview, setPreview] = useState(null);
  const [saving, setSaving] = useState(false);
  const [viewId, setViewId] = useState(null);
  const [viewData, setViewData] = useState(null);
  const [customerFilter, setCustomerFilter] = useState('');

  const load = useCallback(async (silent = false) => {
    if (silent !== true) setLoading(true);
    try {
      const q = new URLSearchParams({ limit: '100' });
      if (customerFilter) q.set('customerId', customerFilter);
      const [data, boot] = await Promise.all([
        apiRequest(`/api/customer-receipts?${q}`),
        apiRequest('/api/finance/bootstrap').catch(() => null),
      ]);
      setList(data.items || []);
      setAccounts(boot?.accounts || []);
    } catch (e) {
      onError?.(e.message);
    } finally {
      setLoading(false);
    }
  }, [customerFilter, onError]);

  useLiveRefresh(() => load(true));
  useEffect(() => { load(); }, [load]);

  const loadOpenInvoices = async (customerId) => {
    if (!customerId) { setOpenInvoices([]); return; }
    try {
      const rows = await apiRequest(`/api/customer-receipts/open-invoices/${customerId}`);
      setOpenInvoices(rows || []);
    } catch (e) {
      onError?.(e.message);
    }
  };

  const runPreview = async (mode = 'auto', allocations = null) => {
    if (!form.customerId || !form.amount) return;
    try {
      const result = await apiRequest('/api/customer-receipts/preview-allocate', {
        method: 'POST',
        body: JSON.stringify({
          customerId: form.customerId,
          amount: Number(form.amount),
          mode,
          allocations: allocations || form.allocations,
        }),
      });
      setPreview(result);
      setForm((p) => ({
        ...p,
        allocate: mode,
        allocations: (result.allocations || []).map((l) => ({
          documentType: l.documentType,
          documentId: l.documentId,
          allocatedAmount: l.allocatedAmount,
        })),
      }));
    } catch (e) {
      onError?.(e.message);
    }
  };

  const openCreate = () => {
    setForm({ ...EMPTY });
    setPreview(null);
    setOpenInvoices([]);
    setModalOpen(true);
  };

  const save = async (post = false) => {
    setSaving(true);
    try {
      const payload = {
        ...form,
        amount: Number(form.amount),
        allocate: form.allocate,
        allocations: form.allocations,
        post,
      };
      await apiRequest('/api/customer-receipts', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      onMessage?.(post ? 'Receipt posted.' : 'Receipt saved as draft.');
      setModalOpen(false);
      await load();
    } catch (e) {
      onError?.(e.message);
    } finally {
      setSaving(false);
    }
  };

  const postVoucher = async (id) => {
    try {
      await apiRequest(`/api/customer-receipts/${id}/post`, { method: 'POST', body: '{}' });
      onMessage?.('Receipt posted.');
      await load();
    } catch (e) {
      onError?.(e.message);
    }
  };

  const cancelVoucher = async (id) => {
    const reason = window.prompt('Cancel reason (required for posted vouchers):') || '';
    try {
      await apiRequest(`/api/customer-receipts/${id}/cancel`, {
        method: 'POST',
        body: JSON.stringify({ reason }),
      });
      onMessage?.('Receipt cancelled.');
      await load();
    } catch (e) {
      onError?.(e.message);
    }
  };

  const openView = async (id) => {
    setViewId(id);
    try {
      setViewData(await apiRequest(`/api/customer-receipts/${id}`));
    } catch (e) {
      onError?.(e.message);
    }
  };

  const selectedCustomer = customers.find((c) => c.id === form.customerId);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="label">Filter customer</label>
          <select className="input-field min-w-[220px]" value={customerFilter} onChange={(e) => setCustomerFilter(e.target.value)}>
            <option value="">All customers</option>
            {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <button type="button" className="btn-primary" onClick={openCreate}>New Customer Receipt</button>
        <button type="button" className="btn-secondary" onClick={load}>Refresh</button>
      </div>

      {loading ? (
        <p className="text-sm text-slate-500">Loading receipts…</p>
      ) : (
        <div className="overflow-auto rounded-xl border border-slate-200">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left">
              <tr>
                <th className="px-3 py-2">Voucher</th>
                <th className="px-3 py-2">Date</th>
                <th className="px-3 py-2">Customer</th>
                <th className="px-3 py-2">Mode</th>
                <th className="px-3 py-2 text-right">Amount</th>
                <th className="px-3 py-2">Allocation</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {list.map((r) => (
                <tr key={r.id}>
                  <td className="px-3 py-2 font-mono text-xs">{r.voucherNumber}</td>
                  <td className="px-3 py-2">{r.receiptDate}</td>
                  <td className="px-3 py-2">{r.customerName}</td>
                  <td className="px-3 py-2 uppercase">{r.paymentMode}</td>
                  <td className="px-3 py-2 text-right">{money(r.amount)}</td>
                  <td className="px-3 py-2 capitalize">{r.allocationStatus}</td>
                  <td className="px-3 py-2 capitalize">{r.status}</td>
                  <td className="px-3 py-2 text-right space-x-2">
                    <button type="button" className="btn-secondary" onClick={() => openView(r.id)}>View</button>
                    {r.status === 'draft' && (
                      <button type="button" className="btn-primary" onClick={() => postVoucher(r.id)}>Post</button>
                    )}
                    {r.status !== 'cancelled' && (
                      <button type="button" className="btn-secondary" onClick={() => cancelVoucher(r.id)}>Cancel</button>
                    )}
                  </td>
                </tr>
              ))}
              {!list.length && (
                <tr><td colSpan={8} className="px-3 py-8 text-center text-slate-500">No customer receipts yet</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={modalOpen} title="Customer Receipt Voucher" onClose={() => setModalOpen(false)} size="xl"
        footer={(
          <>
            <button type="button" className="btn-secondary" onClick={() => setModalOpen(false)}>Close</button>
            <button type="button" className="btn-secondary" disabled={saving} onClick={() => save(false)}>Save Draft</button>
            <button type="button" className="btn-primary" disabled={saving} onClick={() => save(true)}>Post Receipt</button>
          </>
        )}
      >
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <label className="label">Customer *</label>
            <select className="input-field" value={form.customerId} onChange={(e) => {
              const customerId = e.target.value;
              setForm({ ...form, customerId });
              loadOpenInvoices(customerId);
            }}>
              <option value="">Select customer</option>
              {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Date *</label>
            <input type="date" className="input-field" value={form.receiptDate} onChange={(e) => setForm({ ...form, receiptDate: e.target.value })} />
          </div>
          {selectedCustomer && (
            <div className="md:col-span-2 rounded-lg bg-slate-50 p-3 text-xs text-slate-600 grid gap-1 md:grid-cols-3">
              <div>GSTIN: {selectedCustomer.gstNumber || '—'}</div>
              <div>Contact: {selectedCustomer.phone || '—'}</div>
              <div>Outstanding: {money(selectedCustomer.outstandingBalance)}</div>
            </div>
          )}
          <div>
            <label className="label">Payment Mode *</label>
            <select className="input-field" value={form.paymentMode} onChange={(e) => setForm({ ...form, paymentMode: e.target.value })}>
              {['cash', 'bank', 'upi', 'cheque', 'card', 'other'].map((m) => <option key={m} value={m}>{m.toUpperCase()}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Cash/Bank/UPI Account *</label>
            <select className="input-field" value={form.paymentAccountId} onChange={(e) => setForm({ ...form, paymentAccountId: e.target.value })}>
              <option value="">Select account</option>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.name} ({a.accountType})</option>)}
            </select>
          </div>
          <div>
            <label className="label">Amount *</label>
            <input type="number" min="0" step="0.01" className="input-field" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
          </div>
          <div>
            <label className="label">Reference / UTR</label>
            <input className="input-field" value={form.utrNumber || form.referenceNumber} onChange={(e) => setForm({ ...form, utrNumber: e.target.value, referenceNumber: e.target.value })} />
          </div>
          {form.paymentMode === 'cheque' && (
            <>
              <div><label className="label">Cheque No</label><input className="input-field" value={form.chequeNumber} onChange={(e) => setForm({ ...form, chequeNumber: e.target.value })} /></div>
              <div><label className="label">Cheque Date</label><input type="date" className="input-field" value={form.chequeDate} onChange={(e) => setForm({ ...form, chequeDate: e.target.value })} /></div>
              <div className="md:col-span-2"><label className="label">Cheque Bank</label><input className="input-field" value={form.chequeBank} onChange={(e) => setForm({ ...form, chequeBank: e.target.value })} /></div>
            </>
          )}
          <div className="md:col-span-2">
            <label className="label">Remarks</label>
            <textarea className="input-field" rows={2} value={form.remarks} onChange={(e) => setForm({ ...form, remarks: e.target.value })} />
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" className="btn-secondary" onClick={() => runPreview('auto')}>Allocate Automatically</button>
          <button type="button" className="btn-secondary" onClick={() => {
            const allocations = openInvoices.map((inv) => ({
              documentType: 'sales_invoice',
              documentId: inv.id,
              allocatedAmount: 0,
            }));
            setForm((p) => ({ ...p, allocate: 'manual', allocations }));
            setPreview({ allocations: openInvoices.map((inv) => ({ ...inv, documentId: inv.id, allocatedAmount: 0, previousDue: inv.previousDue })) });
          }}>Allocate Manually</button>
        </div>

        {(preview || openInvoices.length > 0) && (
          <div className="mt-3 overflow-auto rounded-lg border border-slate-200">
            <table className="min-w-full text-xs">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-2 py-1 text-left">Invoice</th>
                  <th className="px-2 py-1 text-left">Date</th>
                  <th className="px-2 py-1 text-right">Invoice Amt</th>
                  <th className="px-2 py-1 text-right">Previous Due</th>
                  <th className="px-2 py-1 text-right">Allocated</th>
                  <th className="px-2 py-1 text-right">Remaining</th>
                </tr>
              </thead>
              <tbody>
                {(preview?.allocations || openInvoices).map((row) => {
                  const docId = row.documentId || row.id;
                  const prev = row.previousDue ?? 0;
                  const alloc = form.allocations.find((a) => a.documentId === docId)?.allocatedAmount ?? row.allocatedAmount ?? 0;
                  return (
                    <tr key={docId} className="border-t border-slate-100">
                      <td className="px-2 py-1">{row.invoiceNumber || row.documentNumber}</td>
                      <td className="px-2 py-1">{row.invoiceDate || row.documentDate}</td>
                      <td className="px-2 py-1 text-right">{money(row.invoiceAmount || row.documentAmount)}</td>
                      <td className="px-2 py-1 text-right">{money(prev)}</td>
                      <td className="px-2 py-1 text-right">
                        {form.allocate === 'manual' ? (
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            className="input-field w-24 text-right"
                            value={alloc}
                            onChange={(e) => {
                              const allocatedAmount = Number(e.target.value || 0);
                              setForm((p) => {
                                const rest = p.allocations.filter((a) => a.documentId !== docId);
                                return {
                                  ...p,
                                  allocations: [...rest, { documentType: 'sales_invoice', documentId: docId, allocatedAmount }],
                                };
                              });
                            }}
                            onBlur={() => runPreview('manual', form.allocations)}
                          />
                        ) : money(alloc)}
                      </td>
                      <td className="px-2 py-1 text-right">{money(Math.max(0, prev - Number(alloc || 0)))}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {preview && (
              <div className="border-t border-slate-100 bg-slate-50 px-3 py-2 text-xs">
                Allocated {money(preview.allocatedAmount)} · Unallocated / Advance {money(preview.unallocatedAmount)} · Status: {preview.allocationStatus}
              </div>
            )}
          </div>
        )}
      </Modal>

      <Modal open={Boolean(viewId)} title="Receipt Voucher" onClose={() => { setViewId(null); setViewData(null); }} size="lg">
        {viewData && (
          <div className="space-y-3 text-sm">
            <div className="grid gap-2 md:grid-cols-2">
              <div><span className="text-slate-500">Number:</span> {viewData.voucherNumber}</div>
              <div><span className="text-slate-500">Status:</span> {viewData.status}</div>
              <div><span className="text-slate-500">Customer:</span> {viewData.customerName}</div>
              <div><span className="text-slate-500">Amount:</span> {money(viewData.amount)}</div>
              <div><span className="text-slate-500">Mode:</span> {viewData.paymentMode}</div>
              <div><span className="text-slate-500">Allocation:</span> {viewData.allocationStatus}</div>
            </div>
            <table className="min-w-full text-xs">
              <thead className="bg-slate-50"><tr><th className="px-2 py-1 text-left">Document</th><th className="px-2 py-1 text-right">Allocated</th></tr></thead>
              <tbody>
                {(viewData.allocations || []).map((a) => (
                  <tr key={a.id} className="border-t"><td className="px-2 py-1">{a.documentNumber || a.documentType}</td><td className="px-2 py-1 text-right">{money(a.allocatedAmount)}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Modal>
    </div>
  );
}
