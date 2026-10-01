'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiRequest } from '../../../../lib/api';
import { useLiveRefresh } from '../../../../lib/live';
import { useAuth, RequirePermission } from '../../../../lib/auth-context';
import PageHeader, { Alert, LoadingState, Modal, StatusBadge } from '../../../../components/ui';
import SupplierPaymentPanel from '../../../../components/parties/SupplierPaymentPanel';
import OutstandingPanel from '../../../../components/parties/OutstandingPanel';
import PartyStatementView from '../../../../components/parties/PartyStatementView';

function money(n) {
  return `₹${Number(n || 0).toFixed(2)}`;
}

const TABS = [
  { id: 'dashboard', label: 'Dashboard', permission: 'purchases.orders.view' },
  { id: 'price-lists', label: 'Price List Reader', permission: 'purchases.price_lists.view' },
  { id: 'orders', label: 'Purchase Orders', permission: 'purchases.orders.view' },
  { id: 'bills', label: 'Purchase Bill', permission: 'purchases.bills.view' },
  { id: 'log', label: 'Purchase Log', permission: 'purchases.bills.view' },
  { id: 'returns', label: 'Returns', permission: 'purchases.returns.view' },
  { id: 'payments', label: 'Payment Vouchers', permission: 'purchases.bills.view' },
  { id: 'outstanding', label: 'Outstanding', permission: 'parties.suppliers.view' },
  { id: 'ledger', label: 'Supplier Ledger', permission: 'purchases.orders.view' },
  { id: 'statements', label: 'Statements', permission: 'parties.suppliers.view' },
  { id: 'reports', label: 'Reports', permission: 'purchases.reports.view' },
];

function LineEditor({ lines, setLines, products, onSearch }) {
  const addLine = () => setLines((prev) => [...prev, { productId: '', quantity: 1, unitPrice: '', discountPercent: 0 }]);
  const update = (idx, patch) => setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  const remove = (idx) => setLines((prev) => prev.filter((_, i) => i !== idx));

  return (
    <div className="space-y-2">
      {lines.map((line, idx) => (
        <div key={idx} className="grid gap-2 rounded-lg border border-slate-200 p-3 md:grid-cols-[2fr_1fr_1fr_1fr_auto]">
          <select className="input-field" value={line.productId} onChange={(e) => {
            const p = products.find((x) => x.id === e.target.value);
            update(idx, { productId: e.target.value, unitPrice: p?.purchasePrice || p?.sellingPrice || '' });
          }}>
            <option value="">Select product</option>
            {products.map((p) => <option key={p.id} value={p.id}>{p.sku} — {p.name}</option>)}
          </select>
          <input type="number" className="input-field" placeholder="Qty" min="0.001" step="any" value={line.quantity} onChange={(e) => update(idx, { quantity: e.target.value })} />
          <input type="number" className="input-field" placeholder="Rate" step="0.01" value={line.unitPrice} onChange={(e) => update(idx, { unitPrice: e.target.value })} />
          <input type="number" className="input-field" placeholder="Disc %" step="0.01" value={line.discountPercent} onChange={(e) => update(idx, { discountPercent: e.target.value })} />
          <button type="button" className="btn-secondary" onClick={() => remove(idx)}>×</button>
        </div>
      ))}
      <div className="flex gap-2">
        <button type="button" className="btn-secondary" onClick={addLine}>+ Add line</button>
        {onSearch && (
          <input className="input-field max-w-xs" placeholder="Search product…" onChange={(e) => onSearch(e.target.value)} />
        )}
      </div>
    </div>
  );
}

