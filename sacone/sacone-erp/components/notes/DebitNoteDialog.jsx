'use client';

import { useEffect, useState } from 'react';
import { apiRequest } from '../../lib/api';
import { money } from '../../lib/bill-document';
import { LoadingState } from '../ui';
import { SupplierPicker } from '../purchases/PurchaseBillForm';
import { NoteCard, NotePage, SumRow } from './NotePage';

const r2 = (n) => Math.round((Number(n || 0) + Number.EPSILON) * 100) / 100;
const qtyText = (n) => Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 3 });
const today = () => new Date().toISOString().slice(0, 10);
const lineValue = (qty, rate, disc, gstRate) => {
  const taxable = r2(Number(qty || 0) * Number(rate || 0) * (1 - Number(disc || 0) / 100));
  return { taxable, total: r2(taxable * (1 + Number(gstRate || 0) / 100)) };
};

/**
 * Return to a supplier → GST debit note. Against a bill the lines, rates and GST come from
 * that bill; a direct return (no bill) takes product, quantity, rate and GST by hand.
 * onCreated(note) gets the new debit note.
 * With `editNote` (admin) it edits that note: same supplier, bill and number, its lines filled in.
 */
export default function DebitNoteDialog({ onClose, onCreated, supplierId: initialSupplier = '', editNote = null }) {
  // This note's own quantities count as not yet returned while editing it.
  const mine = (billItemId) => (editNote?.items || []).filter((i) => i.billItemId === billItemId).reduce((s, i) => s + Number(i.quantity), 0);
  const [boot, setBoot] = useState(null);
  const [supplierId, setSupplierId] = useState(editNote?.supplierId || initialSupplier);
  const [bills, setBills] = useState([]);
  const [billId, setBillId] = useState('');
  const [bill, setBill] = useState(null);
  const [qty, setQty] = useState({});
  const [lines, setLines] = useState(editNote && !editNote.billId
    ? editNote.items.map((i) => ({ productId: i.productId, productLabel: i.productName, sku: i.sku, hsnCode: i.hsnCode, quantity: i.quantity, unitPrice: i.unitPrice, gstPercentage: i.gstPercentage }))
    : []);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [pickSupplier, setPickSupplier] = useState(false);
  const [warehouseId, setWarehouseId] = useState(editNote?.warehouseId || '');
  const [returnDate, setReturnDate] = useState(editNote ? String(editNote.returnDate || '').slice(0, 10) : today());
  const [reason, setReason] = useState(editNote?.reason || '');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    apiRequest('/api/purchases/bootstrap').then(setBoot).catch((e) => setError(e.message));
  }, []);

  // direct return: product search (goods only), Enter adds the first match
  useEffect(() => {
    const q = query.trim();
    if (!q) { setResults([]); return undefined; }
    const t = setTimeout(() => {
      apiRequest(`/api/products?${new URLSearchParams({ search: q, itemType: 'goods', isActive: '1', limit: '10' })}`)
        .then((d) => setResults(d.items || []))
        .catch(() => setResults([]));
    }, 200);
    return () => clearTimeout(t);
  }, [query]);

  const addProduct = (p) => {
    setLines((prev) => {
      const at = prev.findIndex((l) => l.productId === p.id);
      if (at >= 0) return prev.map((l, i) => (i === at ? { ...l, quantity: Number(l.quantity || 0) + 1 } : l));
      return [...prev, { productId: p.id, productLabel: p.name, sku: p.sku, hsnCode: p.hsnCode, quantity: 1, unitPrice: p.purchasePrice ?? '', gstPercentage: p.gstPercentage ?? '' }];
    });
    setQuery('');
    setResults([]);
  };

  useEffect(() => {
    setBills([]); setBillId(''); setBill(null);
    if (!supplierId) return;
    apiRequest(`/api/purchases/bills?supplierId=${supplierId}&limit=200&allYears=true`)
      .then((d) => {
        setBills((d.items || []).filter((b) => b.status !== 'cancelled'));
        if (editNote?.billId && editNote.supplierId === supplierId) setBillId(editNote.billId);
      })
      .catch((e) => setError(e.message));
  }, [supplierId]);

  useEffect(() => {
    setBill(null); setQty({});
    if (!billId) return;
    apiRequest(`/api/purchases/bills/${billId}`)
      .then((b) => {
        setBill(b);
        if (editNote) {
          setQty(Object.fromEntries(b.items.filter((i) => mine(i.id) > 0).map((i) => [i.id, mine(i.id)])));
        } else if (b.warehouseId) setWarehouseId(b.warehouseId);
      })
      .catch((e) => setError(e.message));
  }, [billId]);

  const billLines = (bill?.items || []).map((item) => {
    const remaining = r2(item.quantity - ((item.returnedQuantity || 0) - mine(item.id)));
    const q = Math.min(Math.max(Number(qty[item.id] || 0), 0), remaining);
    return { item, remaining, q, ...lineValue(q, item.unitPrice, item.discountPercent, item.gstPercentage) };
  });
  const directLines = lines.map((l) => ({ ...l, ...lineValue(l.quantity, l.unitPrice, 0, l.gstPercentage) }));
  const total = Math.round(r2((bill ? billLines : directLines).reduce((s, l) => s + l.total, 0))); // whole rupees, like the note
  const taxable = r2((bill ? billLines : directLines).reduce((s, l) => s + l.taxable, 0));
  const againstBill = bill ? r2(Math.min(total, Math.max(0, bill.amountPayable + Number(editNote?.adjustedAmount || 0)))) : 0;

  const updateLine = (idx, patch) => setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)));

  const save = async () => {
    const items = bill
      ? billLines.filter((l) => l.q > 0).map((l) => ({ billItemId: l.item.id, productId: l.item.productId, quantity: l.q }))
      : lines.filter((l) => l.productId && Number(l.quantity) > 0).map((l) => ({
        productId: l.productId,
        quantity: Number(l.quantity),
        unitPrice: l.unitPrice === '' ? undefined : Number(l.unitPrice),
        gstPercentage: l.gstPercentage === '' ? undefined : Number(l.gstPercentage),
      }));
    if (!supplierId) { setError('Choose the supplier.'); return; }
    if (!items.length) { setError('Enter the quantity being returned on at least one line.'); return; }
    setSaving(true);
    setError('');
    try {
      const note = await apiRequest(editNote ? `/api/purchases/returns/${editNote.id}` : '/api/purchases/returns', {
        method: editNote ? 'PUT' : 'POST',
        body: JSON.stringify({
          supplierId, billId: billId || null, warehouseId: warehouseId || null, returnDate,
          reason: reason.trim() || null, items,
        }),
      });
      onCreated?.(note);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const supplier = (boot?.suppliers || []).find((s) => s.id === supplierId) || null;
  const supplierState = supplier ? (supplier.gstStateCode || String(supplier.gstNumber || '').slice(0, 2)) : '';
  const igst = Boolean(bill ? Number(bill.igstAmount || 0) > 0 : supplierState && boot?.companyStateCode && supplierState !== boot.companyStateCode);
  const gst = r2((bill ? billLines : directLines).reduce((s, l) => s + l.total - l.taxable, 0));
  const shown = (bill ? billLines.filter((l) => l.q > 0) : directLines.filter((l) => l.productId)).length;

  const main = !boot ? (error ? null : <LoadingState />) : (
    <>
      <div className="grid gap-4 lg:grid-cols-5">
        <NoteCard
          className="lg:col-span-3"
          title="Return to (supplier)"
          right={supplier && !editNote && !pickSupplier && (
            <button type="button" className="btn-secondary !min-h-0 !px-3 !py-1 text-xs" onClick={() => setPickSupplier(true)}>Change</button>
          )}
        >
          {(!supplier || pickSupplier) && (
            <SupplierPicker suppliers={boot.suppliers || []} value={pickSupplier ? '' : supplierId} onChange={(s) => { setSupplierId(s.id); setPickSupplier(false); }} disabled={Boolean(editNote)} />
          )}
          {supplier && !pickSupplier && (
            <div>
              <div className="text-lg font-bold text-slate-900">{supplier.name}</div>
              <div className="text-sm text-slate-500">{[supplier.phone, supplier.gstNumber ? `GSTIN ${supplier.gstNumber}` : 'No GSTIN'].filter(Boolean).join(' · ')}</div>
              {(supplier.address || supplier.city) && <div className="text-sm text-slate-500">{[supplier.address, supplier.city, supplier.state].filter(Boolean).join(', ')}</div>}
              {Number(supplier.outstandingPayable) > 0 && <span className="mt-2 inline-block rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-700">Payable {money(supplier.outstandingPayable)}</span>}
            </div>
          )}
          {supplierId && (
            <div className="mt-3">
              <label className="label">Against purchase bill</label>
              <select className="input-field" value={billId} disabled={Boolean(editNote)} onChange={(e) => setBillId(e.target.value)} data-testid="dn-bill">
                <option value="">No bill — direct return (add items below)</option>
                {bills.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.billNumber}{b.supplierInvoiceNumber ? ` · inv ${b.supplierInvoiceNumber}` : ''} · {new Date(b.billDate).toLocaleDateString('en-IN')} · {money(b.grandTotal)}{b.amountPayable > 0 ? ` · due ${money(b.amountPayable)}` : ' · paid'}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-slate-500">With a bill, rates, discount and GST come from it and the note comes off what you still owe on it.</p>
            </div>
          )}
        </NoteCard>
        <NoteCard className="lg:col-span-2" title="Note details">
          <div className="grid gap-3">
            <div>
              <label className="label">Date</label>
              <input type="date" className="input-field" value={returnDate} onChange={(e) => setReturnDate(e.target.value)} />
            </div>
            <div>
              <label className="label">Goods leave from</label>
              <select className="input-field" value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)}>
                <option value="">{bill?.warehouseName ? `Bill's warehouse (${bill.warehouseName})` : 'Default warehouse'}</option>
                {(boot.warehouses || []).map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Reason</label>
              <input className="input-field" placeholder="e.g. Damaged in transit, short expiry, wrong item" value={reason} onChange={(e) => setReason(e.target.value)} data-testid="dn-reason" />
            </div>
          </div>
          <div className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
            <div className="flex justify-between"><span>Debit note no.</span><span className="font-semibold">{editNote ? (editNote.noteNumber || editNote.returnNumber) : 'Given on save'}</span></div>
          </div>
        </NoteCard>
      </div>

      {billId && !bill && <LoadingState />}

      {supplierId && (bill || !billId) && (
        <NoteCard title={`Items returned · ${shown} line${shown === 1 ? '' : 's'}`}>
          {!bill && (
            <div className="relative mb-3">
              <div className="flex items-center gap-2 rounded-xl border-2 border-brand-500 bg-white px-3">
                <span className="text-lg text-brand-600">＋</span>
                <input
                  className="h-11 w-full border-0 bg-transparent text-sm outline-none focus:ring-0"
                  placeholder="Add item: name, SKU, barcode or HSN · Enter adds"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); if (results[0]) addProduct(results[0]); } }}
                  data-testid="dn-item-search"
                />
              </div>
              {results.length > 0 && (
                <div className="absolute z-20 mt-1 max-h-72 w-full overflow-auto rounded-xl border border-slate-200 bg-white shadow-lg">
                  {results.map((p) => (
                    <button key={p.id} type="button" className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-slate-50" onMouseDown={(e) => { e.preventDefault(); addProduct(p); }}>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-slate-900">{p.name}</span>
                        <span className="block truncate text-xs text-slate-500">{[p.sku, p.hsnCode && `HSN ${p.hsnCode}`, `GST ${p.gstPercentage ?? 0}%`].filter(Boolean).join(' · ')}</span>
                      </span>
                      <span className="w-24 text-right text-sm font-semibold tabular-nums">{money(p.purchasePrice)}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="border-b-2 border-slate-200 text-left text-[11px] uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="w-8 py-2 pr-2">#</th>
                  <th className="min-w-[180px] py-2 pr-2">Item</th>
                  <th className="py-2 pr-2">HSN</th>
                  {bill && <th className="py-2 pr-2 text-right">Billed</th>}
                  {bill && <th className="py-2 pr-2 text-right">Returned</th>}
                  <th className="py-2 pr-2 text-right">{bill ? 'Return qty' : 'Qty'}</th>
                  <th className="py-2 pr-2 text-right">Rate ₹</th>
                  <th className="py-2 pr-2 text-right">GST %</th>
                  <th className="py-2 pr-2 text-right">Tax ₹</th>
                  <th className="py-2 pr-2 text-right">Amount ₹</th>
                  {!bill && <th className="w-10 py-2" />}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {bill ? billLines.map(({ item, remaining, total: value, taxable: tv }, i) => (
                  <tr key={item.id} className={value > 0 ? 'bg-brand-50/40' : ''}>
                    <td className="py-2 pr-2 text-slate-400">{i + 1}</td>
                    <td className="py-2 pr-2 font-semibold text-slate-900">{item.productName}</td>
                    <td className="py-2 pr-2 font-mono text-xs">{item.hsnCode || '—'}</td>
                    <td className="py-2 pr-2 text-right">{qtyText(item.quantity)}</td>
                    <td className="py-2 pr-2 text-right text-slate-500">{item.returnedQuantity - mine(item.id) > 0 ? qtyText(item.returnedQuantity - mine(item.id)) : '—'}</td>
                    <td className="py-2 pr-2 text-right">
                      {remaining > 0 ? (
                        <div className="flex items-center justify-end gap-1">
                          <input
                            type="number" inputMode="decimal" min="0" max={remaining} step="any" placeholder="0"
                            className="input-field !min-h-0 w-24 !py-1.5 text-right"
                            value={qty[item.id] ?? ''}
                            onChange={(e) => setQty({ ...qty, [item.id]: e.target.value })}
                            aria-label={`Return quantity of ${item.productName}`}
                            data-testid={`dn-qty-${i}`}
                          />
                          <button type="button" className="whitespace-nowrap text-xs font-medium text-brand-700 hover:underline" onClick={() => setQty({ ...qty, [item.id]: remaining })}>
                            all {qtyText(remaining)}
                          </button>
                        </div>
                      ) : <span className="text-xs text-slate-400">fully returned</span>}
                    </td>
                    <td className="py-2 pr-2 text-right tabular-nums">{money(item.unitPrice)}{item.discountPercent ? <div className="text-[11px] text-slate-400">−{item.discountPercent}%</div> : null}</td>
                    <td className="py-2 pr-2 text-right text-slate-600">{item.gstPercentage}%</td>
                    <td className="py-2 pr-2 text-right tabular-nums text-slate-500">{value > 0 ? money(value - tv) : '—'}</td>
                    <td className="py-2 pr-2 text-right font-semibold tabular-nums">{value > 0 ? money(value) : '—'}</td>
                  </tr>
                )) : directLines.map((l, idx) => (l.productId ? (
                  <tr key={`${l.productId}-${idx}`}>
                    <td className="py-2 pr-2 text-slate-400">{idx + 1}</td>
                    <td className="py-2 pr-2"><div className="font-semibold text-slate-900">{l.productLabel || l.productId}</div>{l.sku && <div className="text-xs text-slate-500">{l.sku}</div>}</td>
                    <td className="py-2 pr-2 font-mono text-xs">{l.hsnCode || '—'}</td>
                    <td className="py-2 pr-2"><input type="number" min="0" step="any" className="input-field !min-h-0 w-24 !py-1.5 text-right" value={l.quantity} onChange={(e) => updateLine(idx, { quantity: e.target.value })} aria-label={`Quantity of ${l.productLabel}`} /></td>
                    <td className="py-2 pr-2"><input type="number" min="0" step="0.01" className="input-field !min-h-0 w-28 !py-1.5 text-right" value={l.unitPrice} onChange={(e) => updateLine(idx, { unitPrice: e.target.value })} aria-label={`Rate of ${l.productLabel}`} /></td>
                    <td className="py-2 pr-2"><input type="number" min="0" step="0.01" className="input-field !min-h-0 w-20 !py-1.5 text-right" value={l.gstPercentage} onChange={(e) => updateLine(idx, { gstPercentage: e.target.value })} aria-label={`GST % of ${l.productLabel}`} /></td>
                    <td className="py-2 pr-2 text-right tabular-nums text-slate-500">{l.total > 0 ? money(l.total - l.taxable) : '—'}</td>
                    <td className="py-2 pr-2 text-right font-semibold tabular-nums">{l.total > 0 ? money(l.total) : '—'}</td>
                    <td className="py-2 text-right"><button type="button" className="rounded-lg px-2 py-1 text-rose-600 hover:bg-rose-50" onClick={() => setLines((prev) => prev.filter((_, i) => i !== idx))} aria-label={`Remove ${l.productLabel}`}>🗑</button></td>
                  </tr>
                ) : null))}
                {!bill && !directLines.some((l) => l.productId) && (
                  <tr><td colSpan={9} className="py-8 text-center text-slate-400">No items yet. Search above and press Enter to add what goes back.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </NoteCard>
      )}
    </>
  );

  const summary = (
    <>
      <SumRow label="Taxable value" value={money(taxable)} />
      {igst ? <SumRow label="IGST" value={money(gst)} muted /> : (
        <>
          <SumRow label="CGST" value={money(r2(gst / 2))} muted />
          <SumRow label="SGST" value={money(r2(gst - r2(gst / 2)))} muted />
        </>
      )}
      <div className="mt-2 border-t border-slate-100 pt-2">
        {bill && <SumRow label={`Comes off bill ${bill.billNumber}`} value={money(againstBill)} />}
        <SumRow label="Supplier balance reduces by" value={money(total)} strong />
      </div>
    </>
  );

  return (
    <NotePage
      testId="debit-note-page"
      title={editNote ? `Edit debit note ${editNote.noteNumber || editNote.returnNumber}` : bill ? `Debit note · return against ${bill.billNumber}` : 'New debit note'}
      subtitle="Return to a supplier: reduces input GST and what you owe them. Esc back · Ctrl+S save"
      error={error}
      main={main}
      summary={summary}
      total={total}
      totalLabel="Debit note total (incl. GST)"
      actionLabel={editNote ? 'Save debit note' : 'Issue debit note'}
      onAction={save}
      actionDisabled={!supplierId || total <= 0}
      saving={saving}
      onClose={onClose}
      footnote={editNote ? 'Saving undoes the old note (stock, supplier balance, bill) and books this one under the same number.' : 'Stock goes out of the chosen warehouse. The note gets the next debit note number for this financial year.'}
    />
  );
}
