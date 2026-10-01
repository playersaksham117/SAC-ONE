'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiRequest } from '../../../../lib/api';
import { useLiveRefresh } from '../../../../lib/live';
import { useAuth, RequirePermission } from '../../../../lib/auth-context';
import PageHeader, { Alert, Modal } from '../../../../components/ui';
import { StatCard, SectionCard, ModuleTabs } from '../../../../components/module-ui';

function money(n) {
  return `₹${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const EMPTY_AGENT = {
  name: '', agentCode: '', agentType: 'internal', mobile: '', email: '',
  joiningDate: '', defaultCommissionRate: 2, defaultCommissionBasis: 'taxable',
  commissionPlanId: '', remarks: '', status: 'active',
};

export default function CommissionsPage() {
  const { checkPermission } = useAuth();
  const [tab, setTab] = useState('agents');
  const [agents, setAgents] = useState([]);
  const [plans, setPlans] = useState([]);
  const [commissions, setCommissions] = useState({ items: [] });
  const [performance, setPerformance] = useState([]);
  const [payments, setPayments] = useState({ items: [] });
  const [accounts, setAccounts] = useState([]);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [agentModal, setAgentModal] = useState(false);
  const [agentForm, setAgentForm] = useState(EMPTY_AGENT);
  const [editingAgent, setEditingAgent] = useState(null);
  const [dashboard, setDashboard] = useState(null);
  const [selectedAgentId, setSelectedAgentId] = useState('');
  const [payModal, setPayModal] = useState(false);
  const [payForm, setPayForm] = useState({
    salesAgentId: '', paymentDate: new Date().toISOString().slice(0, 10),
    paymentMode: 'bank', paymentAccountId: '', amount: '', remarks: '',
  });
  const [dueLines, setDueLines] = useState([]);
  const [allocMap, setAllocMap] = useState({});
  const [saving, setSaving] = useState(false);
  const [filters, setFilters] = useState({ dateFrom: '', dateTo: '', salesAgentId: '', status: '' });

  const canCreateAgent = checkPermission('sales.agents.create');
  const canPay = checkPermission('sales.commission_payments.create');

  const load = useCallback(async (silent = false) => {
    if (silent !== true) setLoading(true);
    setError('');
    try {
      const [a, p, boot] = await Promise.all([
        apiRequest('/api/sales-agents'),
        apiRequest('/api/commissions/plans'),
        apiRequest('/api/finance/bootstrap').catch(() => null),
      ]);
      setAgents(a || []);
      setPlans(p || []);
      setAccounts(boot?.accounts || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadCommissions = useCallback(async () => {
    const q = new URLSearchParams({ limit: '200' });
    Object.entries(filters).forEach(([k, v]) => { if (v) q.set(k, v); });
    setCommissions(await apiRequest(`/api/commissions?${q}`));
  }, [filters]);

  const loadPerformance = useCallback(async () => {
    const q = new URLSearchParams();
    if (filters.dateFrom) q.set('dateFrom', filters.dateFrom);
    if (filters.dateTo) q.set('dateTo', filters.dateTo);
    setPerformance(await apiRequest(`/api/commissions/performance?${q}`));
  }, [filters.dateFrom, filters.dateTo]);

  const loadPayments = useCallback(async () => {
    setPayments(await apiRequest('/api/commission-payments?limit=100'));
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (tab === 'ledger') loadCommissions().catch((e) => setError(e.message));
    if (tab === 'performance') loadPerformance().catch((e) => setError(e.message));
    if (tab === 'payments') loadPayments().catch((e) => setError(e.message));
  }, [tab, loadCommissions, loadPerformance, loadPayments]);

  useLiveRefresh(() => {
    load(true);
    if (tab === 'ledger') loadCommissions().catch(() => {});
    if (tab === 'performance') loadPerformance().catch(() => {});
    if (tab === 'payments') loadPayments().catch(() => {});
  });

  const saveAgent = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        ...agentForm,
        defaultCommissionRate: Number(agentForm.defaultCommissionRate || 0),
        commissionPlanId: agentForm.commissionPlanId || null,
      };
      if (editingAgent) {
        await apiRequest(`/api/sales-agents/${editingAgent.id}`, { method: 'PUT', body: JSON.stringify(payload) });
        setMessage('Agent updated');
      } else {
        await apiRequest('/api/sales-agents', { method: 'POST', body: JSON.stringify(payload) });
        setMessage('Agent created');
      }
      setAgentModal(false);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const openDashboard = async (id) => {
    setSelectedAgentId(id);
    setDashboard(await apiRequest(`/api/sales-agents/${id}/dashboard`));
    setTab('dashboard');
  };

  const openPay = async (agentId) => {
    setPayForm((f) => ({ ...f, salesAgentId: agentId }));
    const due = await apiRequest(`/api/commissions?salesAgentId=${agentId}&status=eligible&limit=100`);
    const partial = await apiRequest(`/api/commissions?salesAgentId=${agentId}&status=partially_paid&limit=100`);
    const lines = [...(due.items || []), ...(partial.items || [])].filter((c) => c.commissionDue > 0);
    setDueLines(lines);
    const map = {};
    let total = 0;
    for (const l of lines) {
      map[l.id] = l.commissionDue;
      total += l.commissionDue;
    }
    setAllocMap(map);
    setPayForm((f) => ({ ...f, salesAgentId: agentId, amount: String(round2(total)) }));
    setPayModal(true);
  };

  function round2(n) {
    return Math.round((Number(n || 0) + Number.EPSILON) * 100) / 100;
  }

  const submitPay = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const allocations = Object.entries(allocMap)
        .filter(([, amt]) => Number(amt) > 0)
        .map(([saleCommissionId, allocatedAmount]) => ({ saleCommissionId, allocatedAmount: Number(allocatedAmount) }));
      await apiRequest('/api/commission-payments', {
        method: 'POST',
        body: JSON.stringify({
          ...payForm,
          amount: Number(payForm.amount),
          allocations,
          post: true,
        }),
      });
      setMessage('Commission payment posted');
      setPayModal(false);
      await loadPayments();
      await loadCommissions();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const tabs = [
    { id: 'agents', label: 'Sales Agents' },
    { id: 'dashboard', label: 'Agent Dashboard' },
    { id: 'ledger', label: 'Commission Ledger' },
    { id: 'performance', label: 'Performance' },
    { id: 'payments', label: 'Commission Payments' },
  ];

  return (
    <RequirePermission permission="sales.agents.view">
      <div className="mx-auto max-w-7xl space-y-5 p-4 sm:p-6">
        <PageHeader
          title="Sales Agents & Commissions"
          description="Track agent sales, calculate commissions from POS invoices, and pay eligible balances."
          actions={canCreateAgent && tab === 'agents' ? (
            <button type="button" className="btn-primary" onClick={() => { setEditingAgent(null); setAgentForm(EMPTY_AGENT); setAgentModal(true); }}>
              + Sales Agent
            </button>
          ) : null}
        />
        <Alert type="error" message={error} />
        <Alert type="success" message={message} />
        <ModuleTabs tabs={tabs} active={tab} onChange={setTab} />

        {tab === 'agents' && (
          <SectionCard title="Sales agents">
            {loading ? <p className="text-sm text-slate-500">Loading…</p> : (
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-left">
                  <tr>
                    <th className="px-3 py-2">Code</th>
                    <th className="px-3 py-2">Name</th>
                    <th className="px-3 py-2">Type</th>
                    <th className="px-3 py-2">Rate</th>
                    <th className="px-3 py-2">Plan</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {agents.map((a) => (
                    <tr key={a.id}>
                      <td className="px-3 py-2 font-mono text-xs">{a.agentCode}</td>
                      <td className="px-3 py-2 font-medium">{a.name}</td>
                      <td className="px-3 py-2 capitalize">{a.agentType}</td>
                      <td className="px-3 py-2">{a.defaultCommissionRate}% / {a.defaultCommissionBasis}</td>
                      <td className="px-3 py-2 text-xs">{a.commissionPlanName || '—'}</td>
                      <td className="px-3 py-2 capitalize">{a.status}</td>
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap gap-1">
                          <button type="button" className="btn-secondary !px-2 !py-1 text-xs" onClick={() => openDashboard(a.id)}>Dashboard</button>
                          {canPay && <button type="button" className="btn-primary !px-2 !py-1 text-xs" onClick={() => openPay(a.id)}>Pay</button>}
                          {checkPermission('sales.agents.edit') && (
                            <button type="button" className="btn-secondary !px-2 !py-1 text-xs" onClick={() => {
                              setEditingAgent(a);
                              setAgentForm({
                                name: a.name, agentCode: a.agentCode, agentType: a.agentType,
                                mobile: a.mobile || '', email: a.email || '', joiningDate: a.joiningDate || '',
                                defaultCommissionRate: a.defaultCommissionRate,
                                defaultCommissionBasis: a.defaultCommissionBasis,
                                commissionPlanId: a.commissionPlanId || '', remarks: a.remarks || '', status: a.status,
                              });
                              setAgentModal(true);
                            }}
                            >Edit</button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {!agents.length && <tr><td colSpan={7} className="px-3 py-8 text-center text-slate-500">No sales agents yet</td></tr>}
                </tbody>
              </table>
            )}
          </SectionCard>
        )}

        {tab === 'dashboard' && (
          <div className="space-y-4">
            <select className="input" value={selectedAgentId} onChange={(e) => openDashboard(e.target.value)}>
              <option value="">Select agent</option>
              {agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
            {dashboard?.summary && (
              <>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <StatCard label="Total Sales" value={money(dashboard.summary.totalSales)} compact />
                  <StatCard label="Invoices" value={dashboard.summary.invoiceCount} compact />
                  <StatCard label="Commission Earned" value={money(dashboard.summary.commissionEarned)} tone="info" compact />
                  <StatCard label="Commission Due" value={money(dashboard.summary.commissionDue)} tone="warning" compact />
                  <StatCard label="Eligible" value={money(dashboard.summary.commissionEligible)} compact />
                  <StatCard label="Paid" value={money(dashboard.summary.commissionPaid)} tone="success" compact />
                  <StatCard label="Collections" value={money(dashboard.summary.collections)} compact />
                  <StatCard label="Avg Invoice" value={money(dashboard.summary.averageInvoice)} compact />
                </div>
                <SectionCard title={`Ledger — ${dashboard.agent?.name || ''}`}>
                  <table className="min-w-full text-sm">
                    <thead className="bg-slate-50 text-left"><tr>
                      <th className="px-3 py-2">Date</th><th className="px-3 py-2">Invoice</th>
                      <th className="px-3 py-2 text-right">Sales</th><th className="px-3 py-2 text-right">Earned</th>
                      <th className="px-3 py-2 text-right">Due</th><th className="px-3 py-2">Status</th>
                    </tr></thead>
                    <tbody className="divide-y divide-slate-100">
                      {(dashboard.ledger || []).map((r) => (
                        <tr key={r.id}>
                          <td className="px-3 py-2">{r.saleDate}</td>
                          <td className="px-3 py-2">{r.invoiceNumber}</td>
                          <td className="px-3 py-2 text-right">{money(r.salesAmount)}</td>
                          <td className="px-3 py-2 text-right">{money(r.commissionEarned)}</td>
                          <td className="px-3 py-2 text-right">{money(r.commissionDue)}</td>
                          <td className="px-3 py-2 capitalize">{r.status}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </SectionCard>
              </>
            )}
          </div>
        )}

        {tab === 'ledger' && (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <select className="input" value={filters.salesAgentId} onChange={(e) => setFilters((f) => ({ ...f, salesAgentId: e.target.value }))}>
                <option value="">All agents</option>
                {agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
              <select className="input" value={filters.status} onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}>
                <option value="">All statuses</option>
                {['pending', 'earned', 'eligible', 'partially_paid', 'paid', 'reversed'].map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
              <input type="date" className="input" value={filters.dateFrom} onChange={(e) => setFilters((f) => ({ ...f, dateFrom: e.target.value }))} />
              <input type="date" className="input" value={filters.dateTo} onChange={(e) => setFilters((f) => ({ ...f, dateTo: e.target.value }))} />
              <button type="button" className="btn-secondary" onClick={loadCommissions}>Apply</button>
              <button
                type="button"
                className="btn-secondary"
                onClick={async () => {
                  try {
                    const { apiDownload } = await import('../../../../lib/api');
                    await apiDownload(`/api/commissions/export.csv?${new URLSearchParams(filters)}`, 'commissions.csv');
                  } catch (e) {
                    setError(e.message);
                  }
                }}
              >CSV</button>
            </div>
            <SectionCard title="Commission report">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-left"><tr>
                  <th className="px-3 py-2">Agent</th><th className="px-3 py-2">Invoice</th><th className="px-3 py-2">Customer</th>
                  <th className="px-3 py-2 text-right">Sales</th><th className="px-3 py-2 text-right">Rate</th>
                  <th className="px-3 py-2 text-right">Earned</th><th className="px-3 py-2 text-right">Paid</th>
                  <th className="px-3 py-2 text-right">Due</th><th className="px-3 py-2">Status</th>
                </tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {(commissions.items || []).map((r) => (
                    <tr key={r.id}>
                      <td className="px-3 py-2">{r.salesAgentName}</td>
                      <td className="px-3 py-2">{r.invoiceNumber}</td>
                      <td className="px-3 py-2">{r.customerName}</td>
                      <td className="px-3 py-2 text-right">{money(r.salesAmount)}</td>
                      <td className="px-3 py-2 text-right">{r.rateSnapshot}%</td>
                      <td className="px-3 py-2 text-right">{money(r.commissionEarned)}</td>
                      <td className="px-3 py-2 text-right">{money(r.commissionPaid)}</td>
                      <td className="px-3 py-2 text-right">{money(r.commissionDue)}</td>
                      <td className="px-3 py-2 capitalize">{r.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </SectionCard>
          </div>
        )}

        {tab === 'performance' && (
          <SectionCard title="Sales agent performance">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left"><tr>
                <th className="px-3 py-2">Agent</th><th className="px-3 py-2 text-right">Sales</th>
                <th className="px-3 py-2 text-right">Invoices</th><th className="px-3 py-2 text-right">Avg</th>
                <th className="px-3 py-2 text-right">Commission</th><th className="px-3 py-2 text-right">Paid</th>
                <th className="px-3 py-2 text-right">Due</th><th className="px-3 py-2 text-right">Comm %</th>
              </tr></thead>
              <tbody className="divide-y divide-slate-100">
                {performance.map((r) => (
                  <tr key={r.agentId}>
                    <td className="px-3 py-2 font-medium">{r.agentName}</td>
                    <td className="px-3 py-2 text-right">{money(r.totalSales)}</td>
                    <td className="px-3 py-2 text-right">{r.invoiceCount}</td>
                    <td className="px-3 py-2 text-right">{money(r.averageInvoice)}</td>
                    <td className="px-3 py-2 text-right">{money(r.commissionEarned)}</td>
                    <td className="px-3 py-2 text-right">{money(r.commissionPaid)}</td>
                    <td className="px-3 py-2 text-right">{money(r.commissionDue)}</td>
                    <td className="px-3 py-2 text-right">{r.commissionPctOfSales}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </SectionCard>
        )}

        {tab === 'payments' && (
          <SectionCard title="Commission payments">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left"><tr>
                <th className="px-3 py-2">Voucher</th><th className="px-3 py-2">Date</th>
                <th className="px-3 py-2">Agent</th><th className="px-3 py-2">Mode</th>
                <th className="px-3 py-2 text-right">Amount</th><th className="px-3 py-2">Status</th>
              </tr></thead>
              <tbody className="divide-y divide-slate-100">
                {(payments.items || []).map((p) => (
                  <tr key={p.id}>
                    <td className="px-3 py-2 font-mono text-xs">{p.voucherNumber}</td>
                    <td className="px-3 py-2">{p.paymentDate}</td>
                    <td className="px-3 py-2">{p.salesAgentName}</td>
                    <td className="px-3 py-2 uppercase">{p.paymentMode}</td>
                    <td className="px-3 py-2 text-right">{money(p.amount)}</td>
                    <td className="px-3 py-2 capitalize">{p.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </SectionCard>
        )}

        {agentModal && (
          <Modal open title={editingAgent ? 'Edit sales agent' : 'New sales agent'} onClose={() => setAgentModal(false)}>
            <form className="space-y-3" onSubmit={saveAgent}>
              <label className="block text-sm"><span className="mb-1 block">Name *</span>
                <input className="input w-full" required value={agentForm.name} onChange={(e) => setAgentForm((f) => ({ ...f, name: e.target.value }))} />
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-sm"><span className="mb-1 block">Code</span>
                  <input className="input w-full" value={agentForm.agentCode} onChange={(e) => setAgentForm((f) => ({ ...f, agentCode: e.target.value }))} placeholder="Auto if blank" />
                </label>
                <label className="block text-sm"><span className="mb-1 block">Type</span>
                  <select className="input w-full" value={agentForm.agentType} onChange={(e) => setAgentForm((f) => ({ ...f, agentType: e.target.value }))}>
                    <option value="internal">Internal</option>
                    <option value="employee">Employee</option>
                    <option value="external">External</option>
                  </select>
                </label>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-sm"><span className="mb-1 block">Default rate %</span>
                  <input type="number" step="0.01" className="input w-full" value={agentForm.defaultCommissionRate} onChange={(e) => setAgentForm((f) => ({ ...f, defaultCommissionRate: e.target.value }))} />
                </label>
                <label className="block text-sm"><span className="mb-1 block">Basis</span>
                  <select className="input w-full" value={agentForm.defaultCommissionBasis} onChange={(e) => setAgentForm((f) => ({ ...f, defaultCommissionBasis: e.target.value }))}>
                    <option value="taxable">Taxable value</option>
                    <option value="sales_value">Sales value</option>
                    <option value="gross_profit">Gross profit</option>
                    <option value="fixed">Fixed</option>
                  </select>
                </label>
              </div>
              <label className="block text-sm"><span className="mb-1 block">Commission plan</span>
                <select className="input w-full" value={agentForm.commissionPlanId} onChange={(e) => setAgentForm((f) => ({ ...f, commissionPlanId: e.target.value }))}>
                  <option value="">Default / agent rate</option>
                  {plans.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-sm"><span className="mb-1 block">Mobile</span>
                  <input className="input w-full" value={agentForm.mobile} onChange={(e) => setAgentForm((f) => ({ ...f, mobile: e.target.value }))} />
                </label>
                <label className="block text-sm"><span className="mb-1 block">Status</span>
                  <select className="input w-full" value={agentForm.status} onChange={(e) => setAgentForm((f) => ({ ...f, status: e.target.value }))}>
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </label>
              </div>
              <div className="flex justify-end gap-2">
                <button type="button" className="btn-secondary" onClick={() => setAgentModal(false)}>Cancel</button>
                <button type="submit" className="btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
              </div>
            </form>
          </Modal>
        )}

        {payModal && (
          <Modal open title="Commission payment" onClose={() => setPayModal(false)} size="lg">
            <form className="space-y-3" onSubmit={submitPay}>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-sm"><span className="mb-1 block">Date</span>
                  <input type="date" className="input w-full" value={payForm.paymentDate} onChange={(e) => setPayForm((f) => ({ ...f, paymentDate: e.target.value }))} />
                </label>
                <label className="block text-sm"><span className="mb-1 block">Mode</span>
                  <select className="input w-full" value={payForm.paymentMode} onChange={(e) => setPayForm((f) => ({ ...f, paymentMode: e.target.value }))}>
                    {['cash', 'bank', 'upi', 'cheque', 'other'].map((m) => <option key={m} value={m}>{m}</option>)}
                  </select>
                </label>
              </div>
              <label className="block text-sm"><span className="mb-1 block">Account *</span>
                <select className="input w-full" required value={payForm.paymentAccountId} onChange={(e) => setPayForm((f) => ({ ...f, paymentAccountId: e.target.value }))}>
                  <option value="">Select</option>
                  {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </label>
              <div className="max-h-48 overflow-auto rounded border border-slate-200">
                {dueLines.map((l) => (
                  <div key={l.id} className="flex items-center gap-2 border-b border-slate-100 px-2 py-1.5 text-sm">
                    <div className="flex-1">{l.invoiceNumber} · due {money(l.commissionDue)}</div>
                    <input type="number" step="0.01" className="input w-28 text-right" value={allocMap[l.id] ?? ''} onChange={(e) => setAllocMap((m) => ({ ...m, [l.id]: e.target.value }))} />
                  </div>
                ))}
                {!dueLines.length && <p className="p-3 text-sm text-slate-500">No eligible commission due</p>}
              </div>
              <label className="block text-sm"><span className="mb-1 block">Payment amount *</span>
                <input type="number" step="0.01" className="input w-full" required value={payForm.amount} onChange={(e) => setPayForm((f) => ({ ...f, amount: e.target.value }))} />
              </label>
              <div className="flex justify-end gap-2">
                <button type="button" className="btn-secondary" onClick={() => setPayModal(false)}>Cancel</button>
                <button type="submit" className="btn-primary" disabled={saving || !dueLines.length}>{saving ? 'Posting…' : 'Post payment'}</button>
              </div>
            </form>
          </Modal>
        )}
      </div>
    </RequirePermission>
  );
}
