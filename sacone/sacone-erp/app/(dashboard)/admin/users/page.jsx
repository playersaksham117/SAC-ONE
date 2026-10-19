'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { apiRequest } from '../../../../lib/api';
import { useLiveRefresh } from '../../../../lib/live';
import { useAuth, RequirePermission } from '../../../../lib/auth-context';
import PageHeader, { Alert, LoadingState, Modal, StatusBadge } from '../../../../components/ui';

const EMPTY_USER = {
  email: '',
  password: '',
  fullName: '',
  phone: '',
  roleId: '',
  isActive: true,
  posLoginId: '',
  posPin: '',
  posClear: false,
};

/** Random 6-digit PIN that passes the server's rules (no repeats like 111111, no 123456). */
function generatePin() {
  for (;;) {
    const pin = String(100000 + (crypto.getRandomValues(new Uint32Array(1))[0] % 900000));
    if (!/^(\d)\1+$/.test(pin) && pin !== '123456' && pin !== '654321') return pin;
  }
}

const when = (iso) => (iso ? new Date(iso).toLocaleString('en-IN') : '—');

/** Readable one-time password: no 0/O/1/l/I. */
function generatePassword() {
  const pick = (chars, n) => Array.from(crypto.getRandomValues(new Uint8Array(n)), (b) => chars[b % chars.length]).join('');
  return `${pick('ABCDEFGHJKLMNPQRSTUVWXYZ', 2)}${pick('abcdefghjkmnpqrstuvwxyz', 4)}${pick('23456789', 3)}@`;
}

