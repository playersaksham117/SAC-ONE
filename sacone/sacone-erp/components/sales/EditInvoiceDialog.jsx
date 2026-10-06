'use client';

import { useEffect, useMemo, useState } from 'react';
import { apiRequest } from '../../lib/api';
import { Alert, LoadingState, Modal } from '../ui';

const money = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const METHODS = [['cash', 'Cash'], ['upi', 'UPI'], ['bank', 'Bank'], ['credit', 'Credit (on account)']];

/**
 * Owner-only invoice edit. Saving puts the old quantities back in stock and posts the corrected
 * invoice under the same number and date (stock, minimum price and credit rules apply again).
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

  useEffect(() => {
    (async () => {
      try {
        const [s, prods, custs] = await Promise.all([
          apiRequest(`/api/pos/sales/${saleId}`),
          apiRequest('/api/products?limit=500&isActive=1'),
          apiRequest('/api/customers?limit=500').catch(() => ({ items: [] })),
        ]);
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
          })),
          invoiceDiscount: s.invoiceDiscount || 0,
          paymentMethod: paid ? paid.method : 'credit',
          amountReceived: s.amountPaid,
          notes: s.notes || '',
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
    setForm((f) => ({ ...f, items: [...f.items, { productId: p.id, name: p.name, sku: p.sku, quantity: 1, unitPrice: p.sellingPrice, discountAmount: 0 }] }));
    setPick('');
  };

  const total = preview?.grandTotal;
  const credit = form?.paymentMethod === 'credit' ? total : Math.max(0, (total || 0) - Number(form?.amountReceived || 0));

  const save = async () => {
    setSaving(true);
    setError('');
    try {
      const saved = await apiRequest(`/api/pos/sales/${saleId}`, {
        method: 'PUT',
        body: JSON.stringify({
          ...cart,
          paymentMethod: form.paymentMethod,
          amountReceived: form.paymentMethod === 'credit' ? 0 : Number(form.amountReceived || 0),
          notes: form.notes,
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
      title={sale ? `Edit invoice ${sale.invoiceNumber}` : 'Edit invoice'}
      onClose={onClose}
      footer={form && (
        <>
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
                    <td className="px-3 py-2">{it.name}<div className="text-xs text-slate-400">{it.sku}</div></td>
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
            {form.paymentMethod !== 'credit' && (
              <label className="block text-sm"><span className="label">Amount received ₹</span>
                <input type="number" min="0" step="0.01" className="input-field" value={form.amountReceived} onChange={(e) => setForm({ ...form, amountReceived: e.target.value })} />
              </label>
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
