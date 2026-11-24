'use client';

import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { apiRequest } from '../../lib/api';
import { RequirePermission, useAuth } from '../../lib/auth-context';
import PageHeader, { Alert, Modal } from '../ui';
import { EmptyPanel, SectionCard } from '../module-ui';
import EditInvoiceDialog from '../sales/EditInvoiceDialog';
import { LABEL_SIZES, labelSettingsFrom, warrantyLabelsHtml, warrantyUnits } from '../../lib/labels';
import { printHtml } from '../../lib/bill-document';

const ddmmyyyy = (iso) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '');

function PeriodStatus({ label, s }) {
  if (!s) return <span className="text-xs text-slate-400">No {label.toLowerCase()}</span>;
  return (
    <div className={`rounded-lg px-2.5 py-1.5 text-xs ${s.active ? 'bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200' : 'bg-rose-50 text-rose-700 ring-1 ring-rose-200'}`}>
      <div className="font-semibold">{label} {s.period} · {s.active ? 'Active' : 'Expired'}</div>
      <div>{s.active ? `till ${ddmmyyyy(s.till)} · ${s.daysLeft} day${s.daysLeft === 1 ? '' : 's'} left` : `ended ${ddmmyyyy(s.till)}`}</div>
    </div>
  );
}

/** Add / correct the serial numbers of one invoice line. */
function SerialsModal({ result, line, onClose, onSaved }) {
  const [text, setText] = useState(line.serials.join('\n'));
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const save = async () => {
    setSaving(true);
    setError('');
    try {
      await apiRequest(`/api/pos/sales/${result.saleId}/items/${line.itemId}/serials`, { method: 'PUT', body: JSON.stringify({ serialNumbers: text }) });
      onSaved();
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  };
  return (
    <Modal open title={`Serial numbers · ${line.productName}`} onClose={onClose}
      footer={<><button type="button" className="btn-secondary" onClick={onClose}>Cancel</button><button type="button" className="btn-primary" disabled={saving} onClick={save}>{saving ? 'Saving…' : 'Save'}</button></>}>
      <Alert message={error} />
      <p className="mb-2 text-sm text-slate-600">Invoice {result.invoiceNumber} · {line.quantity} unit{line.quantity === 1 ? '' : 's'}. One serial per line (scan or type).</p>
      <textarea className="input-field font-mono" rows={Math.min(10, Math.max(3, line.quantity))} autoFocus value={text} onChange={(e) => setText(e.target.value)} />
    </Modal>
  );
}

/** "Registered · PB/0012 · ABC Traders · 12/11/2026" or "Not registered" for a sold line's batch. */
export function BatchOrigin({ batch }) {
  if (!batch) return null;
  if (!batch.registered) {
    return <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800" title="Not on any purchase bill">Not registered</span>;
  }
  const b = batch.bills?.[0];
  return (
    <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-800 ring-1 ring-emerald-200"
      title={(batch.bills || []).map((x) => `${x.billNumber} · ${x.supplierName || ''} · ${ddmmyyyy(x.date)} · qty ${x.quantity}`).join('\n')}>
      Registered{b ? ` · ${b.billNumber}${b.supplierName ? ` · ${b.supplierName}` : ''} · ${ddmmyyyy(b.date)}` : ''}{batch.bills?.length > 1 ? ` +${batch.bills.length - 1}` : ''}
    </span>
  );
}

/** Set or change the batch number of one invoice line (pick a registered batch of the product, or type one). */
function BatchModal({ result, line, onClose, onSaved }) {
  const [value, setValue] = useState(line.batchNumber || '');
  const [options, setOptions] = useState([]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    apiRequest(`/api/warranty/batches/product/${line.productId}`).then((d) => setOptions(d.batches || [])).catch(() => setOptions([]));
  }, [line.productId]);
  const known = options.some((o) => o.batchNumber === value.trim().toUpperCase());
  const save = async () => {
    setSaving(true);
    setError('');
    try {
      await apiRequest(`/api/pos/sales/${result.saleId}/items/${line.itemId}`, { method: 'PUT', body: JSON.stringify({ batchNumber: value.trim() || null }) });
      onSaved();
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  };
  return (
    <Modal open title={`Batch number · ${line.productName}`} onClose={onClose}
      footer={<><button type="button" className="btn-secondary" onClick={onClose}>Cancel</button><button type="button" className="btn-primary" disabled={saving} onClick={save}>{saving ? 'Saving…' : 'Save'}</button></>}>
      <Alert message={error} />
      <p className="mb-2 text-sm text-slate-600">Invoice {result.invoiceNumber} · {line.quantity} unit{line.quantity === 1 ? '' : 's'}. Pick a batch received on a purchase bill, or type one.</p>
      <input className="input-field font-mono uppercase" autoFocus maxLength={40} list="batch-options" value={value} onChange={(e) => setValue(e.target.value.toUpperCase())} placeholder="Batch number" data-testid="batch-input" />
      <datalist id="batch-options">
        {options.map((o) => <option key={o.batchNumber} value={o.batchNumber}>{`in ${o.received} · sold ${o.sold} · left ${o.balance}`}</option>)}
      </datalist>
      {options.length ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {options.map((o) => (
            <button key={o.batchNumber} type="button" onClick={() => setValue(o.batchNumber)}
              className={`rounded-lg px-2.5 py-1 text-xs ring-1 ${value === o.batchNumber ? 'bg-slate-900 text-white ring-slate-900' : 'bg-white text-slate-700 ring-slate-200 hover:bg-slate-50'}`}>
              <span className="font-mono font-semibold">{o.batchNumber}</span> <span className={value === o.batchNumber ? 'text-slate-300' : 'text-slate-400'}>· {o.balance} left</span>
            </button>
          ))}
        </div>
      ) : <p className="mt-2 text-xs text-slate-400">No batch of this product is registered on a purchase bill yet.</p>}
      {value.trim() && !known && <p className="mt-2 text-xs text-amber-700">Not on any purchase bill: it will show as “not registered”.</p>}
      {!value.trim() && line.batchNumber && <p className="mt-2 text-xs text-slate-500">Saving empty removes the batch from this line.</p>}
    </Modal>
  );
}