export default function UsersPage() {
  const { checkPermission, session } = useAuth();
  const [users, setUsers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_USER);
  const [saving, setSaving] = useState(false);
  const [detail, setDetail] = useState(null);
  const [showPassword, setShowPassword] = useState(false);

  const canCreate = checkPermission('core.users.create');
  // The group owner can use every terminal; others need a role with SAC-POS access.
  const posAccess = (user) => user.roleSlug === 'owner_admin' || Boolean(roles.find((r) => r.id === user.roleId)?.canUsePos);
  const canEdit = checkPermission('core.users.edit');

  const loadData = async (silent = false) => {
    if (silent !== true) setLoading(true);
    try {
      const [usersData, rolesData] = await Promise.all([
        apiRequest('/api/users'),
        apiRequest('/api/roles'),
      ]);
      setUsers(usersData);
      setRoles(rolesData.filter((r) => r.isActive));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useLiveRefresh(() => loadData(true));
  useEffect(() => {
    loadData();
  }, []);

  const openCreate = () => {
    setEditing(null);
    setDetail(null);
    setShowPassword(false);
    setForm(EMPTY_USER);
    setModalOpen(true);
  };

  const openEdit = async (user) => {
    setEditing(user);
    setDetail(user);
    setShowPassword(false);
    setForm({
      email: user.email,
      password: '',
      fullName: user.fullName,
      phone: user.phone || '',
      roleId: user.roleId,
      isActive: user.isActive,
      posLoginId: user.posLoginId || '',
      posPin: '',
      posClear: false,
    });
    setModalOpen(true);
    try {
      setDetail(await apiRequest(`/api/users/${user.id}`));
    } catch {
      /* the list row is enough to edit with */
    }
  };

  // SAC-POS Login ID / PIN: saved only when something changed.
  const savePosLogin = async (userId, before) => {
    const loginId = form.posLoginId.trim().toUpperCase();
    const changed = loginId !== (before?.posLoginId || '') || form.posPin || form.posClear;
    if (!changed) return;
    await apiRequest(`/api/users/${userId}/pos-pin`, {
      method: 'PUT',
      body: JSON.stringify({ loginId, pin: form.posClear ? undefined : form.posPin || undefined, clear: form.posClear || undefined }),
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      if (editing) {
        const payload = {
          email: form.email,
          fullName: form.fullName,
          phone: form.phone,
          roleId: form.roleId,
          isActive: form.isActive,
        };
        if (form.password) payload.password = form.password;
        await apiRequest(`/api/users/${editing.id}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
        await savePosLogin(editing.id, editing);
      } else {
        const { isActive, posLoginId, posPin, posClear, ...createPayload } = form;
        const created = await apiRequest('/api/users', {
          method: 'POST',
          body: JSON.stringify(createPayload),
        });
        await savePosLogin(created.id, null);
      }
      setModalOpen(false);
      await loadData();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (user) => {
    setError('');
    try {
      const path = user.isActive
        ? `/api/users/${user.id}/deactivate`
        : `/api/users/${user.id}/activate`;
      await apiRequest(path, { method: 'POST' });
      await loadData();
    } catch (err) {
      setError(err.message);
    }
  };

  if (loading) return <LoadingState />;

  return (
    <RequirePermission permission="core.users.view">
      <PageHeader
        title="User Management"
        description={`Users of ${session?.firm?.name || 'this firm'}. Each firm has its own users and roles; staff sign in to their own firm only. SAC-POS staff are added here too: they sign in to the terminal with the same email and password.`}
        actions={canCreate && <button type="button" className="btn-primary" onClick={openCreate}>+ Add User</button>}
      />

      <Alert type="error" message={error} />

      <div className="card overflow-hidden p-0">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-4 py-3 text-left font-medium text-slate-600">Name</th>
              <th className="px-4 py-3 text-left font-medium text-slate-600">Email</th>
              <th className="px-4 py-3 text-left font-medium text-slate-600">Role</th>
              <th className="px-4 py-3 text-left font-medium text-slate-600" title="The role includes POS terminal access">SAC-POS</th>
              <th className="px-4 py-3 text-left font-medium text-slate-600">Status</th>
              <th className="px-4 py-3 text-left font-medium text-slate-600">Last Login</th>
              {canEdit && <th className="px-4 py-3 text-right font-medium text-slate-600">Actions</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {users.map((user) => (
              <tr key={user.id} className="hover:bg-slate-50">
                <td className="px-4 py-3 font-medium">{user.fullName}</td>
                <td className="px-4 py-3 text-slate-600">{user.email}</td>
                <td className="px-4 py-3">{user.roleName}</td>
                <td className="px-4 py-3">
                  {posAccess(user) ? (
                    <div className="flex flex-col items-start gap-0.5">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${user.posPinSet ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-800'}`}>
                        {user.posPinSet ? 'PIN set' : 'No PIN yet'}
                      </span>
                      {user.posLoginId && <span className="font-mono text-[11px] text-slate-500">ID {user.posLoginId}</span>}
                    </div>
                  ) : <span className="text-xs text-slate-400">—</span>}
                </td>
                <td className="px-4 py-3"><StatusBadge active={user.isActive} /></td>
                <td className="px-4 py-3 text-slate-500">{user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString() : '—'}</td>
                {canEdit && (
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-2">
                      <button type="button" className="btn-secondary" onClick={() => openEdit(user)}>Edit</button>
                      {user.id !== session?.user?.id && (
                        <button
                          type="button"
                          className={user.isActive ? 'btn-danger' : 'btn-secondary'}
                          onClick={() => toggleActive(user)}
                        >
                          {user.isActive ? 'Deactivate' : 'Activate'}
                        </button>
                      )}
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal
        open={modalOpen}
        title={editing ? 'Edit User' : 'Create User'}
        size="lg"
        onClose={() => setModalOpen(false)}
        footer={(
          <>
            <button type="button" className="btn-secondary" onClick={() => setModalOpen(false)}>Cancel</button>
            <button type="submit" form="user-form" className="btn-primary" disabled={saving}>
              {saving ? 'Saving...' : 'Save'}
            </button>
          </>
        )}
      >
        <form id="user-form" onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="label" htmlFor="email">Email (login ID) *</label>
            <input id="email" className="input-field" type="email" autoComplete="off" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
            {editing && form.email.trim().toLowerCase() !== editing.email.toLowerCase() && (
              <p className="mt-1 text-xs text-amber-700">They will sign in to the ERP and SAC-POS with the new email from now on.</p>
            )}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="fullName">Full Name *</label>
              <input id="fullName" className="input-field" value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} required />
            </div>
            <div>
              <label className="label" htmlFor="phone">Phone</label>
              <input id="phone" className="input-field" type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="roleId">Role *</label>
              <select id="roleId" className="input-field" value={form.roleId} onChange={(e) => setForm({ ...form, roleId: e.target.value })} required>
                <option value="">Select role</option>
                {roles.map((role) => (
                  <option key={role.id} value={role.id}>{role.name}{role.canUsePos ? ' · SAC-POS' : ''}</option>
                ))}
              </select>
              {form.roleId && (
                <p className="mt-1 text-xs text-slate-500">
                  {roles.find((r) => r.id === form.roleId)?.permissionCount ?? 0} permissions ·{' '}
                  {roles.find((r) => r.id === form.roleId)?.canUsePos ? 'can sign in to SAC-POS · ' : 'no SAC-POS access · '}
                  <Link href={`/admin/roles/${form.roleId}`} className="text-brand-600 hover:underline">view role</Link>
                </p>
              )}
            </div>
            {editing && (
              <div>
                <span className="label">Status</span>
                <label className="flex min-h-[40px] items-center gap-2 rounded-lg border border-slate-300 px-3 text-sm">
                  <input
                    type="checkbox"
                    checked={form.isActive}
                    disabled={editing.id === session?.user?.id}
                    onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
                  />
                  {form.isActive ? 'Active: can sign in' : 'Inactive: cannot sign in'}
                </label>
                {editing.id === session?.user?.id && <p className="mt-1 text-xs text-slate-500">You cannot deactivate your own account.</p>}
              </div>
            )}
          </div>
          <p className="text-xs text-slate-500">
            {editing ? 'Belongs to' : 'Will belong to'} <b>{session?.firm?.name || 'this firm'}</b> and can sign in to this firm only.
          </p>
          <div>
            <label className="label" htmlFor="password">{editing ? 'New Password (optional)' : 'Password *'}</label>
            <div className="flex gap-2">
              <input
                id="password"
                className="input-field"
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                required={!editing}
                placeholder={editing ? 'Leave blank to keep the current password' : ''}
              />
              <button type="button" className="btn-secondary shrink-0" onClick={() => setShowPassword((v) => !v)}>{showPassword ? 'Hide' : 'Show'}</button>
              <button type="button" className="btn-secondary shrink-0" onClick={() => { setForm({ ...form, password: generatePassword() }); setShowPassword(true); }}>Generate</button>
            </div>
            {form.password && showPassword && <p className="mt-1 text-xs text-slate-500">Copy it now and give it to the user; it is not shown again after saving.</p>}
          </div>

          <div className="rounded-xl border border-slate-200 p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="font-semibold text-slate-900">SAC-POS sign-in</span>
              <span className="text-xs text-slate-500">
                {editing?.posPinSet ? `PIN set${editing.posPinSetAt ? ` on ${new Date(editing.posPinSetAt).toLocaleDateString('en-IN')}` : ''}` : 'No PIN yet'}
              </span>
            </div>
            <p className="mb-3 mt-1 text-xs text-slate-500">On the phone, staff sign in with this Login ID (or their email) and PIN. The PIN is set only here, not on the phone.</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-sm"><span className="label">Login ID (optional)</span>
                <input className="input-field font-mono uppercase" maxLength={20} placeholder="e.g. 1001 or RAVI" value={form.posLoginId} onChange={(e) => setForm({ ...form, posLoginId: e.target.value })} />
              </label>
              <div className="text-sm">
                <span className="label">{editing?.posPinSet ? 'New PIN (optional)' : 'PIN (4–6 digits)'}</span>
                <div className="flex gap-2">
                  <input className="input-field font-mono tracking-widest" inputMode="numeric" autoComplete="off" maxLength={6} pattern="\d{4,6}"
                    disabled={form.posClear} placeholder={editing?.posPinSet ? 'Leave blank to keep' : '••••'} value={form.posPin}
                    onChange={(e) => setForm({ ...form, posPin: e.target.value.replace(/\D/g, '') })} />
                  <button type="button" className="btn-secondary shrink-0" disabled={form.posClear} onClick={() => setForm({ ...form, posPin: generatePin() })}>Generate</button>
                </div>
                {form.posPin && <p className="mt-1 text-xs text-slate-500">Tell the user this PIN now; it is not shown again after saving.</p>}
              </div>
            </div>
            {editing?.posPinSet && (
              <label className="mt-2 flex items-center gap-2 text-xs text-slate-600">
                <input type="checkbox" checked={form.posClear} onChange={(e) => setForm({ ...form, posClear: e.target.checked, posPin: '' })} />
                Remove the PIN (they cannot sign in to SAC-POS until a new one is set)
              </label>
            )}
          </div>

          {editing && detail && (
            <div className="grid gap-x-6 gap-y-2 rounded-xl bg-slate-50 p-4 text-sm sm:grid-cols-2">
              <div><div className="text-xs text-slate-500">Last sign-in</div><div className="font-medium">{when(detail.lastLoginAt)}</div></div>
              <div><div className="text-xs text-slate-500">Created</div><div className="font-medium">{when(detail.createdAt)}{detail.createdByName ? ` by ${detail.createdByName}` : ''}</div></div>
              <div><div className="text-xs text-slate-500">Last updated</div><div className="font-medium">{when(detail.updatedAt)}</div></div>
              <div>
                <div className="text-xs text-slate-500">Sales agent (commission)</div>
                <div className="font-medium">
                  {detail.salesAgent
                    ? <Link href="/business/commissions" className="text-brand-600 hover:underline">{detail.salesAgent.agentCode} · {detail.salesAgent.name}{detail.salesAgent.status !== 'active' ? ' (inactive)' : ''}</Link>
                    : 'Not a sales agent'}
                </div>
              </div>
            </div>
          )}
        </form>
      </Modal>
    </RequirePermission>
  );
}
