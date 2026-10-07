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
};

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
  const [firms, setFirms] = useState([]);
  const [firmIds, setFirmIds] = useState([]);

  const canCreate = checkPermission('core.users.create');
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
      setFirms(await apiRequest('/api/auth/firms').catch(() => []));
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
    setFirmIds(session?.firm?.id ? [session.firm.id] : []);
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
    });
    setFirmIds([]);
    setModalOpen(true);
    try {
      const [userDetail, access] = await Promise.all([
        apiRequest(`/api/users/${user.id}`),
        apiRequest(`/api/users/${user.id}/firms`).catch(() => null),
      ]);
      setDetail(userDetail);
      if (access) setFirmIds(access.firmIds);
    } catch {
      /* the list row is enough to edit with */
    }
  };

  const selectedRole = roles.find((r) => r.id === form.roleId);
  const isOwnerRole = selectedRole?.slug === 'owner_admin';
  // Only worth asking with more than one firm; the owner opens every firm anyway.
  const showFirmAccess = firms.length > 1 && !isOwnerRole;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (showFirmAccess && !firmIds.length) {
      setError('Tick at least one firm this user can open.');
      return;
    }
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
        if (showFirmAccess) {
          await apiRequest(`/api/users/${editing.id}/firms`, { method: 'PUT', body: JSON.stringify({ firmIds }) });
        }
      } else {
        const { isActive, ...createPayload } = form;
        const created = await apiRequest('/api/users', {
          method: 'POST',
          body: JSON.stringify(createPayload),
        });
        if (showFirmAccess && created?.id) {
          await apiRequest(`/api/users/${created.id}/firms`, { method: 'PUT', body: JSON.stringify({ firmIds }) });
        }
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
        description="Create users, assign roles, and manage access."
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
                  <option key={role.id} value={role.id}>{role.name}</option>
                ))}
              </select>
              {form.roleId && (
                <p className="mt-1 text-xs text-slate-500">
                  {roles.find((r) => r.id === form.roleId)?.permissionCount ?? 0} permissions ·{' '}
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
          {firms.length > 1 && (
            <div>
              <span className="label">Firms this user can open</span>
              {isOwnerRole ? (
                <p className="text-xs text-slate-500">Owner / Admin opens every firm.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {firms.map((f) => (
                    <label key={f.id} className={`flex min-h-[40px] items-center gap-2 rounded-lg border px-3 text-sm ${firmIds.includes(f.id) ? 'border-brand-500 bg-brand-50' : 'border-slate-300'}`}>
                      <input
                        type="checkbox"
                        checked={firmIds.includes(f.id)}
                        onChange={(e) => setFirmIds((ids) => (e.target.checked ? [...ids, f.id] : ids.filter((id) => id !== f.id)))}
                      />
                      {f.name}
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}
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
