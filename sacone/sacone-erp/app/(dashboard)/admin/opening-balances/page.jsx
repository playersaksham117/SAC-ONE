'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiRequest } from '../../../../lib/api';
import { useLiveRefresh } from '../../../../lib/live';
import { useAuth, RequirePermission } from '../../../../lib/auth-context';
import PageHeader, { Alert, LoadingState } from '../../../../components/ui';
import { ModuleTabs, Toolbar } from '../../../../components/module-ui';

const money = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const today = () => new Date().toISOString().slice(0, 10);
const num = (v) => (v === '' || v == null ? null : Number(v));

const TABS = [
  { id: 'stock', label: 'Opening stock', permission: 'inventory.movements.create' },
  { id: 'customer', label: 'Customer dues', permission: 'parties.customers.edit' },
  { id: 'supplier', label: 'Supplier payables', permission: 'parties.suppliers.edit' },
  { id: 'accounts', label: 'Cash & bank', permission: 'finance.ledger.edit' },
];

export default function OpeningBalancesPage() {
  const { checkPermission } = useAuth();
  const tabs = useMemo(() => TABS.filter((t) => checkPermission(t.permission)), [checkPermission]);
  const [tab, setTab] = useState(tabs[0]?.id || 'stock');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const notify = useCallback((m) => { setMessage(m); setError(''); }, []);
  const fail = useCallback((e) => { setError(e.message || String(e)); setMessage(''); }, []);

  return (
    <RequirePermission permissions={TABS.map((t) => t.permission)}>
      <PageHeader
        title="Opening Stock & Balances"
        description="Bring in what you had on the day you start using SACONE. Stock goes to the warehouse (and SAC-POS phones), dues show on statements, outstanding lists and SAC-POS."
      />
      <Alert type="success" message={message} />
      <Alert message={error} />
      <div className="mb-4"><ModuleTabs tabs={tabs} active={tab} onChange={(t) => { setTab(t); setMessage(''); setError(''); }} /></div>
      {tab === 'stock' && <OpeningStock onDone={notify} onError={fail} />}
      {(tab === 'customer' || tab === 'supplier') && <PartyBalances key={tab} type={tab} onDone={notify} onError={fail} />}
      {tab === 'accounts' && <AccountBalances onDone={notify} onError={fail} />}
    </RequirePermission>
  );
}

/* ───────────────────────── Opening stock ───────────────────────── */

function parseStockCsv(text) {
  const rows = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (!rows.length) return [];
  const first = rows[0].toLowerCase();
  const body = /sku|barcode|qty|quantity/.test(first) ? rows.slice(1) : rows;
  return body.map((line) => {
    const [code, quantity, unitCost] = line.split(',').map((c) => c.trim().replace(/^"|"$/g, ''));
    return { sku: code, barcode: code, quantity: Number(quantity), unitCost: unitCost === undefined || unitCost === '' ? null : Number(unitCost) };
  });
}

