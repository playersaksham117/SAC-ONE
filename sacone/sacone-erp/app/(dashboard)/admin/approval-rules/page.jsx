'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { apiRequest } from '../../../../lib/api';
import { useLiveRefresh } from '../../../../lib/live';
import { useAuth, RequirePermission } from '../../../../lib/auth-context';
import PageHeader, { Alert, Modal } from '../../../../components/ui';
import { SectionCard } from '../../../../components/module-ui';

const EMPTY = {
  name: '',
  module: 'finance',
  action: 'expense',
  transactionType: 'expense',
  conditionType: 'amount_gte',
  thresholdAmount: 10000,
  thresholdPercent: '',
  level1RoleSlug: 'manager',
  level2RoleSlug: '',
  allowSelfApproval: false,
  isActive: true,
  notes: '',
};

function money(n) {
  return `₹${Number(n || 0).toLocaleString('en-IN')}`;
}

export default function ApprovalRulesPage() {
  const { checkPermission } = useAuth();
  const canCreate = checkPermission('core.approvals.create');
  const canEdit = checkPermission('core.approvals.edit');
  const [rules, setRules] = useState([]);
  const [modules, setModules] = useState([]);
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async (silent = false) => {
    if (silent !== true) setLoading(true);
    try {
      const [r, m, roleOpts] = await Promise.all([
        apiRequest('/api/approvals/rules'),
        apiRequest('/api/approvals/modules'),
        apiRequest('/api/approvals/role-options'),
      ]);
      setRules(r || []);
      setModules(m || []);
      setRoles(roleOpts || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useLiveRefresh(() => load(true));
  useEffect(() => { load(); }, [load]);

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY);
    setModalOpen(true);
  };

  const openEdit = (rule) => {
    setEditing(rule);
    setForm({
      name: rule.name,
      module: rule.module,
      action: rule.action,
      transactionType: rule.transactionType || '',
      conditionType: rule.conditionType,
      thresholdAmount: rule.thresholdAmount ?? '',
      thresholdPercent: rule.thresholdPercent ?? '',
      level1RoleSlug: rule.level1RoleSlug,
      level2RoleSlug: rule.level2RoleSlug || '',
      allowSelfApproval: rule.allowSelfApproval,
      isActive: rule.isActive,
      notes: rule.notes || '',
    });
    setModalOpen(true);
  };

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const payload = {
        ...form,
        thresholdAmount: form.thresholdAmount === '' ? null : Number(form.thresholdAmount),
        thresholdPercent: form.thresholdPercent === '' ? null : Number(form.thresholdPercent),
        level2RoleSlug: form.level2RoleSlug || null,
        transactionType: form.transactionType || null,
      };
      if (editing) {
        await apiRequest(`/api/approvals/rules/${editing.id}`, { method: 'PUT', body: JSON.stringify(payload) });
        setMessage('Rule updated');
      } else {
        await apiRequest('/api/approvals/rules', { method: 'POST', body: JSON.stringify(payload) });
        setMessage('Rule created');
      }
      setModalOpen(false);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const deactivate = async (id) => {
    try {
      await apiRequest(`/api/approvals/rules/${id}/deactivate`, { method: 'POST', body: '{}' });
      setMessage('Rule deactivated');
      await load();
    } catch (e) {
      setError(e.message);
    }
  };

  const duplicate = async (id) => {
    try {
      await apiRequest(`/api/approvals/rules/${id}/duplicate`, { method: 'POST', body: '{}' });
      setMessage('Rule duplicated (inactive)');
      await load();
    } catch (e) {
      setError(e.message);
    }
  };

  const moduleActions = modules.find((m) => m.code === form.module)?.actions || [];

  return (
    <RequirePermission permission="core.approvals.view">
      <div className="mx-auto max-w-7xl space-y-5 p-4 sm:p-6">
        <PageHeader
          title="Approval Rules"
          description="Configure when create permission still requires independent authorization. Thresholds are editable — not hardcoded."
          actions={(
            <div className="flex flex-wrap gap-2">
              <Link href="/admin/roles" className="btn-secondary">Roles & Permissions</Link>
              <Link href="/admin/approvals" className="btn-secondary">Approval Center</Link>
              {canCreate && <button type="button" className="btn-primary" onClick={openCreate}>+ Create Rule</button>}
            </div>
          )}
        />
        <Alert type="error" message={error} />
        <Alert type="success" message={message} />

        <SectionCard title="Active & inactive rules">
          {loading ? <p className="text-sm text-slate-500">Loading…</p> : (
            <div className="overflow-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-left">
                  <tr>
                    <th className="px-3 py-2">Name</th>
                    <th className="px-3 py-2">Module / Action</th>
                    <th className="px-3 py-2">Condition</th>
                    <th className="px-3 py-2">Approvers</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rules.map((r) => (
                    <tr key={r.id} className={!r.isActive ? 'opacity-50' : ''}>
                      <td className="px-3 py-2 font-medium">{r.name}</td>
                      <td className="px-3 py-2 capitalize">{r.module} · {r.action}</td>
                      <td className="px-3 py-2 text-xs">
                        {r.conditionType === 'amount_gte' && `Amount ≥ ${money(r.thresholdAmount)}`}
                        {r.conditionType === 'percent_gte' && `Percent ≥ ${r.thresholdPercent}%`}
                        {r.conditionType === 'always' && 'Always'}
                        {r.conditionType === 'quantity_gte' && `Qty ≥ ${r.thresholdQuantity}`}
                      </td>
                      <td className="px-3 py-2 text-xs">
                        L1: {r.level1RoleSlug}
                        {r.level2RoleSlug ? <div>L2: {r.level2RoleSlug}</div> : null}
                        {r.allowSelfApproval ? <div className="text-amber-700">Self-approve allowed</div> : null}
                      </td>
                      <td className="px-3 py-2">{r.isActive ? 'Active' : 'Inactive'}</td>
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap gap-1">
                          {canEdit && <button type="button" className="btn-secondary !px-2 !py-1 text-xs" onClick={() => openEdit(r)}>Edit</button>}
                          {canCreate && <button type="button" className="btn-secondary !px-2 !py-1 text-xs" onClick={() => duplicate(r.id)}>Duplicate</button>}
                          {canEdit && r.isActive && <button type="button" className="btn-secondary !px-2 !py-1 text-xs" onClick={() => deactivate(r.id)}>Deactivate</button>}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {!rules.length && (
                    <tr><td colSpan={6} className="px-3 py-8 text-center text-slate-500">No rules yet</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>

        {modalOpen && (
          <Modal open title={editing ? 'Edit approval rule' : 'Create approval rule'} onClose={() => setModalOpen(false)}>
            <form className="space-y-3" onSubmit={save}>
              <label className="block text-sm">
                <span className="mb-1 block text-slate-600">Name *</span>
                <input className="input w-full" required value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-sm">
                  <span className="mb-1 block text-slate-600">Module *</span>
                  <select className="input w-full" value={form.module} onChange={(e) => setForm((f) => ({ ...f, module: e.target.value, action: modules.find((m) => m.code === e.target.value)?.actions?.[0] || f.action }))}>
                    {modules.map((m) => <option key={m.code} value={m.code}>{m.code}</option>)}
                  </select>
                </label>
                <label className="block text-sm">
                  <span className="mb-1 block text-slate-600">Action *</span>
                  <select className="input w-full" value={form.action} onChange={(e) => setForm((f) => ({ ...f, action: e.target.value, transactionType: e.target.value }))}>
                    {moduleActions.map((a) => <option key={a} value={a}>{a}</option>)}
                  </select>
                </label>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-sm">
                  <span className="mb-1 block text-slate-600">Condition</span>
                  <select className="input w-full" value={form.conditionType} onChange={(e) => setForm((f) => ({ ...f, conditionType: e.target.value }))}>
                    <option value="amount_gte">Amount greater than / equal</option>
                    <option value="percent_gte">Percent greater than / equal</option>
                    <option value="quantity_gte">Quantity greater than / equal</option>
                    <option value="always">Always</option>
                  </select>
                </label>
                {form.conditionType === 'amount_gte' && (
                  <label className="block text-sm">
                    <span className="mb-1 block text-slate-600">Amount (₹)</span>
                    <input type="number" className="input w-full" value={form.thresholdAmount} onChange={(e) => setForm((f) => ({ ...f, thresholdAmount: e.target.value }))} />
                  </label>
                )}
                {form.conditionType === 'percent_gte' && (
                  <label className="block text-sm">
                    <span className="mb-1 block text-slate-600">Percent</span>
                    <input type="number" className="input w-full" value={form.thresholdPercent} onChange={(e) => setForm((f) => ({ ...f, thresholdPercent: e.target.value }))} />
                  </label>
                )}
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-sm">
                  <span className="mb-1 block text-slate-600">Level 1 approver role *</span>
                  <select className="input w-full" required value={form.level1RoleSlug} onChange={(e) => setForm((f) => ({ ...f, level1RoleSlug: e.target.value }))}>
                    {roles.map((r) => <option key={r.slug} value={r.slug}>{r.name} ({r.slug})</option>)}
                  </select>
                </label>
                <label className="block text-sm">
                  <span className="mb-1 block text-slate-600">Level 2 (optional)</span>
                  <select className="input w-full" value={form.level2RoleSlug} onChange={(e) => setForm((f) => ({ ...f, level2RoleSlug: e.target.value }))}>
                    <option value="">None</option>
                    {roles.map((r) => <option key={r.slug} value={r.slug}>{r.name} ({r.slug})</option>)}
                  </select>
                </label>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={form.allowSelfApproval} onChange={(e) => setForm((f) => ({ ...f, allowSelfApproval: e.target.checked }))} />
                Allow self-approval (default: off)
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={form.isActive} onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))} />
                Active
              </label>
              <label className="block text-sm">
                <span className="mb-1 block text-slate-600">Notes</span>
                <textarea className="input w-full" rows={2} value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
              </label>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" className="btn-secondary" onClick={() => setModalOpen(false)}>Cancel</button>
                <button type="submit" className="btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save rule'}</button>
              </div>
            </form>
          </Modal>
        )}
      </div>
    </RequirePermission>
  );
}
