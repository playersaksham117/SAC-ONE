'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiRequest } from '../../lib/api';
import { useAuth } from '../../lib/auth-context';
import { printHtml } from '../../lib/bill-document';
import PageHeader, { Alert, LoadingState, Modal } from '../ui';

const money = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const day = (d) => (d ? new Date(`${String(d).slice(0, 10)}T00:00:00`).toLocaleDateString('en-GB') : '');
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const PURPOSES = [['approval', 'On approval'], ['job_work', 'Job work'], ['sample', 'Sample'], ['other', 'Other (not a sale)']];
const STATUS = {
  open: ['Out', 'bg-amber-50 text-amber-700'],
  returned: ['Returned', 'bg-emerald-50 text-emerald-700'],
  invoiced: ['Invoiced', 'bg-blue-50 text-blue-700'],
  kept: ['Kept / written off', 'bg-slate-100 text-slate-600'],
  cancelled: ['Cancelled', 'bg-slate-100 text-slate-400'],
};
const EMPTY = { purpose: 'approval', customerId: '', partyName: '', partyAddress: '', partyGstin: '', partyPhone: '', warehouseId: '', challanDate: '', vehicleNumber: '', notes: '' };

/** Printable delivery challan: goods out without a sale, no GST. */
function challanHtml(c, company) {
  const firm = company?.businessName || company?.name || 'SACONE';
  const firmAddr = [company?.addressLine1, company?.addressLine2, company?.city, company?.state, company?.postalCode].filter(Boolean).join(', ');
  const rows = c.items.map((i, n) => `<tr><td class="c">${n + 1}</td><td><b>${esc(i.productName)}</b>${i.description ? `<div class="m">${esc(i.description)}</div>` : ''}</td><td>${esc(i.hsnCode || '')}</td><td class="r">${i.quantity} ${esc(i.unit || '')}</td><td class="r">${money(i.rate)}</td><td class="r">${money(i.value)}</td></tr>`).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(c.challanNumber)}</title><style>
    @page{size:A4 portrait;margin:10mm} body{font-family:Arial,sans-serif;font-size:12px;color:#111;text-transform:uppercase}
    h1{font-size:20px;margin:0} .c{text-align:center} .r{text-align:right} .m{font-size:10px;color:#444;text-transform:none}
    table{width:100%;border-collapse:collapse;margin-top:8px} th,td{border:1px solid #333;padding:5px;vertical-align:top} th{background:#eee}
    .box{border:1px solid #333;padding:8px;margin-top:8px} .row{display:flex;gap:8px} .row>div{flex:1}
    .note{margin-top:8px;font-size:11px;border:1px dashed #555;padding:6px}
  </style></head><body>
    <div class="c"><h1>${esc(firm)}</h1><div>${esc(firmAddr)}</div>${company?.gstNumber ? `<div>GSTIN ${esc(company.gstNumber)}</div>` : ''}<h2 style="margin:8px 0 0">DELIVERY CHALLAN</h2><div>${esc(c.purposeLabel)}</div></div>
    <div class="row">
      <div class="box"><b>To:</b> ${esc(c.partyName)}<br>${esc(c.partyAddress || '')}${c.partyPhone ? `<br>Mobile: ${esc(c.partyPhone)}` : ''}${c.partyGstin ? `<br>GSTIN: ${esc(c.partyGstin)}` : ''}</div>
      <div class="box">Challan No.: <b>${esc(c.challanNumber)}</b><br>Date: ${esc(day(c.challanDate))}<br>From: ${esc(c.warehouseName || '')}${c.vehicleNumber ? `<br>Vehicle No.: ${esc(c.vehicleNumber)}` : ''}</div>
    </div>
    <table><thead><tr><th>Sr</th><th>Description of goods</th><th>HSN</th><th>Qty</th><th>Rate</th><th>Value</th></tr></thead>
      <tbody>${rows}<tr><td></td><td><b>Total</b></td><td></td><td class="r"><b>${c.totalQuantity}</b></td><td></td><td class="r"><b>${money(c.totalValue)}</b></td></tr></tbody></table>
    <div class="note">Goods sent ${esc(c.purposeLabel.toLowerCase())}. This is not a sale invoice: no GST is charged on this challan. Value shown for reference only.${c.notes ? `<br>Note: ${esc(c.notes)}` : ''}</div>
    <div class="row" style="margin-top:40px"><div>Receiver's signature</div><div class="r">For ${esc(firm)}<br><br><br>Authorised signatory</div></div>
  </body></html>`;
}

/**
 * Delivery challans: goods out without a sale (on approval, job work, sample). Stock goes out on
 * issue; close as returned (stock back), invoiced (billed on SAC-POS), or kept (sample / written off).
 */
export default function DeliveryChallans() {
  const { checkPermission } = useAuth();
  const canCreate = checkPermission('pos.sales.create');
  const [data, setData] = useState({ items: [], total: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [lines, setLines] = useState([{ productId: '', quantity: 1, rate: '', description: '' }]);
  const [products, setProducts] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const q = new URLSearchParams({ limit: '300', ...(status ? { status } : {}), ...(search.trim() ? { search: search.trim() } : {}) });
      setData(await apiRequest(`/api/delivery-challans?${q}`));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [status, search]);

  useEffect(() => { load(); }, [status]); // eslint-disable-line react-hooks/exhaustive-deps

  const openNew = async () => {
    setError('');
    setForm(EMPTY);
    setLines([{ productId: '', quantity: 1, rate: '', description: '' }]);
    setModal(true);
    if (!products.length) {
      const [p, c, w] = await Promise.all([
        apiRequest('/api/products?limit=1000&isActive=1').catch(() => ({ items: [] })),
        apiRequest('/api/customers?limit=1000').catch(() => ({ items: [] })),
        apiRequest('/api/warehouses').catch(() => []),
      ]);
      setProducts((p.items || []).filter((x) => x.itemType !== 'service'));
      setCustomers((c.items || []).filter((x) => !x.isWalkIn));
      const wl = Array.isArray(w) ? w : w.items || [];
      setWarehouses(wl);
      setForm((f) => ({ ...f, warehouseId: f.warehouseId || wl.find((x) => x.isDefault)?.id || wl[0]?.id || '' }));
    }
  };

  const pickCustomer = (id) => {
    const c = customers.find((x) => x.id === id);
    setForm((f) => ({
      ...f,
      customerId: id,
      partyName: c?.name || '',
      partyAddress: c ? [c.address, c.city, c.state].filter(Boolean).join(', ') : '',
      partyGstin: c?.gstNumber || '',
      partyPhone: c?.phone || '',
    }));
  };

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const made = await apiRequest('/api/delivery-challans', {
        method: 'POST',
        body: JSON.stringify({
          ...form,
          customerId: form.customerId || undefined,
          items: lines.filter((l) => l.productId).map((l) => ({ productId: l.productId, quantity: Number(l.quantity), rate: l.rate === '' ? undefined : Number(l.rate), description: l.description })),
        }),
      });
      setModal(false);
      setMessage(`Delivery challan ${made.challanNumber} made — stock out ${made.totalQuantity}.`);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const close = async (c, as) => {
    let invoiceNumber;
    const ask = {
      returned: `${c.challanNumber}: the goods came back? Stock goes back into ${c.warehouseName || 'the warehouse'}.`,
      kept: `${c.challanNumber}: the goods stay out (sample given / written off)? Stock stays reduced.`,
      cancelled: `Cancel ${c.challanNumber}? Stock goes back as if it never left.`,
    };
    if (as === 'invoiced') {
      invoiceNumber = window.prompt(`${c.challanNumber}: SAC-POS invoice number these goods were billed on (the bill takes the stock, so the challan's stock comes back here):`);
      if (!invoiceNumber) return;
    } else if (!window.confirm(ask[as])) return;
    setError('');
    try {
      const done = await apiRequest(`/api/delivery-challans/${c.id}/close`, { method: 'POST', body: JSON.stringify({ as, invoiceNumber }) });
      setMessage(`${done.challanNumber}: ${STATUS[done.status]?.[0] || done.status}.`);
      await load();
    } catch (err) {
      setError(err.message);
    }
  };

  const print = async (c) => {
    try {
      const [full, company] = await Promise.all([apiRequest(`/api/delivery-challans/${c.id}`), apiRequest('/api/company').catch(() => null)]);
      printHtml(challanHtml(full, company));
    } catch (err) {
      setError(err.message);
    }
  };

  const setLine = (i, patch) => setLines((ls) => ls.map((l, k) => (k === i ? { ...l, ...patch } : l)));

  return (
    <>
      <PageHeader
        title="Delivery Challans"
        description="Goods sent out without a sale — on approval, job work or as samples. No GST, not a sale; stock goes out and comes back when closed."
        actions={canCreate ? <button type="button" className="btn-primary" onClick={openNew}>+ New challan</button> : null}
      />
      <Alert type="error" message={error} />
      <Alert type="success" message={message} />
      <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
        {[['', 'All'], ['open', 'Out (open)'], ['returned', 'Returned'], ['invoiced', 'Invoiced'], ['kept', 'Kept'], ['cancelled', 'Cancelled']].map(([v, l]) => (
          <button key={v} type="button" className={`rounded-full px-3 py-1 ${status === v ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700'}`} onClick={() => setStatus(v)}>{l}</button>
        ))}
        <input className="input-field max-w-xs" placeholder="Challan no., party or invoice no." value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && load()} />
        <button type="button" className="btn-secondary" onClick={load}>Search</button>
      </div>
      {loading ? <LoadingState /> : (
        <div className="card overflow-x-auto p-0">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500"><tr>
              <th className="px-4 py-3">Challan</th><th className="px-4 py-3">Date</th><th className="px-4 py-3">To</th><th className="px-4 py-3">Purpose</th>
              <th className="px-4 py-3 text-right">Qty</th><th className="px-4 py-3 text-right">Value</th><th className="px-4 py-3">Status</th><th className="px-4 py-3" />
            </tr></thead>
            <tbody className="divide-y divide-slate-100">
              {data.items.map((c) => (
                <tr key={c.id}>
                  <td className="whitespace-nowrap px-4 py-3 font-mono text-xs font-semibold">{c.challanNumber}</td>
                  <td className="px-4 py-3 text-slate-500">{day(c.challanDate)}</td>
                  <td className="px-4 py-3">{c.partyName}{c.partyAddress && <div className="max-w-xs text-xs text-slate-500">{c.partyAddress}</div>}</td>
                  <td className="px-4 py-3">{c.purposeLabel}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{c.totalQuantity}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{money(c.totalValue)}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS[c.status]?.[1] || ''}`}>{STATUS[c.status]?.[0] || c.status}</span>
                    {c.invoiceNumber && <div className="font-mono text-[11px] text-slate-500">{c.invoiceNumber}</div>}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right">
                    <button type="button" className="btn-secondary !min-h-0 mr-1 !px-3 !py-1.5 text-xs" onClick={() => print(c)}>Print</button>
                    {canCreate && c.status === 'open' && (
                      <>
                        <button type="button" className="btn-secondary !min-h-0 mr-1 !px-3 !py-1.5 text-xs" onClick={() => close(c, 'returned')}>Returned</button>
                        <button type="button" className="btn-secondary !min-h-0 mr-1 !px-3 !py-1.5 text-xs" onClick={() => close(c, 'invoiced')}>Invoiced</button>
                        <button type="button" className="btn-secondary !min-h-0 mr-1 !px-3 !py-1.5 text-xs" onClick={() => close(c, 'kept')}>Kept</button>
                        <button type="button" className="btn-secondary !min-h-0 !px-3 !py-1.5 text-xs !text-red-600" onClick={() => close(c, 'cancelled')}>Cancel</button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
              {!data.items.length && <tr><td colSpan={8} className="px-4 py-8 text-center text-slate-400">No delivery challans</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={modal} title="New delivery challan" onClose={() => setModal(false)} size="xl"
        footer={<><button type="button" className="btn-secondary" onClick={() => setModal(false)}>Cancel</button><button type="submit" form="challan-form" className="btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Make challan · stock out'}</button></>}>
        <form id="challan-form" onSubmit={save} className="space-y-4">
          <Alert type="error" message={error} />
          <div className="grid gap-3 md:grid-cols-3">
            <label className="text-sm"><span className="label">Why the goods go out *</span>
              <select className="input-field" value={form.purpose} onChange={(e) => setForm({ ...form, purpose: e.target.value })}>{PURPOSES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
            </label>
            <label className="text-sm"><span className="label">From warehouse *</span>
              <select className="input-field" required value={form.warehouseId} onChange={(e) => setForm({ ...form, warehouseId: e.target.value })}>{warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}</select>
            </label>
            <label className="text-sm"><span className="label">Date</span>
              <input type="date" className="input-field" value={form.challanDate} onChange={(e) => setForm({ ...form, challanDate: e.target.value })} />
            </label>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <label className="text-sm"><span className="label">Customer</span>
              <select className="input-field" value={form.customerId} onChange={(e) => pickCustomer(e.target.value)}>
                <option value="">— Someone else (type below) —</option>
                {customers.map((c) => <option key={c.id} value={c.id}>{c.name}{c.phone ? ` · ${c.phone}` : ''}</option>)}
              </select>
            </label>
            <label className="text-sm"><span className="label">Name *</span><input className="input-field" required value={form.partyName} onChange={(e) => setForm({ ...form, partyName: e.target.value })} /></label>
            <label className="text-sm md:col-span-2"><span className="label">Address</span><input className="input-field" value={form.partyAddress} onChange={(e) => setForm({ ...form, partyAddress: e.target.value })} /></label>
            <label className="text-sm"><span className="label">Mobile</span><input className="input-field" value={form.partyPhone} onChange={(e) => setForm({ ...form, partyPhone: e.target.value })} /></label>
            <label className="text-sm"><span className="label">GSTIN</span><input className="input-field" value={form.partyGstin} onChange={(e) => setForm({ ...form, partyGstin: e.target.value })} /></label>
          </div>
          <div>
            <div className="label">Items (rate is for the value on the challan only; blank = selling price)</div>
            {lines.map((l, i) => (
              <div key={i} className="mb-2 grid gap-2 md:grid-cols-[2fr_90px_110px_2fr_auto]">
                <select className="input-field" required={i === 0} value={l.productId} onChange={(e) => setLine(i, { productId: e.target.value })}>
                  <option value="">Product…</option>
                  {products.map((p) => <option key={p.id} value={p.id}>{p.sku} — {p.name}</option>)}
                </select>
                <input className="input-field" type="number" min="0.001" step="any" placeholder="Qty" value={l.quantity} onChange={(e) => setLine(i, { quantity: e.target.value })} />
                <input className="input-field" type="number" min="0" step="0.01" placeholder="Rate" value={l.rate} onChange={(e) => setLine(i, { rate: e.target.value })} />
                <input className="input-field" placeholder="Description (optional)" value={l.description} onChange={(e) => setLine(i, { description: e.target.value })} />
                <button type="button" className="btn-secondary !px-3" onClick={() => setLines((ls) => (ls.length > 1 ? ls.filter((_, k) => k !== i) : ls))}>×</button>
              </div>
            ))}
            <button type="button" className="btn-secondary text-xs" onClick={() => setLines((ls) => [...ls, { productId: '', quantity: 1, rate: '', description: '' }])}>+ Add item</button>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <label className="text-sm"><span className="label">Vehicle no.</span><input className="input-field" value={form.vehicleNumber} onChange={(e) => setForm({ ...form, vehicleNumber: e.target.value })} /></label>
            <label className="text-sm"><span className="label">Note</span><input className="input-field" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></label>
          </div>
          <p className="text-xs text-slate-500">Not a sale and no GST. Stock leaves the warehouse now; close the challan when the goods come back, are billed on SAC-POS, or stay out as a sample.</p>
        </form>
      </Modal>
    </>
  );
}