function OpeningStock({ onDone, onError }) {
  const [warehouses, setWarehouses] = useState([]);
  const [warehouseId, setWarehouseId] = useState('');
  const [search, setSearch] = useState('');
  const [sheet, setSheet] = useState(null);
  const [entries, setEntries] = useState({});
  const [asOfDate, setAsOfDate] = useState(today());
  const [csv, setCsv] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    apiRequest('/api/warehouses').then((w) => {
      const list = (Array.isArray(w) ? w : w.items || []).filter((x) => x.isActive);
      setWarehouses(list);
      setWarehouseId((cur) => cur || list.find((x) => x.isDefault)?.id || list[0]?.id || '');
    }).catch(onError);
  }, [onError]);

  const load = useCallback(async () => {
    if (!warehouseId) return;
    try {
      setSheet(await apiRequest(`/api/opening-balances/stock?warehouseId=${warehouseId}&search=${encodeURIComponent(search)}`));
    } catch (e) { onError(e); }
  }, [warehouseId, search, onError]);
  useEffect(() => { load(); }, [warehouseId]); // eslint-disable-line react-hooks/exhaustive-deps
  useLiveRefresh(load, { tables: ['stock_levels', 'products'] });

  const set = (id, field, value) => setEntries((e) => ({ ...e, [id]: { ...e[id], [field]: value } }));
  const lines = Object.entries(entries)
    .map(([productId, e]) => ({ productId, quantity: num(e.quantity), unitCost: num(e.unitCost) }))
    .filter((l) => l.quantity > 0);

  const post = async (payload, label) => {
    if (!window.confirm(`Post ${label} into ${sheet?.warehouse?.name || 'the warehouse'} as of ${asOfDate}? Stock increases immediately and SAC-POS phones receive it.`)) return;
    setBusy(true);
    try {
      const res = await apiRequest('/api/opening-balances/stock', { method: 'POST', body: JSON.stringify({ warehouseId, asOfDate, lines: payload }) });
      onDone(`Posted opening stock for ${res.posted} product(s), ${res.totalQuantity} units, into ${res.warehouse.name}.`);
      setEntries({});
      setCsv('');
      load();
    } catch (e) { onError(e); } finally { setBusy(false); }
  };

  if (!warehouses.length) return <Alert message="Create a warehouse first (Operations → Warehouse), then come back here." />;

  return (
    <div className="space-y-4">
      <Toolbar>
        <label className="text-sm text-slate-500">Warehouse
          <select className="input-field ml-2 w-auto" value={warehouseId} onChange={(e) => { setWarehouseId(e.target.value); setEntries({}); }}>
            {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
        </label>
        <label className="text-sm text-slate-500">As of
          <input type="date" className="input-field ml-2 w-auto" value={asOfDate} onChange={(e) => setAsOfDate(e.target.value)} />
        </label>
        <input className="input-field w-full sm:w-64" placeholder="Search name, SKU or barcode" value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') load(); }} />
        <button type="button" className="btn-secondary" onClick={load}>Search</button>
      </Toolbar>

      {!sheet ? <LoadingState /> : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Product</th>
                <th className="px-4 py-3 text-right">In stock</th>
                <th className="px-4 py-3 text-right">Opening posted</th>
                <th className="px-4 py-3 text-right">Opening qty</th>
                <th className="px-4 py-3 text-right">Cost price</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sheet.items.map((p) => (
                <tr key={p.id}>
                  <td className="px-4 py-2">
                    <div className="font-medium text-slate-900">{p.name}</div>
                    <div className="text-xs text-slate-500">{p.sku}{p.barcode ? ` · ${p.barcode}` : ''}</div>
                  </td>
                  <td className="px-4 py-2 text-right">{p.onHand}</td>
                  <td className={`px-4 py-2 text-right ${p.openingQty ? 'text-amber-700' : 'text-slate-400'}`}>{p.openingQty || '—'}</td>
                  <td className="px-4 py-2 text-right">
                    <input type="number" min="0" step="any" className="input-field w-24 text-right" value={entries[p.id]?.quantity ?? ''} onChange={(e) => set(p.id, 'quantity', e.target.value)} placeholder="0" />
                  </td>
                  <td className="px-4 py-2 text-right">
                    <input type="number" min="0" step="any" className="input-field w-28 text-right" value={entries[p.id]?.unitCost ?? ''} onChange={(e) => set(p.id, 'unitCost', e.target.value)} placeholder={p.purchasePrice ? String(p.purchasePrice) : 'cost'} />
                  </td>
                </tr>
              ))}
              {!sheet.items.length && <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-400">No products. Add products first (Operations → Products).</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-slate-500">"Opening posted" shows stock already entered as opening for this warehouse; posting again adds to it. Cost price updates the product's purchase price (stock value).</p>
        <button type="button" className="btn-primary" disabled={busy || !lines.length} onClick={() => post(lines, `${lines.length} product(s)`)}>
          {busy ? 'Posting…' : `Post opening stock (${lines.length})`}
        </button>
      </div>

      <details className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <summary className="cursor-pointer text-sm font-semibold text-slate-700">Import from CSV (many products at once)</summary>
        <p className="mt-2 text-xs text-slate-500">One line per product: <code>sku or barcode, quantity, cost price (optional)</code>. A header row is fine. Nothing is posted if any line is wrong.</p>
        <textarea className="input-field mt-2 min-h-[140px] font-mono text-xs" value={csv} onChange={(e) => setCsv(e.target.value)} placeholder={'sku,quantity,cost\nLEDSTU-15W-WIVO,25,310\n00000002,10,'} />
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <label className="btn-secondary cursor-pointer">
            Choose CSV file
            <input type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) f.text().then(setCsv); }} />
          </label>
          <button type="button" className="btn-primary" disabled={busy || !csv.trim()} onClick={() => { const rows = parseStockCsv(csv); post(rows, `${rows.length} CSV line(s)`); }}>Post CSV</button>
        </div>
      </details>
    </div>
  );
}

/* ───────────────────────── Customer / supplier dues ───────────────────────── */

