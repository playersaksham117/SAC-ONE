'use client';

import { useEffect, useMemo, useState } from 'react';
import { apiRequest } from '../../../../lib/api';
import { useLiveRefresh } from '../../../../lib/live';
import { useAuth, RequirePermission } from '../../../../lib/auth-context';
import PageHeader, { Alert, LoadingState, Modal, StatusBadge } from '../../../../components/ui';

const EMPTY_MOVEMENT = {
  productId: '',
  warehouseId: '',
  movementType: '',
  quantity: '',
  reason: '',
  notes: '',
};

const INVENTORY_ACCESS = [
  'inventory.stock.view',
  'inventory.movements.view',
  'inventory.adjustments.view',
];

export default function InventoryPage() {
  const { checkPermission } = useAuth();
  const [tab, setTab] = useState('');
  const [stock, setStock] = useState([]);
  const [movements, setMovements] = useState([]);
  const [pending, setPending] = useState([]);
  const [products, setProducts] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [movementTypes, setMovementTypes] = useState([]);
  const [creatableTypes, setCreatableTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [search, setSearch] = useState('');
  const [warehouseFilter, setWarehouseFilter] = useState('');
  const [productFilter, setProductFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_MOVEMENT);
  const [saving, setSaving] = useState(false);

  const canCreateMovement = checkPermission('inventory.movements.create');
  const canCreateAdjustment = checkPermission('inventory.adjustments.create');
  const canCreate = canCreateMovement || canCreateAdjustment;
  const canApprove = checkPermission('inventory.adjustments.approve');

  const tabs = useMemo(() => ([
    { id: 'stock', label: 'Stock Levels', show: checkPermission('inventory.stock.view') },
    { id: 'ledger', label: 'Movement Ledger', show: checkPermission('inventory.movements.view') },
    { id: 'adjustments', label: 'Pending Adjustments', show: checkPermission('inventory.adjustments.view') },
  ].filter((t) => t.show)), [checkPermission]);

  useEffect(() => {
    if (!tab && tabs.length) setTab(tabs[0].id);
    if (tab && tabs.length && !tabs.some((t) => t.id === tab)) setTab(tabs[0].id);
  }, [tabs, tab]);

  const openCreateModal = () => {
    setError('');
    setForm((prev) => ({
      ...EMPTY_MOVEMENT,
      warehouseId: prev.warehouseId || warehouses.find((w) => w.isDefault)?.id || warehouses[0]?.id || '',
      movementType: creatableTypes[0]?.value || '',
    }));
    setModalOpen(true);
  };

  const loadLookups = async () => {
    const [prods, whs, allTypes, createTypes] = await Promise.all([
      apiRequest('/api/products?limit=500&isActive=1'),
      apiRequest('/api/inventory/warehouses'),
      apiRequest('/api/inventory/movement-types'),
      apiRequest('/api/inventory/movement-types?scope=manual'),
    ]);
    setProducts(prods.items || []);
    setWarehouses(whs || []);
    setMovementTypes(allTypes || []);
    setCreatableTypes(createTypes || []);
    setForm((prev) => ({
      ...prev,
      warehouseId: prev.warehouseId || whs.find((w) => w.isDefault)?.id || whs[0]?.id || '',
      movementType: prev.movementType || createTypes[0]?.value || '',
    }));
  };

  const loadStock = async (silent = false) => {
    if (silent !== true) setLoading(true);
    setError('');
    try {
      const query = new URLSearchParams();
      if (search) query.set('search', search);
      if (warehouseFilter) query.set('warehouseId', warehouseFilter);
      if (productFilter) query.set('productId', productFilter);
      const data = await apiRequest(`/api/inventory/stock?${query.toString()}`);
      setStock(data.items || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const loadMovements = async (silent = false) => {
    if (silent !== true) setLoading(true);
    setError('');
    try {
      const query = new URLSearchParams({ limit: '200' });
      if (warehouseFilter) query.set('warehouseId', warehouseFilter);
      if (productFilter) query.set('productId', productFilter);
      if (typeFilter) query.set('movementType', typeFilter);
      if (statusFilter) query.set('status', statusFilter);
      if (dateFrom) query.set('dateFrom', dateFrom);
      if (dateTo) query.set('dateTo', dateTo);
      if (search) query.set('search', search);
      const data = await apiRequest(`/api/inventory/movements?${query.toString()}`);
      setMovements(data.items || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const loadPending = async (silent = false) => {
    if (silent !== true) setLoading(true);
    setError('');
    try {
      const data = await apiRequest('/api/inventory/adjustments/pending');
      setPending(data.items || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLookups().catch((err) => setError(err.message));
  }, []);

  useLiveRefresh(() => {
    if (tab === 'stock') loadStock(true);
    if (tab === 'ledger') loadMovements(true);
    if (tab === 'adjustments') loadPending(true);
  });

  useEffect(() => {
    if (tab === 'stock') loadStock();
    if (tab === 'ledger') loadMovements();
    if (tab === 'adjustments') loadPending();
  }, [tab]);

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!form.movementType) {
      setError('Select a movement type');
      return;
    }
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const result = await apiRequest('/api/inventory/movements', {
        method: 'POST',
        body: JSON.stringify({
          ...form,
          quantity: Number(form.quantity),
        }),
      });
      const statusNote = result.movement.status === 'pending'
        ? 'Adjustment submitted for approval.'
        : `Movement recorded. Available stock: ${result.stock?.quantityAvailable ?? '—'}`;
      setMessage(statusNote);
      setModalOpen(false);
      setForm((prev) => ({
        ...EMPTY_MOVEMENT,
        warehouseId: prev.warehouseId || warehouses[0]?.id || '',
        movementType: creatableTypes[0]?.value || '',
      }));
      if (tab === 'stock') await loadStock();
      if (tab === 'ledger') await loadMovements();
      if (tab === 'adjustments') await loadPending();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const approve = async (id) => {
    setError('');
    setMessage('');
    try {
      const result = await apiRequest(`/api/inventory/adjustments/${id}/approve`, { method: 'POST' });
      setMessage(`Adjustment approved. Available stock: ${result.stock?.quantityAvailable}`);
      await loadPending();
      if (checkPermission('inventory.stock.view')) await loadStock();
    } catch (err) {
      setError(err.message);
    }
  };

  const reject = async (id) => {
    const reason = window.prompt('Rejection reason') || 'Rejected';
    setError('');
    setMessage('');
    try {
      await apiRequest(`/api/inventory/adjustments/${id}/reject`, {
        method: 'POST',
        body: JSON.stringify({ reason }),
      });
      setMessage('Adjustment rejected.');
      await loadPending();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <RequirePermission permissions={INVENTORY_ACCESS}>
      <PageHeader
        title="Inventory"
        description="Movement-driven stock engine. Stock is never changed without an inventory movement."
        actions={canCreate && creatableTypes.length > 0 && (
          <button type="button" className="btn-primary" onClick={openCreateModal}>
            + Record Movement
          </button>
        )}
      />

      <div className="mb-6 flex flex-wrap gap-2">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
              tab === t.id ? 'bg-brand-600 text-white' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <Alert type="error" message={error} />
      <Alert type="success" message={message} />

      {(tab === 'stock' || tab === 'ledger') && (
        <div className="mb-4 grid gap-3 md:grid-cols-4 lg:grid-cols-6">
          <input
            className="input-field md:col-span-2"
            placeholder="Search product / SKU / reason..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                if (tab === 'stock') loadStock();
                else loadMovements();
              }
            }}
          />
          <select className="input-field" value={warehouseFilter} onChange={(e) => setWarehouseFilter(e.target.value)}>
            <option value="">All warehouses</option>
            {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
          <select className="input-field" value={productFilter} onChange={(e) => setProductFilter(e.target.value)}>
            <option value="">All products</option>
            {products.map((p) => <option key={p.id} value={p.id}>{p.sku} — {p.name}</option>)}
          </select>
          {tab === 'ledger' && (
            <>
              <select className="input-field" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
                <option value="">All types</option>
                {movementTypes.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
              <select className="input-field" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                <option value="">All statuses</option>
                <option value="completed">Completed</option>
                <option value="pending">Pending</option>
                <option value="rejected">Rejected</option>
              </select>
              <input type="date" className="input-field" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
              <input type="date" className="input-field" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
            </>
          )}
          <button
            type="button"
            className="btn-primary"
            onClick={() => (tab === 'stock' ? loadStock() : loadMovements())}
          >
            Apply Filters
          </button>
        </div>
      )}

      {loading || !tab ? (
        <LoadingState />
      ) : tab === 'stock' ? (
        <div className="card overflow-hidden p-0">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-slate-600">SKU</th>
                <th className="px-4 py-3 text-left font-medium text-slate-600">Product</th>
                <th className="px-4 py-3 text-left font-medium text-slate-600">Warehouse</th>
                <th className="px-4 py-3 text-right font-medium text-slate-600">On Hand</th>
                <th className="px-4 py-3 text-right font-medium text-slate-600">Reserved</th>
                <th className="px-4 py-3 text-right font-medium text-slate-600">Available</th>
                <th className="px-4 py-3 text-right font-medium text-slate-600">Reorder</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {stock.map((row) => (
                <tr key={row.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-mono text-xs">{row.productSku}</td>
                  <td className="px-4 py-3 font-medium">{row.productName}</td>
                  <td className="px-4 py-3 text-slate-600">{row.warehouseName}</td>
                  <td className="px-4 py-3 text-right">{row.quantityOnHand}</td>
                  <td className="px-4 py-3 text-right">{row.quantityReserved}</td>
                  <td className="px-4 py-3 text-right font-semibold">{row.quantityAvailable}</td>
                  <td className="px-4 py-3 text-right text-slate-500">{row.reorderLevel}</td>
                </tr>
              ))}
              {!stock.length && (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-500">No stock rows yet. Record an opening stock movement.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      ) : tab === 'ledger' ? (
        <div className="card overflow-hidden p-0">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-slate-600">Date</th>
                <th className="px-4 py-3 text-left font-medium text-slate-600">Type</th>
                <th className="px-4 py-3 text-left font-medium text-slate-600">Product</th>
                <th className="px-4 py-3 text-left font-medium text-slate-600">Warehouse</th>
                <th className="px-4 py-3 text-right font-medium text-slate-600">In</th>
                <th className="px-4 py-3 text-right font-medium text-slate-600">Out</th>
                <th className="px-4 py-3 text-left font-medium text-slate-600">Status</th>
                <th className="px-4 py-3 text-left font-medium text-slate-600">By</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {movements.map((m) => (
                <tr key={m.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{new Date(m.createdAt).toLocaleString()}</td>
                  <td className="px-4 py-3">{m.movementTypeLabel}</td>
                  <td className="px-4 py-3">
                    <div className="font-medium">{m.productName}</div>
                    <div className="font-mono text-xs text-slate-400">{m.productSku}</div>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{m.warehouseName}</td>
                  <td className="px-4 py-3 text-right text-emerald-700">{m.quantityIn || '—'}</td>
                  <td className="px-4 py-3 text-right text-red-600">{m.quantityOut || '—'}</td>
                  <td className="px-4 py-3">
                    <StatusBadge
                      active={m.status === 'completed' || m.status === 'approved'}
                      labelActive={m.status}
                      labelInactive={m.status}
                    />
                  </td>
                  <td className="px-4 py-3 text-slate-500">{m.createdByName || '—'}</td>
                </tr>
              ))}
              {!movements.length && (
                <tr><td colSpan={8} className="px-4 py-8 text-center text-slate-500">No movements found</td></tr>
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="card overflow-hidden p-0">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-slate-600">Date</th>
                <th className="px-4 py-3 text-left font-medium text-slate-600">Type</th>
                <th className="px-4 py-3 text-left font-medium text-slate-600">Product</th>
                <th className="px-4 py-3 text-right font-medium text-slate-600">Qty</th>
                <th className="px-4 py-3 text-left font-medium text-slate-600">Reason</th>
                {canApprove && <th className="px-4 py-3 text-right font-medium text-slate-600">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {pending.map((m) => (
                <tr key={m.id}>
                  <td className="px-4 py-3 text-slate-500">{new Date(m.createdAt).toLocaleString()}</td>
                  <td className="px-4 py-3">{m.movementTypeLabel}</td>
                  <td className="px-4 py-3">{m.productSku} — {m.productName}</td>
                  <td className="px-4 py-3 text-right">{m.quantityIn || m.quantityOut}</td>
                  <td className="px-4 py-3 text-slate-600">{m.reason || '—'}</td>
                  {canApprove && (
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-2">
                        <button type="button" className="btn-primary" onClick={() => approve(m.id)}>Approve</button>
                        <button type="button" className="btn-danger" onClick={() => reject(m.id)}>Reject</button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
              {!pending.length && (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-500">No pending adjustments</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <Modal
        open={modalOpen}
        title="Record Inventory Movement"
        onClose={() => setModalOpen(false)}
        size="lg"
        footer={(
          <>
            <button type="button" className="btn-secondary" onClick={() => setModalOpen(false)}>Cancel</button>
            <button type="submit" form="movement-form" className="btn-primary" disabled={saving || !creatableTypes.length}>
              {saving ? 'Saving...' : 'Save Movement'}
            </button>
          </>
        )}
      >
        <form id="movement-form" onSubmit={handleCreate} className="grid gap-4 md:grid-cols-2">
          <div className="md:col-span-2">
            <label className="label">Product *</label>
            <select className="input-field" value={form.productId} onChange={(e) => setForm({ ...form, productId: e.target.value })} required>
              <option value="">Select product</option>
              {products.map((p) => <option key={p.id} value={p.id}>{p.sku} — {p.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Warehouse *</label>
            <select className="input-field" value={form.warehouseId} onChange={(e) => setForm({ ...form, warehouseId: e.target.value })} required>
              <option value="">Select warehouse</option>
              {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Movement Type *</label>
            <select className="input-field" value={form.movementType} onChange={(e) => setForm({ ...form, movementType: e.target.value })} required>
              <option value="">Select type</option>
              {creatableTypes.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}{t.requiresApproval ? ' (needs approval)' : ''}
                </option>
              ))}
            </select>
            {!creatableTypes.length && (
              <p className="mt-1 text-xs text-amber-600">You do not have permission to create inventory movements.</p>
            )}
          </div>
          <div>
            <label className="label">Quantity *</label>
            <input type="number" min="0.0001" step="any" className="input-field" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} required />
          </div>
          <div>
            <label className="label">Reason</label>
            <input className="input-field" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} />
          </div>
          <div className="md:col-span-2">
            <label className="label">Notes</label>
            <textarea className="input-field min-h-[80px]" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>
          <p className="md:col-span-2 text-xs text-slate-500">
            Adjustments need approval before stock changes. Opening stock, purchase, and returns update stock immediately.
            POS sales and warehouse transfers are recorded from those modules.
          </p>
        </form>
      </Modal>
    </RequirePermission>
  );
}