export default function PurchasesPage() {
  const { checkPermission } = useAuth();
  const visibleTabs = useMemo(() => TABS.filter((t) => checkPermission(t.permission)), [checkPermission]);
  const [tab, setTab] = useState(visibleTabs[0]?.id || 'dashboard');

  const [bootstrap, setBootstrap] = useState(null);
  const [dashboard, setDashboard] = useState(null);
  const [orders, setOrders] = useState([]);
  const [bills, setBills] = useState([]);
  const [priceLists, setPriceLists] = useState([]);
  const [returns, setReturns] = useState([]);
  const [reports, setReports] = useState(null);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);

  const [poModal, setPoModal] = useState(false);
  const [billModal, setBillModal] = useState(false);
  const [priceModal, setPriceModal] = useState(false);
  const [returnModal, setReturnModal] = useState(false);
  const [ledgerSupplierId, setLedgerSupplierId] = useState('');
  const [ledger, setLedger] = useState(null);

  const [poForm, setPoForm] = useState({ supplierId: '', warehouseId: '', orderDate: '', notes: '' });
  const [poLines, setPoLines] = useState([{ productId: '', quantity: 1, unitPrice: '', discountPercent: 0 }]);
  const [poPreview, setPoPreview] = useState(null);

  const [billForm, setBillForm] = useState({ supplierId: '', warehouseId: '', supplierInvoiceNumber: '', billDate: '', purchaseOrderId: '', notes: '' });
  const [billLines, setBillLines] = useState([{ productId: '', quantity: 1, unitPrice: '', discountPercent: 0 }]);
  const [billPreview, setBillPreview] = useState(null);

  const [priceForm, setPriceForm] = useState({ supplierId: '', name: '', csv: '' });
  const [pricePreview, setPricePreview] = useState(null);

  const [returnForm, setReturnForm] = useState({ supplierId: '', warehouseId: '', billId: '', returnDate: '', notes: '' });
  const [returnLines, setReturnLines] = useState([{ productId: '', quantity: 1, unitPrice: '', discountPercent: 0 }]);

  const loadBootstrap = useCallback(async () => {
    const data = await apiRequest('/api/purchases/bootstrap');
    setBootstrap(data);
  }, []);

  const loadProducts = useCallback(async (search = '') => {
    const q = new URLSearchParams({ limit: '200', isActive: '1' });
    if (search) q.set('search', search);
    const data = await apiRequest(`/api/products?${q}`);
    setProducts(data.items || []);
  }, []);

  const loadTab = useCallback(async (silent = false) => {
    if (silent !== true) setLoading(true);
    setError('');
    try {
      if (tab === 'dashboard') {
        setDashboard(await apiRequest('/api/purchases/dashboard'));
      } else if (tab === 'orders') {
        setOrders((await apiRequest('/api/purchases/orders?limit=100')).items || []);
      } else if (tab === 'bills' || tab === 'log') {
        setBills((await apiRequest('/api/purchases/bills?limit=100')).items || []);
      } else if (tab === 'price-lists') {
        setPriceLists((await apiRequest('/api/purchases/price-lists?limit=50')).items || []);
      } else if (tab === 'returns') {
        setReturns((await apiRequest('/api/purchases/returns?limit=50')).items || []);
      } else if (tab === 'reports') {
        setReports(await apiRequest('/api/purchases/reports/summary'));
      } else if (tab === 'ledger' && ledgerSupplierId) {
        setLedger(await apiRequest(`/api/suppliers/${ledgerSupplierId}/statement`));
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [tab, ledgerSupplierId]);

  useEffect(() => {
    loadBootstrap().catch((e) => setError(e.message));
    loadProducts();
  }, [loadBootstrap, loadProducts]);

  useEffect(() => { loadTab(); }, [loadTab]);

  useLiveRefresh(() => {
    loadBootstrap().catch(() => {});
    loadTab(true);
  });

  const previewDoc = async (supplierId, lines, setter) => {
    if (!supplierId || !lines.some((l) => l.productId)) return;
    try {
      const data = await apiRequest('/api/purchases/preview', {
        method: 'POST',
        body: JSON.stringify({
          supplierId,
          items: lines.filter((l) => l.productId).map((l) => ({
            productId: l.productId,
            quantity: Number(l.quantity) || 1,
            unitPrice: Number(l.unitPrice) || 0,
            discountPercent: Number(l.discountPercent) || 0,
          })),
        }),
      });
      setter(data);
    } catch {
      setter(null);
    }
  };

  useEffect(() => {
    if (!poModal) return;
    const t = setTimeout(() => previewDoc(poForm.supplierId, poLines, setPoPreview), 300);
    return () => clearTimeout(t);
  }, [poModal, poForm.supplierId, poLines]);

  useEffect(() => {
    if (!billModal) return;
    const t = setTimeout(() => previewDoc(billForm.supplierId, billLines, setBillPreview), 300);
    return () => clearTimeout(t);
  }, [billModal, billForm.supplierId, billLines]);

  const savePo = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await apiRequest('/api/purchases/orders', {
        method: 'POST',
        body: JSON.stringify({
          ...poForm,
          orderDate: poForm.orderDate || new Date().toISOString().slice(0, 10),
          items: poLines.filter((l) => l.productId).map((l) => ({
            productId: l.productId,
            quantity: Number(l.quantity),
            unitPrice: Number(l.unitPrice),
            discountPercent: Number(l.discountPercent) || 0,
          })),
        }),
      });
      setMessage('Purchase order created.');
      setPoModal(false);
      setTab('orders');
      await loadTab();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const saveBill = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await apiRequest('/api/purchases/bills', {
        method: 'POST',
        body: JSON.stringify({
          ...billForm,
          billDate: billForm.billDate || new Date().toISOString().slice(0, 10),
          purchaseOrderId: billForm.purchaseOrderId || null,
          items: billLines.filter((l) => l.productId).map((l) => ({
            productId: l.productId,
            quantity: Number(l.quantity),
            unitPrice: Number(l.unitPrice),
            discountPercent: Number(l.discountPercent) || 0,
          })),
        }),
      });
      setMessage('Purchase bill posted — stock updated, payable recorded.');
      setBillModal(false);
      setTab('log');
      await loadTab();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const parsePriceList = async () => {
    setSaving(true);
    setError('');
    try {
      const data = await apiRequest('/api/purchases/price-lists/parse', {
        method: 'POST',
        body: JSON.stringify({ csv: priceForm.csv }),
      });
      setPricePreview(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const savePriceList = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const list = await apiRequest('/api/purchases/price-lists', {
        method: 'POST',
        body: JSON.stringify(priceForm),
      });
      setMessage(`Price list saved — ${list.matchedCount}/${list.rowCount} rows matched.`);
      setPriceModal(false);
      await loadTab();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const createPoFromList = async (listId) => {
    setSaving(true);
    try {
      await apiRequest(`/api/purchases/price-lists/${listId}/create-po`, {
        method: 'POST',
        body: JSON.stringify({ defaultQty: 1 }),
      });
      setMessage('Purchase order created from price list.');
      setTab('orders');
      await loadTab();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const approvePo = async (id) => {
    try {
      await apiRequest(`/api/purchases/orders/${id}/approve`, { method: 'POST' });
      setMessage('PO approved/sent.');
      await loadTab();
    } catch (err) {
      setError(err.message);
    }
  };

  const billFromPo = async (po) => {
    setBillForm({
      supplierId: po.supplierId,
      warehouseId: po.warehouseId || '',
      supplierInvoiceNumber: '',
      billDate: new Date().toISOString().slice(0, 10),
      purchaseOrderId: po.id,
      notes: `GRN for ${po.poNumber}`,
    });
    setBillLines(po.items?.map((i) => ({
      productId: i.productId,
      quantity: Math.max(0, i.quantity - i.receivedQty),
      unitPrice: i.unitPrice,
      discountPercent: i.discountPercent,
    })).filter((l) => l.quantity > 0) || []);
    setBillModal(true);
  };

  const saveReturn = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await apiRequest('/api/purchases/returns', {
        method: 'POST',
        body: JSON.stringify({
          ...returnForm,
          returnDate: returnForm.returnDate || new Date().toISOString().slice(0, 10),
          items: returnLines.filter((l) => l.productId).map((l) => ({
            productId: l.productId,
            quantity: Number(l.quantity),
            unitPrice: Number(l.unitPrice),
          })),
        }),
      });
      setMessage('Purchase return recorded — stock reduced.');
      setReturnModal(false);
      await loadTab();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const suppliers = bootstrap?.suppliers || [];
  const warehouses = bootstrap?.warehouses || [];

  return (
    <RequirePermission permission="purchases.orders.view">
      <PageHeader
        title="Purchase Management"
        description="Supplier price lists → PO → purchase bill → stock IN → supplier payable"
        actions={(
          <>
            {checkPermission('purchases.price_lists.create') && tab === 'price-lists' && (
              <button type="button" className="btn-secondary" onClick={() => { setPriceForm({ supplierId: '', name: '', csv: '' }); setPricePreview(null); setPriceModal(true); }}>Import Price List</button>
            )}
            {checkPermission('purchases.orders.create') && tab === 'orders' && (
              <button type="button" className="btn-primary" onClick={() => { setPoForm({ supplierId: '', warehouseId: '', orderDate: '', notes: '' }); setPoLines([{ productId: '', quantity: 1, unitPrice: '', discountPercent: 0 }]); setPoModal(true); }}>+ Purchase Order</button>
            )}
            {checkPermission('purchases.bills.create') && tab === 'bills' && (
              <button type="button" className="btn-primary" onClick={() => { setBillForm({ supplierId: '', warehouseId: '', supplierInvoiceNumber: '', billDate: '', purchaseOrderId: '', notes: '' }); setBillLines([{ productId: '', quantity: 1, unitPrice: '', discountPercent: 0 }]); setBillModal(true); }}>+ Purchase Bill</button>
            )}
            {checkPermission('purchases.returns.create') && tab === 'returns' && (
              <button type="button" className="btn-secondary" onClick={() => setReturnModal(true)}>+ Return</button>
            )}
          </>
        )}
      />

      <div className="mb-6 flex flex-wrap gap-2">
        {visibleTabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition ${tab === t.id ? 'bg-brand-600 text-white' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <Alert type="error" message={error} />
      <Alert type="success" message={message} />

      {loading ? <LoadingState /> : (
        <>
          {tab === 'dashboard' && dashboard && (
            <div className="grid gap-4 md:grid-cols-3">
              {[
                ['Open POs', dashboard.openPurchaseOrders],
                ['Pending Bills', dashboard.pendingBills],
                ['Payable', money(dashboard.pendingPayable)],
                ['This Month Purchases', money(dashboard.monthPurchaseTotal)],
                ['Price Lists', dashboard.processedPriceLists],
                ['Returns (month)', dashboard.monthReturns],
              ].map(([label, val]) => (
                <div key={label} className="card">
                  <div className="text-sm text-slate-500">{label}</div>
                  <div className="mt-1 text-2xl font-bold text-slate-900">{val}</div>
                </div>
              ))}
            </div>
          )}

          {tab === 'price-lists' && (
            <div className="card overflow-hidden p-0">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50"><tr>
                  <th className="px-4 py-3 text-left">Name</th>
                  <th className="px-4 py-3 text-left">Supplier</th>
                  <th className="px-4 py-3 text-left">Matched</th>
                  <th className="px-4 py-3 text-left">Date</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {priceLists.map((pl) => (
                    <tr key={pl.id}>
                      <td className="px-4 py-3 font-medium">{pl.name}</td>
                      <td className="px-4 py-3">{pl.supplierName}</td>
                      <td className="px-4 py-3">{pl.matchedCount}/{pl.rowCount}</td>
                      <td className="px-4 py-3 text-slate-500">{pl.effectiveDate || pl.createdAt?.slice(0, 10)}</td>
                      <td className="px-4 py-3 text-right">
                        {checkPermission('purchases.orders.create') && (
                          <button type="button" className="btn-secondary" onClick={() => createPoFromList(pl.id)} disabled={saving}>Create PO</button>
                        )}
                      </td>
                    </tr>
                  ))}
                  {!priceLists.length && <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-400">No price lists yet</td></tr>}
                </tbody>
              </table>
            </div>
          )}

          {tab === 'orders' && (
            <div className="card overflow-hidden p-0">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50"><tr>
                  <th className="px-4 py-3 text-left">PO #</th>
                  <th className="px-4 py-3 text-left">Supplier</th>
                  <th className="px-4 py-3 text-left">Date</th>
                  <th className="px-4 py-3 text-left">Status</th>
                  <th className="px-4 py-3 text-right">Total</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {orders.map((po) => (
                    <tr key={po.id}>
                      <td className="px-4 py-3 font-mono text-xs">{po.poNumber}</td>
                      <td className="px-4 py-3">{po.supplierName}</td>
                      <td className="px-4 py-3">{po.orderDate}</td>
                      <td className="px-4 py-3"><StatusBadge active={po.status !== 'cancelled'} labelActive={po.status} labelInactive={po.status} /></td>
                      <td className="px-4 py-3 text-right">{money(po.grandTotal)}</td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex justify-end gap-2">
                          {po.status === 'draft' && checkPermission('purchases.orders.approve') && (
                            <button type="button" className="btn-secondary" onClick={() => approvePo(po.id)}>Approve</button>
                          )}
                          {['sent', 'partial'].includes(po.status) && checkPermission('purchases.bills.create') && (
                            <button type="button" className="btn-primary" onClick={() => billFromPo(po)}>Receive / Bill</button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {!orders.length && <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400">No purchase orders</td></tr>}
                </tbody>
              </table>
            </div>
          )}

          {(tab === 'bills' || tab === 'log') && (
            <div className="card overflow-hidden p-0">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50"><tr>
                  <th className="px-4 py-3 text-left">Bill #</th>
                  <th className="px-4 py-3 text-left">Supplier Inv.</th>
                  <th className="px-4 py-3 text-left">Supplier</th>
                  <th className="px-4 py-3 text-left">Date</th>
                  <th className="px-4 py-3 text-left">Stock</th>
                  <th className="px-4 py-3 text-right">Total</th>
                  <th className="px-4 py-3 text-right">Paid</th>
                  <th className="px-4 py-3 text-right">Due</th>
                  <th className="px-4 py-3 text-left">Status</th>
                </tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {bills.map((b) => (
                    <tr key={b.id}>
                      <td className="px-4 py-3 font-mono text-xs">{b.billNumber}</td>
                      <td className="px-4 py-3 text-slate-500">{b.supplierInvoiceNumber || '—'}</td>
                      <td className="px-4 py-3">{b.supplierName}</td>
                      <td className="px-4 py-3">{b.billDate}</td>
                      <td className="px-4 py-3">{b.stockPosted ? '✓ IN' : '—'}</td>
                      <td className="px-4 py-3 text-right">{money(b.grandTotal)}</td>
                      <td className="px-4 py-3 text-right">{money(b.amountPaid)}</td>
                      <td className="px-4 py-3 text-right">{money(b.amountPayable)}</td>
                      <td className="px-4 py-3 capitalize">{b.status}</td>
                    </tr>
                  ))}
                  {!bills.length && <tr><td colSpan={9} className="px-4 py-8 text-center text-slate-400">No purchase bills</td></tr>}
                </tbody>
              </table>
            </div>
          )}

          {tab === 'returns' && (
            <div className="card overflow-hidden p-0">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50"><tr>
                  <th className="px-4 py-3 text-left">Return #</th>
                  <th className="px-4 py-3 text-left">Supplier</th>
                  <th className="px-4 py-3 text-left">Date</th>
                  <th className="px-4 py-3 text-right">Total</th>
                </tr></thead>
                <tbody>
                  {returns.map((r) => (
                    <tr key={r.id} className="border-t border-slate-100">
                      <td className="px-4 py-3 font-mono text-xs">{r.returnNumber}</td>
                      <td className="px-4 py-3">{r.supplierName}</td>
                      <td className="px-4 py-3">{r.returnDate}</td>
                      <td className="px-4 py-3 text-right">{money(r.grandTotal)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {tab === 'ledger' && (
            <div className="space-y-4">
              <div className="flex gap-2">
                <select className="input-field max-w-md" value={ledgerSupplierId} onChange={(e) => setLedgerSupplierId(e.target.value)}>
                  <option value="">Select supplier</option>
                  {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              {ledger && (
                <div className="card overflow-hidden p-0">
                  <div className="border-b border-slate-100 px-4 py-3 text-sm">
                    Outstanding payable: <strong>{money(ledger.supplier?.outstandingPayable)}</strong>
                  </div>
                  <table className="min-w-full text-sm">
                    <thead className="bg-slate-50"><tr>
                      <th className="px-4 py-2 text-left">Date</th>
                      <th className="px-4 py-2 text-left">Type</th>
                      <th className="px-4 py-2 text-left">Reference</th>
                      <th className="px-4 py-2 text-right">Debit</th>
                      <th className="px-4 py-2 text-right">Credit</th>
                      <th className="px-4 py-2 text-right">Balance</th>
                    </tr></thead>
                    <tbody>
                      {(ledger.lines || []).map((line, i) => (
                        <tr key={i} className="border-t border-slate-100">
                          <td className="px-4 py-2">{String(line.date).slice(0, 10)}</td>
                          <td className="px-4 py-2">{line.particulars || line.description || line.type}</td>
                          <td className="px-4 py-2">{line.documentNumber || line.reference}</td>
                          <td className="px-4 py-2 text-right">{line.debit ? money(line.debit) : '—'}</td>
                          <td className="px-4 py-2 text-right">{line.credit ? money(line.credit) : '—'}</td>
                          <td className="px-4 py-2 text-right font-medium">{money(line.balance)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {tab === 'payments' && (
            <SupplierPaymentPanel
              suppliers={suppliers}
              onMessage={setMessage}
              onError={setError}
            />
          )}

          {tab === 'outstanding' && (
            <OutstandingPanel partyType="supplier" onError={setError} />
          )}

          {tab === 'statements' && (
            <div className="space-y-3">
              <select className="input-field max-w-md" value={ledgerSupplierId} onChange={(e) => setLedgerSupplierId(e.target.value)}>
                <option value="">Select supplier</option>
                {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              <PartyStatementView partyType="supplier" partyId={ledgerSupplierId} onError={setError} />
            </div>
          )}

          {tab === 'reports' && reports && (
            <div className="space-y-4">
              <div className="grid gap-4 md:grid-cols-3">
                <div className="card"><div className="text-sm text-slate-500">Bills</div><div className="text-2xl font-bold">{reports.totals.billCount}</div></div>
                <div className="card"><div className="text-sm text-slate-500">Purchase Total</div><div className="text-2xl font-bold">{money(reports.totals.purchaseTotal)}</div></div>
                <div className="card"><div className="text-sm text-slate-500">Input GST</div><div className="text-2xl font-bold">{money(reports.totals.gstTotal)}</div></div>
              </div>
              <div className="card overflow-hidden p-0">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-50"><tr>
                    <th className="px-4 py-3 text-left">Supplier</th>
                    <th className="px-4 py-3 text-right">Bills</th>
                    <th className="px-4 py-3 text-right">Purchases</th>
                    <th className="px-4 py-3 text-right">Payable</th>
                  </tr></thead>
                  <tbody>
                    {reports.bySupplier?.map((s) => (
                      <tr key={s.id} className="border-t border-slate-100">
                        <td className="px-4 py-3">{s.name}</td>
                        <td className="px-4 py-3 text-right">{s.billCount}</td>
                        <td className="px-4 py-3 text-right">{money(s.purchaseTotal)}</td>
                        <td className="px-4 py-3 text-right">{money(s.payableTotal)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      <Modal open={poModal} title="Create Purchase Order" onClose={() => setPoModal(false)} size="xl"
        footer={<><button type="button" className="btn-secondary" onClick={() => setPoModal(false)}>Cancel</button><button type="submit" form="po-form" className="btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save PO'}</button></>}>
        <form id="po-form" onSubmit={savePo} className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div><label className="label">Supplier *</label><select className="input-field" required value={poForm.supplierId} onChange={(e) => setPoForm({ ...poForm, supplierId: e.target.value })}><option value="">Select</option>{suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
            <div><label className="label">Warehouse</label><select className="input-field" value={poForm.warehouseId} onChange={(e) => setPoForm({ ...poForm, warehouseId: e.target.value })}><option value="">Default</option>{warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}</select></div>
          </div>
          <LineEditor lines={poLines} setLines={setPoLines} products={products} onSearch={loadProducts} />
          {poPreview?.totals && <div className="rounded-lg bg-slate-50 p-3 text-sm">Total: <strong>{money(poPreview.totals.grandTotal)}</strong> (GST {money(poPreview.totals.gstAmount)})</div>}
        </form>
      </Modal>

      <Modal open={billModal} title="Purchase Bill Entry" onClose={() => setBillModal(false)} size="xl"
        footer={<><button type="button" className="btn-secondary" onClick={() => setBillModal(false)}>Cancel</button><button type="submit" form="bill-form" className="btn-primary" disabled={saving}>{saving ? 'Posting…' : 'Post Bill & Stock IN'}</button></>}>
        <form id="bill-form" onSubmit={saveBill} className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div><label className="label">Supplier *</label><select className="input-field" required value={billForm.supplierId} onChange={(e) => setBillForm({ ...billForm, supplierId: e.target.value })}><option value="">Select</option>{suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
            <div><label className="label">Supplier Invoice #</label><input className="input-field" value={billForm.supplierInvoiceNumber} onChange={(e) => setBillForm({ ...billForm, supplierInvoiceNumber: e.target.value })} /></div>
            <div><label className="label">Warehouse</label><select className="input-field" value={billForm.warehouseId} onChange={(e) => setBillForm({ ...billForm, warehouseId: e.target.value })}><option value="">Default</option>{warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}</select></div>
            <div><label className="label">Bill Date</label><input type="date" className="input-field" value={billForm.billDate} onChange={(e) => setBillForm({ ...billForm, billDate: e.target.value })} /></div>
          </div>
          <LineEditor lines={billLines} setLines={setBillLines} products={products} onSearch={loadProducts} />
          {billPreview?.totals && <div className="rounded-lg bg-emerald-50 p-3 text-sm">Posts stock IN + supplier payable: <strong>{money(billPreview.totals.grandTotal)}</strong></div>}
        </form>
      </Modal>

      <Modal open={priceModal} title="Supplier Price List Reader" onClose={() => setPriceModal(false)} size="xl"
        footer={<><button type="button" className="btn-secondary" onClick={() => setPriceModal(false)}>Cancel</button><button type="button" className="btn-secondary" onClick={parsePriceList} disabled={saving}>Preview Match</button><button type="submit" form="price-form" className="btn-primary" disabled={saving}>Save List</button></>}>
        <form id="price-form" onSubmit={savePriceList} className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div><label className="label">Supplier *</label><select className="input-field" required value={priceForm.supplierId} onChange={(e) => setPriceForm({ ...priceForm, supplierId: e.target.value })}><option value="">Select</option>{suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
            <div><label className="label">List Name *</label><input className="input-field" required value={priceForm.name} onChange={(e) => setPriceForm({ ...priceForm, name: e.target.value })} placeholder="HALONIX Aug 2026" /></div>
          </div>
          <div><label className="label">CSV *</label><textarea className="input-field min-h-[160px] font-mono text-xs" required value={priceForm.csv} onChange={(e) => setPriceForm({ ...priceForm, csv: e.target.value })} placeholder="sku,name,barcode,rate,mrp,gst" /></div>
          {pricePreview && <p className="text-sm text-slate-600">Matched {pricePreview.matchedCount} of {pricePreview.rowCount} rows</p>}
        </form>
      </Modal>

      <Modal open={returnModal} title="Purchase Return" onClose={() => setReturnModal(false)} size="lg"
        footer={<><button type="button" className="btn-secondary" onClick={() => setReturnModal(false)}>Cancel</button><button type="submit" form="return-form" className="btn-primary" disabled={saving}>Post Return</button></>}>
        <form id="return-form" onSubmit={saveReturn} className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div><label className="label">Supplier *</label><select className="input-field" required value={returnForm.supplierId} onChange={(e) => setReturnForm({ ...returnForm, supplierId: e.target.value })}><option value="">Select</option>{suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
            <div><label className="label">Warehouse</label><select className="input-field" value={returnForm.warehouseId} onChange={(e) => setReturnForm({ ...returnForm, warehouseId: e.target.value })}><option value="">Default</option>{warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}</select></div>
          </div>
          <LineEditor lines={returnLines} setLines={setReturnLines} products={products} />
        </form>
      </Modal>
    </RequirePermission>
  );
}
