'use client';

import { useEffect, useState } from 'react';
import { apiRequest } from '../../../../lib/api';
import { useLiveRefresh } from '../../../../lib/live';
import { useAuth, RequirePermission } from '../../../../lib/auth-context';
import PageHeader, { Alert, LoadingState, Modal, StatusBadge } from '../../../../components/ui';

function HierarchyTree({ nodes, depth = 0, onShowQr }) {
  if (!nodes?.length) return null;
  return (
    <ul className={depth === 0 ? 'space-y-2' : 'ml-4 mt-2 space-y-2 border-l border-slate-200 pl-4'}>
      {nodes.map((node) => (
        <li key={node.id}>
          <div className="flex flex-wrap items-center gap-2 rounded-lg bg-white px-3 py-2 text-sm shadow-sm border border-slate-100">
            <span className="rounded bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-slate-600">
              {node.locationType}
            </span>
            <span className="font-medium">{node.name}</span>
            <span className="font-mono text-xs text-slate-400">{node.fullCode || node.code}</span>
            {!node.isActive && <StatusBadge active={false} />}
            <button type="button" className="btn-secondary ml-auto text-xs" onClick={() => onShowQr(node)}>
              QR
            </button>
          </div>
          <HierarchyTree nodes={node.children} depth={depth + 1} onShowQr={onShowQr} />
        </li>
      ))}
    </ul>
  );
}

