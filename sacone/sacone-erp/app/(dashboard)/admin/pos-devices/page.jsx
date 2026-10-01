'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiRequest, getApiBase } from '../../../../lib/api';
import { useLiveRefresh } from '../../../../lib/live';
import { RequirePermission, useAuth } from '../../../../lib/auth-context';
import PageHeader, { Alert, Modal, StatusBadge } from '../../../../components/ui';
import {
  EmptyPanel, ModuleTabs, SectionCard, SkeletonGrid, StatCard, StatusPill, Toolbar,
} from '../../../../components/module-ui';

const INBOX_STATUS_COLORS = {
  applied: 'bg-emerald-100 text-emerald-700',
  failed: 'bg-rose-100 text-rose-700',
  pending_review: 'bg-amber-100 text-amber-800',
  ignored: 'bg-slate-100 text-slate-600',
  rejected: 'bg-slate-200 text-slate-700',
};

const fmtTime = (iso) => (iso ? new Date(iso).toLocaleString() : '—');
const ago = (iso) => {
  if (!iso) return 'never';
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  if (mins < 1440) return `${Math.round(mins / 60)} h ago`;
  return `${Math.round(mins / 1440)} d ago`;
};

function SyncKeyBanner({ secret, onClose }) {
  if (!secret) return null;
  const apiUrl = getApiBase();
  return (
    <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="font-semibold text-amber-900">Sync key for {secret.device.name} — copy it now, it is shown only once</div>
        <button type="button" className="text-amber-700" onClick={onClose}>✕</button>
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <div>
          <div className="text-xs text-amber-800">Server URL (enter in SAC-POS → Connect to SACONE)</div>
          <code className="mt-1 block break-all rounded-lg bg-white px-3 py-2 font-mono text-xs">{apiUrl}</code>
        </div>
        <div>
          <div className="text-xs text-amber-800">Device sync key</div>
          <code className="mt-1 block break-all rounded-lg bg-white px-3 py-2 font-mono text-xs">{secret.syncKey}</code>
        </div>
      </div>
      <button
        type="button"
        className="btn-secondary mt-3 text-xs"
        onClick={() => navigator.clipboard?.writeText(secret.syncKey)}
      >
        Copy key
      </button>
    </div>
  );
}

/* ───────────────────────── Devices tab ───────────────────────── */

