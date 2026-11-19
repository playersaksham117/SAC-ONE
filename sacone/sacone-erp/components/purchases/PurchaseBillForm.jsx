'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { apiRequest } from '../../lib/api';
import { amountInWords } from '../../lib/bill-document';
import { Alert } from '../ui';

/**
 * Purchase bill entry laid out like the GST sale invoice: supplier and bill details on top,
 * an item table with a search box (name, SKU, barcode or HSN; Enter adds), the GST summary
 * on the right and the post button always in view. Totals come from the server's preview
 * (the same calculation that posts the bill).
 *
 * Keys: F2 item search · Ctrl+S post · Esc closes the search list.
 */

const money = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const num = (v) => (v === '' || v == null ? '' : Number(v));

function Card({ title, right, children, className = '' }) {
  return (
    <section className={`rounded-2xl border border-slate-200 bg-white p-4 shadow-sm ${className}`}>
      {(title || right) && (
        <div className="mb-3 flex items-center justify-between gap-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</h3>
          {right}
        </div>
      )}
      {children}
    </section>
  );
}

function Row({ label, value, strong = false, muted = false }) {
  return (
    <div className={`flex items-center justify-between py-1 text-sm ${strong ? 'font-semibold text-slate-900' : muted ? 'text-slate-500' : 'text-slate-700'}`}>
      <span>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}

function SupplierPicker({ suppliers, value, onChange, disabled }) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q
      ? suppliers.filter((s) => [s.name, s.code, s.phone, s.gstNumber, s.city].some((v) => String(v || '').toLowerCase().includes(q)))
      : suppliers;
    return list.slice(0, 12);
  }, [suppliers, query]);
  if (value && !open) return null;
  return (
    <div className="relative">
      <input
        className="input-field"
        placeholder="Search supplier: name, phone, GSTIN or city"
        value={query}
        disabled={disabled}
        autoFocus={!value}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
        onKeyDown={(e) => { if (e.key === 'Enter' && matches[0]) { e.preventDefault(); onChange(matches[0]); setQuery(''); setOpen(false); } }}
        data-testid="pb-supplier-search"
      />
      {open && (
        <div className="absolute z-30 mt-1 max-h-72 w-full overflow-auto rounded-xl border border-slate-200 bg-white shadow-lg">
          {matches.map((s) => (
            <button key={s.id} type="button" className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-slate-50"
              onMouseDown={(e) => { e.preventDefault(); onChange(s); setQuery(''); setOpen(false); }}>
              <span>
                <span className="block text-sm font-semibold text-slate-900">{s.name}</span>
                <span className="block text-xs text-slate-500">{[s.gstNumber ? `GSTIN ${s.gstNumber}` : 'No GSTIN', s.city, s.phone].filter(Boolean).join(' · ')}</span>
              </span>
              {Number(s.outstandingPayable) > 0 && <span className="whitespace-nowrap text-xs font-semibold text-amber-700">Payable {money(s.outstandingPayable)}</span>}
            </button>
          ))}
          {!matches.length && <div className="px-3 py-3 text-sm text-slate-500">No supplier matches. Add suppliers in Customers &amp; Suppliers.</div>}
        </div>
      )}
    </div>
  );
}

