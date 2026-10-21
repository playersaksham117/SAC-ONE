'use client';

import { useEffect, useMemo, useState } from 'react';
import { apiRequest } from '../../lib/api';
import { Alert, LoadingState, Modal } from '../ui';
import { accountLabel, defaultAccountFor } from '../../lib/accounts';
import ShipToPicker from './ShipToPicker';

const money = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const METHODS = [['cash', 'Cash'], ['upi', 'UPI'], ['bank', 'Bank'], ['credit', 'Credit (on account)']];
const MODES = ['By Road', 'By Hand', 'Courier', 'Rail', 'Air'];
const EMPTY_TRANSPORT = { mode: '', transporter: '', vehicleNumber: '', lrNumber: '', lrDate: '', ewayBillNumber: '' };
const EMPTY_SHIP = { name: '', address: '', city: '', state: '', gstin: '', phone: '' };
const blank = (o) => Object.values(o).every((v) => !String(v || '').trim());
/** 'YYYY-MM-DD' (IST) of a timestamp. */
const istDay = (iso) => new Date(new Date(iso || Date.now()).getTime() + 330 * 60000).toISOString().slice(0, 10);

/**
 * Edit bill (firm admin / group owner only). Saving puts the old quantities back in stock and
 * posts the corrected invoice under the same number and date (stock, minimum price and credit
 * rules apply again); the old version is kept voided for audit. Covers items and prices,
 * customer, payment, PO, transport, Ship To, serial numbers and notes.
 */
