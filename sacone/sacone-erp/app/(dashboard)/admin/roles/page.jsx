'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { apiRequest } from '../../../../lib/api';
import { useLiveRefresh } from '../../../../lib/live';
import { useAuth, RequirePermission } from '../../../../lib/auth-context';
import PageHeader, { Alert, LoadingState, Modal, StatusBadge, SystemBadge } from '../../../../components/ui';
import PermissionMatrix from '../../../../components/PermissionMatrix';

const EMPTY_ROLE = {
  name: '',
  description: '',
  permissionIds: [],
};

export default function RolesPage() {
  const { checkPermission } = useAuth();
  const [roles, setRoles] = useState([]);
  const [permissionTree, setPermissionTree] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_ROLE);
  const [saving, setSaving] = useState(false);

  const canCreate = checkPermission('core.roles.create');
  const canEdit = checkPermission('core.roles.edit');
  const canDelete = checkPermission('core.roles.delete');

  const loadData = async (silent = false) => {
    if (silent !== true) setLoading(true);
    try {
      const [rolesData, treeData] = await Promise.all([
        apiRequest('/api/roles'),
        apiRequest('/api/roles/permission-tree'),
      ]);
      setRoles(rolesData);
      setPermissionTree(treeData);
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
    setForm(EMPTY_ROLE);
    setModalOpen(true);
  };

  const openEdit = async (role) => {
    setError('');
    try {
      const detail = await apiRequest(`/api/roles/${role.id}`);
      setEditing(role);
      setForm({
        name: detail.name,
        description: detail.description || '',
        permissionIds: detail.permissions.map((p) => p.id),
      });
      setModalOpen(true);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const payload = {
        name: form.name,
        description: form.description,
        permissionIds: form.permissionIds,
      };

      if (editing) {
        await apiRequest(`/api/roles/${editing.id}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
      } else {
        await apiRequest('/api/roles', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
      }
      setModalOpen(false);
      await loadData();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (role) => {
    if (!window.confirm(`Delete role "${role.name}"?`)) return;
    setError('');
    try {
      await apiRequest(`/api/roles/${role.id}`, { method: 'DELETE' });
      await loadData();
    } catch (err) {
      setError(err.message);
    }
  };

  const togglePermission = (permissionId) => {
    setForm((prev) => {
      const exists = prev.permissionIds.includes(permissionId);
      return {
        ...prev,
        permissionIds: exists
          ? prev.permissionIds.filter((id) => id !== permissionId)
          : [...prev.permissionIds, permissionId],
      };
    });
  };

  const isOwnerAdmin = editing?.slug === 'owner_admin';

  if (loading) return <LoadingState />;

  return (
    <RequirePermission permission="core.roles.view">
      <PageHeader
        title="Roles & Permissions"
        description="Manage roles, permissions, and link to approval rules (authorization thresholds)."
        actions={(
          <div className="flex flex-wrap gap-2">
            <Link href="/admin/approval-rules" className="btn-secondary">Approval Rules</Link>
            {canCreate && <button type="button" className="btn-primary" onClick={openCreate}>+ Create Role</button>}
          </div>
        )}
      />

      <Alert type="error" message={error} />

      <div className="card overflow-hidden p-0">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-4 py-3 text-left font-medium text-slate-600">Role</th>
              <th className="px-4 py-3 text-left font-medium text-slate-600">Description</th>
              <th className="px-4 py-3 text-left font-medium text-slate-600">Permissions</th>
              <th className="px-4 py-3 text-left font-medium text-slate-600">Status</th>
              <th className="px-4 py-3 text-right font-medium text-slate-600">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {roles.map((role) => (
              <tr key={role.id} className="hover:bg-slate-50">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2 font-medium">
                    {role.name}
                    {role.isSystem && <SystemBadge />}
                  </div>
                </td>
                <td className="px-4 py-3 text-slate-600">{role.description || '—'}</td>
                <td className="px-4 py-3">{role.permissionCount}</td>
                <td className="px-4 py-3"><StatusBadge active={role.isActive} /></td>
                <td className="px-4 py-3 text-right">
                  <div className="flex justify-end gap-2">
                    <Link href={`/admin/roles/${role.id}`} className="btn-secondary">View</Link>
                    {canEdit && (
                      <button type="button" className="btn-secondary" onClick={() => openEdit(role)}>Edit</button>
                    )}
                    {canDelete && !role.isSystem && (
                      <button type="button" className="btn-danger" onClick={() => handleDelete(role)}>Delete</button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal
        open={modalOpen}
        title={editing ? `Edit Role: ${editing.name}` : 'Create Custom Role'}
        onClose={() => setModalOpen(false)}
        footer={(
          <>
            <button type="button" className="btn-secondary" onClick={() => setModalOpen(false)}>Cancel</button>
            {!isOwnerAdmin && (
              <button type="submit" form="role-form" className="btn-primary" disabled={saving}>
                {saving ? 'Saving...' : 'Save Role'}
              </button>
            )}
          </>
        )}
      >
        <form id="role-form" onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="label" htmlFor="roleName">Role Name *</label>
            <input
              id="roleName"
              className="input-field"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
              disabled={isOwnerAdmin}
            />
          </div>
          <div>
            <label className="label" htmlFor="roleDescription">Description</label>
            <textarea
              id="roleDescription"
              className="input-field min-h-[80px]"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              disabled={isOwnerAdmin}
            />
          </div>

          {isOwnerAdmin ? (
            <p className="rounded-lg bg-blue-50 p-3 text-sm text-blue-700">
              Owner/Admin always has full access. Permissions cannot be modified.
            </p>
          ) : (
            <PermissionMatrix
              tree={permissionTree}
              selectedIds={form.permissionIds}
              onToggle={togglePermission}
            />
          )}
        </form>
      </Modal>
    </RequirePermission>
  );
}