/** Batches matching the search: where they came from and how many are sold. */
function BatchSummary({ batches }) {
  if (!batches?.length) return null;
  return (
    <div className="mb-4 grid gap-3 md:grid-cols-2">
      {batches.map((b) => (
        <div key={`${b.productId}-${b.batchNumber}`} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm" data-testid="batch-summary">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">Batch</div>
              <div className="font-mono text-lg font-bold text-slate-900">{b.batchNumber}</div>
              <div className="truncate text-sm text-slate-600">{b.productName} <span className="text-slate-400">· {b.sku}</span></div>
            </div>
            {b.registered
              ? <span className="shrink-0 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-800 ring-1 ring-emerald-200">Registered</span>
              : <span className="shrink-0 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800">Not registered</span>}
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2 text-center text-sm">
            <div className="rounded-lg bg-slate-50 py-1.5"><div className="text-[10px] uppercase text-slate-400">Received</div><div className="font-semibold">{b.registered ? b.received : '—'}</div>{b.returned ? <div className="text-[10px] text-rose-600">−{b.returned} returned</div> : null}</div>
            <div className="rounded-lg bg-slate-50 py-1.5"><div className="text-[10px] uppercase text-slate-400">Sold</div><div className="font-semibold">{b.sold}</div></div>
            <div className="rounded-lg bg-slate-50 py-1.5"><div className="text-[10px] uppercase text-slate-400">Left</div><div className="font-semibold">{b.registered ? b.balance : '—'}</div></div>
          </div>
          {b.bills?.length ? (
            <ul className="mt-3 space-y-0.5 text-xs text-slate-600">
              {b.bills.map((x) => (
                <li key={x.billId}>Purchase {x.billNumber}{x.supplierInvoiceNumber ? ` (inv. ${x.supplierInvoiceNumber})` : ''} · {x.supplierName || 'Supplier'} · {ddmmyyyy(x.date)} · qty {x.quantity}</li>
              ))}
            </ul>
          ) : <p className="mt-3 text-xs text-slate-500">Only on sale bills; not received on any purchase bill.</p>}
        </div>
      ))}
    </div>
  );
}

