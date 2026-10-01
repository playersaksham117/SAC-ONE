'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { apiRequest, getApiBase, getToken } from '../../lib/api';
import { Alert, Modal } from '../ui';
import { openWhatsAppShare, openMailtoFallback } from '../../lib/document-share';


function money(n) {
  return `₹${Number(n || 0).toFixed(2)}`;
}

function buildSnapshot(customer, overrides = {}) {
  if (!customer && !overrides.name) return {};
  return {
    name: overrides.name ?? customer?.name ?? '',
    businessName: overrides.businessName ?? customer?.businessName ?? customer?.name ?? '',
    contactPerson: overrides.contactPerson ?? customer?.contactPerson ?? '',
    phone: overrides.phone ?? customer?.phone ?? '',
    email: overrides.email ?? customer?.email ?? '',
    gstNumber: overrides.gstNumber ?? customer?.gstNumber ?? '',
    billingAddress: overrides.billingAddress ?? customer?.address ?? '',
    billingCity: overrides.billingCity ?? customer?.city ?? '',
    billingState: overrides.billingState ?? customer?.state ?? '',
    billingPostal: overrides.billingPostal ?? customer?.postalCode ?? '',
    shippingAddress: overrides.shippingAddress ?? customer?.shippingAddress ?? overrides.billingAddress ?? customer?.address ?? '',
    shippingCity: overrides.shippingCity ?? customer?.shippingCity ?? overrides.billingCity ?? customer?.city ?? '',
    shippingState: overrides.shippingState ?? customer?.shippingState ?? overrides.billingState ?? customer?.state ?? '',
    shippingPostal: overrides.shippingPostal ?? customer?.shippingPostal ?? overrides.billingPostal ?? customer?.postalCode ?? '',
  };
}

async function fetchDocumentHtml(quotationId) {
  const res = await fetch(`${getApiBase()}/api/pos/quotations/${quotationId}/document`, {
    headers: { Authorization: `Bearer ${getToken()}` },
  });
  if (!res.ok) throw new Error('Failed to load document');
  return res.text();
}

