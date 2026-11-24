'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { apiRequest } from '../../lib/api';
import { amountInWords } from '../../lib/bill-document';
import { Alert } from '../ui';

/**
 * Purchase bill (kind="bill") or purchase order (kind="order") entry laid out like the GST sale invoice: supplier and bill details on top,
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

export function SupplierPicker({ suppliers, value, onChange, disabled }) {
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

const NUM_INPUT = 'input-field !min-h-0 !py-2 text-right text-sm font-semibold tabular-nums [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none';

/** A labelled box on a bill line (label above, value below). */
function LineField({ label, hint, children }) {
  return (
    <label className="block min-w-0">
      <span className="mb-1 block truncate text-[10px] font-semibold uppercase tracking-wide text-slate-500">{label}</span>
      {children}
      {hint ? <span className="mt-0.5 block text-[10px] text-amber-700">{hint}</span> : null}
    </label>
  );
}

export default function PurchaseBillForm({
  kind = 'bill', editing, form, setForm, lines, setLines, suppliers, warehouses, saving, error, onSubmit, onCancel,
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [showResults, setShowResults] = useState(false);
  const [preview, setPreview] = useState(null);
  const [pickingSupplier, setPickingSupplier] = useState(!form.supplierId);
  const searchRef = useRef(null);
  const formRef = useRef(null);
  const order = kind === 'order';
  const docName = order ? 'purchase order' : 'purchase bill';

  const supplier = suppliers.find((s) => s.id === form.supplierId) || null;
  const items = lines.filter((l) => l.productId);
  const update = (idx, patch) => setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  const remove = (idx) => setLines((prev) => prev.filter((_, i) => i !== idx));
  // the same product again on the next line, for a second batch of it
  const splitBatch = (idx) => setLines((prev) => {
    const src = prev[idx];
    const copy = { ...src, quantity: 1, batchNumber: '' };
    return [...prev.slice(0, idx + 1), copy, ...prev.slice(idx + 1)];
  });

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
            unregistered: !order && Boolean(form.unregistered),
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
      const at = clean.map((l) => l.productId).lastIndexOf(p.id);
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
    setForm(order ? { ...form, supplierId: s.id } : { ...form, supplierId: s.id, unregistered: !String(s.gstNumber || '').trim() });
    setPickingSupplier(false);
    setTimeout(() => searchRef.current?.focus(), 0);
  };

  const t = preview?.totals;
  const computed = preview?.items || [];
  const igst = t?.taxSplit === 'igst';
  const qty = items.reduce((n, l) => n + (Number(l.quantity) || 0), 0);
  const discount = t ? Math.max(0, Number(t.subtotal || 0) - Number(t.taxableAmount ?? t.subtotal ?? 0)) : 0;

  return (
    <form ref={formRef} onSubmit={onSubmit} className="space-y-4" data-testid={order ? 'purchase-order-form' : 'purchase-bill-form'}>
      {/* header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button type="button" className="btn-secondary !px-3" onClick={onCancel} title={`Back to ${docName}s`}>← Back</button>
          <div>
            <h2 className="text-xl font-bold text-slate-900">{editing ? `Edit ${docName}` : `New ${docName}`}</h2>
            <p className="text-xs text-slate-500">
              {order
                ? 'What you are ordering from the supplier: no stock or money moves until the goods are received on a purchase bill. F2 item search · Ctrl+S save'
                : <>Stock comes IN to the warehouse and the amount is added to the supplier&apos;s payable. F2 item search · Ctrl+S post</>}
            </p>
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
              title={order ? 'Order to (supplier)' : 'Bill from (supplier)'}
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
              {!order && <label className={`mt-3 flex items-start gap-2 rounded-lg border px-3 py-2 text-sm ${form.unregistered ? 'border-amber-300 bg-amber-50' : 'border-slate-200'}`}>
                <input type="checkbox" className="mt-0.5" checked={Boolean(form.unregistered)} onChange={(e) => setForm({ ...form, unregistered: e.target.checked })} data-testid="pb-unregistered" />
                <span>
                  <span className="font-semibold">Unregistered supplier (no GSTIN)</span>
                  <span className="block text-xs text-slate-500">No GST and no input tax credit on this bill; the rate paid is the cost.</span>
                </span>
              </label>}
            </Card>

            {/* bill details */}
            <Card className="lg:col-span-2" title={order ? 'Order details' : 'Bill details'}>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1 2xl:grid-cols-2">
                {order ? (
                  <>
                    <div>
                      <label className="label">Order date</label>
                      <input type="date" className="input-field" value={form.orderDate || ''} onChange={(e) => setForm({ ...form, orderDate: e.target.value })} data-testid="po-order-date" />
                    </div>
                    <div>
                      <label className="label">Expected delivery</label>
                      <input type="date" className="input-field" value={form.expectedDate || ''} onChange={(e) => setForm({ ...form, expectedDate: e.target.value })} data-testid="po-expected-date" />
                    </div>
                  </>
                ) : (
                <>
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
                </>
                )}
                <div>
                  <label className="label">{order ? 'Deliver to' : 'Stock into'}</label>
                  <select className="input-field" value={form.warehouseId || ''} onChange={(e) => setForm({ ...form, warehouseId: e.target.value })}>
                    <option value="">Default warehouse</option>
                    {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
                  </select>
                </div>
              </div>
              <div className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
                <div className="flex justify-between"><span>{order ? 'PO no.' : 'Bill no.'}</span><span className="font-semibold">{editing ? 'Unchanged' : 'Given on save'}</span></div>
                <div className="flex justify-between"><span>GST</span><span className="font-semibold">{!order && form.unregistered ? 'None (unregistered)' : !t ? '—' : igst ? 'IGST (other state)' : 'CGST + SGST (same state)'}</span></div>
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

            <div className="mt-4 space-y-3">
              {items.map((l, i) => {
                const idx = lines.indexOf(l);
                const c = computed[i] && computed[i].productId === l.productId ? computed[i] : computed.find((x) => x.productId === l.productId);
                return (
                  <div key={`${l.productId}-${i}`} className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm transition hover:border-slate-300" data-testid={`pb-line-${i}`}>
                    <div className="flex items-start gap-3">
                      <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-500">{i + 1}</span>
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold leading-snug text-slate-900">{l.productLabel || c?.productName || l.productId}</div>
                        <div className="text-xs text-slate-500">{[l.sku || c?.sku, l.unit].filter(Boolean).join(' · ')}</div>
                      </div>
                      <div className="shrink-0 text-right">
                        <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Amount</div>
                        <div className="text-base font-bold tabular-nums text-slate-900">{c ? money(c.lineTotal) : '—'}</div>
                      </div>
                      {!order && (
                        <button type="button" className="shrink-0 rounded-lg px-2 py-1 text-xs font-semibold text-brand-700 hover:bg-brand-50" onClick={() => splitBatch(idx)}
                          title="Same item on a new line for another batch" data-testid={`pb-split-${i}`}>+ Batch</button>
                      )}
                      <button type="button" className="shrink-0 rounded-lg px-2 py-1 text-rose-600 hover:bg-rose-50" onClick={() => remove(idx)} aria-label={`Remove ${l.productLabel}`} title="Remove line">🗑</button>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 sm:grid-cols-3 lg:grid-cols-6 sm:pl-9">
                      <LineField label="Qty" hint={l.receivedQty > 0 ? `received ${l.receivedQty}` : null}>
                        <input type="number" min="0.001" step="any" className={NUM_INPUT} value={l.quantity}
                          onChange={(e) => update(idx, { quantity: num(e.target.value) })} onFocus={(e) => e.target.select()} aria-label={`Quantity of ${l.productLabel}`} data-testid={`pb-qty-${i}`} />
                      </LineField>
                      <LineField label="Rate ₹">
                        <input type="number" step="0.01" min="0" className={NUM_INPUT} value={l.unitPrice}
                          onChange={(e) => update(idx, { unitPrice: num(e.target.value) })} onFocus={(e) => e.target.select()} aria-label={`Rate of ${l.productLabel}`} data-testid={`pb-rate-${i}`} />
                      </LineField>
                      <LineField label="Disc %">
                        <input type="number" step="0.01" min="0" max="100" className={NUM_INPUT} value={l.discountPercent}
                          onChange={(e) => update(idx, { discountPercent: num(e.target.value) })} onFocus={(e) => e.target.select()} aria-label={`Discount % on ${l.productLabel}`} data-testid={`pb-disc-${i}`} />
                      </LineField>
                      <LineField label="HSN / SAC">
                        <input className="input-field !min-h-0 !py-2 font-mono text-sm" inputMode="numeric" maxLength={8} placeholder="Auto" title="HSN / SAC (4–8 digits); blank = the product's code"
                          value={l.hsnCode || ''} onChange={(e) => update(idx, { hsnCode: e.target.value.replace(/\D/g, '') })} aria-label={`HSN of ${l.productLabel}`} />
                      </LineField>
                      <LineField label="Taxable ₹">
                        <div className="py-2 text-right text-sm tabular-nums text-slate-700">{c ? money(c.taxableAmount) : '—'}</div>
                      </LineField>
                      <LineField label={`GST ${c ? c.gstPercentage : l.gstPercentage ?? '—'}%`}>
                        <div className="py-2 text-right text-sm tabular-nums text-slate-700">{c ? money(c.gstAmount) : '—'}</div>
                      </LineField>
                    </div>
                    {!order && (
                      <div className="mt-2 flex flex-wrap items-center gap-2 sm:pl-9">
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Batch No.</span>
                        <input className="input-field !min-h-0 w-full max-w-xs !py-1.5 font-mono text-sm uppercase" maxLength={40} placeholder="Optional · e.g. B2611"
                          value={l.batchNumber || ''} onChange={(e) => update(idx, { batchNumber: e.target.value.toUpperCase() })}
                          aria-label={`Batch number of ${l.productLabel}`} data-testid={`pb-batch-${i}`} />
                      </div>
                    )}
                  </div>
                );
              })}
              {!items.length && (
                <div className="rounded-xl border border-dashed border-slate-300 py-10 text-center text-sm text-slate-400">
                  No items yet. {form.supplierId ? 'Search above and press Enter to add products.' : 'Choose the supplier, then add products.'}
                </div>
              )}
            </div>
            <p className="mt-2 text-xs text-slate-400">
              Rates are before GST. HSN blank = the product&apos;s own code. Adding an item twice adds to its quantity.
              {!order ? ' Batch No. registers the batch for Warranty Check; “+ Batch” puts the same item on a new line for another batch.' : ''}
            </p>
          </Card>

          <Card title="Notes">
            <input className="input-field" value={form.notes || ''} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder={order ? 'e.g. Deliver before the 25th · Payment 30 days' : 'e.g. Transport by ABC Roadways · LR 1234'} />
          </Card>
        </div>

        {/* summary */}
        <aside className="xl:sticky xl:top-4 xl:self-start">
          <Card title="Summary">
            <Row label="Subtotal" value={money(t?.subtotal)} muted />
            {discount > 0.004 && <Row label="Discounts" value={`− ${money(discount)}`} muted />}
            <Row label="Taxable value" value={money(t?.taxableAmount ?? t?.subtotal)} />
            {!order && form.unregistered ? (
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
              <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{order ? 'Order total' : 'Bill total'}</div>
              <div className="text-3xl font-black tabular-nums text-slate-900" data-testid="pb-total">{money(t?.grandTotal)}</div>
              {t?.grandTotal > 0 && <div className="mt-1 text-xs text-slate-500">{amountInWords(t.grandTotal)}</div>}
            </div>
            <button type="submit" className="btn-primary mt-4 w-full !py-3 text-base" disabled={saving || !form.supplierId || !items.length} data-testid="pb-post">
              {saving ? 'Saving…' : editing ? 'Save changes (Ctrl+S)' : order ? 'Save purchase order (Ctrl+S)' : 'Post bill & stock IN (Ctrl+S)'}
            </button>
            <button type="button" className="btn-secondary mt-2 w-full" onClick={onCancel}>Cancel</button>
            <p className="mt-3 text-xs text-slate-500">
              {order
                ? 'Saved as a draft: approve / send it from Purchase Orders, then use Receive / Bill when the goods arrive.'
                : editing
                ? 'Stock and the supplier balance move by the difference from the bill as it was.'
                : 'Posting adds the stock to the warehouse and the total to the supplier’s payable. Pay it later from Payment Vouchers.'}
            </p>
          </Card>
        </aside>
      </div>
    </form>
  );
}
