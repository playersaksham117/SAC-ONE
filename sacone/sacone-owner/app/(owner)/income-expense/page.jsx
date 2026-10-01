'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { apiRequest } from '../../../lib/api';
import { useLiveRefresh } from '../../../lib/live';
import { useAuth, RequirePermission } from '../../../lib/auth-context';
import PageHeader, { Alert, Modal, StatusBadge } from '../../../components/ui';
import {
  StatCard, SectionCard, ModuleTabs, GridCard, StatusPill,
  SkeletonGrid, SkeletonBlock, EmptyPanel, Toolbar,
} from '../../../components/module-ui';

function money(n) {
  return `₹${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const STATUS_MAP = {
  draft: 'bg-slate-100 text-slate-700',
  submitted: 'bg-blue-100 text-blue-700',
  pending_approval: 'bg-amber-100 text-amber-800',
  approved: 'bg-indigo-100 text-indigo-700',
  posted: 'bg-emerald-100 text-emerald-700',
  rejected: 'bg-red-100 text-red-700',
  voided: 'bg-slate-200 text-slate-600',
};

const FIN_TABS = [
  { id: 'transactions', label: 'Transactions' },
  { id: 'dashboard', label: 'Summary' },
  { id: 'categories', label: 'Categories' },
];

const EMPTY_TXN = {
  transactionDate: new Date().toISOString().slice(0, 10),
  transactionType: 'expense',
  categoryId: '',
  amount: '',
  paymentAccountId: '',
  paymentMode: 'cash',
  referenceNumber: '',
  description: '',
  notes: '',
};

export default function IncomeExpensePage() {
  const { checkPermission } = useAuth();
  const canView = checkPermission('finance.ledger.view');
  const canCreate = checkPermission('finance.ledger.create');
  const canEdit = checkPermission('finance.ledger.edit');
  const canApprove = checkPermission('finance.ledger.approve');
  const canVoid = checkPermission('finance.ledger.delete');

  const [tab, setTab] = useState('transactions');
  const [bootstrap, setBootstrap] = useState(null);
  const [reports, setReports] = useState(null);
  const [transactions, setTransactions] = useState({ items: [], total: 0 });
  const [bootLoading, setBootLoading] = useState(true);
  const [tabLoading, setTabLoading] = useState(false);
  const loadedRef = useRef(new Set());
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const [filters, setFilters] = useState({
    search: '', status: '', transactionType: '', paymentMode: '', dateFrom: '', dateTo: '',
  });

  const [txnModal, setTxnModal] = useState(false);
  const [txnForm, setTxnForm] = useState(EMPTY_TXN);
  const [editingTxn, setEditingTxn] = useState(null);
  const [saving, setSaving] = useState(false);

  const [catModal, setCatModal] = useState(false);
  const [catForm, setCatForm] = useState({ name: '', categoryType: 'expense', isActive: true });
  const [acctModal, setAcctModal] = useState(false);
  const [acctForm, setAcctForm] = useState({ name: '', accountType: 'cash', openingBalance: 0, isActive: true });
  const [cashBook, setCashBook] = useState(null);
  const [cashBookType, setCashBookType] = useState('cash');
  const [cashBookSummary, setCashBookSummary] = useState(null);

  const reloadBootstrap = useCallback(async () => {
    const data = await apiRequest('/api/finance/bootstrap');
    setBootstrap(data);
    return data;
  }, []);

  const fetchReports = useCallback(async () => {
    const q = new URLSearchParams();
    if (filters.dateFrom) q.set('dateFrom', filters.dateFrom);
    if (filters.dateTo) q.set('dateTo', filters.dateTo);
    return apiRequest(`/api/finance/reports?${q}`);
  }, [filters.dateFrom, filters.dateTo]);

  useEffect(() => {
    if (!canView) return;
    apiRequest('/api/finance/bootstrap')
      .then(setBootstrap)
      .catch((e) => setError(e.message))
      .finally(() => setBootLoading(false));
  }, [canView]);

  const loadTab = useCallback(async (t, force = false, silent = false) => {
    if (!canView || (!force && loadedRef.current.has(t))) return;
    if (!silent) setTabLoading(true);
    setError('');
    try {
      if (t === 'transactions') {
        const q = new URLSearchParams({ limit: '100' });
        Object.entries(filters).forEach(([k, v]) => { if (v) q.set(k, v); });
        setTransactions(await apiRequest(`/api/finance/transactions?${q}`));
      }
      if (t === 'dashboard') setReports(await fetchReports());
      if (t === 'cashbook') {
        setCashBookSummary(await apiRequest('/api/cash-book/summary'));
        setCashBook(await apiRequest(`/api/cash-book?accountType=${cashBookType}&limit=200`));
      }
      loadedRef.current.add(t);
    } catch (err) {
      setError(err.message);
    } finally {
      setTabLoading(false);
    }
  }, [canView, filters, fetchReports, cashBookType]);

  useEffect(() => { loadTab(tab); }, [tab, loadTab]);

  // Other tabs reload when opened next; the visible one refreshes now.
  useLiveRefresh(() => {
    if (!canView) return;
    loadedRef.current.clear();
    reloadBootstrap().catch(() => {});
    loadTab(tab, true, true);
  });

  useEffect(() => {
    if (tab !== 'cashbook') return;
    loadedRef.current.delete('cashbook');
    loadTab('cashbook', true);
  }, [cashBookType]); // eslint-disable-line react-hooks/exhaustive-deps

  const invalidate = (...keys) => keys.forEach((k) => loadedRef.current.delete(k));

  const categoriesForType = useMemo(() => {
    if (!bootstrap) return [];
    return txnForm.transactionType === 'income'
      ? bootstrap.categories.income
      : bootstrap.categories.expense;
  }, [bootstrap, txnForm.transactionType]);

  const openCreateTxn = () => {
    setEditingTxn(null);
    setTxnForm({
      ...EMPTY_TXN,
      categoryId: '',
      paymentAccountId: bootstrap?.accounts?.[0]?.id || '',
    });
    setTxnModal(true);
  };

  const openEditTxn = (txn) => {
    setEditingTxn(txn);
    setTxnForm({
      transactionDate: txn.transactionDate,
      transactionType: txn.transactionType,
      categoryId: txn.categoryId,
      amount: String(txn.amount),
      paymentAccountId: txn.paymentAccountId,
      paymentMode: txn.paymentMode,
      referenceNumber: txn.referenceNumber || '',
      description: txn.description || '',
      notes: txn.notes || '',
    });
    setTxnModal(true);
  };

  const saveTxn = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const body = {
        ...txnForm,
        amount: Number(txnForm.amount),
      };
      if (editingTxn) {
        await apiRequest(`/api/finance/transactions/${editingTxn.id}`, {
          method: 'PUT',
          body: JSON.stringify(body),
        });
        setMessage('Transaction updated');
      } else {
        await apiRequest('/api/finance/transactions', {
          method: 'POST',
          body: JSON.stringify(body),
        });
        setMessage('Transaction created as draft');
      }
      setTxnModal(false);
      invalidate('transactions', 'dashboard');
      loadTab('transactions', true);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const txnAction = async (id, action, body = {}) => {
    setError('');
    try {
      await apiRequest(`/api/finance/transactions/${id}/${action}`, {
        method: 'POST',
        body: JSON.stringify(body),
      });
      setMessage(`Transaction ${action} successful`);
      invalidate('transactions', 'dashboard');
      loadTab('transactions', true);
      if (tab === 'dashboard') loadTab('dashboard', true);
    } catch (err) {
      setError(err.message);
    }
  };

  const saveCategory = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await apiRequest('/api/finance/categories', {
        method: 'POST',
        body: JSON.stringify(catForm),
      });
      setMessage('Category created');
      setCatModal(false);
      await reloadBootstrap();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const toggleCategory = async (cat) => {
    try {
      await apiRequest(`/api/finance/categories/${cat.id}`, {
        method: 'PUT',
        body: JSON.stringify({ isActive: !cat.isActive }),
      });
      await reloadBootstrap();
    } catch (err) {
      setError(err.message);
    }
  };

  const saveAccount = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await apiRequest('/api/finance/accounts', {
        method: 'POST',
        body: JSON.stringify({
          ...acctForm,
          openingBalance: Number(acctForm.openingBalance || 0),
        }),
      });
      setMessage('Payment account created');
      setAcctModal(false);
      await reloadBootstrap();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const toggleAccount = async (acct) => {
    try {
      await apiRequest(`/api/finance/accounts/${acct.id}`, {
        method: 'PUT',
        body: JSON.stringify({ isActive: !acct.isActive }),
      });
      await reloadBootstrap();
    } catch (err) {
      setError(err.message);
    }
  };

  if (!canView) {
    return (
      <RequirePermission permission="finance.ledger.view">
        <div />
      </RequirePermission>
    );
  }

  return (
    <RequirePermission permission="finance.ledger.view">
      <div className="mx-auto max-w-7xl space-y-5">
        <PageHeader
          title="Income & Expense"
          description="Record income and expenses, approve them, and track totals by category. Banking, cash books and bank import stay in the ERP."
          actions={(
            <div className="flex flex-wrap gap-2">
              {canCreate && tab === 'transactions' && (
                <button type="button" className="btn-primary" onClick={openCreateTxn}>+ Transaction</button>
              )}
              {canEdit && tab === 'categories' && (
                <button type="button" className="btn-secondary" onClick={() => setCatModal(true)}>+ Category</button>
              )}
            </div>
          )}
        />

        {!bootLoading && bootstrap && (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Pending Approval" value={bootstrap.pendingApproval ?? 0} tone={bootstrap.pendingApproval ? 'warning' : 'default'} icon="⏳" compact />
            <StatCard label="Income Categories" value={bootstrap.categories?.income?.length ?? 0} icon="📈" compact />
            <StatCard label="Expense Categories" value={bootstrap.categories?.expense?.length ?? 0} icon="📉" compact />
            <StatCard label="Approval Limit" value={money(bootstrap.approvalSettings?.approvalThresholdAmount)} tone="info" icon="✓" compact />
          </div>
        )}

        <ModuleTabs
          tabs={FIN_TABS.map((t) => (t.id === 'transactions' ? { ...t, badge: bootstrap?.pendingApproval || 0 } : t))}
          active={tab}
          onChange={setTab}
        />

        <Alert type="error" message={error} />
        <Alert type="success" message={message} />
        {message && <button type="button" className="mb-2 text-xs text-slate-400 hover:text-slate-600" onClick={() => setMessage('')}>Dismiss</button>}

        {bootLoading ? <SkeletonGrid count={4} /> : null}

        {bootstrap && tab === 'dashboard' && (
          tabLoading && !reports ? <SkeletonGrid count={4} /> : (
            <div className="space-y-5">
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <StatCard label="Income Today" value={money(reports?.income?.today)} tone="success" icon="↑" />
                <StatCard label="Income This Month" value={money(reports?.income?.thisMonth)} tone="success" icon="📅" />
                <StatCard label="Expenses Today" value={money(reports?.expenses?.today)} tone="danger" icon="↓" />
                <StatCard label="Expenses This Month" value={money(reports?.expenses?.thisMonth)} tone="danger" icon="📊" />
              </div>
              <div className="grid gap-4 lg:grid-cols-3">
                <SectionCard title="Cash Flow">
                  <div className="grid grid-cols-2 gap-3">
                    <StatCard label="Cash In" value={money(reports?.flow?.cashIn)} tone="success" compact />
                    <StatCard label="Cash Out" value={money(reports?.flow?.cashOut)} tone="danger" compact />
                  </div>
                </SectionCard>
                <SectionCard title="UPI Flow">
                  <div className="grid grid-cols-2 gap-3">
                    <StatCard label="UPI In" value={money(reports?.flow?.upiIn)} tone="success" compact />
                    <StatCard label="UPI Out" value={money(reports?.flow?.upiOut)} tone="danger" compact />
                  </div>
                </SectionCard>
                <SectionCard title="Bank Flow">
                  <div className="grid grid-cols-2 gap-3">
                    <StatCard label="Bank In" value={money(reports?.flow?.bankIn)} tone="success" compact />
                    <StatCard label="Bank Out" value={money(reports?.flow?.bankOut)} tone="danger" compact />
                  </div>
                </SectionCard>
              </div>
              <div className="grid gap-4 lg:grid-cols-2">
                <SectionCard title="Income by Category">
                  <div className="grid gap-2 sm:grid-cols-2">
                    {(reports?.income?.byCategory || []).map((c) => (
                      <div key={c.categoryId} className="rounded-xl bg-emerald-50/50 px-3 py-2">
                        <div className="text-xs text-slate-500">{c.name}</div>
                        <div className="font-semibold tabular-nums text-emerald-800">{money(c.total)}</div>
                      </div>
                    ))}
                    {!reports?.income?.byCategory?.length && <p className="text-sm text-slate-400">No posted income</p>}
                  </div>
                </SectionCard>
                <SectionCard title="Expenses by Category">
                  <div className="grid gap-2 sm:grid-cols-2">
                    {(reports?.expenses?.byCategory || []).map((c) => (
                      <div key={c.categoryId} className="rounded-xl bg-rose-50/50 px-3 py-2">
                        <div className="text-xs text-slate-500">{c.name}</div>
                        <div className="font-semibold tabular-nums text-rose-800">{money(c.total)}</div>
                      </div>
                    ))}
                    {!reports?.expenses?.byCategory?.length && <p className="text-sm text-slate-400">No posted expenses</p>}
                  </div>
                </SectionCard>
              </div>
              <SectionCard title="Account Balances">
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {(reports?.accounts || []).map((a) => (
                    <GridCard key={a.id} className="!p-3">
                      <div className="font-medium">{a.name}</div>
                      <div className="text-xs capitalize text-slate-500">{a.accountType}</div>
                      <div className="mt-2 text-xl font-bold tabular-nums">{money(a.closingBalance)}</div>
                      <div className="mt-1 flex justify-between text-[11px] text-slate-400">
                        <span>In {money(a.totalIn)}</span>
                        <span>Out {money(a.totalOut)}</span>
                      </div>
                    </GridCard>
                  ))}
                </div>
              </SectionCard>
            </div>
          )
        )}

        {bootstrap && tab === 'transactions' && (
          <div className="space-y-4">
            <Toolbar>
              <input className="input-field max-w-[180px]" placeholder="Search…" value={filters.search} onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))} />
              <select className="input-field max-w-[140px]" value={filters.status} onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}>
                <option value="">All statuses</option>
                {bootstrap.statuses.map((s) => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
              </select>
              <select className="input-field max-w-[120px]" value={filters.transactionType} onChange={(e) => setFilters((f) => ({ ...f, transactionType: e.target.value }))}>
                <option value="">All types</option>
                <option value="income">Income</option>
                <option value="expense">Expense</option>
              </select>
              <button type="button" className="btn-secondary text-xs" onClick={() => loadTab('transactions', true)}>Apply</button>
            </Toolbar>

            {tabLoading && !transactions.items.length ? (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{Array.from({ length: 6 }).map((_, i) => <SkeletonBlock key={i} className="h-36" />)}</div>
            ) : transactions.items.length ? (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {transactions.items.map((txn) => (
                  <GridCard key={txn.id} className="!p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="font-mono text-[11px] text-slate-400">{txn.transactionNumber}</div>
                        <div className="mt-1 font-semibold capitalize">{txn.transactionType}</div>
                      </div>
                      <StatusPill status={txn.status} map={STATUS_MAP} />
                    </div>
                    <div className={`mt-3 text-2xl font-bold tabular-nums ${txn.transactionType === 'income' ? 'text-emerald-700' : 'text-rose-700'}`}>
                      {money(txn.amount)}
                    </div>
                    <div className="mt-2 space-y-1 text-xs text-slate-500">
                      <div>{txn.categoryName}</div>
                      <div className="capitalize">{txn.paymentMode} · {txn.transactionDate}</div>
                      {txn.description && <div className="truncate">{txn.description}</div>}
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2 border-t border-slate-100 pt-3">
                      {canEdit && ['draft', 'rejected'].includes(txn.status) && (
                        <button type="button" className="text-xs font-medium text-sky-700" onClick={() => openEditTxn(txn)}>Edit</button>
                      )}
                      {canCreate && ['draft', 'rejected'].includes(txn.status) && (
                        <button type="button" className="text-xs font-medium text-indigo-700" onClick={() => txnAction(txn.id, 'submit')}>Submit</button>
                      )}
                      {canApprove && txn.status === 'pending_approval' && (
                        <>
                          <button type="button" className="text-xs font-medium text-emerald-700" onClick={() => txnAction(txn.id, 'approve')}>Approve</button>
                          <button type="button" className="text-xs font-medium text-red-700" onClick={() => txnAction(txn.id, 'reject', { reason: 'Rejected' })}>Reject</button>
                        </>
                      )}
                      {canVoid && txn.status === 'posted' && !txn.reversalOfId && (
                        <button type="button" className="text-xs font-medium text-slate-600" onClick={() => {
                          const reason = window.prompt('Void reason (optional):');
                          if (reason !== null) txnAction(txn.id, 'void', { reason });
                        }}>Void</button>
                      )}
                    </div>
                  </GridCard>
                ))}
              </div>
            ) : (
              <EmptyPanel title="No transactions" description="Create a manual income or expense entry." action={canCreate && <button type="button" className="btn-primary" onClick={openCreateTxn}>+ New Transaction</button>} />
            )}
            <p className="text-xs text-slate-400">{transactions.total} total · showing {transactions.items.length}</p>
          </div>
        )}

        {bootstrap && tab === 'categories' && (
          <div className="grid gap-4 lg:grid-cols-2">
            {['income', 'expense'].map((type) => (
              <SectionCard key={type} title={`${type} Categories`} subtitle={`${(bootstrap.categories[type] || []).length} items`}>
                <div className="grid gap-2 sm:grid-cols-2">
                  {(bootstrap.categories[type] || []).map((c) => (
                    <GridCard key={c.id} className="!p-3">
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <div className="font-medium">{c.name}</div>
                          <div className="font-mono text-[10px] text-slate-400">{c.code}</div>
                        </div>
                        {canEdit && !c.isSystem ? (
                          <button type="button" onClick={() => toggleCategory(c)}><StatusBadge active={c.isActive} /></button>
                        ) : <StatusBadge active={c.isActive} />}
                      </div>
                    </GridCard>
                  ))}
                </div>
              </SectionCard>
            ))}
          </div>
        )}

        <Modal
          open={txnModal}
          title={editingTxn ? `Edit ${editingTxn.transactionNumber}` : 'New Transaction'}
          onClose={() => setTxnModal(false)}
          size="lg"
          footer={(
            <>
              <button type="button" className="btn-secondary" onClick={() => setTxnModal(false)}>Cancel</button>
              <button type="submit" form="txn-form" className="btn-primary" disabled={saving}>
                {saving ? 'Saving…' : 'Save Draft'}
              </button>
            </>
          )}
        >
          <form id="txn-form" onSubmit={saveTxn} className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="text-xs text-slate-500">Date</span>
              <input type="date" required className="input-field w-full" value={txnForm.transactionDate} onChange={(e) => setTxnForm((f) => ({ ...f, transactionDate: e.target.value }))} />
            </label>
            <label className="block">
              <span className="text-xs text-slate-500">Type</span>
              <select required className="input-field w-full" value={txnForm.transactionType} onChange={(e) => setTxnForm((f) => ({ ...f, transactionType: e.target.value, categoryId: '' }))}>
                <option value="expense">Expense</option>
                <option value="income">Income</option>
              </select>
            </label>
            <label className="block">
              <span className="text-xs text-slate-500">Category</span>
              <select required className="input-field w-full" value={txnForm.categoryId} onChange={(e) => setTxnForm((f) => ({ ...f, categoryId: e.target.value }))}>
                <option value="">Select…</option>
                {categoriesForType.filter((c) => c.isActive).map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-xs text-slate-500">Amount (₹)</span>
              <input type="number" required min="0.01" step="0.01" className="input-field w-full" value={txnForm.amount} onChange={(e) => setTxnForm((f) => ({ ...f, amount: e.target.value }))} />
            </label>
            <label className="block">
              <span className="text-xs text-slate-500">Payment Account</span>
              <select required className="input-field w-full" value={txnForm.paymentAccountId} onChange={(e) => setTxnForm((f) => ({ ...f, paymentAccountId: e.target.value }))}>
                <option value="">Select…</option>
                {bootstrap?.accounts.filter((a) => a.isActive).map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-xs text-slate-500">Payment Mode</span>
              <select required className="input-field w-full" value={txnForm.paymentMode} onChange={(e) => setTxnForm((f) => ({ ...f, paymentMode: e.target.value }))}>
                {bootstrap?.paymentModes.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </label>
            <label className="block sm:col-span-2">
              <span className="text-xs text-slate-500">Reference Number</span>
              <input className="input-field w-full" value={txnForm.referenceNumber} onChange={(e) => setTxnForm((f) => ({ ...f, referenceNumber: e.target.value }))} />
            </label>
            <label className="block sm:col-span-2">
              <span className="text-xs text-slate-500">Description</span>
              <input className="input-field w-full" value={txnForm.description} onChange={(e) => setTxnForm((f) => ({ ...f, description: e.target.value }))} />
            </label>
            <label className="block sm:col-span-2">
              <span className="text-xs text-slate-500">Notes</span>
              <textarea className="input-field w-full" rows={2} value={txnForm.notes} onChange={(e) => setTxnForm((f) => ({ ...f, notes: e.target.value }))} />
            </label>
          </form>
        </Modal>

        <Modal open={catModal} title="New Category" onClose={() => setCatModal(false)} footer={(
          <>
            <button type="button" className="btn-secondary" onClick={() => setCatModal(false)}>Cancel</button>
            <button type="submit" form="cat-form" className="btn-primary" disabled={saving}>Create</button>
          </>
        )}>
          <form id="cat-form" onSubmit={saveCategory} className="space-y-3">
            <input required className="input-field w-full" placeholder="Category name" value={catForm.name} onChange={(e) => setCatForm((f) => ({ ...f, name: e.target.value }))} />
            <select className="input-field w-full" value={catForm.categoryType} onChange={(e) => setCatForm((f) => ({ ...f, categoryType: e.target.value }))}>
              <option value="expense">Expense</option>
              <option value="income">Income</option>
            </select>
          </form>
        </Modal>

      </div>
    </RequirePermission>
  );
}
