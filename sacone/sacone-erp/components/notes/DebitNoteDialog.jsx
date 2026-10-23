'use client';

import { useEffect, useState } from 'react';
import { apiRequest } from '../../lib/api';
import { money } from '../../lib/bill-document';
import { Alert, LoadingState, Modal } from '../ui';

const r2 = (n) => Math.round((Number(n || 0) + Number.EPSILON) * 100) / 100;
const qtyText = (n) => Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 3 });
const today = () => new Date().toISOString().slice(0, 10);
const lineValue = (qty, rate, disc, gstRate) => {
  const taxable = r2(Number(qty || 0) * Number(rate || 0) * (1 - Number(disc || 0) / 100));
  return { taxable, total: r2(taxable * (1 + Number(gstRate || 0) / 100)) };
};
const blankLine = () => ({ productId: '', quantity: '', unitPrice: '', gstPercentage: '' });

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
    ? editNote.items.map((i) => ({ productId: i.productId, quantity: i.quantity, unitPrice: i.unitPrice, gstPercentage: i.gstPercentage }))
    : [blankLine()]);
  const [products, setProducts] = useState([]);
  const [warehouseId, setWarehouseId] = useState(editNote?.warehouseId || '');
  const [returnDate, setReturnDate] = useState(editNote ? String(editNote.returnDate || '').slice(0, 10) : today());
  const [reason, setReason] = useState(editNote?.reason || '');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    apiRequest('/api/purchases/bootstrap').then(setBoot).catch((e) => setError(e.message));
    apiRequest('/api/products?itemType=goods&isActive=1&limit=1000').then((d) => setProducts(d.items || [])).catch(() => {});
  }, []);

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

  return (
    <Modal
      open
      size="xl"
      title={editNote ? `✏ Edit debit note ${editNote.noteNumber || editNote.returnNumber}` : bill ? `Debit note · return against ${bill.billNumber}` : 'New debit note'}
      onClose={onClose}
      footer={(
        <>
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          <button type="button" className="btn-primary" onClick={save} disabled={saving || total <= 0}>
            {saving ? 'Saving…' : `${editNote ? 'Save debit note' : 'Issue debit note'}${total > 0 ? ` · ${money(total)}` : ''}`}
          </button>
        </>
      )}
    >
      {!boot ? (error ? <Alert message={error} /> : <LoadingState />) : (
        <div className="space-y-4">
          <Alert message={error} />
          <div className="grid gap-3 md:grid-cols-4">
            <div className="md:col-span-2">
              <label className="label">Supplier *</label>
              <select className="input-field" value={supplierId} disabled={Boolean(editNote)} onChange={(e) => setSupplierId(e.target.value)}>
                <option value="">Select supplier</option>
                {(boot.suppliers || []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
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
          </div>

          {supplierId && (
            <div>
              <label className="label">Against purchase bill</label>
              <select className="input-field" value={billId} disabled={Boolean(editNote)} onChange={(e) => setBillId(e.target.value)}>
                <option value="">No bill — direct return (enter items by hand)</option>
                {bills.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.billNumber}{b.supplierInvoiceNumber ? ` · inv ${b.supplierInvoiceNumber}` : ''} · {new Date(b.billDate).toLocaleDateString('en-IN')} · {money(b.grandTotal)}{b.amountPayable > 0 ? ` · due ${money(b.amountPayable)}` : ' · paid'}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-slate-500">With a bill, rates, discount and GST come from the bill and the note comes off what you still owe on it.</p>
            </div>
          )}

          {billId && !bill && <LoadingState />}

          {bill && (
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-3 py-2">Item</th>
                    <th className="px-3 py-2 text-right">Billed</th>
                    <th className="px-3 py-2 text-right">Already returned</th>
                    <th className="px-3 py-2 text-right">Return qty</th>
                    <th className="px-3 py-2 text-right">Value incl. GST</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {billLines.map(({ item, remaining, total: value }) => (
                    <tr key={item.id}>
                      <td className="px-3 py-2">
                        <div className="font-medium">{item.productName}</div>
                        <div className="text-xs text-slate-500">{item.hsnCode ? `HSN ${item.hsnCode} · ` : ''}{money(item.unitPrice)}{item.discountPercent ? ` −${item.discountPercent}%` : ''} · GST {item.gstPercentage}%</div>
                      </td>
                      <td className="px-3 py-2 text-right">{qtyText(item.quantity)}</td>
                      <td className="px-3 py-2 text-right text-slate-500">{item.returnedQuantity - mine(item.id) > 0 ? qtyText(item.returnedQuantity - mine(item.id)) : '—'}</td>
                      <td className="px-3 py-2 text-right">
                        {remaining > 0 ? (
                          <div className="flex items-center justify-end gap-1">
                            <input
                              type="number" inputMode="decimal" min="0" max={remaining} step="any" placeholder="0"
                              className="input-field w-24 text-right"
                              value={qty[item.id] ?? ''}
                              onChange={(e) => setQty({ ...qty, [item.id]: e.target.value })}
                            />
                            <button type="button" className="text-xs font-medium text-brand-700 hover:underline" onClick={() => setQty({ ...qty, [item.id]: remaining })}>
                              all {qtyText(remaining)}
                            </button>
                          </div>
                        ) : <span className="text-xs text-slate-400">fully returned</span>}
                      </td>
                      <td className="px-3 py-2 text-right font-medium">{value > 0 ? money(value) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {supplierId && !billId && (
            <div className="space-y-2">
              {lines.map((line, idx) => (
                <div key={idx} className="grid gap-2 rounded-lg border border-slate-200 p-3 md:grid-cols-[2fr_1fr_1fr_1fr_auto]">
                  <select
                    className="input-field"
                    value={line.productId}
                    onChange={(e) => {
                      const p = products.find((x) => x.id === e.target.value);
                      updateLine(idx, { productId: e.target.value, unitPrice: p?.purchasePrice ?? '', gstPercentage: p?.gstPercentage ?? '' });
                    }}
                  >
                    <option value="">Select product</option>
                    {products.map((p) => <option key={p.id} value={p.id}>{p.sku} — {p.name}</option>)}
                  </select>
                  <input type="number" className="input-field" placeholder="Qty" min="0" step="any" value={line.quantity} onChange={(e) => updateLine(idx, { quantity: e.target.value })} />
                  <input type="number" className="input-field" placeholder="Rate" step="0.01" value={line.unitPrice} onChange={(e) => updateLine(idx, { unitPrice: e.target.value })} />
                  <input type="number" className="input-field" placeholder="GST %" step="0.01" value={line.gstPercentage} onChange={(e) => updateLine(idx, { gstPercentage: e.target.value })} />
                  <button type="button" className="btn-secondary" onClick={() => setLines((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== idx) : [blankLine()]))}>×</button>
                </div>
              ))}
              <button type="button" className="btn-secondary" onClick={() => setLines((prev) => [...prev, blankLine()])}>+ Add line</button>
            </div>
          )}

          {supplierId && (
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="label">Reason</label>
                <input className="input-field" placeholder="e.g. Damaged in transit, short expiry, wrong item" value={reason} onChange={(e) => setReason(e.target.value)} />
              </div>
              <div className="rounded-xl border border-slate-200 p-3 text-sm">
                <div className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">Debit note</div>
                <div className="flex justify-between"><span>Taxable value</span><span>{money(taxable)}</span></div>
                <div className="flex justify-between"><span>Value (incl. GST)</span><span className="font-semibold">{money(total)}</span></div>
                {bill && <div className="flex justify-between"><span>Comes off bill {bill.billNumber}</span><span>{money(againstBill)}</span></div>}
                <div className="flex justify-between text-slate-500"><span>Supplier balance reduces by</span><span>{money(total)}</span></div>
                <p className="mt-2 text-xs text-slate-500">{editNote ? 'Saving undoes the old note (stock, supplier balance, bill) and books this one under the same number.' : 'Stock goes out of the chosen warehouse. The note gets the next debit note number for this financial year.'}</p>
              </div>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
