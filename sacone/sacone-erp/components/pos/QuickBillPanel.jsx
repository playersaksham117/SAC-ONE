'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { apiRequest } from '../../lib/api';
import { Alert, Modal } from '../ui';

function money(n) {
  return `₹${Number(n || 0).toFixed(2)}`;
}

/**
 * Streamlined counter billing — reuses /api/pos/preview and /api/pos/checkout.
 * Cash → walk-in default. Credit → requires a registered customer.
 */
export default function QuickBillPanel({
  bootstrap,
  warehouseId,
  onWarehouseChange,
  canSell,
  onSaleComplete,
  onError,
  onMessage,
}) {
  const searchRef = useRef(null);
  const qtyRef = useRef(null);

  const [customer, setCustomer] = useState(null);
  const [salesAgentId, setSalesAgentId] = useState('');
  const [line, setLine] = useState(null);
  const [quantity, setQuantity] = useState('1');
  const [discountPercent, setDiscountPercent] = useState('');
  const [payMode, setPayMode] = useState('cash');
  const [search, setSearch] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [totals, setTotals] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [customerModal, setCustomerModal] = useState(false);
  const [customerList, setCustomerList] = useState([]);

  useEffect(() => {
    setCustomer(bootstrap?.walkInCustomer || null);
  }, [bootstrap?.walkInCustomer]);

  useEffect(() => {
    searchRef.current?.focus();
  }, []);

  useEffect(() => {
    if (payMode === 'cash') {
      setCustomer(bootstrap?.walkInCustomer || null);
    }
  }, [payMode, bootstrap?.walkInCustomer]);

  const cartItems = useMemo(() => {
    if (!line) return [];
    const qty = Math.max(0.001, Number(quantity) || 1);
    const disc = Math.min(100, Math.max(0, Number(discountPercent) || 0));
    return [{
      productId: line.productId,
      quantity: qty,
      unitPrice: line.unitPrice,
      discountAmount: 0,
      discountPercent: disc,
      gstPercentage: line.gstPercentage,
    }];
  }, [line, quantity, discountPercent]);

  useEffect(() => {
    if (!line) {
      setTotals(null);
      return;
    }
    const timer = setTimeout(() => {
      apiRequest('/api/pos/preview', {
        method: 'POST',
        body: JSON.stringify({
          customerId: customer?.id,
          invoiceDiscount: 0,
          items: cartItems,
        }),
      })
        .then(setTotals)
        .catch((e) => {
          setError(e.message);
          onError?.(e.message);
        });
    }, 150);
    return () => clearTimeout(timer);
  }, [line, cartItems, customer?.id, onError]);

  const selectProduct = (product) => {
    setError('');
    setLine({
      productId: product.id,
      productName: product.name,
      sku: product.sku,
      barcode: product.barcode,
      brandName: product.brandName,
      modelVariant: product.modelVariant,
      unitPrice: product.sellingPrice,
      gstPercentage: product.gstPercentage,
      hsnCode: product.hsnCode,
      stockHint: product.quantityAvailable,
    });
    setQuantity('1');
    setSearch('');
    setResults([]);
    setTimeout(() => qtyRef.current?.focus(), 50);
  };

  const runSearch = async (value) => {
    setSearch(value);
    if (!value.trim()) {
      setResults([]);
      return;
    }
    setSearching(true);
    try {
      const data = await apiRequest(`/api/pos/products?q=${encodeURIComponent(value.trim())}`);
      if ((data.match === 'barcode' || data.match === 'sku') && data.items?.[0]) {
        selectProduct(data.items[0]);
        return;
      }
      setResults(data.items || []);
    } catch (e) {
      setError(e.message);
      onError?.(e.message);
    } finally {
      setSearching(false);
    }
  };

  const loadCustomers = useCallback(async (q = '') => {
    const data = await apiRequest(`/api/customers/lookup?q=${encodeURIComponent(q)}&limit=40`);
    setCustomerList((data.items || []).filter((c) => !c.isWalkIn));
  }, []);

  const resetLine = () => {
    setLine(null);
    setQuantity('1');
    setDiscountPercent('');
    setTotals(null);
    setSearch('');
    searchRef.current?.focus();
  };

  const confirmSale = async () => {
    if (!line || !totals || !canSell) return;
    if (payMode === 'credit' && (!customer || customer.isWalkIn)) {
      setError('Select a customer for credit sales');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const sale = await apiRequest('/api/pos/checkout', {
        method: 'POST',
        body: JSON.stringify({
          warehouseId,
          customerId: customer?.id,
          salesAgentId: salesAgentId || undefined,
          invoiceDiscount: 0,
          notes: 'Quick Bill',
          items: cartItems,
          payments: [{
            method: payMode,
            amount: totals.grandTotal,
          }],
        }),
      });
      onMessage?.(`Quick Bill · ${sale.invoiceNumber} · ${money(sale.grandTotal)}`);
      onSaleComplete?.(sale);
      resetLine();
    } catch (e) {
      setError(e.message);
      onError?.(e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleSearchKeyDown = (e) => {
    if (e.key === 'Enter' && results[0]) {
      e.preventDefault();
      selectProduct(results[0]);
    }
  };

  const handleQtyKeyDown = (e) => {
    if (e.key === 'Enter' && line && totals) {
      e.preventDefault();
      confirmSale();
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="rounded-2xl border-2 border-amber-400/80 bg-gradient-to-br from-amber-50 to-white p-1 shadow-sm">
        <div className="rounded-xl bg-white px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <span className="inline-flex items-center gap-2 rounded-full bg-amber-500 px-3 py-1 text-xs font-bold uppercase tracking-wide text-white">
                ⚡ Quick Bill
              </span>
              <p className="mt-1 text-xs text-slate-500">Scan → Qty → Discount → Cash / Credit → Confirm</p>
            </div>
            <select
              className="input-field max-w-[180px] text-sm"
              value={warehouseId}
              onChange={(e) => onWarehouseChange?.(e.target.value)}
            >
              {(bootstrap?.warehouses || []).map((w) => (
                <option key={w.id} value={w.id}>{w.name}</option>
              ))}
            </select>
            <select
              className="input-field max-w-[200px] text-sm"
              value={salesAgentId}
              onChange={(e) => setSalesAgentId(e.target.value)}
            >
              <option value="">Agent: Direct</option>
              {(bootstrap?.salesAgents || []).map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <Alert type="error" message={error} />

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Search / scan product</label>
        <input
          ref={searchRef}
          className="input-field mt-2 text-xl font-medium"
          placeholder="Barcode, SKU, or name…"
          value={search}
          onChange={(e) => runSearch(e.target.value)}
          onKeyDown={handleSearchKeyDown}
          autoComplete="off"
        />
        {searching && <p className="mt-1 text-xs text-slate-400">Searching…</p>}
        {results.length > 0 && (
          <ul className="mt-2 max-h-40 overflow-auto rounded-lg border border-slate-200">
            {results.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  className="flex w-full items-center justify-between px-3 py-2.5 text-left text-sm hover:bg-amber-50"
                  onClick={() => selectProduct(p)}
                >
                  <span>
                    <span className="font-medium">{p.name}</span>
                    <span className="ml-2 font-mono text-xs text-slate-400">{p.sku}</span>
                    {p.brandName && (
                      <span className="mt-0.5 block text-xs text-slate-500">{p.brandName}</span>
                    )}
                    {p.modelVariant && (
                      <span className="mt-0.5 block text-xs text-slate-500">Model: {p.modelVariant}</span>
                    )}
                  </span>
                  <span className="font-bold text-slate-900">{money(p.sellingPrice)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {line && (
        <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-lg font-bold text-slate-900">{line.productName}</div>
              <div className="font-mono text-xs text-slate-400">{line.sku}{line.barcode ? ` · ${line.barcode}` : ''}</div>
              {line.brandName && (
                <div className="text-xs text-slate-500">{line.brandName}</div>
              )}
              {line.modelVariant && (
                <div className="text-xs text-slate-500">Model: {line.modelVariant}</div>
              )}
              <div className="mt-1 text-sm text-slate-600">
                Rate: {money(line.unitPrice)} · GST {line.gstPercentage}%{line.hsnCode ? ` · HSN ${line.hsnCode}` : ''}
              </div>
            </div>
            <button type="button" className="text-xs text-slate-400 hover:text-slate-700" onClick={resetLine}>
              Clear
            </button>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm">
              <span className="text-xs font-semibold uppercase text-slate-500">Quantity</span>
              <input
                ref={qtyRef}
                className="input-field mt-1 text-2xl font-bold tabular-nums"
                type="number"
                min="0.001"
                step="any"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                onKeyDown={handleQtyKeyDown}
              />
            </label>
            <label className="text-sm">
              <span className="text-xs font-semibold uppercase text-slate-500">Discount % (optional)</span>
              <input
                className="input-field mt-1 text-2xl font-bold tabular-nums"
                type="number"
                min="0"
                max="100"
                step="0.01"
                placeholder="0"
                value={discountPercent}
                onChange={(e) => setDiscountPercent(e.target.value)}
              />
            </label>
          </div>

          {totals && (
            <div className="rounded-xl bg-slate-50 px-4 py-3 text-sm">
              <div className="flex justify-between"><span>Taxable</span><span>{money(totals.taxableAmount)}</span></div>
              <div className="flex justify-between"><span>GST</span><span>{money(totals.gstAmount)}</span></div>
              <div className="mt-2 flex justify-between border-t border-slate-200 pt-2 text-2xl font-bold text-slate-900">
                <span>Total</span><span>{money(totals.grandTotal)}</span>
              </div>
            </div>
          )}

          <div>
            <p className="mb-2 text-xs font-semibold uppercase text-slate-500">Payment</p>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                className={`rounded-xl py-4 text-lg font-bold transition ${
                  payMode === 'cash'
                    ? 'bg-emerald-600 text-white shadow-md ring-2 ring-emerald-300'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
                onClick={() => setPayMode('cash')}
              >
                💵 CASH
              </button>
              <button
                type="button"
                className={`rounded-xl py-4 text-lg font-bold transition ${
                  payMode === 'credit'
                    ? 'bg-indigo-600 text-white shadow-md ring-2 ring-indigo-300'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
                onClick={() => {
                  setPayMode('credit');
                  loadCustomers();
                  setCustomerModal(true);
                }}
              >
                📋 CREDIT
              </button>
            </div>
            {payMode === 'credit' && customer && !customer.isWalkIn && (
              <p className="mt-2 text-sm text-indigo-700">
                Customer: <strong>{customer.name}</strong>
                {customer.phone ? ` · ${customer.phone}` : ''}
                <button type="button" className="ml-2 text-xs underline" onClick={() => { loadCustomers(); setCustomerModal(true); }}>
                  Change
                </button>
              </p>
            )}
            {payMode === 'cash' && (
              <p className="mt-2 text-xs text-slate-500">Walk-in customer · {bootstrap?.walkInCustomer?.name || 'Default'}</p>
            )}
          </div>

          {canSell && (
            <button
              type="button"
              className="btn-primary w-full py-4 text-lg font-bold"
              disabled={saving || !totals}
              onClick={confirmSale}
            >
              {saving ? 'Processing…' : `Confirm Sale · ${money(totals?.grandTotal)}`}
            </button>
          )}
          <p className="text-center text-[11px] text-slate-400">Enter in qty field to confirm · Invoice + stock update on confirm</p>
        </div>
      )}

      {!line && (
        <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50/50 py-16 text-center text-sm text-slate-400">
          Scan or search a product to start Quick Bill
        </div>
      )}

      <Modal open={customerModal} title="Customer for credit sale" onClose={() => setCustomerModal(false)} size="md">
        <input
          className="input-field mb-3"
          placeholder="Search customer…"
          onChange={(e) => loadCustomers(e.target.value)}
        />
        <ul className="max-h-64 overflow-auto divide-y divide-slate-100 rounded-lg border border-slate-200">
          {customerList.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                className="flex w-full justify-between px-3 py-2.5 text-left text-sm hover:bg-indigo-50"
                onClick={() => {
                  setCustomer(c);
                  setCustomerModal(false);
                }}
              >
                <span>
                  <span className="font-medium">{c.name}</span>
                  {c.phone && <span className="ml-2 text-xs text-slate-400">{c.phone}</span>}
                </span>
                <span className="text-xs text-slate-500">Due {money(c.outstandingBalance)}</span>
              </button>
            </li>
          ))}
          {!customerList.length && (
            <li className="px-3 py-6 text-center text-sm text-slate-400">No customers found</li>
          )}
        </ul>
      </Modal>
    </div>
  );
}
