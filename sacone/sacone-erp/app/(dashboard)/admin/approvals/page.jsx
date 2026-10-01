'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { apiRequest } from '../../../../lib/api';
import { useLiveRefresh } from '../../../../lib/live';
import { useAuth, RequirePermission } from '../../../../lib/auth-context';
import PageHeader, { Alert, Modal } from '../../../../components/ui';
import { StatCard, SectionCard, EmptyPanel } from '../../../../components/module-ui';

function money(n) {
  return `₹${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const STATUS_CLASS = {
  pending: 'bg-amber-100 text-amber-800',
  partially_approved: 'bg-sky-100 text-sky-800',
  approved: 'bg-emerald-100 text-emerald-800',
  rejected: 'bg-rose-100 text-rose-800',
  cancelled: 'bg-slate-200 text-slate-600',
};

export default function ApprovalsCenterPage() {
  const { checkPermission } = useAuth();
  const canApprove = checkPermission('core.approvals.approve');
  const [dashboard, setDashboard] = useState(null);
  const [scope, setScope] = useState('assigned');
  const [status, setStatus] = useState('open');
  const [module, setModule] = useState('');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [rejectModal, setRejectModal] = useState(null);
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async (silent = false) => {
    if (silent !== true) setLoading(true);
    setError('');
    try {
      const q = new URLSearchParams({ scope, limit: '100' });
      if (status) q.set('status', status === 'open' ? 'open' : status);
      if (module) q.set('module', module);
      const [dash, list] = await Promise.all([
        apiRequest('/api/approvals/dashboard'),
        apiRequest(`/api/approvals/requests?${q}`),
      ]);
      setDashboard(dash);
      setItems(list.items || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [scope, status, module]);

  useLiveRefresh(() => load(true));
  useEffect(() => { load(); }, [load]);

  const approve = async (id) => {
    setSaving(true);
    setError('');
    try {
      await apiRequest(`/api/approvals/requests/${id}/approve`, { method: 'POST', body: '{}' });
      setMessage('Approved');
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const reject = async () => {
    if (!rejectModal) return;
    setSaving(true);
    try {
      await apiRequest(`/api/approvals/requests/${rejectModal.id}/reject`, {
        method: 'POST',
        body: JSON.stringify({ reason }),
      });
      setRejectModal(null);
      setReason('');
      setMessage('Rejected');
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <RequirePermission permission="core.approvals.view">
      <div className="mx-auto max-w-7xl space-y-5 p-4 sm:p-6">
        <PageHeader
          title="Approval Center"
          description="Pending authorizations across Finance, Purchases, Inventory, and more. Permissions allow create; approvals authorize finalize."
          actions={(
            <Link href="/admin/approval-rules" className="btn-secondary">Approval Rules</Link>
          )}
        />
        <Alert type="error" message={error} />
        <Alert type="success" message={message} />

        {dashboard?.summary && (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Pending" value={dashboard.summary.pending} tone="warning" compact />
            <StatCard label="Assigned to my role" value={dashboard.summary.assignedToMe} tone="info" compact />
            <StatCard label="Approved (30d)" value={dashboard.summary.approvedRecent} tone="success" compact />
            <StatCard label="Rejected (30d)" value={dashboard.summary.rejectedRecent} tone="danger" compact />
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          {[
            { id: 'assigned', label: 'Assigned to me' },
            { id: 'open', label: 'All open' },
            { id: 'mine', label: 'My requests' },
            { id: 'all', label: 'All' },
          ].map((s) => (
            <button
              key={s.id}
              type="button"
              className={`rounded-lg px-3 py-1.5 text-sm font-medium ${scope === s.id ? 'bg-slate-900 text-white' : 'bg-slate-100'}`}
              onClick={() => { setScope(s.id); setStatus(s.id === 'all' ? '' : 'open'); }}
            >
              {s.label}
            </button>
          ))}
          <select className="input" value={module} onChange={(e) => setModule(e.target.value)}>
            <option value="">All modules</option>
            {(dashboard?.modules || []).map((m) => (
              <option key={m.code} value={m.code}>{m.code}</option>
            ))}
          </select>
          <button type="button" className="btn-secondary" onClick={load}>Refresh</button>
        </div>

        <SectionCard title="Requests">
          {loading ? <p className="text-sm text-slate-500">Loading…</p> : (
            <div className="overflow-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-left">
                  <tr>
                    <th className="px-3 py-2">When</th>
                    <th className="px-3 py-2">Module</th>
                    <th className="px-3 py-2">Amount</th>
                    <th className="px-3 py-2">Requested by</th>
                    <th className="px-3 py-2">Level</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {items.map((r) => (
                    <tr key={r.id}>
                      <td className="px-3 py-2 whitespace-nowrap text-xs">{String(r.requestedAt || '').slice(0, 16)}</td>
                      <td className="px-3 py-2">
                        <div className="font-medium capitalize">{r.module} · {r.action}</div>
                        <div className="text-xs text-slate-500">{r.ruleName || r.transactionId}</div>
                      </td>
                      <td className="px-3 py-2 tabular-nums">{r.amount != null ? money(r.amount) : '—'}</td>
                      <td className="px-3 py-2">{r.requestedByName || '—'}</td>
                      <td className="px-3 py-2 text-xs">
                        L{r.currentLevel}/{r.requiredLevels}
                        <div className="text-slate-500">
                          {r.currentLevel === 1 ? r.level1RoleSlug : r.level2RoleSlug}
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <span className={`rounded-full px-2 py-0.5 text-xs ${STATUS_CLASS[r.status] || 'bg-slate-100'}`}>
                          {r.status}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        {canApprove && ['pending', 'partially_approved'].includes(r.status) && (
                          <div className="flex gap-1">
                            <button type="button" className="btn-primary !px-2 !py-1 text-xs" disabled={saving} onClick={() => approve(r.id)}>Approve</button>
                            <button type="button" className="btn-secondary !px-2 !py-1 text-xs" onClick={() => setRejectModal(r)}>Reject</button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                  {!items.length && (
                    <tr><td colSpan={7} className="px-3 py-10"><EmptyPanel title="No approval requests" description="When rules match submitted transactions, they appear here." /></td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>

        {rejectModal && (
          <Modal open title="Reject approval" onClose={() => setRejectModal(null)}>
            <label className="block text-sm">
              <span className="mb-1 block text-slate-600">Reason *</span>
              <textarea className="input w-full" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
            </label>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" className="btn-secondary" onClick={() => setRejectModal(null)}>Cancel</button>
              <button type="button" className="btn-primary" disabled={saving || !reason.trim()} onClick={reject}>Reject</button>
            </div>
          </Modal>
        )}
      </div>
    </RequirePermission>
  );
}
