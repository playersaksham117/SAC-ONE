'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { apiRequest } from '../../../../../lib/api';
import { RequirePermission, useAuth } from '../../../../../lib/auth-context';
import PageHeader, { Alert, LoadingState, StatusBadge, SystemBadge } from '../../../../../components/ui';
import PermissionMatrix from '../../../../../components/PermissionMatrix';

export default function RoleDetailPage() {
  const params = useParams();
  const { checkPermission } = useAuth();
  const canEdit = checkPermission('core.roles.edit');
  const [role, setRole] = useState(null);
  const [permissionTree, setPermissionTree] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [editing, setEditing] = useState(false);
  const [selected, setSelected] = useState([]);
  const [saving, setSaving] = useState(false);

  const load = () => Promise.all([
    apiRequest(`/api/roles/${params.id}`),
    apiRequest('/api/roles/permission-tree'),
  ])
    .then(([roleData, treeData]) => {
      setRole(roleData);
      setPermissionTree(treeData);
      setSelected(roleData.permissions.map((p) => p.id));
    })
    .catch((err) => setError(err.message))
    .finally(() => setLoading(false));

  useEffect(() => { load(); }, [params.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = (id) => setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  const setMany = (ids, checked) => setSelected((prev) => {
    const next = new Set(prev);
    for (const id of ids) {
      if (checked) next.add(id);
      else next.delete(id);
    }
    return [...next];
  });

  const save = async () => {
    setSaving(true);
    setError('');
    try {
      await apiRequest(`/api/roles/${params.id}`, { method: 'PUT', body: JSON.stringify({ permissionIds: selected }) });
      setMessage('Permissions saved');
      setEditing(false);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <LoadingState />;
  if (!role) return <Alert type="error" message={error || 'Role not found'} />;

  return (
    <RequirePermission permission="core.roles.view">
      <PageHeader
        title={role.name}
        description={role.description || 'Role details and assigned permissions'}
        actions={(
          <div className="flex flex-wrap gap-2">
            {canEdit && !editing && <button type="button" className="btn-primary" onClick={() => { setMessage(''); setEditing(true); }}>Edit permissions</button>}
            {editing && (
              <>
                <button type="button" className="btn-secondary" onClick={() => { setEditing(false); setSelected(role.permissions.map((p) => p.id)); }}>Cancel</button>
                <button type="button" className="btn-primary" disabled={saving} onClick={save}>{saving ? 'Saving…' : 'Save permissions'}</button>
              </>
            )}
            <Link href="/admin/roles" className="btn-secondary">← Back to Roles</Link>
          </div>
        )}
      />

      <Alert type="error" message={error} />
      <Alert type="success" message={message} />

      <div className="mb-6 grid gap-4 md:grid-cols-3">
        <div className="card">
          <div className="text-sm text-slate-500">Type</div>
          <div className="mt-1 flex items-center gap-2 font-medium">
            {role.isSystem ? 'System Role' : 'Custom Role'}
            {role.isSystem && <SystemBadge />}
          </div>
        </div>
        <div className="card">
          <div className="text-sm text-slate-500">Status</div>
          <div className="mt-1"><StatusBadge active={role.isActive} /></div>
        </div>
        <div className="card">
          <div className="text-sm text-slate-500">Permissions</div>
          <div className="mt-1 font-medium">{editing ? `${selected.length} selected` : role.permissions.length}</div>
        </div>
      </div>

      <div className="card">
        <h3 className="mb-4 font-semibold">Permission Matrix</h3>
        <PermissionMatrix
          tree={permissionTree}
          selectedIds={selected}
          onToggle={toggle}
          onSetMany={setMany}
          readOnly={!editing}
        />
      </div>
    </RequirePermission>
  );
}