export default function WarehousePage() {
  const { checkPermission } = useAuth();
  const [tab, setTab] = useState('summary');
  const [warehouses, setWarehouses] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [summary, setSummary] = useState(null);
  const [hierarchy, setHierarchy] = useState([]);
  const [stock, setStock] = useState([]);
  const [locationStock, setLocationStock] = useState([]);
  const [occupancy, setOccupancy] = useState([]);
  const [transfers, setTransfers] = useState([]);
  const [counts, setCounts] = useState([]);
  const [products, setProducts] = useState([]);
  const [locations, setLocations] = useState([]);
  const [sourceLocations, setSourceLocations] = useState([]);
  const [destLocations, setDestLocations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const [whModal, setWhModal] = useState(false);
  const [whForm, setWhForm] = useState({ code: '', name: '', city: '', state: '', address: '', isDefault: false });
  const [locModal, setLocModal] = useState(false);
  const [locForm, setLocForm] = useState({ code: '', name: '', locationType: 'bin', parentId: '', capacity: '' });
  const [transferModal, setTransferModal] = useState(false);
  const [transferForm, setTransferForm] = useState({
    sourceWarehouseId: '', destinationWarehouseId: '', sourceLocationId: '', destinationLocationId: '',
    reason: '', requiresApproval: true, productId: '', quantity: '',
  });
  const [qrModal, setQrModal] = useState(null);
  const [scanPayload, setScanPayload] = useState('');
  const [scanResult, setScanResult] = useState(null);
  const [countDetail, setCountDetail] = useState(null);
  const [saving, setSaving] = useState(false);

  const canCreateWh = checkPermission('warehouse.warehouses.create');
  const canEditWh = checkPermission('warehouse.warehouses.edit');
  const canCreateLoc = checkPermission('warehouse.locations.create');
  const canCreateTransfer = checkPermission('warehouse.transfers.create');
  const canApproveTransfer = checkPermission('warehouse.transfers.approve');
  const canCreateCount = checkPermission('warehouse.stock_counts.create');
  const canApproveCount = checkPermission('warehouse.stock_counts.approve');

  const loadWarehouses = async () => {
    const list = await apiRequest('/api/warehouses?includeInactive=true');
    setWarehouses(list);
    if (!selectedId && list.length) {
      setSelectedId(list.find((w) => w.isDefault)?.id || list[0].id);
    }
  };

  const refreshTab = async (warehouseId = selectedId, activeTab = tab, silent = false) => {
    if (!warehouseId) return;
    if (!silent) setLoading(true);
    setError('');
    try {
      if (activeTab === 'summary') {
        setSummary(await apiRequest(`/api/warehouses/${warehouseId}/summary`));
      } else if (activeTab === 'hierarchy') {
        setHierarchy(await apiRequest(`/api/warehouses/${warehouseId}/hierarchy`));
        setLocations(await apiRequest(`/api/warehouses/${warehouseId}/locations?includeInactive=true`));
      } else if (activeTab === 'stock') {
        const data = await apiRequest(`/api/warehouses/${warehouseId}/stock`);
        setStock(data.items || []);
      } else if (activeTab === 'locationStock') {
        const data = await apiRequest(`/api/warehouses/location-stock?warehouseId=${warehouseId}`);
        setLocationStock(data.items || []);
      } else if (activeTab === 'occupancy') {
        setOccupancy(await apiRequest(`/api/warehouses/${warehouseId}/occupancy`));
      } else if (activeTab === 'transfers') {
        const data = await apiRequest(`/api/warehouses/transfers?warehouseId=${warehouseId}`);
        setTransfers(data.items || []);
      } else if (activeTab === 'counts') {
        const data = await apiRequest(`/api/warehouses/stock-counts?warehouseId=${warehouseId}`);
        setCounts(data.items || []);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    Promise.all([
      loadWarehouses(),
      apiRequest('/api/products?limit=500&isActive=1').then((d) => setProducts(d.items || [])),
    ]).catch((err) => setError(err.message));
  }, []);

  useEffect(() => {
    if (selectedId) refreshTab(selectedId, tab);
  }, [selectedId, tab]);

  useLiveRefresh(() => {
    loadWarehouses().catch(() => {});
    if (selectedId) refreshTab(selectedId, tab, true);
  });

  const selectedWarehouse = warehouses.find((w) => w.id === selectedId);

  const createWarehouse = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const created = await apiRequest('/api/warehouses', { method: 'POST', body: JSON.stringify(whForm) });
      setWhModal(false);
      setMessage(`Warehouse ${created.warehouse.name} created with default Zone/Rack/Bin.`);
      await loadWarehouses();
      setSelectedId(created.warehouse.id);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const toggleWarehouseActive = async () => {
    if (!selectedWarehouse) return;
    setError('');
    try {
      await apiRequest(`/api/warehouses/${selectedWarehouse.id}`, {
        method: 'PUT',
        body: JSON.stringify({ isActive: !selectedWarehouse.isActive }),
      });
      setMessage(selectedWarehouse.isActive ? 'Warehouse deactivated.' : 'Warehouse activated.');
      await loadWarehouses();
      await refreshTab();
    } catch (err) {
      setError(err.message);
    }
  };

  const createLocation = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await apiRequest(`/api/warehouses/${selectedId}/locations`, {
        method: 'POST',
        body: JSON.stringify({
          ...locForm,
          parentId: locForm.parentId || null,
          capacity: locForm.capacity === '' ? null : Number(locForm.capacity),
        }),
      });
      setLocModal(false);
      setMessage('Location created.');
      await refreshTab(selectedId, 'hierarchy');
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const showQr = async (location) => {
    setError('');
    try {
      const data = await apiRequest(`/api/warehouses/locations/${location.id}/qr`);
      setQrModal(data);
    } catch (err) {
      setError(err.message);
    }
  };

  const scanQr = async () => {
    setError('');
    try {
      const result = await apiRequest(`/api/warehouses/locations/scan?payload=${encodeURIComponent(scanPayload)}`);
      setScanResult(result);
    } catch (err) {
      setScanResult(null);
      setError(err.message);
    }
  };

  const createTransfer = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const result = await apiRequest('/api/warehouses/transfers', {
        method: 'POST',
        body: JSON.stringify({
          sourceWarehouseId: transferForm.sourceWarehouseId || selectedId,
          destinationWarehouseId: transferForm.destinationWarehouseId,
          sourceLocationId: transferForm.sourceLocationId || null,
          destinationLocationId: transferForm.destinationLocationId || null,
          reason: transferForm.reason,
          requiresApproval: transferForm.requiresApproval,
          items: [{ productId: transferForm.productId, quantity: Number(transferForm.quantity) }],
        }),
      });
      setTransferModal(false);
      setMessage(`Transfer ${result.transferNumber || result.id} ${result.status === 'completed' ? 'completed' : 'submitted'}.`);
      setTab('transfers');
      await refreshTab(selectedId, 'transfers');
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const approveTransfer = async (id) => {
    try {
      await apiRequest(`/api/warehouses/transfers/${id}/approve`, { method: 'POST' });
      setMessage('Transfer approved and executed via movement engine.');
      await refreshTab(selectedId, 'transfers');
      await refreshTab(selectedId, 'stock');
    } catch (err) {
      setError(err.message);
    }
  };

  const rejectTransfer = async (id) => {
    const reason = window.prompt('Rejection reason') || 'Rejected';
    try {
      await apiRequest(`/api/warehouses/transfers/${id}/reject`, {
        method: 'POST',
        body: JSON.stringify({ reason }),
      });
      setMessage('Transfer rejected.');
      await refreshTab(selectedId, 'transfers');
    } catch (err) {
      setError(err.message);
    }
  };

  const startCount = async () => {
    setError('');
    try {
      const count = await apiRequest('/api/warehouses/stock-counts', {
        method: 'POST',
        body: JSON.stringify({ warehouseId: selectedId }),
      });
      setMessage(`Stock count ${count.countNumber} started.`);
      setCountDetail(count);
      setTab('counts');
      await refreshTab(selectedId, 'counts');
    } catch (err) {
      setError(err.message);
    }
  };

  const openCount = async (id) => {
    setError('');
    try {
      setCountDetail(await apiRequest(`/api/warehouses/stock-counts/${id}`));
    } catch (err) {
      setError(err.message);
    }
  };

  const saveCountedQty = async (itemId, countedQuantity) => {
    setError('');
    try {
      const updated = await apiRequest(`/api/warehouses/stock-counts/${countDetail.id}/items/${itemId}`, {
        method: 'PUT',
        body: JSON.stringify({ countedQuantity: countedQuantity === '' ? null : Number(countedQuantity) }),
      });
      setCountDetail(updated);
    } catch (err) {
      setError(err.message);
    }
  };

  const submitCount = async () => {
    setError('');
    setMessage('');
    try {
      const updated = await apiRequest(`/api/warehouses/stock-counts/${countDetail.id}/submit`, { method: 'POST' });
      setCountDetail(updated);
      setMessage('Stock count submitted for approval.');
      await refreshTab(selectedId, 'counts');
    } catch (err) {
      setError(err.message);
    }
  };

  const approveCount = async (id) => {
    setError('');
    setMessage('');
    try {
      await apiRequest(`/api/warehouses/stock-counts/${id}/approve`, { method: 'POST' });
      setMessage('Stock count approved. Variances posted via inventory movements.');
      setCountDetail(null);
      await refreshTab(selectedId, 'counts');
      await refreshTab(selectedId, 'stock');
    } catch (err) {
      setError(err.message);
    }
  };

  const loadTransferLocations = async (sourceId, destId) => {
    try {
      const jobs = [];
      if (sourceId) {
        jobs.push(
          apiRequest(`/api/warehouses/${sourceId}/locations?includeInactive=false`)
            .then((list) => setSourceLocations(list || []))
            .catch(() => setSourceLocations([]))
        );
      } else {
        setSourceLocations([]);
      }
      if (destId) {
        jobs.push(
          apiRequest(`/api/warehouses/${destId}/locations?includeInactive=false`)
            .then((list) => setDestLocations(list || []))
            .catch(() => setDestLocations([]))
        );
      } else {
        setDestLocations([]);
      }
      await Promise.all(jobs);
    } catch (err) {
      setError(err.message);
    }
  };

  const openTransferModal = async () => {
    const sourceWarehouseId = selectedId || warehouses.find((w) => w.isActive)?.id || '';
    const destinationWarehouseId = warehouses.find((w) => w.isActive && w.id !== sourceWarehouseId)?.id || '';
    setTransferForm({
      sourceWarehouseId,
      destinationWarehouseId,
      sourceLocationId: '',
      destinationLocationId: '',
      reason: '',
      requiresApproval: true,
      productId: '',
      quantity: '',
    });
    setTransferModal(true);
    await loadTransferLocations(sourceWarehouseId, destinationWarehouseId);
  };

  const tabs = [
    { id: 'summary', label: 'Summary' },
    { id: 'hierarchy', label: 'Locations' },
    { id: 'stock', label: 'Warehouse Stock' },
    { id: 'locationStock', label: 'Location Stock' },
    { id: 'occupancy', label: 'Occupancy' },
    { id: 'transfers', label: 'Transfers' },
    { id: 'counts', label: 'Stock Counts' },
    { id: 'scan', label: 'QR Scan' },
  ];

  return (
    <RequirePermission permission="warehouse.warehouses.view">
      <PageHeader
        title="Warehouse Management"
        description="Hierarchy, transfers, occupancy and stock counts — all stock changes go through the inventory movement engine."
        actions={(
          <>
            {canCreateWh && (
              <button type="button" className="btn-primary" onClick={() => setWhModal(true)}>+ Warehouse</button>
            )}
            {canCreateTransfer && (
              <button type="button" className="btn-secondary" onClick={openTransferModal}>
                + Transfer
              </button>
            )}
          </>
        )}
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <select className="input-field max-w-sm" value={selectedId} onChange={(e) => setSelectedId(e.target.value)}>
          {warehouses.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name} ({w.code}){w.isDefault ? ' • default' : ''}{!w.isActive ? ' • inactive' : ''}
            </option>
          ))}
        </select>
        {canEditWh && selectedWarehouse && (
          <button type="button" className={selectedWarehouse.isActive ? 'btn-danger' : 'btn-secondary'} onClick={toggleWarehouseActive}>
            {selectedWarehouse.isActive ? 'Deactivate' : 'Activate'}
          </button>
        )}
      </div>

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

      {loading ? <LoadingState /> : (
        <>
          {tab === 'summary' && summary && (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <div className="card">
                <div className="text-xs uppercase text-slate-400">Warehouse</div>
                <div className="mt-1 text-xl font-semibold">{summary.warehouse.name}</div>
                <div className="text-sm text-slate-500">{summary.warehouse.code} · {summary.warehouse.city || '—'}</div>
              </div>
              <div className="card">
                <div className="text-xs uppercase text-slate-400">Stock</div>
                <div className="mt-1 text-xl font-semibold">{summary.stock.totalAvailable}</div>
                <div className="text-sm text-slate-500">{summary.stock.skuCount} SKUs · on hand {summary.stock.totalOnHand}</div>
              </div>
              <div className="card">
                <div className="text-xs uppercase text-slate-400">Occupancy</div>
                <div className="mt-1 text-xl font-semibold">
                  {summary.occupancy.occupancyPercent == null ? '—' : `${summary.occupancy.occupancyPercent}%`}
                </div>
                <div className="text-sm text-slate-500">
                  {summary.occupancy.occupiedQty} / {summary.occupancy.totalCapacity || '∞'} capacity units
                </div>
              </div>
              <div className="card">
                <div className="text-xs uppercase text-slate-400">Operations</div>
                <div className="mt-2 text-sm">Pending transfers: <strong>{summary.pendingTransfers}</strong></div>
                <div className="text-sm">Open counts: <strong>{summary.openCounts}</strong></div>
                <div className="mt-3 text-xs text-slate-500">
                  Locations: {Object.entries(summary.locationBreakdown || {}).map(([k, v]) => `${k}:${v}`).join(' · ') || 'none'}
                </div>
              </div>
            </div>
          )}

          {tab === 'hierarchy' && (
            <div className="space-y-4">
              {canCreateLoc && (
                <button type="button" className="btn-primary" onClick={() => {
                  setLocForm({ code: '', name: '', locationType: 'bin', parentId: '', capacity: '' });
                  setLocModal(true);
                }}
                >
                  + Add Location
                </button>
              )}
              <div className="card">
                <HierarchyTree nodes={hierarchy} onShowQr={showQr} />
                {!hierarchy.length && <p className="text-sm text-slate-500">No locations yet.</p>}
              </div>
            </div>
          )}

          {tab === 'stock' && (
            <div className="card overflow-hidden p-0">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-4 py-3 text-left">SKU</th>
                    <th className="px-4 py-3 text-left">Product</th>
                    <th className="px-4 py-3 text-right">On Hand</th>
                    <th className="px-4 py-3 text-right">Reserved</th>
                    <th className="px-4 py-3 text-right">Available</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {stock.map((row) => (
                    <tr key={row.id}>
                      <td className="px-4 py-3 font-mono text-xs">{row.productSku}</td>
                      <td className="px-4 py-3">{row.productName}</td>
                      <td className="px-4 py-3 text-right">{row.quantityOnHand}</td>
                      <td className="px-4 py-3 text-right">{row.quantityReserved}</td>
                      <td className="px-4 py-3 text-right font-semibold">{row.quantityAvailable}</td>
                    </tr>
                  ))}
                  {!stock.length && <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-500">No warehouse stock</td></tr>}
                </tbody>
              </table>
            </div>
          )}

          {tab === 'locationStock' && (
            <div className="card overflow-hidden p-0">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-4 py-3 text-left">Location</th>
                    <th className="px-4 py-3 text-left">SKU</th>
                    <th className="px-4 py-3 text-left">Product</th>
                    <th className="px-4 py-3 text-right">Available</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {locationStock.map((row) => (
                    <tr key={row.id}>
                      <td className="px-4 py-3">{row.locationCode} · {row.locationName}</td>
                      <td className="px-4 py-3 font-mono text-xs">{row.productSku}</td>
                      <td className="px-4 py-3">{row.productName}</td>
                      <td className="px-4 py-3 text-right font-semibold">{row.quantityAvailable}</td>
                    </tr>
                  ))}
                  {!locationStock.length && <tr><td colSpan={4} className="px-4 py-8 text-center text-slate-500">No location stock tracked yet</td></tr>}
                </tbody>
              </table>
            </div>
          )}

          {tab === 'occupancy' && (
            <div className="card overflow-hidden p-0">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-4 py-3 text-left">Location</th>
                    <th className="px-4 py-3 text-left">Type</th>
                    <th className="px-4 py-3 text-right">Occupied</th>
                    <th className="px-4 py-3 text-right">Capacity</th>
                    <th className="px-4 py-3 text-right">Occupancy</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {occupancy.map((row) => (
                    <tr key={row.id}>
                      <td className="px-4 py-3">{row.fullCode || row.code} · {row.name}</td>
                      <td className="px-4 py-3">{row.locationType}</td>
                      <td className="px-4 py-3 text-right">{row.occupied}</td>
                      <td className="px-4 py-3 text-right">{row.capacity ?? '—'}</td>
                      <td className="px-4 py-3 text-right">{row.occupancyPercent == null ? '—' : `${row.occupancyPercent}%`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {tab === 'transfers' && (
            <div className="card overflow-hidden p-0">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-4 py-3 text-left">Number</th>
                    <th className="px-4 py-3 text-left">Route</th>
                    <th className="px-4 py-3 text-left">Status</th>
                    <th className="px-4 py-3 text-left">Created</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {transfers.map((t) => (
                    <tr key={t.id}>
                      <td className="px-4 py-3 font-medium">{t.transferNumber}</td>
                      <td className="px-4 py-3">
                        {t.sourceWarehouseName}
                        {t.sourceLocationName ? ` / ${t.sourceLocationName}` : ''}
                        {' → '}
                        {t.destinationWarehouseName}
                        {t.destinationLocationName ? ` / ${t.destinationLocationName}` : ''}
                      </td>
                      <td className="px-4 py-3"><StatusBadge active={t.status === 'completed'} labelActive={t.status} labelInactive={t.status} /></td>
                      <td className="px-4 py-3 text-slate-500">{new Date(t.createdAt).toLocaleString()}</td>
                      <td className="px-4 py-3 text-right">
                        {canApproveTransfer && t.status === 'pending_approval' && (
                          <div className="flex justify-end gap-2">
                            <button type="button" className="btn-primary" onClick={() => approveTransfer(t.id)}>Approve</button>
                            <button type="button" className="btn-danger" onClick={() => rejectTransfer(t.id)}>Reject</button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                  {!transfers.length && <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-500">No transfers</td></tr>}
                </tbody>
              </table>
            </div>
          )}

          {tab === 'counts' && (
            <div className="space-y-4">
              {canCreateCount && (
                <button type="button" className="btn-primary" onClick={startCount}>+ Start Stock Count</button>
              )}
              <div className="card overflow-hidden p-0">
                <table className="min-w-full divide-y divide-slate-200 text-sm">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="px-4 py-3 text-left">Number</th>
                      <th className="px-4 py-3 text-left">Status</th>
                      <th className="px-4 py-3 text-left">Created</th>
                      <th className="px-4 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {counts.map((c) => (
                      <tr key={c.id}>
                        <td className="px-4 py-3 font-medium">{c.countNumber}</td>
                        <td className="px-4 py-3">{c.status}</td>
                        <td className="px-4 py-3 text-slate-500">{new Date(c.createdAt).toLocaleString()}</td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex justify-end gap-2">
                            <button type="button" className="btn-secondary" onClick={() => openCount(c.id)}>Open</button>
                            {canApproveCount && c.status === 'pending_approval' && (
                              <button type="button" className="btn-primary" onClick={() => approveCount(c.id)}>Approve</button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {countDetail && (
                <div className="card">
                  <div className="mb-3 flex items-center justify-between">
                    <h3 className="font-semibold">{countDetail.countNumber} · {countDetail.status}</h3>
                    {['draft', 'in_progress'].includes(countDetail.status) && canCreateCount && (
                      <button type="button" className="btn-primary" onClick={submitCount}>Submit for Approval</button>
                    )}
                  </div>
                  <table className="min-w-full divide-y divide-slate-200 text-sm">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="px-3 py-2 text-left">SKU</th>
                        <th className="px-3 py-2 text-right">System</th>
                        <th className="px-3 py-2 text-right">Counted</th>
                        <th className="px-3 py-2 text-right">Variance</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {countDetail.items.map((item) => (
                        <tr key={item.id}>
                          <td className="px-3 py-2">{item.productSku} · {item.productName}</td>
                          <td className="px-3 py-2 text-right">{item.systemQuantity}</td>
                          <td className="px-3 py-2 text-right">
                            {['draft', 'in_progress'].includes(countDetail.status) ? (
                              <input
                                type="number"
                                className="input-field w-24 text-right"
                                defaultValue={item.countedQuantity ?? ''}
                                onBlur={(e) => saveCountedQty(item.id, e.target.value)}
                              />
                            ) : item.countedQuantity}
                          </td>
                          <td className="px-3 py-2 text-right">{item.variance}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {tab === 'scan' && (
            <div className="card max-w-xl space-y-3">
              <p className="text-sm text-slate-500">Scan or paste a location QR payload (format: SACONE:LOC:&lt;id&gt;).</p>
              <input className="input-field" value={scanPayload} onChange={(e) => setScanPayload(e.target.value)} placeholder="SACONE:LOC:..." />
              <button type="button" className="btn-primary" onClick={scanQr}>Resolve Location</button>
              {scanResult && (
                <div className="rounded-lg bg-slate-50 p-4 text-sm">
                  <div className="font-semibold">{scanResult.name}</div>
                  <div className="font-mono text-xs text-slate-500">{scanResult.fullCode || scanResult.code}</div>
                  <div className="mt-1">{scanResult.locationType} · {scanResult.warehouseName}</div>
                </div>
              )}
            </div>
          )}
        </>
      )}

      <Modal open={whModal} title="Create Warehouse" onClose={() => setWhModal(false)} footer={(
        <>
          <button type="button" className="btn-secondary" onClick={() => setWhModal(false)}>Cancel</button>
          <button type="submit" form="wh-form" className="btn-primary" disabled={saving}>{saving ? 'Saving...' : 'Create'}</button>
        </>
      )}
      >
        <form id="wh-form" onSubmit={createWarehouse} className="grid gap-3 md:grid-cols-2">
          <div><label className="label">Code *</label><input className="input-field" value={whForm.code} onChange={(e) => setWhForm({ ...whForm, code: e.target.value })} required /></div>
          <div><label className="label">Name *</label><input className="input-field" value={whForm.name} onChange={(e) => setWhForm({ ...whForm, name: e.target.value })} required /></div>
          <div><label className="label">City</label><input className="input-field" value={whForm.city} onChange={(e) => setWhForm({ ...whForm, city: e.target.value })} /></div>
          <div><label className="label">State</label><input className="input-field" value={whForm.state} onChange={(e) => setWhForm({ ...whForm, state: e.target.value })} /></div>
          <div className="md:col-span-2"><label className="label">Address</label><input className="input-field" value={whForm.address} onChange={(e) => setWhForm({ ...whForm, address: e.target.value })} /></div>
          <label className="inline-flex items-center gap-2 text-sm"><input type="checkbox" checked={whForm.isDefault} onChange={(e) => setWhForm({ ...whForm, isDefault: e.target.checked })} /> Default warehouse</label>
        </form>
      </Modal>

      <Modal open={locModal} title="Add Location" onClose={() => setLocModal(false)} footer={(
        <>
          <button type="button" className="btn-secondary" onClick={() => setLocModal(false)}>Cancel</button>
          <button type="submit" form="loc-form" className="btn-primary" disabled={saving}>{saving ? 'Saving...' : 'Create'}</button>
        </>
      )}
      >
        <form id="loc-form" onSubmit={createLocation} className="grid gap-3 md:grid-cols-2">
          <div>
            <label className="label">Type *</label>
            <select className="input-field" value={locForm.locationType} onChange={(e) => setLocForm({ ...locForm, locationType: e.target.value })}>
              {['zone', 'rack', 'shelf', 'bin', 'cell', 'receiving', 'shipping'].map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Parent</label>
            <select className="input-field" value={locForm.parentId} onChange={(e) => setLocForm({ ...locForm, parentId: e.target.value })}>
              <option value="">Warehouse root</option>
              {locations.map((l) => <option key={l.id} value={l.id}>{l.fullCode || l.code} · {l.name} ({l.locationType})</option>)}
            </select>
          </div>
          <div><label className="label">Code *</label><input className="input-field" value={locForm.code} onChange={(e) => setLocForm({ ...locForm, code: e.target.value })} required /></div>
          <div><label className="label">Name *</label><input className="input-field" value={locForm.name} onChange={(e) => setLocForm({ ...locForm, name: e.target.value })} required /></div>
          <div><label className="label">Capacity</label><input type="number" className="input-field" value={locForm.capacity} onChange={(e) => setLocForm({ ...locForm, capacity: e.target.value })} /></div>
        </form>
      </Modal>

      <Modal open={transferModal} title="Create Transfer" size="lg" onClose={() => setTransferModal(false)} footer={(
        <>
          <button type="button" className="btn-secondary" onClick={() => setTransferModal(false)}>Cancel</button>
          <button type="submit" form="tr-form" className="btn-primary" disabled={saving}>{saving ? 'Saving...' : 'Create Transfer'}</button>
        </>
      )}
      >
        <form id="tr-form" onSubmit={createTransfer} className="grid gap-3 md:grid-cols-2">
          <div>
            <label className="label">Source Warehouse *</label>
            <select
              className="input-field"
              value={transferForm.sourceWarehouseId}
              onChange={async (e) => {
                const sourceWarehouseId = e.target.value;
                setTransferForm((prev) => ({
                  ...prev,
                  sourceWarehouseId,
                  sourceLocationId: '',
                }));
                await loadTransferLocations(sourceWarehouseId, transferForm.destinationWarehouseId);
              }}
              required
            >
              {warehouses.filter((w) => w.isActive).map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Destination Warehouse *</label>
            <select
              className="input-field"
              value={transferForm.destinationWarehouseId}
              onChange={async (e) => {
                const destinationWarehouseId = e.target.value;
                setTransferForm((prev) => ({
                  ...prev,
                  destinationWarehouseId,
                  destinationLocationId: '',
                }));
                await loadTransferLocations(transferForm.sourceWarehouseId, destinationWarehouseId);
              }}
              required
            >
              <option value="">Select</option>
              {warehouses.filter((w) => w.isActive).map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Source Location</label>
            <select className="input-field" value={transferForm.sourceLocationId} onChange={(e) => setTransferForm({ ...transferForm, sourceLocationId: e.target.value })}>
              <option value="">Default / any</option>
              {sourceLocations.filter((l) => ['bin', 'cell', 'shelf', 'default'].includes(l.locationType)).map((l) => (
                <option key={l.id} value={l.id}>{l.fullCode || l.code}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Destination Location</label>
            <select className="input-field" value={transferForm.destinationLocationId} onChange={(e) => setTransferForm({ ...transferForm, destinationLocationId: e.target.value })}>
              <option value="">Default / any</option>
              {destLocations.filter((l) => ['bin', 'cell', 'shelf', 'default'].includes(l.locationType)).map((l) => (
                <option key={l.id} value={l.id}>{l.fullCode || l.code}</option>
              ))}
            </select>
          </div>
          <div className="md:col-span-2">
            <label className="label">Product *</label>
            <select className="input-field" value={transferForm.productId} onChange={(e) => setTransferForm({ ...transferForm, productId: e.target.value })} required>
              <option value="">Select product</option>
              {products.map((p) => <option key={p.id} value={p.id}>{p.sku} — {p.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Quantity *</label>
            <input type="number" min="0.0001" step="any" className="input-field" value={transferForm.quantity} onChange={(e) => setTransferForm({ ...transferForm, quantity: e.target.value })} required />
          </div>
          <div>
            <label className="label">Reason</label>
            <input className="input-field" value={transferForm.reason} onChange={(e) => setTransferForm({ ...transferForm, reason: e.target.value })} />
          </div>
          <label className="inline-flex items-center gap-2 text-sm md:col-span-2">
            <input type="checkbox" checked={transferForm.requiresApproval} onChange={(e) => setTransferForm({ ...transferForm, requiresApproval: e.target.checked })} />
            Require Warehouse Manager approval before movements are posted
          </label>
          <p className="md:col-span-2 text-xs text-slate-500">
            Flow: Create → Approval (if required) → Transfer Out movement → Transfer In movement. Stock is never edited directly.
          </p>
        </form>
      </Modal>

      <Modal open={Boolean(qrModal)} title="Location QR Code" onClose={() => setQrModal(null)}>
        {qrModal && (
          <div className="space-y-3 text-center">
            <img src={qrModal.qrDataUrl} alt="Location QR" className="mx-auto h-48 w-48" />
            <div className="font-semibold">{qrModal.name}</div>
            <div className="font-mono text-xs text-slate-500">{qrModal.fullCode}</div>
            <div className="rounded bg-slate-50 px-3 py-2 font-mono text-xs break-all">{qrModal.payload}</div>
          </div>
        )}
      </Modal>
    </RequirePermission>
  );
}