function DevicesTab({ devices, warehouses, users, onChanged, onSecret, setError }) {
  const { checkPermission } = useAuth();
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);

  const open = (device = null) => setForm(device
    ? { id: device.id, name: device.name, warehouseId: device.warehouseId, actingUserId: device.actingUserId, notes: device.notes || '' }
    : { name: '', code: '', warehouseId: warehouses.find((w) => w.isDefault)?.id || warehouses[0]?.id || '', actingUserId: '', notes: '' });

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      if (form.id) {
        await apiRequest(`/api/pos-devices/${form.id}`, { method: 'PUT', body: JSON.stringify(form) });
      } else {
        const created = await apiRequest('/api/pos-devices', { method: 'POST', body: JSON.stringify(form) });
        onSecret(created);
      }
      setForm(null);
      await onChanged();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const rotate = async (device) => {
    if (!window.confirm(`Issue a new sync key for ${device.name}? The terminal must be updated with the new key.`)) return;
    try {
      onSecret(await apiRequest(`/api/pos-devices/${device.id}/rotate-key`, { method: 'POST' }));
      await onChanged();
    } catch (err) { setError(err.message); }
  };

  const revoke = async (device) => {
    if (!window.confirm(`Revoke ${device.name}? It will stop syncing immediately.`)) return;
    try {
      await apiRequest(`/api/pos-devices/${device.id}/revoke`, { method: 'POST' });
      await onChanged();
    } catch (err) { setError(err.message); }
  };

  return (
    <>
      <Toolbar className="mb-4 justify-between">
        <p className="text-sm text-slate-600">Each POS terminal (desktop or phone) gets its own key, warehouse and invoice prefix.</p>
        {checkPermission('pos.devices.create') && (
          <button type="button" className="btn-primary" onClick={() => open()}>Register device</button>
        )}
      </Toolbar>

      {!devices.length ? (
        <EmptyPanel title="No POS devices yet" description="Register a phone to let SAC-POS sync sales, returns, collections and customers into SACONE." />
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {devices.map((d) => (
            <div key={d.id} className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate font-semibold text-slate-900">{d.name}</div>
                  <div className="font-mono text-xs text-slate-500">{d.code} · {d.keyPrefix}…</div>
                </div>
                <StatusBadge active={d.isActive} labelInactive="Revoked" />
              </div>
              <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                <dt className="text-slate-500">Warehouse</dt><dd className="truncate text-right">{d.warehouseName || '—'}</dd>
                <dt className="text-slate-500">Acts as</dt><dd className="truncate text-right">{d.actingUserName || '—'}</dd>
                <dt className="text-slate-500">Last seen</dt><dd className="text-right">{ago(d.lastSeenAt)}</dd>
                <dt className="text-slate-500">Last push</dt><dd className="text-right">{ago(d.lastPushAt)}</dd>
                <dt className="text-slate-500">Platform</dt><dd className="truncate text-right">{[d.platform, d.appVersion].filter(Boolean).join(' ') || '—'}</dd>
              </dl>
              {(d.failedCount > 0 || d.pendingReviewCount > 0) && (
                <div className="mt-3 flex flex-wrap gap-2 text-xs">
                  {d.failedCount > 0 && <span className="rounded-full bg-rose-100 px-2 py-0.5 font-semibold text-rose-700">{d.failedCount} failed</span>}
                  {d.pendingReviewCount > 0 && <span className="rounded-full bg-amber-100 px-2 py-0.5 font-semibold text-amber-800">{d.pendingReviewCount} to review</span>}
                </div>
              )}
              <div className="mt-4 flex flex-wrap gap-2">
                {checkPermission('pos.devices.edit') && (
                  <>
                    <button type="button" className="btn-secondary px-3 py-1.5 text-xs" onClick={() => open(d)}>Edit</button>
                    <button type="button" className="btn-secondary px-3 py-1.5 text-xs" onClick={() => rotate(d)}>
                      {d.isActive ? 'Rotate key' : 'Re-activate'}
                    </button>
                  </>
                )}
                {d.isActive && checkPermission('pos.devices.delete') && (
                  <button type="button" className="px-3 py-1.5 text-xs font-medium text-rose-600" onClick={() => revoke(d)}>Revoke</button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal
        open={Boolean(form)}
        title={form?.id ? 'Edit POS device' : 'Register POS device'}
        onClose={() => setForm(null)}
        footer={(
          <>
            <button type="button" className="btn-secondary" onClick={() => setForm(null)}>Cancel</button>
            <button type="submit" form="device-form" className="btn-primary" disabled={saving}>{form?.id ? 'Save' : 'Create & show key'}</button>
          </>
        )}
      >
        {form && (
          <form id="device-form" onSubmit={save} className="space-y-3">
            <div>
              <label className="label" htmlFor="dev-name">Device name</label>
              <input id="dev-name" className="input-field" required placeholder="Counter 1 / Sales rep phone" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            {!form.id && (
              <div>
                <label className="label" htmlFor="dev-code">Invoice prefix (optional)</label>
                <input id="dev-code" className="input-field uppercase" maxLength={10} placeholder="Auto: POS1, POS2…" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} />
              </div>
            )}
            <div>
              <label className="label" htmlFor="dev-wh">Warehouse (stock is deducted here)</label>
              <select id="dev-wh" className="input-field" required value={form.warehouseId} onChange={(e) => setForm({ ...form, warehouseId: e.target.value })}>
                {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="dev-user">Records documents as</label>
              <select id="dev-user" className="input-field" value={form.actingUserId} onChange={(e) => setForm({ ...form, actingUserId: e.target.value })}>
                <option value="">Me</option>
                {users.map((u) => <option key={u.id} value={u.id}>{u.fullName} ({u.roleName})</option>)}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="dev-notes">Notes</label>
              <input id="dev-notes" className="input-field" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
          </form>
        )}
      </Modal>
    </>
  );
}

/* ───────────────────────── POS users tab ───────────────────────── */

function PosUsersTab({ posUsers, warehouses, onChanged, setError }) {
  const { checkPermission } = useAuth();
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const body = { ...form, warehouseId: form.warehouseId || null };
      if (!body.pin) delete body.pin;
      if (form.id) await apiRequest(`/api/pos-devices/users/${form.id}`, { method: 'PUT', body: JSON.stringify(body) });
      else await apiRequest('/api/pos-devices/users', { method: 'POST', body: JSON.stringify(body) });
      setForm(null);
      await onChanged();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const toggle = async (u) => {
    try {
      await apiRequest(`/api/pos-devices/users/${u.id}`, { method: 'PUT', body: JSON.stringify({ isActive: !u.isActive }) });
      await onChanged();
    } catch (err) { setError(err.message); }
  };

  return (
    <>
      <Toolbar className="mb-4 justify-between">
        <p className="text-sm text-slate-600">PIN logins for terminals. Changes reach every device on its next sync — terminals log in offline.</p>
        {checkPermission('pos.devices.create') && (
          <button type="button" className="btn-primary" onClick={() => setForm({ loginId: '', displayName: '', pin: '', role: 'cashier', warehouseId: '' })}>
            Add POS user
          </button>
        )}
      </Toolbar>

      <SectionCard noPadding>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-2">Login ID</th>
                <th className="px-4 py-2">Name</th>
                <th className="px-4 py-2">Role</th>
                <th className="px-4 py-2">Terminals</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {posUsers.map((u) => (
                <tr key={u.id} className="border-t border-slate-100">
                  <td className="px-4 py-2 font-mono text-xs">{u.loginId}</td>
                  <td className="px-4 py-2">{u.displayName}</td>
                  <td className="px-4 py-2 capitalize">{u.role}</td>
                  <td className="px-4 py-2 text-xs text-slate-500">{u.warehouseName || 'All warehouses'}</td>
                  <td className="px-4 py-2"><StatusBadge active={u.isActive} /></td>
                  <td className="whitespace-nowrap px-4 py-2 text-right">
                    {checkPermission('pos.devices.edit') && (
                      <>
                        <button type="button" className="text-xs font-medium text-brand-600" onClick={() => setForm({ ...u, pin: '', warehouseId: u.warehouseId || '' })}>Edit</button>
                        <button type="button" className="ml-3 text-xs font-medium text-slate-500" onClick={() => toggle(u)}>{u.isActive ? 'Disable' : 'Enable'}</button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
              {!posUsers.length && (
                <tr><td colSpan={6} className="px-4 py-10 text-center text-slate-400">No POS users yet</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </SectionCard>

      <Modal
        open={Boolean(form)}
        title={form?.id ? `Edit ${form.loginId}` : 'Add POS user'}
        onClose={() => setForm(null)}
        footer={(
          <>
            <button type="button" className="btn-secondary" onClick={() => setForm(null)}>Cancel</button>
            <button type="submit" form="posuser-form" className="btn-primary" disabled={saving}>Save</button>
          </>
        )}
      >
        {form && (
          <form id="posuser-form" onSubmit={save} className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="pu-login">Login ID</label>
              <input id="pu-login" className="input-field uppercase" required disabled={Boolean(form.id)} maxLength={20} value={form.loginId} onChange={(e) => setForm({ ...form, loginId: e.target.value })} />
            </div>
            <div>
              <label className="label" htmlFor="pu-pin">{form.id ? 'New PIN (optional)' : 'PIN (4–8 digits)'}</label>
              <input id="pu-pin" className="input-field" inputMode="numeric" pattern="\d{4,8}" required={!form.id} value={form.pin} onChange={(e) => setForm({ ...form, pin: e.target.value })} />
            </div>
            <div className="sm:col-span-2">
              <label className="label" htmlFor="pu-name">Display name</label>
              <input id="pu-name" className="input-field" required value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} />
            </div>
            <div>
              <label className="label" htmlFor="pu-role">Role</label>
              <select id="pu-role" className="input-field" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                <option value="cashier">Cashier</option>
                <option value="manager">Manager</option>
                <option value="admin">Admin</option>
              </select>
            </div>
            <div>
              <label className="label" htmlFor="pu-wh">Terminals</label>
              <select id="pu-wh" className="input-field" value={form.warehouseId} onChange={(e) => setForm({ ...form, warehouseId: e.target.value })}>
                <option value="">All warehouses</option>
                {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name} only</option>)}
              </select>
            </div>
          </form>
        )}
      </Modal>
    </>
  );
}

/* ───────────────────────── Sync inbox tab ───────────────────────── */

function InboxTab({ devices, onChanged, setError, setMessage }) {
  const { checkPermission } = useAuth();
  const [filters, setFilters] = useState({ status: 'failed', entityType: '', deviceId: '' });
  const [rows, setRows] = useState({ items: [], total: 0 });
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState(null);

  const load = useCallback(async (silent = false) => {
    if (silent !== true) setLoading(true);
    try {
      const qs = new URLSearchParams(Object.entries(filters).filter(([, v]) => v)).toString();
      setRows(await apiRequest(`/api/pos-devices/inbox?limit=200&${qs}`));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [filters, setError]);

  useEffect(() => { load(); }, [load]);
  useLiveRefresh(() => load(true), { tables: ['pos_sync_inbox'] });

  const act = async (item, action, body) => {
    try {
      const res = await apiRequest(`/api/pos-devices/inbox/${item.id}/${action}`, {
        method: 'POST', body: body ? JSON.stringify(body) : undefined,
      });
      setMessage(action === 'retry'
        ? (res.status === 'applied' ? 'Record applied successfully' : `Still failing: ${res.errorMessage}`)
        : `Record ${action === 'approve' ? 'approved' : 'rejected'}`);
      setDetail(null);
      await Promise.all([load(), onChanged()]);
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <>
      <Toolbar className="mb-4">
        <select className="input-field w-auto" value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}>
          <option value="">All statuses</option>
          <option value="failed">Failed</option>
          <option value="pending_review">Pending review</option>
          <option value="applied">Applied</option>
          <option value="ignored">Ignored</option>
          <option value="rejected">Rejected</option>
        </select>
        <select className="input-field w-auto" value={filters.entityType} onChange={(e) => setFilters({ ...filters, entityType: e.target.value })}>
          <option value="">All records</option>
          {['sale', 'return', 'payment', 'customer', 'stock_event', 'product'].map((t) => <option key={t} value={t}>{t.replace('_', ' ')}</option>)}
        </select>
        <select className="input-field w-auto" value={filters.deviceId} onChange={(e) => setFilters({ ...filters, deviceId: e.target.value })}>
          <option value="">All devices</option>
          {devices.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
        <span className="ml-auto text-xs text-slate-500">{rows.total} record(s)</span>
      </Toolbar>

      <SectionCard noPadding>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-2">Received</th>
                <th className="px-4 py-2">Device</th>
                <th className="px-4 py-2">Record</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2">Detail</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400">Loading…</td></tr>}
              {!loading && rows.items.map((i) => (
                <tr key={i.id} className="border-t border-slate-100 align-top">
                  <td className="whitespace-nowrap px-4 py-2 text-xs text-slate-500">{fmtTime(i.updatedAt)}</td>
                  <td className="px-4 py-2 text-xs">{i.deviceCode}</td>
                  <td className="px-4 py-2">
                    <div className="text-xs uppercase text-slate-400">{i.entityType.replace('_', ' ')}</div>
                    <div className="font-mono text-xs">{i.externalRef}</div>
                  </td>
                  <td className="px-4 py-2"><StatusPill status={i.status} map={INBOX_STATUS_COLORS} /></td>
                  <td className="max-w-xs px-4 py-2 text-xs text-slate-600">
                    {i.errorMessage || i.warnings?.map((w) => w.message).join(' · ') || '—'}
                    {i.attempts > 1 && <span className="ml-1 text-slate-400">({i.attempts} attempts)</span>}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2 text-right text-xs">
                    <button type="button" className="font-medium text-slate-600" onClick={() => setDetail(i)}>View</button>
                    {i.status === 'failed' && checkPermission('pos.devices.edit') && (
                      <button type="button" className="ml-3 font-medium text-brand-600" onClick={() => act(i, 'retry')}>Retry</button>
                    )}
                    {i.status === 'pending_review' && i.entityType === 'product' && checkPermission('pos.devices.approve') && (
                      <button type="button" className="ml-3 font-medium text-emerald-600" onClick={() => act(i, 'approve', {})}>Approve</button>
                    )}
                    {['failed', 'pending_review'].includes(i.status) && i.entityType !== 'stock_event' && checkPermission('pos.devices.approve') && (
                      <button type="button" className="ml-3 font-medium text-rose-600" onClick={() => act(i, 'reject', { reason: window.prompt('Reason for rejecting?') || '' })}>Reject</button>
                    )}
                  </td>
                </tr>
              ))}
              {!loading && !rows.items.length && (
                <tr><td colSpan={6} className="px-4 py-10 text-center text-slate-400">Nothing here — all synced records are healthy.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </SectionCard>

      <Modal open={Boolean(detail)} title={`${detail?.entityType} ${detail?.externalRef}`} onClose={() => setDetail(null)} size="lg">
        {detail && (
          <div className="space-y-3 text-sm">
            <div className="flex flex-wrap gap-2">
              <StatusPill status={detail.status} map={INBOX_STATUS_COLORS} />
              {detail.errorCode && <span className="rounded-full bg-rose-50 px-2 py-0.5 font-mono text-[11px] text-rose-700">{detail.errorCode}</span>}
            </div>
            {detail.errorMessage && <p className="text-rose-700">{detail.errorMessage}</p>}
            <pre className="max-h-96 overflow-auto rounded-xl bg-slate-900 p-3 text-[11px] leading-relaxed text-slate-100">
              {JSON.stringify(detail.payload, null, 2)}
            </pre>
          </div>
        )}
      </Modal>
    </>
  );
}

/* ───────────────────────── Page ───────────────────────── */

export default function PosDevicesPage() {
  const [tab, setTab] = useState('devices');
  const [devices, setDevices] = useState([]);
  const [posUsers, setPosUsers] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [users, setUsers] = useState([]);
  const [summary, setSummary] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [secret, setSecret] = useState(null);

  const load = useCallback(async () => {
    setError('');
    try {
      const [d, pu, s] = await Promise.all([
        apiRequest('/api/pos-devices'),
        apiRequest('/api/pos-devices/users'),
        apiRequest('/api/pos-devices/inbox/summary'),
      ]);
      setDevices(d);
      setPosUsers(pu);
      setSummary(s);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    apiRequest('/api/warehouses').then((w) => setWarehouses((Array.isArray(w) ? w : w.items || []).filter((x) => x.isActive))).catch(() => {});
    apiRequest('/api/users').then((u) => setUsers((Array.isArray(u) ? u : u.items || []).filter((x) => x.isActive))).catch(() => {});
  }, [load]);

  // Device status (last seen, last sync) and the inbox summary follow every terminal sync.
  useLiveRefresh(load, { tables: ['pos_devices', 'pos_users', 'pos_sync_inbox', 'warehouses', 'users'] });

  const totals = useMemo(() => {
    const by = (status) => summary.filter((r) => r.status === status).reduce((s, r) => s + r.count, 0);
    const sales = summary.filter((r) => r.entityType === 'sale' && r.status === 'applied').reduce((s, r) => s + r.count, 0);
    return { failed: by('failed'), review: by('pending_review'), sales };
  }, [summary]);

  const online = devices.filter((d) => d.isActive && d.lastSeenAt && Date.now() - new Date(d.lastSeenAt).getTime() < 15 * 60000).length;

  return (
    <RequirePermission permission="pos.devices.view" fallback={<Alert message="You do not have access to POS devices." />}>
      <PageHeader
        title="POS Devices & Sync"
        description="Connect SAC-POS phones to SACONE. Sales, returns, collections and new customers sync automatically; products, prices, stock and customers flow back. Staff sign in with their ERP login and role permissions."
      />
      <Alert type="error" message={error} />
      <Alert type="success" message={message} />
      <SyncKeyBanner secret={secret} onClose={() => setSecret(null)} />

      {loading ? <SkeletonGrid /> : (
        <>
          <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard label="Active devices" value={devices.filter((d) => d.isActive).length} hint={`${online} online (15 min)`} icon="🖥️" />
            <StatCard label="Synced invoices" value={totals.sales} icon="🧾" tone="success" />
            <StatCard label="Failed records" value={totals.failed} tone={totals.failed ? 'danger' : 'default'} icon="⚠️" />
            <StatCard label="Awaiting review" value={totals.review} tone={totals.review ? 'warning' : 'default'} icon="🕒" />
          </div>

          <div className="mb-4">
            <ModuleTabs
              active={tab}
              onChange={setTab}
              tabs={[
                { id: 'devices', label: 'Devices' },
                { id: 'users', label: 'POS users' },
                { id: 'inbox', label: 'Sync inbox', badge: totals.failed + totals.review },
              ]}
            />
          </div>

          {tab === 'devices' && (
            <DevicesTab devices={devices} warehouses={warehouses} users={users} onChanged={load} onSecret={setSecret} setError={setError} />
          )}
          {tab === 'users' && (
            <PosUsersTab posUsers={posUsers} warehouses={warehouses} onChanged={load} setError={setError} />
          )}
          {tab === 'inbox' && (
            <InboxTab devices={devices} onChanged={load} setError={setError} setMessage={setMessage} />
          )}
        </>
      )}
    </RequirePermission>
  );
}