export default function PurchaseBillForm({
  editing, form, setForm, lines, setLines, suppliers, warehouses, saving, error, onSubmit, onCancel,
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [showResults, setShowResults] = useState(false);
  const [preview, setPreview] = useState(null);
  const [pickingSupplier, setPickingSupplier] = useState(!form.supplierId);
  const searchRef = useRef(null);
  const formRef = useRef(null);

  const supplier = suppliers.find((s) => s.id === form.supplierId) || null;
  const items = lines.filter((l) => l.productId);
  const update = (idx, patch) => setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  const remove = (idx) => setLines((prev) => prev.filter((_, i) => i !== idx));

  // product search (debounced)
  useEffect(() => {
    const q = query.trim();
    if (!q) { setResults([]); return undefined; }
    const t = setTimeout(async () => {
      try {
        const data = await apiRequest(`/api/products?${new URLSearchParams({ search: q, limit: '10', isActive: '1' })}`);
        setResults(data.items || []);
        setShowResults(true);
      } catch {
        setResults([]);
      }
    }, 200);
    return () => clearTimeout(t);
  }, [query]);

  // live totals from the server (same maths as posting)
  useEffect(() => {
    if (!form.supplierId || !items.length) { setPreview(null); return undefined; }
    const t = setTimeout(async () => {
      try {
        setPreview(await apiRequest('/api/purchases/preview', {
          method: 'POST',
          body: JSON.stringify({
            supplierId: form.supplierId,
            unregistered: Boolean(form.unregistered),
            items: items.map((l) => ({
              productId: l.productId,
              quantity: Number(l.quantity) || 1,
              unitPrice: Number(l.unitPrice) || 0,
              discountPercent: Number(l.discountPercent) || 0,
            })),
          }),
        }));
      } catch {
        setPreview(null);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [form.supplierId, form.unregistered, JSON.stringify(items.map((l) => [l.productId, l.quantity, l.unitPrice, l.discountPercent]))]); // eslint-disable-line react-hooks/exhaustive-deps

  const addProduct = useCallback((p) => {
    setLines((prev) => {
      const clean = prev.filter((l) => l.productId);
      const at = clean.findIndex((l) => l.productId === p.id);
      if (at >= 0) return clean.map((l, i) => (i === at ? { ...l, quantity: Number(l.quantity || 0) + 1 } : l));
      return [...clean, {
        productId: p.id,
        productLabel: p.name,
        sku: p.sku,
        unit: p.unitAbbreviation || p.unitName || '',
        quantity: 1,
        unitPrice: p.purchasePrice || p.sellingPrice || '',
        discountPercent: 0,
        hsnCode: p.hsnCode || '',
        gstPercentage: p.gstPercentage,
      }];
    });
    setQuery('');
    setResults([]);
    setShowResults(false);
    searchRef.current?.focus();
  }, [setLines]);

  const submitSearch = () => {
    const q = query.trim().toLowerCase();
    if (!q || !results.length) return;
    const exact = results.find((p) => [p.barcode, p.sku].some((v) => String(v || '').toLowerCase() === q));
    addProduct(exact || results[0]);
  };

  // F2 = item search, Ctrl+S = post
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'F2') { e.preventDefault(); searchRef.current?.focus(); }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); formRef.current?.requestSubmit(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const pickSupplier = (s) => {
    setForm({ ...form, supplierId: s.id, unregistered: !String(s.gstNumber || '').trim() });
    setPickingSupplier(false);
    setTimeout(() => searchRef.current?.focus(), 0);
  };

  const t = preview?.totals;
  const computed = preview?.items || [];
  const igst = t?.taxSplit === 'igst';
  const qty = items.reduce((n, l) => n + (Number(l.quantity) || 0), 0);
  const discount = t ? Math.max(0, Number(t.subtotal || 0) - Number(t.taxableAmount ?? t.subtotal ?? 0)) : 0;

  return (
    <form ref={formRef} onSubmit={onSubmit} className="space-y-4" data-testid="purchase-bill-form">
      {/* header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button type="button" className="btn-secondary !px-3" onClick={onCancel} title="Back to purchase bills">← Back</button>
          <div>
            <h2 className="text-xl font-bold text-slate-900">{editing ? 'Edit purchase bill' : 'New purchase bill'}</h2>
            <p className="text-xs text-slate-500">Stock comes IN to the warehouse and the amount is added to the supplier&apos;s payable. F2 item search · Ctrl+S post</p>
          </div>
        </div>
        {form.purchaseOrderId && !editing && <span className="rounded-full bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-700">Receiving against a purchase order</span>}
      </div>

      <Alert type="error" message={error} />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
        {/* main column */}
        <div className="min-w-0 space-y-4">
          <div className="grid gap-4 lg:grid-cols-5">
            {/* supplier */}
            <Card
              className="lg:col-span-3"
              title="Bill from (supplier)"
              right={supplier && !editing && (
                <button type="button" className="btn-secondary !min-h-0 !px-3 !py-1 text-xs" onClick={() => setPickingSupplier(true)}>Change</button>
              )}
            >
              {(!supplier || pickingSupplier) && (
                <SupplierPicker suppliers={suppliers} value={pickingSupplier ? '' : form.supplierId} onChange={pickSupplier} disabled={editing} />
              )}
              {supplier && !pickingSupplier && (
                <div>
                  <div className="text-lg font-bold text-slate-900">{supplier.name}</div>
                  <div className="text-sm text-slate-500">{[supplier.phone, supplier.gstNumber ? `GSTIN ${supplier.gstNumber}` : 'No GSTIN'].filter(Boolean).join(' · ')}</div>
                  {(supplier.address || supplier.city) && <div className="text-sm text-slate-500">{[supplier.address, supplier.city, supplier.state].filter(Boolean).join(', ')}</div>}
                  <div className="mt-2 flex flex-wrap gap-2">
                    {Number(supplier.outstandingPayable) > 0 && <span className="rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-700">Payable {money(supplier.outstandingPayable)}</span>}
                    {supplier.creditDays ? <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-600">Credit {supplier.creditDays} days</span> : null}
                  </div>
                </div>
              )}
              <label className={`mt-3 flex items-start gap-2 rounded-lg border px-3 py-2 text-sm ${form.unregistered ? 'border-amber-300 bg-amber-50' : 'border-slate-200'}`}>
                <input type="checkbox" className="mt-0.5" checked={Boolean(form.unregistered)} onChange={(e) => setForm({ ...form, unregistered: e.target.checked })} data-testid="pb-unregistered" />
                <span>
                  <span className="font-semibold">Unregistered supplier (no GSTIN)</span>
                  <span className="block text-xs text-slate-500">No GST and no input tax credit on this bill; the rate paid is the cost.</span>
                </span>
              </label>
            </Card>

            {/* bill details */}
            <Card className="lg:col-span-2" title="Bill details">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1 2xl:grid-cols-2">
                <div>
                  <label className="label">Supplier invoice no.</label>
                  <input className="input-field" value={form.supplierInvoiceNumber || ''} onChange={(e) => setForm({ ...form, supplierInvoiceNumber: e.target.value })} placeholder="As printed on their bill" data-testid="pb-invoice-no" />
                </div>
                <div>
                  <label className="label">Bill date</label>
                  <input type="date" className="input-field" value={form.billDate || ''} onChange={(e) => setForm({ ...form, billDate: e.target.value })} />
                </div>
                <div>
                  <label className="label">Due date</label>
                  <input type="date" className="input-field" value={form.dueDate || ''} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} />
                </div>
                <div>
                  <label className="label">Stock into</label>
                  <select className="input-field" value={form.warehouseId || ''} onChange={(e) => setForm({ ...form, warehouseId: e.target.value })}>
                    <option value="">Default warehouse</option>
                    {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
                  </select>
                </div>
              </div>
              <div className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
                <div className="flex justify-between"><span>Bill no.</span><span className="font-semibold">{editing ? 'Unchanged' : 'Given on save'}</span></div>
                <div className="flex justify-between"><span>GST</span><span className="font-semibold">{form.unregistered ? 'None (unregistered)' : !t ? '—' : igst ? 'IGST (other state)' : 'CGST + SGST (same state)'}</span></div>
              </div>
            </Card>
          </div>

          {/* items */}
          <Card title={`Items · ${items.length} line${items.length === 1 ? '' : 's'} · qty ${qty}`}>
            <div className="relative">
              <div className="flex items-center gap-2 rounded-xl border-2 border-brand-500 bg-white px-3">
                <span className="text-lg text-brand-600">＋</span>
                <input
                  ref={searchRef}
                  className="h-11 w-full border-0 bg-transparent text-sm outline-none focus:ring-0"
                  placeholder={form.supplierId ? 'Add item: name, SKU, barcode or HSN  (F2) · Enter adds' : 'Choose the supplier first, then add items here'}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onFocus={() => results.length && setShowResults(true)}
                  onBlur={() => setTimeout(() => setShowResults(false), 150)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') { e.preventDefault(); submitSearch(); }
                    if (e.key === 'Escape') setShowResults(false);
                  }}
                  data-testid="pb-item-search"
                />
              </div>
              {showResults && results.length > 0 && (
                <div className="absolute z-20 mt-1 max-h-80 w-full overflow-auto rounded-xl border border-slate-200 bg-white shadow-lg">
                  {results.map((p) => (
                    <button key={p.id} type="button" className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-slate-50" onMouseDown={(e) => { e.preventDefault(); addProduct(p); }}>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-slate-900">{p.name}</span>
                        <span className="block truncate text-xs text-slate-500">{[p.sku, p.hsnCode && `HSN ${p.hsnCode}`, `GST ${p.gstPercentage ?? 0}%`].filter(Boolean).join(' · ')}</span>
                      </span>
                      <span className="whitespace-nowrap text-xs text-slate-500">Last cost</span>
                      <span className="w-24 text-right text-sm font-semibold tabular-nums">{money(p.purchasePrice)}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="border-b-2 border-slate-200 text-left text-[11px] uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="w-8 py-2 pr-2">#</th>
                    <th className="min-w-[180px] py-2 pr-2">Item</th>
                    <th className="w-24 py-2 pr-2">HSN/SAC</th>
                    <th className="w-24 py-2 pr-2 text-right">Qty</th>
                    <th className="w-28 py-2 pr-2 text-right">Rate ₹</th>
                    <th className="w-20 py-2 pr-2 text-right">Disc %</th>
                    <th className="w-16 py-2 pr-2 text-right">GST</th>
                    <th className="hidden w-24 py-2 pr-2 text-right 2xl:table-cell">Tax ₹</th>
                    <th className="w-28 py-2 pr-2 text-right">Amount ₹</th>
                    <th className="w-10 py-2" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {items.map((l, i) => {
                    const idx = lines.indexOf(l);
                    const c = computed.find((x) => x.productId === l.productId);
                    return (
                      <tr key={l.productId} className="align-top">
                        <td className="py-2 pr-2 text-slate-400">{i + 1}</td>
                        <td className="py-2 pr-2">
                          <div className="font-semibold text-slate-900">{l.productLabel || c?.productName || l.productId}</div>
                          <div className="text-xs text-slate-500">{[l.sku || c?.sku, l.unit].filter(Boolean).join(' · ')}</div>
                        </td>
                        <td className="py-2 pr-2">
                          <input className="input-field !min-h-0 !py-1.5 font-mono text-xs" inputMode="numeric" maxLength={8} placeholder="Product's" title="HSN / SAC (4–8 digits); blank = the product's code"
                            value={l.hsnCode || ''} onChange={(e) => update(idx, { hsnCode: e.target.value.replace(/\D/g, '') })} />
                        </td>
                        <td className="py-2 pr-2">
                          <input type="number" min="0.001" step="any" className="input-field !min-h-0 !py-1.5 text-right" value={l.quantity}
                            onChange={(e) => update(idx, { quantity: num(e.target.value) })} aria-label={`Quantity of ${l.productLabel}`} data-testid={`pb-qty-${i}`} />
                          {l.receivedQty > 0 && <div className="mt-0.5 text-[10px] text-amber-700">received {l.receivedQty}</div>}
                        </td>
                        <td className="py-2 pr-2">
                          <input type="number" step="0.01" min="0" className="input-field !min-h-0 !py-1.5 text-right" value={l.unitPrice}
                            onChange={(e) => update(idx, { unitPrice: num(e.target.value) })} aria-label={`Rate of ${l.productLabel}`} data-testid={`pb-rate-${i}`} />
                        </td>
                        <td className="py-2 pr-2">
                          <input type="number" step="0.01" min="0" max="100" className="input-field !min-h-0 !py-1.5 text-right" value={l.discountPercent}
                            onChange={(e) => update(idx, { discountPercent: num(e.target.value) })} aria-label={`Discount % on ${l.productLabel}`} />
                        </td>
                        <td className="py-2 pr-2 pt-3.5 text-right text-slate-600">{c ? c.gstPercentage : l.gstPercentage ?? '—'}%</td>
                        <td className="hidden py-2 pr-2 pt-3.5 text-right tabular-nums text-slate-500 2xl:table-cell">{c ? money(c.gstAmount) : '—'}</td>
                        <td className="py-2 pr-2 pt-3.5 text-right font-semibold tabular-nums text-slate-900">{c ? money(c.lineTotal) : '—'}</td>
                        <td className="py-2 pt-2.5 text-right">
                          <button type="button" className="rounded-lg px-2 py-1 text-rose-600 hover:bg-rose-50" onClick={() => remove(idx)} aria-label={`Remove ${l.productLabel}`}>🗑</button>
                        </td>
                      </tr>
                    );
                  })}
                  {!items.length && (
                    <tr>
                      <td colSpan={10} className="py-10 text-center text-slate-400">
                        No items yet. {form.supplierId ? 'Search above and press Enter to add products.' : 'Choose the supplier, then add products.'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-xs text-slate-400">Rates are before GST. HSN blank = the product&apos;s own code. Adding an item twice adds to its quantity.</p>
          </Card>

          <Card title="Notes">
            <input className="input-field" value={form.notes || ''} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="e.g. Transport by ABC Roadways · LR 1234" />
          </Card>
        </div>

        {/* summary */}
        <aside className="xl:sticky xl:top-4 xl:self-start">
          <Card title="Summary">
            <Row label="Subtotal" value={money(t?.subtotal)} muted />
            {discount > 0.004 && <Row label="Discounts" value={`− ${money(discount)}`} muted />}
            <Row label="Taxable value" value={money(t?.taxableAmount ?? t?.subtotal)} />
            {form.unregistered ? (
              <Row label="GST" value="None (unregistered)" muted />
            ) : igst ? (
              <Row label="IGST" value={money(t?.igstAmount)} muted />
            ) : (
              <>
                <Row label="CGST" value={money(t?.cgstAmount)} muted />
                <Row label="SGST" value={money(t?.sgstAmount)} muted />
              </>
            )}
            {t?.roundOff && Math.abs(t.roundOff) >= 0.01 ? <Row label="Round off" value={money(t.roundOff)} muted /> : null}
            <div className="mt-3 rounded-xl bg-slate-50 p-4">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Bill total</div>
              <div className="text-3xl font-black tabular-nums text-slate-900" data-testid="pb-total">{money(t?.grandTotal)}</div>
              {t?.grandTotal > 0 && <div className="mt-1 text-xs text-slate-500">{amountInWords(t.grandTotal)}</div>}
            </div>
            <button type="submit" className="btn-primary mt-4 w-full !py-3 text-base" disabled={saving || !form.supplierId || !items.length} data-testid="pb-post">
              {saving ? 'Saving…' : editing ? 'Save changes (Ctrl+S)' : 'Post bill & stock IN (Ctrl+S)'}
            </button>
            <button type="button" className="btn-secondary mt-2 w-full" onClick={onCancel}>Cancel</button>
            <p className="mt-3 text-xs text-slate-500">
              {editing
                ? 'Stock and the supplier balance move by the difference from the bill as it was.'
                : 'Posting adds the stock to the warehouse and the total to the supplier’s payable. Pay it later from Payment Vouchers.'}
            </p>
          </Card>
        </aside>
      </div>
    </form>
  );
}
