'use client';

import { useEffect, useMemo, useState } from 'react';
import { apiRequest } from '../../lib/api';
import { Alert, LoadingState, Modal } from '../ui';

const money = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * Edit a quotation (draft or sent): customer, dates, lines with HSN / description, discount,
 * customer PO, notes and terms. Same number; nothing moves in stock or accounts.
 */
export default function EditQuotationDialog({ quotationId, onClose, onSaved }) {
  const [quote, setQuote] = useState(null);
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
        const [q, prods, custs] = await Promise.all([
          apiRequest(`/api/pos/quotations/${quotationId}`),
          apiRequest('/api/products?limit=500&isActive=1'),
          apiRequest('/api/customers?limit=500').catch(() => ({ items: [] })),
        ]);
        setQuote(q);
        setProducts(prods.items || []);
        const list = custs.items || custs || [];
        setCustomers(!q.customerId || list.some((c) => c.id === q.customerId) ? list : [{ id: q.customerId, name: q.customerSnapshot?.name || q.customerName }, ...list]);
        setForm({
          customerId: q.customerId || '',
          quotationDate: String(q.quotationDate || '').slice(0, 10),
          validUntil: String(q.validUntil || '').slice(0, 10),
          items: (q.items || []).map((i) => ({
            productId: i.productId,
            name: i.productName,
            sku: i.sku,
            hsnCode: i.hsnCode || '',
            quantity: i.quantity,
            unitPrice: i.unitPrice,
            discountAmount: i.discountAmount || 0,
            description: i.shortDescription || i.description || '',
          })),
          invoiceDiscount: q.invoiceDiscount || 0,
          customerPoNumber: q.customerPoNumber || '',
          customerPoDate: q.customerPoDate || '',
          notes: q.notes || '',
          termsConditions: q.termsConditions || '',
        });
      } catch (e) {
        setError(e.message);
      }
    })();
  }, [quotationId]);

  const cart = useMemo(() => form && {
    customerId: form.customerId || undefined,
    invoiceDiscount: Number(form.invoiceDiscount || 0),
    items: form.items.map((i) => ({
      productId: i.productId,
      hsnCode: String(i.hsnCode || '').trim() || undefined,
      quantity: Number(i.quantity),
      unitPrice: Number(i.unitPrice),
      discountAmount: Number(i.discountAmount || 0),
    })),
  }, [form]);

  // Live total from the server, same maths as the invoice.
  useEffect(() => {
    if (!cart || !cart.items.length || cart.items.some((i) => !(i.quantity > 0))) { setPreview(null); return undefined; }
    const t = setTimeout(() => {
      apiRequest('/api/pos/quotations/preview', { method: 'POST', body: JSON.stringify(cart) })
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
    setForm((f) => ({ ...f, items: [...f.items, { productId: p.id, name: p.name, sku: p.sku, hsnCode: p.hsnCode || '', quantity: 1, unitPrice: p.sellingPrice, discountAmount: 0, description: '' }] }));
    setPick('');
  };

  const save = async () => {
    setSaving(true);
    setError('');
    try {
      const saved = await apiRequest(`/api/pos/quotations/${quotationId}`, {
        method: 'PUT',
        body: JSON.stringify({
          ...cart,
          items: cart.items.map((it, i) => ({ ...it, description: form.items[i].description })),
          quotationDate: form.quotationDate || undefined,
          validUntil: form.validUntil || undefined,
          customerPoNumber: form.customerPoNumber.trim(),
          customerPoDate: form.customerPoNumber.trim() ? form.customerPoDate : '',
          notes: form.notes,
          termsConditions: form.termsConditions,
        }),
      });
      onSaved(saved);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const total = preview?.grandTotal;

  return (
    <Modal
      open
      size="xl"
      title={quote ? `✏ Edit quotation ${quote.quotationNumber}` : 'Edit quotation'}
      onClose={onClose}
      footer={form && (
        <>
          {error && <span className="mr-auto max-w-md text-sm font-medium text-red-600">{error}</span>}
          <button type="button" className="btn-secondary" onClick={onClose} disabled={saving}>Cancel</button>
          <button type="button" className="btn-primary" onClick={save} disabled={saving || !form.items.length || !preview}>{saving ? 'Saving…' : 'Save changes'}</button>
        </>
      )}
    >
      <Alert message={error} />
      {!form ? (!error && <LoadingState />) : (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="block text-sm sm:col-span-3"><span className="label">Customer</span>
              <select className="input-field" value={form.customerId} onChange={(e) => setForm({ ...form, customerId: e.target.value })}>
                {!form.customerId && <option value="">Walk-in</option>}
                {customers.map((c) => <option key={c.id} value={c.id}>{c.name}{c.phone ? ` · ${c.phone}` : ''}</option>)}
              </select>
            </label>
            <label className="block text-sm"><span className="label">Quotation date</span>
              <input type="date" className="input-field" value={form.quotationDate} onChange={(e) => setForm({ ...form, quotationDate: e.target.value })} />
            </label>
            <label className="block text-sm"><span className="label">Valid until</span>
              <input type="date" className="input-field" value={form.validUntil} onChange={(e) => setForm({ ...form, validUntil: e.target.value })} />
            </label>
            <label className="block text-sm"><span className="label">Discount on total ₹</span>
              <input type="number" min="0" step="0.01" className="input-field" value={form.invoiceDiscount} onChange={(e) => setForm({ ...form, invoiceDiscount: e.target.value })} />
            </label>
          </div>

          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-3 py-2">Item</th>
                  <th className="px-3 py-2 w-28">HSN / SAC</th>
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
                      <textarea className="input-field mt-1 !min-h-0 text-xs" rows={2} maxLength={500} placeholder="Description on this quotation (prints under the item)"
                        value={it.description ?? ''} onChange={(e) => setItem(idx, { description: e.target.value })} />
                    </td>
                    <td className="px-3 py-2">
                      <input className="input-field font-mono" inputMode="numeric" maxLength={8} placeholder="HSN" aria-label={`HSN / SAC for ${it.name}`}
                        value={it.hsnCode} onChange={(e) => setItem(idx, { hsnCode: e.target.value.replace(/\D/g, '') })} />
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

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm"><span className="label">Customer PO no.</span>
              <input className="input-field" maxLength={60} value={form.customerPoNumber} onChange={(e) => setForm({ ...form, customerPoNumber: e.target.value })} />
            </label>
            <label className="block text-sm"><span className="label">Customer PO date</span>
              <input className="input-field" type="date" disabled={!form.customerPoNumber.trim()} value={form.customerPoDate} onChange={(e) => setForm({ ...form, customerPoDate: e.target.value })} />
            </label>
          </div>
          <label className="block text-sm"><span className="label">Notes</span>
            <input className="input-field" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </label>
          <label className="block text-sm"><span className="label">Terms &amp; conditions</span>
            <textarea className="input-field" rows={2} value={form.termsConditions} onChange={(e) => setForm({ ...form, termsConditions: e.target.value })} />
          </label>

          <div className="flex flex-wrap justify-end gap-6 rounded-xl bg-slate-50 px-4 py-3 text-sm">
            <span>Was <b>{money(quote.grandTotal)}</b></span>
            <span>New total <b>{total != null ? money(total) : '—'}</b></span>
          </div>
        </div>
      )}
    </Modal>
  );
}