export default function EditInvoiceDialog({ saleId, onClose, onSaved }) {
  const [sale, setSale] = useState(null);
  const [products, setProducts] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [form, setForm] = useState(null);
  const [preview, setPreview] = useState(null);
  const [pick, setPick] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [banks, setBanks] = useState([]);
  const [shipChoices, setShipChoices] = useState([]);

  useEffect(() => {
    (async () => {
      try {
        const [s, prods, custs, accts] = await Promise.all([
          apiRequest(`/api/pos/sales/${saleId}`),
          apiRequest('/api/products?limit=500&isActive=1'),
          apiRequest('/api/customers?limit=500').catch(() => ({ items: [] })),
          apiRequest('/api/finance/accounts').catch(() => []),
        ]);
        apiRequest('/api/firms/addresses').then((a) => setShipChoices(Array.isArray(a) ? a : [])).catch(() => {});
        const bankList = (Array.isArray(accts) ? accts : accts.items || []).filter((a) => a.accountType === 'bank' || a.accountType === 'upi');
        setBanks(bankList);
        setSale(s);
        setProducts(prods.items || []);
        const list = custs.items || custs || [];
        setCustomers(list.some((c) => c.id === s.customerId) ? list : [{ id: s.customerId, name: s.customerName }, ...list]);
        const paid = (s.payments || []).find((p) => p.method !== 'credit');
        setForm({
          customerId: s.customerId,
          items: s.items.map((i) => ({
            productId: i.productId,
            name: i.productName || i.name,
            sku: i.sku,
            quantity: i.quantity,
            unitPrice: i.unitPrice,
            discountAmount: i.discountAmount || 0,
            serials: (i.serialNumbers || []).join('\n'),
          })),
          transport: { ...EMPTY_TRANSPORT, ...(s.transport || {}) },
          shipTo: { ...EMPTY_SHIP, ...(s.shipTo || {}) },
          shipOn: Boolean(s.shipTo?.name),
          billDate: istDay(s.completedAt || s.createdAt),
          originalDate: istDay(s.completedAt || s.createdAt),
          invoiceDiscount: s.invoiceDiscount || 0,
          paymentMethod: paid ? paid.method : 'credit',
          amountReceived: s.amountPaid,
          // A fully paid bill stays fully paid when the total changes (unless the amount is typed).
          followTotal: Number(s.amountCredit || 0) <= 0.009,
          notes: s.notes || '',
          paymentAccountId: paid?.paymentAccountId || '',
          customerPoNumber: s.customerPoNumber || '',
          customerPoDate: s.customerPoDate || '',
        });
      } catch (e) {
        setError(e.message);
      }
    })();
  }, [saleId]);

  const cart = useMemo(() => form && {
    customerId: form.customerId,
    invoiceDiscount: Number(form.invoiceDiscount || 0),
    items: form.items.map((i) => ({
      productId: i.productId,
      quantity: Number(i.quantity),
      unitPrice: Number(i.unitPrice),
      discountAmount: Number(i.discountAmount || 0),
    })),
  }, [form]);

  // Live GST total from the server, same maths as checkout.
  useEffect(() => {
    if (!cart || !cart.items.length || cart.items.some((i) => !(i.quantity > 0))) { setPreview(null); return undefined; }
    const t = setTimeout(() => {
      apiRequest('/api/pos/preview', { method: 'POST', body: JSON.stringify(cart) })
        .then(setPreview)
        .catch(() => setPreview(null));
    }, 300);
    return () => clearTimeout(t);
  }, [cart]);

  const setItem = (idx, patch) => setForm((f) => ({ ...f, items: f.items.map((it, i) => (i === idx ? { ...it, ...patch } : it)) }));
  const removeItem = (idx) => setForm((f) => ({ ...f, items: f.items.filter((_, i) => i !== idx) }));
  const addItem = () => {
    const p = products.find((x) => x.id === pick);
    if (!p) return;
    setForm((f) => ({ ...f, items: [...f.items, { productId: p.id, name: p.name, sku: p.sku, quantity: 1, unitPrice: p.sellingPrice, discountAmount: 0, serials: '' }] }));
    setPick('');
  };

  const total = preview?.grandTotal;
  const received = form?.followTotal && total != null ? total : Number(form?.amountReceived || 0);
  const credit = form?.paymentMethod === 'credit' ? total : Math.max(0, (total || 0) - received);
  const walkIn = customers.find((c) => c.id === form?.customerId)?.isWalkIn ?? sale?.customerIsWalkIn;

  const save = async () => {
    setSaving(true);
    setError('');
    try {
      const saved = await apiRequest(`/api/pos/sales/${saleId}`, {
        method: 'PUT',
        body: JSON.stringify({
          ...cart,
          // Serial numbers as typed for each line (blank clears them).
          items: cart.items.map((it, i) => ({ ...it, serialNumbers: form.items[i].serials })),
          transport: blank(form.transport) ? null : form.transport,
          shipTo: form.shipOn && !blank(form.shipTo) ? form.shipTo : null,
          ...(form.billDate && form.billDate !== form.originalDate ? { billDate: form.billDate } : {}),
          paymentMethod: form.paymentMethod,
          amountReceived: form.paymentMethod === 'credit' ? 0 : received,
          paymentAccountId: ['upi', 'bank'].includes(form.paymentMethod) ? form.paymentAccountId || undefined : undefined,
          notes: form.notes,
          customerPoNumber: form.customerPoNumber.trim(),
          customerPoDate: form.customerPoNumber.trim() ? form.customerPoDate : '',
        }),
      });
      onSaved(saved);
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
      title={sale ? `✏ Edit bill ${sale.invoiceNumber}` : 'Edit bill'}
      onClose={onClose}
      footer={form && (
        <>
          {error && <span className="mr-auto max-w-md text-sm font-medium text-red-600">{error}</span>}
          {!error && walkIn && total != null && credit > 0.009 && (
            <span className="mr-auto max-w-md text-sm text-amber-700">Walk-in customers cannot take credit: receive the full {money(total)} or choose a customer.</span>
          )}
          <button type="button" className="btn-secondary" onClick={onClose} disabled={saving}>Cancel</button>
          <button type="button" className="btn-primary" onClick={save} disabled={saving || !form.items.length || !preview}>{saving ? 'Saving…' : 'Save changes'}</button>
        </>
      )}
    >
      <Alert message={error} />
      {!form ? (!error && <LoadingState />) : (
        <div className="space-y-4">
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
            Saving returns the original quantities to stock and re-bills the invoice with the same number and date.
          </p>
          <label className="flex items-center gap-3 text-sm">
            <span className="label !mb-0">Bill date</span>
            <input type="date" className={`input-field !min-h-0 w-auto !py-1 ${form.billDate !== form.originalDate ? 'border-amber-400 bg-amber-50' : ''}`}
              max={istDay()} value={form.billDate} onChange={(e) => setForm({ ...form, billDate: e.target.value || form.originalDate })} />
            {form.billDate !== form.originalDate && <span className="text-xs text-amber-700">was {form.originalDate.split('-').reverse().join('/')}</span>}
          </label>
          <label className="block text-sm"><span className="label">Customer</span>
            <select className="input-field" value={form.customerId} onChange={(e) => setForm({ ...form, customerId: e.target.value })}>
              {customers.map((c) => <option key={c.id} value={c.id}>{c.name}{c.phone ? ` · ${c.phone}` : ''}</option>)}
            </select>
          </label>

          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-3 py-2">Item</th>
                  <th className="px-3 py-2 w-24">Qty</th>
                  <th className="px-3 py-2 w-32">Rate</th>
                  <th className="px-3 py-2 w-28">Discount ₹</th>
                  <th className="px-3 py-2 w-10" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {form.items.map((it, idx) => (
                  <tr key={`${it.productId}-${idx}`}>
                    <td className="px-3 py-2">
                      {it.name}<div className="text-xs text-slate-400">{it.sku}</div>
                      <textarea className="input-field mt-1 !min-h-0 font-mono text-xs" rows={1} placeholder="Serial no(s), one per line"
                        value={it.serials} onChange={(e) => setItem(idx, { serials: e.target.value })} />
                    </td>
                    <td className="px-3 py-2"><input type="number" min="0" step="any" className="input-field" value={it.quantity} onChange={(e) => setItem(idx, { quantity: e.target.value })} /></td>
                    <td className="px-3 py-2"><input type="number" min="0" step="0.01" className="input-field" value={it.unitPrice} onChange={(e) => setItem(idx, { unitPrice: e.target.value })} /></td>
                    <td className="px-3 py-2"><input type="number" min="0" step="0.01" className="input-field" value={it.discountAmount} onChange={(e) => setItem(idx, { discountAmount: e.target.value })} /></td>
                    <td className="px-3 py-2"><button type="button" className="text-red-600 hover:underline" aria-label="Remove item" onClick={() => removeItem(idx)}>✕</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap gap-2">
            <select className="input-field flex-1" value={pick} onChange={(e) => setPick(e.target.value)}>
              <option value="">Add a product…</option>
              {products.map((p) => <option key={p.id} value={p.id}>{p.name} · {p.sku} · {money(p.sellingPrice)}</option>)}
            </select>
            <button type="button" className="btn-secondary" onClick={addItem} disabled={!pick}>Add</button>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <label className="block text-sm"><span className="label">Invoice discount ₹</span>
              <input type="number" min="0" step="0.01" className="input-field" value={form.invoiceDiscount} onChange={(e) => setForm({ ...form, invoiceDiscount: e.target.value })} />
            </label>
            <label className="block text-sm"><span className="label">Payment</span>
              <select className="input-field" value={form.paymentMethod} onChange={(e) => setForm({ ...form, paymentMethod: e.target.value })}>
                {METHODS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </label>
            {['upi', 'bank'].includes(form.paymentMethod) && banks.length > 0 && (
              <label className="block text-sm"><span className="label">Received in bank</span>
                <select className="input-field" value={form.paymentAccountId} onChange={(e) => setForm({ ...form, paymentAccountId: e.target.value })}>
                  <option value="">Default bank{defaultAccountFor(banks, form.paymentMethod) ? ` (${defaultAccountFor(banks, form.paymentMethod).name})` : ''}</option>
                  {banks.map((a) => <option key={a.id} value={a.id}>{accountLabel(a)}</option>)}
                </select>
              </label>
            )}
            {form.paymentMethod !== 'credit' && (
              <label className="block text-sm"><span className="label">Amount received ₹</span>
                <input type="number" min="0" step="0.01" className="input-field" value={form.followTotal && total != null ? total : form.amountReceived}
                  onChange={(e) => setForm({ ...form, amountReceived: e.target.value, followTotal: false })} />
                {form.followTotal && <span className="mt-1 block text-xs text-slate-500">Follows the new total (fully paid)</span>}
              </label>
            )}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm"><span className="label">Customer PO no.</span>
              <input className="input-field" maxLength={60} placeholder="Buyer's purchase order number" value={form.customerPoNumber} onChange={(e) => setForm({ ...form, customerPoNumber: e.target.value })} />
            </label>
            <label className="block text-sm"><span className="label">Customer PO date</span>
              <input className="input-field" type="date" disabled={!form.customerPoNumber.trim()} value={form.customerPoDate} onChange={(e) => setForm({ ...form, customerPoDate: e.target.value })} />
            </label>
          </div>
          <details className="rounded-xl border border-slate-200 p-3" open={!blank(form.transport)}>
            <summary className="cursor-pointer text-sm font-semibold text-slate-800">Transport</summary>
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              <label className="block text-sm"><span className="label">Mode</span>
                <select className="input-field" value={form.transport.mode} onChange={(e) => setForm({ ...form, transport: { ...form.transport, mode: e.target.value } })}>
                  <option value="">—</option>
                  {MODES.map((m) => <option key={m}>{m}</option>)}
                </select>
              </label>
              {[['transporter', 'Transporter'], ['vehicleNumber', 'Vehicle no.'], ['lrNumber', 'LR / GR no.'], ['ewayBillNumber', 'E-way bill no.']].map(([k, l]) => (
                <label key={k} className="block text-sm"><span className="label">{l}</span>
                  <input className="input-field" value={form.transport[k]} onChange={(e) => setForm({ ...form, transport: { ...form.transport, [k]: e.target.value } })} />
                </label>
              ))}
              <label className="block text-sm"><span className="label">LR date</span>
                <input type="date" className="input-field" value={form.transport.lrDate} onChange={(e) => setForm({ ...form, transport: { ...form.transport, lrDate: e.target.value } })} />
              </label>
            </div>
          </details>

          <div className="rounded-xl border border-slate-200 p-3">
            <label className="flex items-center gap-2 text-sm font-semibold text-slate-800">
              <input type="checkbox" checked={form.shipOn} onChange={(e) => setForm({ ...form, shipOn: e.target.checked })} />
              Ship To a different address (consignee)
            </label>
            {form.shipOn && (
              <ShipToPicker
                firms={shipChoices}
                customers={customers}
                onPick={(a) => setForm({ ...form, shipTo: { ...EMPTY_SHIP, ...a } })}
              />
            )}
            {form.shipOn && (
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {[['name', 'Name *'], ['phone', 'Phone'], ['address', 'Address'], ['city', 'City'], ['state', 'State'], ['gstin', 'GSTIN']].map(([k, l]) => (
                  <label key={k} className={`block text-sm ${k === 'address' ? 'sm:col-span-2' : ''}`}><span className="label">{l}</span>
                    <input className="input-field" value={form.shipTo[k] || ''} onChange={(e) => setForm({ ...form, shipTo: { ...form.shipTo, [k]: e.target.value } })} />
                  </label>
                ))}
              </div>
            )}
          </div>

          <label className="block text-sm"><span className="label">Notes</span>
            <input className="input-field" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </label>

          <div className="flex flex-wrap justify-end gap-6 rounded-xl bg-slate-50 px-4 py-3 text-sm">
            <span>Was <b>{money(sale.grandTotal)}</b></span>
            <span>New total <b>{total != null ? money(total) : '—'}</b></span>
            {total != null && credit > 0.009 && <span className="text-amber-700">On credit <b>{money(credit)}</b></span>}
          </div>
        </div>
      )}
    </Modal>
  );
}
