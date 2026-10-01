'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { apiRequest } from '../../../../../lib/api';
import { RequirePermission } from '../../../../../lib/auth-context';
import PageHeader, { Alert, LoadingState, StatusBadge, SystemBadge } from '../../../../../components/ui';
import PermissionMatrix from '../../../../../components/PermissionMatrix';

export default function RoleDetailPage() {
  const params = useParams();
  const [role, setRole] = useState(null);
  const [permissionTree, setPermissionTree] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([
      apiRequest(`/api/roles/${params.id}`),
      apiRequest('/api/roles/permission-tree'),
    ])
      .then(([roleData, treeData]) => {
        setRole(roleData);
        setPermissionTree(treeData);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [params.id]);

  if (loading) return <LoadingState />;
  if (!role) return <Alert type="error" message={error || 'Role not found'} />;

  const selectedIds = role.permissions.map((p) => p.id);

  return (
    <RequirePermission permission="core.roles.view">
      <PageHeader
        title={role.name}
        description={role.description || 'Role details and assigned permissions'}
        actions={<Link href="/admin/roles" className="btn-secondary">← Back to Roles</Link>}
      />

      <Alert type="error" message={error} />

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
          <div className="mt-1 font-medium">{role.permissions.length}</div>
        </div>
      </div>

      <div className="card">
        <h3 className="mb-4 font-semibold">Permission Matrix</h3>
        <PermissionMatrix
          tree={permissionTree}
          selectedIds={selectedIds}
          onToggle={() => {}}
          readOnly
        />
      </div>
    </RequirePermission>
  );
}
