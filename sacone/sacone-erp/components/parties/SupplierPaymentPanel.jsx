'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiRequest } from '../../lib/api';
import { useLiveRefresh } from '../../lib/live';
import { Modal } from '../ui';

function money(n) {
  return `₹${Number(n || 0).toFixed(2)}`;
}

const EMPTY = {
  supplierId: '',
  paymentDate: new Date().toISOString().slice(0, 10),
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

export default function SupplierPaymentPanel({ suppliers = [], onMessage, onError }) {
  const [list, setList] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [openBills, setOpenBills] = useState([]);
  const [preview, setPreview] = useState(null);
  const [saving, setSaving] = useState(false);
  const [viewId, setViewId] = useState(null);
  const [viewData, setViewData] = useState(null);
  const [supplierFilter, setSupplierFilter] = useState('');

  const load = useCallback(async (silent = false) => {
    if (silent !== true) setLoading(true);
    try {
      const q = new URLSearchParams({ limit: '100' });
      if (supplierFilter) q.set('supplierId', supplierFilter);
      const [data, boot] = await Promise.all([
        apiRequest(`/api/supplier-payment-vouchers?${q}`),
        apiRequest('/api/finance/bootstrap').catch(() => null),
      ]);
      setList(data.items || []);
      setAccounts(boot?.accounts || []);
    } catch (e) {
      onError?.(e.message);
    } finally {
      setLoading(false);
    }
  }, [supplierFilter, onError]);

  useLiveRefresh(() => load(true));
  useEffect(() => { load(); }, [load]);

  const loadOpenBills = async (supplierId) => {
    if (!supplierId) { setOpenBills([]); return; }
    try {
      setOpenBills(await apiRequest(`/api/supplier-payment-vouchers/open-bills/${supplierId}`) || []);
    } catch (e) {
      onError?.(e.message);
    }
  };

  const runPreview = async (mode = 'auto', allocations = null) => {
    if (!form.supplierId || !form.amount) return;
    try {
      const result = await apiRequest('/api/supplier-payment-vouchers/preview-allocate', {
        method: 'POST',
        body: JSON.stringify({
          supplierId: form.supplierId,
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

  const save = async (post = false) => {
    setSaving(true);
    try {
      await apiRequest('/api/supplier-payment-vouchers', {
        method: 'POST',
        body: JSON.stringify({ ...form, amount: Number(form.amount), post }),
      });
      onMessage?.(post ? 'Supplier payment posted.' : 'Payment voucher saved as draft.');
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
      await apiRequest(`/api/supplier-payment-vouchers/${id}/post`, { method: 'POST', body: '{}' });
      onMessage?.('Payment voucher posted.');
      await load();
    } catch (e) {
      onError?.(e.message);
    }
  };

  const cancelVoucher = async (id) => {
    const reason = window.prompt('Cancel reason:') || '';
    try {
      await apiRequest(`/api/supplier-payment-vouchers/${id}/cancel`, {
        method: 'POST',
        body: JSON.stringify({ reason }),
      });
      onMessage?.('Payment voucher cancelled.');
      await load();
    } catch (e) {
      onError?.(e.message);
    }
  };

  const selected = suppliers.find((s) => s.id === form.supplierId);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="label">Filter supplier</label>
          <select className="input-field min-w-[220px]" value={supplierFilter} onChange={(e) => setSupplierFilter(e.target.value)}>
            <option value="">All suppliers</option>
            {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <button type="button" className="btn-primary" onClick={() => { setForm({ ...EMPTY }); setPreview(null); setOpenBills([]); setModalOpen(true); }}>New Supplier Payment</button>
        <button type="button" className="btn-secondary" onClick={load}>Refresh</button>
      </div>

      {loading ? <p className="text-sm text-slate-500">Loading payment vouchers…</p> : (
        <div className="overflow-auto rounded-xl border border-slate-200">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left">
              <tr>
                <th className="px-3 py-2">Voucher</th>
                <th className="px-3 py-2">Date</th>
                <th className="px-3 py-2">Supplier</th>
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
                  <td className="px-3 py-2">{r.paymentDate}</td>
                  <td className="px-3 py-2">{r.supplierName}</td>
                  <td className="px-3 py-2 uppercase">{r.paymentMode}</td>
                  <td className="px-3 py-2 text-right">{money(r.amount)}</td>
                  <td className="px-3 py-2 capitalize">{r.allocationStatus}</td>
                  <td className="px-3 py-2 capitalize">{r.status}</td>
                  <td className="px-3 py-2 text-right space-x-2">
                    <button type="button" className="btn-secondary" onClick={async () => { setViewId(r.id); setViewData(await apiRequest(`/api/supplier-payment-vouchers/${r.id}`)); }}>View</button>
                    {r.status === 'draft' && <button type="button" className="btn-primary" onClick={() => postVoucher(r.id)}>Post</button>}
                    {r.status !== 'cancelled' && <button type="button" className="btn-secondary" onClick={() => cancelVoucher(r.id)}>Cancel</button>}
                  </td>
                </tr>
              ))}
              {!list.length && <tr><td colSpan={8} className="px-3 py-8 text-center text-slate-500">No supplier payment vouchers yet</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={modalOpen} title="Supplier Payment Voucher" onClose={() => setModalOpen(false)} size="xl"
        footer={(
          <>
            <button type="button" className="btn-secondary" onClick={() => setModalOpen(false)}>Close</button>
            <button type="button" className="btn-secondary" disabled={saving} onClick={() => save(false)}>Save Draft</button>
            <button type="button" className="btn-primary" disabled={saving} onClick={() => save(true)}>Post Payment</button>
          </>
        )}
      >
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <label className="label">Supplier *</label>
            <select className="input-field" value={form.supplierId} onChange={(e) => {
              const supplierId = e.target.value;
              setForm({ ...form, supplierId });
              loadOpenBills(supplierId);
            }}>
              <option value="">Select supplier</option>
              {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Date *</label>
            <input type="date" className="input-field" value={form.paymentDate} onChange={(e) => setForm({ ...form, paymentDate: e.target.value })} />
          </div>
          {selected && (
            <div className="md:col-span-2 rounded-lg bg-slate-50 p-3 text-xs text-slate-600 grid gap-1 md:grid-cols-3">
              <div>GSTIN: {selected.gstNumber || '—'}</div>
              <div>Contact: {selected.phone || '—'}</div>
              <div>Payable: {money(selected.outstandingPayable)}</div>
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
              <div className="md:col-span-2"><label className="label">Bank</label><input className="input-field" value={form.chequeBank} onChange={(e) => setForm({ ...form, chequeBank: e.target.value })} /></div>
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
            setForm((p) => ({
              ...p,
              allocate: 'manual',
              allocations: openBills.map((b) => ({ documentType: 'purchase_bill', documentId: b.id, allocatedAmount: 0 })),
            }));
            setPreview({ allocations: openBills.map((b) => ({ ...b, documentId: b.id, allocatedAmount: 0 })) });
          }}>Allocate Manually</button>
        </div>

        {(preview || openBills.length > 0) && (
          <div className="mt-3 overflow-auto rounded-lg border border-slate-200">
            <table className="min-w-full text-xs">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-2 py-1 text-left">Purchase Bill</th>
                  <th className="px-2 py-1 text-left">Date</th>
                  <th className="px-2 py-1 text-right">Bill Amt</th>
                  <th className="px-2 py-1 text-right">Previous Due</th>
                  <th className="px-2 py-1 text-right">Allocated</th>
                  <th className="px-2 py-1 text-right">Remaining</th>
                </tr>
              </thead>
              <tbody>
                {(preview?.allocations || openBills).map((row) => {
                  const docId = row.documentId || row.id;
                  const prev = row.previousDue ?? 0;
                  const alloc = form.allocations.find((a) => a.documentId === docId)?.allocatedAmount ?? row.allocatedAmount ?? 0;
                  return (
                    <tr key={docId} className="border-t border-slate-100">
                      <td className="px-2 py-1">{row.billNumber || row.documentNumber}</td>
                      <td className="px-2 py-1">{row.billDate || row.documentDate}</td>
                      <td className="px-2 py-1 text-right">{money(row.billAmount || row.documentAmount)}</td>
                      <td className="px-2 py-1 text-right">{money(prev)}</td>
                      <td className="px-2 py-1 text-right">
                        {form.allocate === 'manual' ? (
                          <input type="number" min="0" step="0.01" className="input-field w-24 text-right" value={alloc}
                            onChange={(e) => {
                              const allocatedAmount = Number(e.target.value || 0);
                              setForm((p) => ({
                                ...p,
                                allocations: [
                                  ...p.allocations.filter((a) => a.documentId !== docId),
                                  { documentType: 'purchase_bill', documentId: docId, allocatedAmount },
                                ],
                              }));
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
                Allocated {money(preview.allocatedAmount)} · Advance {money(preview.unallocatedAmount)} · {preview.allocationStatus}
              </div>
            )}
          </div>
        )}
      </Modal>

      <Modal open={Boolean(viewId)} title="Supplier Payment Voucher" onClose={() => { setViewId(null); setViewData(null); }} size="lg">
        {viewData && (
          <div className="space-y-3 text-sm">
            <div className="grid gap-2 md:grid-cols-2">
              <div>Number: {viewData.voucherNumber}</div>
              <div>Status: {viewData.status}</div>
              <div>Supplier: {viewData.supplierName}</div>
              <div>Amount: {money(viewData.amount)}</div>
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