export default function WarrantyCheckPage() {
  const { checkPermission, session } = useAuth();
  const canEditSerials = checkPermission('pos.sales.create');
  const isAdmin = ['owner_admin', 'firm_admin'].includes(session?.user?.roleSlug);
  const [editSaleId, setEditSaleId] = useState(null);
  const [q, setQ] = useState('');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(null);
  const [batchEdit, setBatchEdit] = useState(null);
  const input = useRef(null);
  // Warranty labels: size from Settings → Barcode labels (changeable here); shop name from the firm
  const [labelSize, setLabelSize] = useState('50x25');
  const [shop, setShop] = useState('');
  useEffect(() => {
    Promise.all([apiRequest('/api/settings').catch(() => []), apiRequest('/api/company').catch(() => null)]).then(([list, company]) => {
      const rows = Array.isArray(list) ? list : [];
      setLabelSize(labelSettingsFrom(rows).size);
      setShop(rows.find((x) => x.key === 'label.businessName')?.value || company?.businessName || company?.name || '');
    });
  }, []);
  const printLabels = (r) => {
    const units = warrantyUnits(r, { shop });
    if (!units.length) { setError('Nothing left to label on this invoice (all returned).'); return; }
    printHtml(warrantyLabelsHtml(units, { size: labelSize }));
  };

  const search = async (value = q) => {
    if (value.trim().length < 2) return;
    setBusy(true);
    setError('');
    try { setData(await apiRequest(`/api/warranty/check?q=${encodeURIComponent(value.trim())}`)); } catch (err) { setError(err.message); setData(null); } finally { setBusy(false); }
  };
  useEffect(() => { input.current?.focus(); }, []);
  // ?q=… (e.g. a batch clicked in the Batch Register) runs that search
  const params = useSearchParams();
  const linked = params.get('q');
  useEffect(() => {
    if (linked && linked.trim().length >= 2) { setQ(linked); search(linked); }
  }, [linked]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <RequirePermission permission="pos.sales.view" fallback={<Alert message="You do not have access to sales." />}>
      <PageHeader title="Warranty Check" description="Scan or type an invoice number, a product's serial number or a batch number to see its warranty and guarantee from the invoice date, and where the batch came from." />
      <form onSubmit={(e) => { e.preventDefault(); search(); }} className="mb-5 flex max-w-2xl gap-2">
        <input ref={input} className="input-field text-lg" placeholder="Invoice, serial or batch no." value={q} onChange={(e) => setQ(e.target.value)} />
        <button type="submit" className="btn-primary shrink-0" disabled={busy || q.trim().length < 2}>{busy ? 'Checking…' : 'Check'}</button>
      </form>
      <Alert message={error} />
      {data?.results.length ? (
        <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
          <span className="text-slate-500">Warranty label size</span>
          <select className="input-field max-w-xs" value={labelSize} onChange={(e) => setLabelSize(e.target.value)}>
            {LABEL_SIZES.map((x) => <option key={x.value} value={x.value}>{x.label}</option>)}
          </select>
          <span className="text-xs text-slate-400">Shop, branch, sale date, warranty end and a barcode of the serial (or invoice) that this page scans back.</span>
        </div>
      ) : null}

      <BatchSummary batches={data?.batches} />
      {data && !data.results.length && !data.batches?.length && <EmptyPanel title="Nothing found" description={`No invoice, serial or batch number matches “${data.query}”.`} />}
      {data && !data.results.length && data.batches?.length ? <p className="mb-4 text-sm text-slate-500">No sale bill carries this batch yet.</p> : null}
      <div className="space-y-4">
        {data?.results.map((r) => (
          <SectionCard key={r.saleId}
            title={<span>Invoice {r.invoiceNumber}{r.status === 'cancelled' ? <span className="ml-2 rounded-full bg-rose-100 px-2 py-0.5 text-xs text-rose-700">Cancelled</span> : null}</span>}
            action={(
              <div className="flex gap-2">
                {r.status !== 'cancelled' && <button type="button" className="btn-secondary !min-h-0 !py-1.5 text-xs" onClick={() => printLabels(r)}>🏷 Warranty labels</button>}
                {isAdmin && r.status === 'completed' && <button type="button" className="btn-secondary !min-h-0 !py-1.5 text-xs" onClick={() => setEditSaleId(r.saleId)}>✏ Edit bill</button>}
              </div>
            )}
            subtitle={`${new Date(r.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })} · ${r.customerName ? `${r.customerName}${r.customerPhone ? ` · ${r.customerPhone}` : ''}` : 'Walk-in customer'}${r.matchedSerial ? ` · serial ${r.matchedSerial}` : ''}${r.matchedBatch ? ` · batch ${r.matchedBatch}` : ''}`}
            noPadding>
            <div className="divide-y divide-slate-100">
              {r.lines.map((l) => {
                const hit = (r.matchedSerial && l.serials.includes(r.matchedSerial)) || (r.matchedBatch && l.batchNumber === r.matchedBatch);
                return (
                  <div key={l.itemId} className={`grid gap-3 px-4 py-3 sm:grid-cols-[1.4fr_1fr_1fr] ${hit ? 'bg-amber-50/60' : ''}`}>
                    <div className="min-w-0">
                      <div className="font-medium text-slate-900">{l.productName}</div>
                      <div className="text-xs text-slate-500">{l.sku} · Qty {l.quantity}{l.quantityReturned ? ` · ${l.quantityReturned} returned` : ''}</div>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5">
                        {l.batchNumber ? (
                          <span className={`rounded px-1.5 py-0.5 font-mono text-[11px] ${l.batchNumber === r.matchedBatch ? 'bg-amber-200 text-amber-900' : 'bg-indigo-50 text-indigo-700'}`}>Batch {l.batchNumber}</span>
                        ) : null}
                        <BatchOrigin batch={l.batchNumber ? l.batch : null} />
                        {canEditSerials && r.status !== 'cancelled' && (
                          <button type="button" className="text-xs font-medium text-brand-600 hover:underline" onClick={() => setBatchEdit({ result: r, line: l })} data-testid={`set-batch-${l.itemId}`}>
                            {l.batchNumber ? 'Change batch' : '+ Batch no.'}
                          </button>
                        )}
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-1">
                        {l.serials.map((s) => <span key={s} className={`rounded px-1.5 py-0.5 font-mono text-[11px] ${s === r.matchedSerial ? 'bg-amber-200 text-amber-900' : 'bg-slate-100 text-slate-600'}`}>{s}</span>)}
                        {canEditSerials && r.status !== 'cancelled' && (
                          <button type="button" className="text-xs font-medium text-brand-600 hover:underline" onClick={() => setEditing({ result: r, line: l })}>
                            {l.serials.length ? 'Edit serials' : '+ Add serial no.'}
                          </button>
                        )}
                      </div>
                    </div>
                    <PeriodStatus label="Warranty" s={l.warranty} />
                    <PeriodStatus label="Guarantee" s={l.guarantee} />
                  </div>
                );
              })}
            </div>
          </SectionCard>
        ))}
      </div>
      {editSaleId && <EditInvoiceDialog saleId={editSaleId} onClose={() => setEditSaleId(null)} onSaved={() => { setEditSaleId(null); search(); }} />}
      {batchEdit && <BatchModal result={batchEdit.result} line={batchEdit.line} onClose={() => setBatchEdit(null)} onSaved={() => { setBatchEdit(null); search(); }} />}
      {editing && <SerialsModal result={editing.result} line={editing.line} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); search(); }} />}
    </RequirePermission>
  );
}
