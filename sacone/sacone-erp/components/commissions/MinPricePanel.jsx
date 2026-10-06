'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiRequest } from '../../lib/api';
import { useLiveRefresh } from '../../lib/live';
import { Modal } from '../ui';
import { SectionCard } from '../module-ui';

const money = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const EMPTY = { scope: 'product', targetId: '', mode: 'price', value: '', notes: '' };
const SCOPE_LABEL = { product: 'Product', brand: 'Brand', category: 'Category' };

/**
 * Minimum selling prices: managed only here, in Commission settings.
 * Sales below the floor are blocked on SAC-POS and in the ERP, and those lines earn no commission.
 */
export default function MinPricePanel({ canEdit, onError, onMessage }) {
  const [rules, setRules] = useState([]);
  const [products, setProducts] = useState([]);
  const [brands, setBrands] = useState([]);
  const [categories, setCategories] = useState([]);
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      setRules(await apiRequest('/api/commissions/min-prices'));
    } catch (e) {
      onError?.(e.message);
    }
  }, [onError]);

  useEffect(() => {
    load();
    Promise.all([
      apiRequest('/api/products?limit=1000&isActive=1').then((d) => d.items || []),
      apiRequest('/api/brands'),
      apiRequest('/api/categories'),
    ]).then(([p, b, c]) => {
      setProducts(p);
      setBrands((b || []).filter((x) => x.isActive));
      setCategories((c || []).filter((x) => x.isActive));
    }).catch(() => {});
  }, [load]);
  useLiveRefresh(load, { tables: ['min_selling_prices', 'products'] });

  const targets = form?.scope === 'brand' ? brands : form?.scope === 'category' ? categories : products;
  const target = useMemo(() => targets.find((t) => t.id === form?.targetId), [targets, form?.targetId]);
  const previewFloor = form?.scope === 'product' && target && form.value !== ''
    ? (form.mode === 'price' ? Number(form.value) : Number(target.mrp || target.sellingPrice || 0) * Number(form.value) / 100)
    : null;

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await apiRequest('/api/commissions/min-prices', {
        method: 'POST',
        body: JSON.stringify({
          scope: form.scope,
          targetId: form.targetId,
          minPrice: form.mode === 'price' ? form.value : null,
          minPercentOfMrp: form.mode === 'percent' ? form.value : null,
          notes: form.notes,
        }),
      });
      onMessage?.('Minimum selling price saved. Phones pick it up on their next sync.');
      setForm(null);
      await load();
    } catch (err) {
      onError?.(err.message);
    } finally {
      setSaving(false);
    }
  };

  const remove = async (rule) => {
    if (!window.confirm(`Remove the minimum price for ${rule.targetName}?`)) return;
    try {
      await apiRequest(`/api/commissions/min-prices/${rule.id}`, { method: 'DELETE' });
      await load();
    } catch (err) {
      onError?.(err.message);
    }
  };

  return (
    <SectionCard
      title="Minimum selling price"
      subtitle="Nobody can sell below these prices on SAC-POS or in the ERP, and lines sold below them earn no commission. Price per unit before GST, after discounts. Product rules beat brand rules, which beat category rules."
      action={canEdit ? <button type="button" className="btn-primary" onClick={() => setForm(EMPTY)}>+ Minimum price</button> : null}
    >
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-2">Applies to</th>
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">Minimum</th>
              <th className="px-3 py-2">Notes</th>
              {canEdit && <th className="px-3 py-2" />}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rules.map((r) => (
              <tr key={r.id}>
                <td className="px-3 py-2">{SCOPE_LABEL[r.scope]}</td>
                <td className="px-3 py-2 font-medium">{r.targetName}{r.targetCode ? <span className="ml-1 font-mono text-xs text-slate-400">{r.targetCode}</span> : null}</td>
                <td className="px-3 py-2">
                  {r.minPrice != null ? money(r.minPrice) : `${r.minPercentOfMrp}% of MRP`}
                  {r.minPercentOfMrp != null && r.targetMrp ? <span className="ml-1 text-xs text-slate-500">({money(r.targetMrp * r.minPercentOfMrp / 100)})</span> : null}
                </td>
                <td className="px-3 py-2 text-slate-500">{r.notes || '—'}</td>
                {canEdit && (
                  <td className="px-3 py-2 text-right">
                    <div className="flex justify-end gap-1">
                      <button
                        type="button"
                        className="btn-secondary !min-h-0 !px-2 !py-1 text-xs"
                        onClick={() => setForm({
                          scope: r.scope,
                          targetId: r.productId || r.brandId || r.categoryId,
                          mode: r.minPrice != null ? 'price' : 'percent',
                          value: String(r.minPrice ?? r.minPercentOfMrp),
                          notes: r.notes || '',
                        })}
                      >Edit</button>
                      <button type="button" className="btn-secondary !min-h-0 !px-2 !py-1 text-xs text-red-600" onClick={() => remove(r)}>Remove</button>
                    </div>
                  </td>
                )}
              </tr>
            ))}
            {!rules.length && (
              <tr><td colSpan={canEdit ? 5 : 4} className="px-3 py-8 text-center text-slate-500">No minimum prices yet: staff can sell at any price their role allows.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {form && (
        <Modal open title="Minimum selling price" onClose={() => setForm(null)}>
          <form className="space-y-3" onSubmit={save}>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-sm"><span className="label">Applies to</span>
                <select
                  className="input-field"
                  value={form.scope}
                  onChange={(e) => setForm((f) => ({ ...f, scope: e.target.value, targetId: '', mode: e.target.value === 'product' ? f.mode : 'percent' }))}
                >
                  <option value="product">One product</option>
                  <option value="brand">A brand</option>
                  <option value="category">A category</option>
                </select>
              </label>
              <label className="block text-sm"><span className="label">{SCOPE_LABEL[form.scope]} *</span>
                <select className="input-field" required value={form.targetId} onChange={(e) => setForm((f) => ({ ...f, targetId: e.target.value }))}>
                  <option value="">Select</option>
                  {targets.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}{t.sku ? ` (${t.sku})` : ''}</option>
                  ))}
                </select>
              </label>
            </div>
            {form.scope === 'product' && target && (
              <p className="text-xs text-slate-500">MRP {money(target.mrp)} · selling price {money(target.sellingPrice)}</p>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-sm"><span className="label">Minimum as</span>
                <select className="input-field" value={form.mode} onChange={(e) => setForm((f) => ({ ...f, mode: e.target.value }))} disabled={form.scope !== 'product'}>
                  <option value="price">Fixed price (₹)</option>
                  <option value="percent">% of MRP</option>
                </select>
              </label>
              <label className="block text-sm"><span className="label">{form.mode === 'price' ? 'Minimum price ₹ *' : '% of MRP *'}</span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  max={form.mode === 'percent' ? 100 : undefined}
                  className="input-field"
                  required
                  value={form.value}
                  onChange={(e) => setForm((f) => ({ ...f, value: e.target.value }))}
                />
              </label>
            </div>
            {previewFloor != null && (
              <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
                Lowest allowed price: <b>{money(previewFloor)}</b> per unit before GST
                {target && previewFloor > Number(target.sellingPrice) ? ' (above the current selling price)' : ''}
              </p>
            )}
            <label className="block text-sm"><span className="label">Notes</span>
              <input className="input-field" value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
            </label>
            <div className="flex justify-end gap-2">
              <button type="button" className="btn-secondary" onClick={() => setForm(null)}>Cancel</button>
              <button type="submit" className="btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
            </div>
          </form>
        </Modal>
      )}
    </SectionCard>
  );
}