export default function QuotationPanel({ bootstrap, checkPermission, onMessage, onError }) {
  const searchRef = useRef(null);
  const canCreate = checkPermission('pos.quotations.create');
  const canEdit = checkPermission('pos.quotations.edit');
  const canPrint = checkPermission('pos.quotations.approve');
  const canPdf = checkPermission('pos.quotations.approve');
  const canWhatsApp = checkPermission('pos.quotations.approve');
  const canEmail = checkPermission('pos.quotations.approve');
  const canConvert = checkPermission('pos.quotations.approve');
  const canCancel = checkPermission('pos.quotations.delete');

  const [mode, setMode] = useState('list');
  const [quotes, setQuotes] = useState([]);
  const [activeQuote, setActiveQuote] = useState(null);
  const [warehouseId, setWarehouseId] = useState('');
  const [customer, setCustomer] = useState(null);
  const [cart, setCart] = useState([]);
  const [invoiceDiscount, setInvoiceDiscount] = useState(0);
  const [notes, setNotes] = useState('');
  const [terms, setTerms] = useState('Prices valid until validity date. Goods once sold will not be taken back.');
  const [validUntil, setValidUntil] = useState('');
  const [snapOverrides, setSnapOverrides] = useState({});
  const [search, setSearch] = useState('');
  const [results, setResults] = useState([]);
  const [totals, setTotals] = useState(null);
  const [saving, setSaving] = useState(false);
  const [customerModal, setCustomerModal] = useState(false);
  const [customerList, setCustomerList] = useState([]);
  const [convertModal, setConvertModal] = useState(false);
  const [payMode, setPayMode] = useState('cash');

  useEffect(() => {
    setWarehouseId(bootstrap?.defaultWarehouse?.id || bootstrap?.warehouses?.[0]?.id || '');
    setCustomer(bootstrap?.walkInCustomer || null);
    const d = new Date();
    d.setDate(d.getDate() + 15);
    setValidUntil(d.toISOString().slice(0, 10));
  }, [bootstrap]);

  const loadQuotes = useCallback(async () => {
    const data = await apiRequest('/api/pos/quotations?limit=50');
    setQuotes(data.items || []);
  }, []);

  useEffect(() => {
    loadQuotes().catch((e) => onError?.(e.message));
  }, [loadQuotes, onError]);

  useEffect(() => {
    if (!cart.length) { setTotals(null); return; }
    const t = setTimeout(() => {
      apiRequest('/api/pos/quotations/preview', {
        method: 'POST',
        body: JSON.stringify({
          customerId: customer?.id,
          invoiceDiscount: Number(invoiceDiscount) || 0,
          customerSnapshot: buildSnapshot(customer, snapOverrides),
          items: cart.map((c) => ({
            productId: c.productId,
            quantity: c.quantity,
            unitPrice: c.unitPrice,
            discountAmount: c.discountAmount,
            discountPercent: c.discountPercent,
            gstPercentage: c.gstPercentage,
          })),
        }),
      }).then(setTotals).catch((e) => onError?.(e.message));
    }, 200);
    return () => clearTimeout(t);
  }, [cart, invoiceDiscount, customer?.id, snapOverrides, onError]);

  const addProduct = (product) => {
    setCart((prev) => {
      const ex = prev.find((c) => c.productId === product.id);
      if (ex) return prev.map((c) => c.productId === product.id ? { ...c, quantity: Number(c.quantity) + 1 } : c);
      return [...prev, {
        productId: product.id,
        productName: product.name,
        sku: product.sku,
        hsnCode: product.hsnCode,
        unitAbbreviation: product.unitAbbreviation,
        quantity: 1,
        unitPrice: product.sellingPrice,
        discountAmount: 0,
        discountPercent: 0,
        gstPercentage: product.gstPercentage,
      }];
    });
    setSearch('');
    setResults([]);
  };

  const runSearch = async (value) => {
    setSearch(value);
    if (!value.trim()) { setResults([]); return; }
    const data = await apiRequest(`/api/pos/products?q=${encodeURIComponent(value.trim())}`);
    if (data.match === 'barcode' || data.match === 'sku') {
      if (data.items?.[0]) { addProduct(data.items[0]); return; }
    }
    setResults(data.items || []);
  };

  const resetForm = () => {
    setCart([]);
    setInvoiceDiscount(0);
    setNotes('');
    setSnapOverrides({});
    setCustomer(bootstrap?.walkInCustomer || null);
    setActiveQuote(null);
    setMode('list');
  };

  const saveQuotation = async (asSent = false) => {
    if (!cart.length) return;
    setSaving(true);
    try {
      const payload = {
        warehouseId,
        customerId: customer?.id,
        invoiceDiscount: Number(invoiceDiscount) || 0,
        notes,
        termsConditions: terms,
        validUntil,
        status: asSent ? 'sent' : 'draft',
        customerSnapshot: buildSnapshot(customer, snapOverrides),
        items: cart.map((c) => ({
          productId: c.productId,
          quantity: c.quantity,
          unitPrice: c.unitPrice,
          discountAmount: c.discountAmount,
          discountPercent: c.discountPercent,
          gstPercentage: c.gstPercentage,
        })),
      };
      const quote = activeQuote
        ? await apiRequest(`/api/pos/quotations/${activeQuote.id}`, { method: 'PUT', body: JSON.stringify(payload) })
        : await apiRequest('/api/pos/quotations', { method: 'POST', body: JSON.stringify(payload) });
      onMessage?.(`Quotation ${quote.quotationNumber} ${asSent ? 'sent' : 'saved'}`);
      await loadQuotes();
      setActiveQuote(quote);
      setMode('view');
    } catch (e) {
      onError?.(e.message);
    } finally {
      setSaving(false);
    }
  };

  const openQuote = async (id) => {
    const q = await apiRequest(`/api/pos/quotations/${id}`);
    setActiveQuote(q);
    setMode('view');
  };

  const editQuote = (q) => {
    setActiveQuote(q);
    setCart(q.items.map((i) => ({ ...i, productId: i.productId })));
    setInvoiceDiscount(q.invoiceDiscount);
    setNotes(q.notes || '');
    setTerms(q.termsConditions || '');
    setValidUntil(q.validUntil || '');
    setCustomer(q.customerId ? { id: q.customerId, name: q.customerSnapshot?.name } : bootstrap?.walkInCustomer);
    setSnapOverrides(q.customerSnapshot || {});
    setMode('edit');
  };

  const printDoc = async (id) => {
    if (!canPrint) return;
    try {
      const html = await fetchDocumentHtml(id);
      const win = window.open('', '_blank');
      win.document.write(html);
      win.document.close();
      win.onload = () => win.print();
      await apiRequest(`/api/pos/quotations/${id}/print`, { method: 'POST' });
    } catch (e) { onError?.(e.message); }
  };

  const downloadPdf = async (q) => {
    if (!canPdf) return;
    try {
      await apiRequest(`/api/pos/quotations/${q.id}/pdf`, { method: 'POST' });
      const html = await fetchDocumentHtml(q.id);
      const win = window.open('', '_blank');
      win.document.write(html);
      win.document.close();
      win.document.title = `${q.quotationNumber}.pdf`;
      setTimeout(() => win.print(), 300);
      onMessage?.('Use Print → Save as PDF in the dialog');
    } catch (e) { onError?.(e.message); }
  };

  const shareWhatsApp = async (q) => {
    if (!canWhatsApp) return;
    const data = await apiRequest(`/api/pos/quotations/${q.id}/whatsapp`);
    openWhatsAppShare(data);
    onMessage?.('WhatsApp opened — attach PDF manually if needed');
  };

  const sendEmail = async (q) => {
    if (!canEmail) return;
    setSaving(true);
    try {
      const res = await apiRequest(`/api/pos/quotations/${q.id}/email`, { method: 'POST', body: JSON.stringify({}) });
      if (res.mode === 'mailto_fallback') {
        openMailtoFallback(res);
        onMessage?.(res.message);
      } else {
        onMessage?.(`Email sent to ${q.customerSnapshot?.email}`);
      }
      await openQuote(q.id);
    } catch (e) {
      onError?.(e.message);
    } finally {
      setSaving(false);
    }
  };

  const convertToSale = async () => {
    if (!activeQuote) return;
    const total = activeQuote.grandTotal;
    setSaving(true);
    try {
      const payments = payMode === 'credit'
        ? [{ method: 'credit', amount: total }]
        : [{ method: payMode, amount: total }];
      const result = await apiRequest(`/api/pos/quotations/${activeQuote.id}/convert`, {
        method: 'POST',
        body: JSON.stringify({ warehouseId, payments, refreshPrices: false }),
      });
      onMessage?.(`Converted to invoice ${result.sale.invoiceNumber}`);
      setConvertModal(false);
      await loadQuotes();
      setActiveQuote(result.quotation);
      setMode('view');
    } catch (e) {
      onError?.(e.message);
    } finally {
      setSaving(false);
    }
  };

  const snap = useMemo(
    () => activeQuote?.customerSnapshot || buildSnapshot(customer, snapOverrides),
    [activeQuote, customer, snapOverrides],
  );

  const renderCustomerBlock = () => (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-semibold uppercase text-slate-500">Customer Details</span>
        <button type="button" className="text-xs text-blue-600" onClick={() => { setCustomerModal(true); apiRequest('/api/customers/lookup?limit=50').then((d) => setCustomerList(d.items || [])); }}>
          Change
        </button>
      </div>
      <div className="font-semibold">{snap.businessName || snap.name || 'Walk-in'}</div>
      {snap.contactPerson && <div className="text-slate-600">Contact: {snap.contactPerson}</div>}
      {snap.billingAddress && <div className="text-slate-600">{snap.billingAddress}, {snap.billingCity} {snap.billingState} {snap.billingPostal}</div>}
      {snap.gstNumber && <div className="text-slate-600">GSTIN: {snap.gstNumber}</div>}
      {snap.phone && <div className="text-slate-600">Mobile: {snap.phone}</div>}
      {(mode === 'create' || mode === 'edit') && (
        <details className="mt-2">
          <summary className="cursor-pointer text-xs text-blue-600">Edit address for this document only</summary>
          <div className="mt-2 grid gap-2">
            <input className="input-field" placeholder="Billing address" value={snapOverrides.billingAddress ?? snap.billingAddress ?? ''} onChange={(e) => setSnapOverrides((p) => ({ ...p, billingAddress: e.target.value }))} />
            <input className="input-field" placeholder="Shipping address (if different)" value={snapOverrides.shippingAddress ?? snap.shippingAddress ?? ''} onChange={(e) => setSnapOverrides((p) => ({ ...p, shippingAddress: e.target.value }))} />
          </div>
        </details>
      )}
    </div>
  );

  if (mode === 'list') {
    return (
      <div className="space-y-4">
        <div className="flex flex-wrap gap-2">
          {canCreate && (
            <button type="button" className="btn-primary" onClick={() => { setMode('create'); setActiveQuote(null); setCart([]); }}>
              + New Quotation
            </button>
          )}
        </div>
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-3 py-2">Number</th>
                <th className="px-3 py-2">Customer</th>
                <th className="px-3 py-2">Date</th>
                <th className="px-3 py-2">Total</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {!quotes.length && (
                <tr><td colSpan={6} className="px-3 py-8 text-center text-slate-400">No quotations yet</td></tr>
              )}
              {quotes.map((q) => (
                <tr key={q.id} className="border-t border-slate-100">
                  <td className="px-3 py-2 font-mono text-xs">{q.quotationNumber}</td>
                  <td className="px-3 py-2">{q.customerSnapshot?.businessName || q.customerSnapshot?.name || '—'}</td>
                  <td className="px-3 py-2">{new Date(q.quotationDate).toLocaleDateString('en-IN')}</td>
                  <td className="px-3 py-2">{money(q.grandTotal)}</td>
                  <td className="px-3 py-2 capitalize">{q.status.replace(/_/g, ' ')}</td>
                  <td className="px-3 py-2">
                    <button type="button" className="text-xs text-blue-600" onClick={() => openQuote(q.id)}>Open</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  if (mode === 'view' && activeQuote) {
    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className="btn-secondary" onClick={resetForm}>← Back</button>
          <span className="font-mono font-semibold">{activeQuote.quotationNumber}</span>
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs capitalize">{activeQuote.status}</span>
          <div className="ml-auto flex flex-wrap gap-2">
            {canPrint && <button type="button" className="btn-secondary text-xs" onClick={() => printDoc(activeQuote.id)}>Print</button>}
            {canPdf && <button type="button" className="btn-secondary text-xs" onClick={() => downloadPdf(activeQuote)}>PDF</button>}
            {canWhatsApp && <button type="button" className="btn-secondary text-xs" onClick={() => shareWhatsApp(activeQuote)}>WhatsApp</button>}
            {canEmail && <button type="button" className="btn-secondary text-xs" onClick={() => sendEmail(activeQuote)}>Email</button>}
            {canEdit && ['draft', 'sent'].includes(activeQuote.status) && (
              <button type="button" className="btn-secondary text-xs" onClick={() => editQuote(activeQuote)}>Edit</button>
            )}
            {canConvert && ['draft', 'sent', 'accepted'].includes(activeQuote.status) && (
              <button type="button" className="btn-primary text-xs" onClick={() => setConvertModal(true)}>Convert to Sale</button>
            )}
          </div>
        </div>
        {renderCustomerBlock()}
        <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm">
          <div className="mb-2 flex justify-between"><span>Grand Total</span><strong>{money(activeQuote.grandTotal)}</strong></div>
          <div className="text-xs text-slate-500">Valid until: {activeQuote.validUntil || '—'}</div>
          {activeQuote.convertedInvoiceNumber && (
            <div className="mt-2 text-emerald-700">Converted to invoice: {activeQuote.convertedInvoiceNumber}</div>
          )}
          {(activeQuote.shareHistory || []).length > 0 && (
            <div className="mt-3 border-t pt-2">
              <div className="text-xs font-semibold uppercase text-slate-400">Share history</div>
              <ul className="mt-1 space-y-1 text-xs text-slate-600">
                {activeQuote.shareHistory.map((h) => (
                  <li key={h.id}>{h.action} · {new Date(h.createdAt).toLocaleString()}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
        <Modal open={convertModal} title="Convert to Sale" onClose={() => setConvertModal(false)}>
          <p className="mb-3 text-sm text-slate-600">Stock will be reduced and a new invoice number will be generated.</p>
          <select className="input-field mb-3" value={payMode} onChange={(e) => setPayMode(e.target.value)}>
            <option value="cash">Cash</option>
            <option value="upi">UPI</option>
            <option value="bank">Bank</option>
            <option value="credit">Credit</option>
          </select>
          <button type="button" className="btn-primary w-full" disabled={saving} onClick={convertToSale}>
            Confirm conversion · {money(activeQuote.grandTotal)}
          </button>
        </Modal>
      </div>
    );
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
      <div className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn-secondary" onClick={resetForm}>← Back</button>
          <select className="input-field max-w-xs" value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)}>
            {(bootstrap?.warehouses || []).map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
        </div>
        {renderCustomerBlock()}
        <input
          ref={searchRef}
          className="input-field text-lg"
          placeholder="Search / SKU / barcode…"
          value={search}
          onChange={(e) => runSearch(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && results[0]) { e.preventDefault(); addProduct(results[0]); } }}
        />
        {results.length > 0 && (
          <ul className="max-h-48 overflow-auto rounded-lg border border-slate-200 bg-white">
            {results.map((p) => (
              <li key={p.id}>
                <button type="button" className="flex w-full justify-between px-3 py-2 text-sm hover:bg-slate-50" onClick={() => addProduct(p)}>
                  <span>{p.name} <span className="font-mono text-xs text-slate-400">{p.sku}</span></span>
                  <span>{money(p.sellingPrice)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-3 py-2 text-left">Item</th>
                <th className="px-3 py-2">Qty</th>
                <th className="px-3 py-2">Rate</th>
                <th className="px-3 py-2">Disc%</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {cart.map((line) => (
                <tr key={line.productId} className="border-t border-slate-100">
                  <td className="px-3 py-2">{line.productName}</td>
                  <td className="px-3 py-2">
                    <input className="input-field w-20" type="number" min="0.001" value={line.quantity}
                      onChange={(e) => setCart((p) => p.map((c) => c.productId === line.productId ? { ...c, quantity: Number(e.target.value) } : c))} />
                  </td>
                  <td className="px-3 py-2">
                    <input className="input-field w-24" type="number" min="0" value={line.unitPrice}
                      onChange={(e) => setCart((p) => p.map((c) => c.productId === line.productId ? { ...c, unitPrice: Number(e.target.value) } : c))} />
                  </td>
                  <td className="px-3 py-2">
                    <input className="input-field w-16" type="number" min="0" max="100" value={line.discountPercent}
                      onChange={(e) => setCart((p) => p.map((c) => c.productId === line.productId ? { ...c, discountPercent: Number(e.target.value), discountAmount: 0 } : c))} />
                  </td>
                  <td className="px-3 py-2">
                    <button type="button" className="text-xs text-red-600" onClick={() => setCart((p) => p.filter((c) => c.productId !== line.productId))}>×</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h3 className="font-semibold">Quotation summary</h3>
        <div className="space-y-1 text-sm">
          <div className="flex justify-between"><span>Subtotal</span><span>{money(totals?.subtotal)}</span></div>
          <div className="flex justify-between"><span>GST</span><span>{money(totals?.gstAmount)}</span></div>
          <div className="flex justify-between border-t pt-2 text-base font-bold"><span>Total</span><span>{money(totals?.grandTotal)}</span></div>
        </div>
        <label className="block text-sm">Invoice discount
          <input className="input-field mt-1" type="number" min="0" value={invoiceDiscount} onChange={(e) => setInvoiceDiscount(e.target.value)} />
        </label>
        <label className="block text-sm">Valid until
          <input className="input-field mt-1" type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} />
        </label>
        <textarea className="input-field" rows={2} placeholder="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
        <textarea className="input-field" rows={3} placeholder="Terms & conditions" value={terms} onChange={(e) => setTerms(e.target.value)} />
        {canCreate && (
          <div className="grid grid-cols-2 gap-2">
            <button type="button" className="btn-secondary" disabled={!cart.length || saving} onClick={() => saveQuotation(false)}>Save Draft</button>
            <button type="button" className="btn-primary" disabled={!cart.length || saving} onClick={() => saveQuotation(true)}>Save & Mark Sent</button>
          </div>
        )}
      </div>
      <Modal open={customerModal} title="Select customer" onClose={() => setCustomerModal(false)} size="lg">
        <ul className="max-h-64 overflow-auto divide-y divide-slate-100">
          {customerList.map((c) => (
            <li key={c.id}>
              <button type="button" className="flex w-full px-3 py-2 text-left text-sm hover:bg-slate-50"
                onClick={() => { setCustomer(c); setSnapOverrides({}); setCustomerModal(false); }}>
                {c.name} · {c.phone || c.code}
              </button>
            </li>
          ))}
        </ul>
      </Modal>
    </div>
  );
}