function PartyBalances({ type, onDone, onError }) {
  const [rows, setRows] = useState(null);
  const [search, setSearch] = useState('');
  const [edits, setEdits] = useState({});
  const [asOfDate, setAsOfDate] = useState(today());
  const [busy, setBusy] = useState(false);
  const label = type === 'customer' ? 'customer' : 'supplier';

  const load = useCallback(async () => {
    try {
      setRows(await apiRequest(`/api/opening-balances/parties?type=${type}&search=${encodeURIComponent(search)}`));
    } catch (e) { onError(e); }
  }, [type, search, onError]);
  useEffect(() => { load(); }, [type]); // eslint-disable-line react-hooks/exhaustive-deps
  useLiveRefresh(load, { tables: ['opening_balances', type === 'customer' ? 'customers' : 'suppliers'] });

  const changed = Object.entries(edits).filter(([id, v]) => {
    const row = rows?.find((r) => r.id === id);
    return row && v !== '' && Number(v) !== row.openingAmount;
  });

  const save = async () => {
    setBusy(true);
    try {
      const res = await apiRequest('/api/opening-balances/parties', {
        method: 'PUT',
        body: JSON.stringify({ type, entries: changed.map(([partyId, amount]) => ({ partyId, amount: Number(amount), asOfDate })) }),
      });
      onDone(`Saved opening balance for ${res.saved} ${label}(s).`);
      setEdits({});
      load();
    } catch (e) { onError(e); } finally { setBusy(false); }
  };

  return (
    <div className="space-y-4">
      <Toolbar>
        <label className="text-sm text-slate-500">As of
          <input type="date" className="input-field ml-2 w-auto" value={asOfDate} onChange={(e) => setAsOfDate(e.target.value)} />
        </label>
        <input className="input-field w-full sm:w-64" placeholder={`Search ${label} name, code or phone`} value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') load(); }} />
        <button type="button" className="btn-secondary" onClick={load}>Search</button>
      </Toolbar>

      {!rows ? <LoadingState /> : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">{type === 'customer' ? 'Customer' : 'Supplier'}</th>
                <th className="px-4 py-3 text-right">{type === 'customer' ? 'Outstanding now' : 'Payable now'}</th>
                <th className="px-4 py-3 text-right">Opening balance</th>
                <th className="px-4 py-3">As of</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="px-4 py-2">
                    <div className="font-medium text-slate-900">{r.name}</div>
                    <div className="text-xs text-slate-500">{r.code}{r.phone ? ` · ${r.phone}` : ''}</div>
                  </td>
                  <td className="px-4 py-2 text-right">{money(r.outstanding)}</td>
                  <td className="px-4 py-2 text-right">
                    <input
                      type="number" step="any" className="input-field w-32 text-right"
                      value={edits[r.id] ?? (r.openingAmount || '')}
                      placeholder="0.00"
                      onChange={(e) => setEdits((x) => ({ ...x, [r.id]: e.target.value }))}
                    />
                  </td>
                  <td className="px-4 py-2 text-slate-500">{r.asOfDate || '—'}</td>
                </tr>
              ))}
              {!rows.length && <tr><td colSpan={4} className="px-4 py-8 text-center text-slate-400">No {label}s yet. Add them in Business → Customers &amp; Suppliers.</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-slate-500">
          {type === 'customer'
            ? 'Positive = the customer owes you; negative = advance they paid. Shows on statements, outstanding and SAC-POS dues; payments taken "on account" settle it first.'
            : 'Positive = you owe the supplier; negative = advance you paid. Shows on statements and outstanding; payments "on account" settle it first.'}
          {' '}Re-saving replaces the amount; it never adds twice.
        </p>
        <button type="button" className="btn-primary" disabled={busy || !changed.length} onClick={save}>{busy ? 'Saving…' : `Save changes (${changed.length})`}</button>
      </div>
    </div>
  );
}

/* ───────────────────────── Cash & bank ───────────────────────── */

function AccountBalances({ onDone, onError }) {
  const [accounts, setAccounts] = useState(null);
  const [edits, setEdits] = useState({});
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try { setAccounts(await apiRequest('/api/finance/accounts')); } catch (e) { onError(e); }
  }, [onError]);
  useEffect(() => { load(); }, [load]);

  const changed = Object.entries(edits).filter(([id, v]) => v !== '' && Number(v) !== accounts?.find((a) => a.id === id)?.openingBalance);
  const save = async () => {
    setBusy(true);
    try {
      for (const [id, v] of changed) {
        await apiRequest(`/api/finance/accounts/${id}`, { method: 'PUT', body: JSON.stringify({ openingBalance: Number(v) }) });
      }
      onDone(`Saved opening balance for ${changed.length} account(s).`);
      setEdits({});
      load();
    } catch (e) { onError(e); } finally { setBusy(false); }
  };

  if (!accounts) return <LoadingState />;
  return (
    <div className="space-y-4">
      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr><th className="px-4 py-3">Account</th><th className="px-4 py-3">Type</th><th className="px-4 py-3 text-right">Opening balance</th></tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {accounts.map((a) => (
              <tr key={a.id}>
                <td className="px-4 py-2 font-medium text-slate-900">{a.name}<div className="text-xs font-normal text-slate-500">{a.code}</div></td>
                <td className="px-4 py-2 capitalize text-slate-600">{a.accountType}</td>
                <td className="px-4 py-2 text-right">
                  <input type="number" step="any" className="input-field w-36 text-right" value={edits[a.id] ?? a.openingBalance} onChange={(e) => setEdits((x) => ({ ...x, [a.id]: e.target.value }))} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-slate-500">Cash in hand, bank and UPI balances on your start date. The cash and bank books start from these.</p>
        <button type="button" className="btn-primary" disabled={busy || !changed.length} onClick={save}>{busy ? 'Saving…' : `Save changes (${changed.length})`}</button>
      </div>
    </div>
  );
}
