'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { apiRequest } from '../../../../lib/api';
import { useLiveRefresh } from '../../../../lib/live';
import { useAuth, RequirePermission } from '../../../../lib/auth-context';
import PageHeader, { Alert, Modal, StatusBadge } from '../../../../components/ui';
import {
  StatCard, SectionCard, ModuleTabs, GridCard, StatusPill,
  SkeletonGrid, SkeletonBlock, EmptyPanel, Toolbar,
} from '../../../../components/module-ui';
import BankImportPanel from '../../../../components/finance/BankImportPanel';

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
  { id: 'cashbook', label: 'Cash / Bank / UPI' },
  { id: 'bank-import', label: 'Bank Import' },
  { id: 'party-links', label: 'Party Payments' },
  { id: 'accounts', label: 'Accounts' },
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

export default function BankingPage() {
  const { checkPermission } = useAuth();
  const canView = checkPermission('finance.ledger.view');
  const canCreate = checkPermission('finance.ledger.create');
  const canEdit = checkPermission('finance.ledger.edit');
  const canApprove = checkPermission('finance.ledger.approve');
  const canVoid = checkPermission('finance.ledger.delete');

  const [tab, setTab] = useState('cashbook');
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
      <div className="mx-auto max-w-7xl space-y-5 p-4 sm:p-6">
        <PageHeader
          title="Banking & Cash"
          description="Cash, bank and UPI books, bank statement import & reconciliation, party payment links and payment accounts. Income & Expense is in the SACONE Owner app."
          actions={(
            <div className="flex flex-wrap gap-2">
              {canEdit && tab === 'accounts' && (
                <button type="button" className="btn-secondary" onClick={() => setAcctModal(true)}>+ Account</button>
              )}
            </div>
          )}
        />

        <ModuleTabs
          tabs={FIN_TABS}
          active={tab}
          onChange={setTab}
        />

        <Alert type="error" message={error} />
        <Alert type="success" message={message} />
        {message && <button type="button" className="mb-2 text-xs text-slate-400 hover:text-slate-600" onClick={() => setMessage('')}>Dismiss</button>}

        {bootLoading ? <SkeletonGrid count={4} /> : null}

        {tab === 'bank-import' && (
          <BankImportPanel
            accounts={bootstrap?.accounts || []}
            categories={bootstrap?.categories || {}}
            onMessage={(m) => { setMessage(m); setError(''); }}
            onError={(m) => { setError(m); setMessage(''); }}
          />
        )}

        {tab === 'cashbook' && (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              {['cash', 'bank', 'upi'].map((t) => (
                <button
                  key={t}
                  type="button"
                  className={`rounded-lg px-3 py-1.5 text-sm font-medium uppercase ${cashBookType === t ? 'bg-slate-900 text-white' : 'bg-slate-100'}`}
                  onClick={() => setCashBookType(t)}
                >
                  {t} Book
                </button>
              ))}
            </div>
            {cashBookSummary && (
              <div className="grid gap-3 sm:grid-cols-3">
                {['cash', 'bank', 'upi'].map((k) => (
                  <SectionCard key={k} title={`${k.toUpperCase()} summary`}>
                    <div className="text-sm">In: {money(cashBookSummary[k]?.in)} · Out: {money(cashBookSummary[k]?.out)}</div>
                  </SectionCard>
                ))}
              </div>
            )}
            <div className="overflow-auto rounded-xl border border-slate-200">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-left">
                  <tr>
                    <th className="px-3 py-2">Date</th>
                    <th className="px-3 py-2">Account</th>
                    <th className="px-3 py-2">Direction</th>
                    <th className="px-3 py-2">Mode</th>
                    <th className="px-3 py-2">Reference</th>
                    <th className="px-3 py-2 text-right">Amount</th>
                    <th className="px-3 py-2">Source</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(cashBook?.items || []).map((e) => (
                    <tr key={e.id}>
                      <td className="px-3 py-2">{e.entryDate}</td>
                      <td className="px-3 py-2">{e.paymentAccountName}</td>
                      <td className="px-3 py-2 uppercase">{e.direction}</td>
                      <td className="px-3 py-2 uppercase">{e.paymentMode}</td>
                      <td className="px-3 py-2 font-mono text-xs">{e.reference || '—'}</td>
                      <td className="px-3 py-2 text-right">{money(e.amount)}</td>
                      <td className="px-3 py-2 text-xs">{e.sourceType}</td>
                    </tr>
                  ))}
                  {!cashBook?.items?.length && (
                    <tr><td colSpan={7} className="px-3 py-8 text-center text-slate-500">No cash book entries yet (post RV/PV vouchers)</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            {cashBook && (
              <div className="text-sm text-slate-600">
                Inflow {money(cashBook.inflow)} · Outflow {money(cashBook.outflow)} · Net {money(cashBook.net)}
              </div>
            )}
          </div>
        )}

        {tab === 'party-links' && (
          <div className="grid gap-4 md:grid-cols-2">
            <SectionCard title="Customer Receipts">
              <p className="text-sm text-slate-600 mb-3">Record money received from customers against invoices or as advances.</p>
              <a className="btn-primary inline-flex" href="/business/crm">Open CRM → Customer Receipts</a>
            </SectionCard>
            <SectionCard title="Supplier Payments">
              <p className="text-sm text-slate-600 mb-3">Record payments to suppliers against purchase bills or as advances.</p>
              <a className="btn-primary inline-flex" href="/operations/purchases">Open Purchases → Payment Vouchers</a>
            </SectionCard>
          </div>
        )}

        {bootstrap && tab === 'accounts' && (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {bootstrap.accounts.map((a) => (
              <GridCard key={a.id}>
                <div className="flex items-start justify-between">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-lg capitalize">{a.accountType.charAt(0)}</div>
                  {canEdit && <button type="button" onClick={() => toggleAccount(a)}><StatusBadge active={a.isActive} /></button>}
                </div>
                <h4 className="mt-3 font-semibold">{a.name}</h4>
                <p className="text-xs capitalize text-slate-500">{a.accountType} account</p>
                <div className="mt-3 border-t border-slate-100 pt-3">
                  <div className="text-[10px] uppercase text-slate-400">Opening Balance</div>
                  <div className="text-lg font-bold tabular-nums">{money(a.openingBalance)}</div>
                </div>
              </GridCard>
            ))}
          </div>
        )}

        <Modal open={acctModal} title="New Payment Account" onClose={() => setAcctModal(false)} footer={(
          <>
            <button type="button" className="btn-secondary" onClick={() => setAcctModal(false)}>Cancel</button>
            <button type="submit" form="acct-form" className="btn-primary" disabled={saving}>Create</button>
          </>
        )}>
          <form id="acct-form" onSubmit={saveAccount} className="space-y-3">
            <input required className="input-field w-full" placeholder="Account name" value={acctForm.name} onChange={(e) => setAcctForm((f) => ({ ...f, name: e.target.value }))} />
            <select className="input-field w-full" value={acctForm.accountType} onChange={(e) => setAcctForm((f) => ({ ...f, accountType: e.target.value }))}>
              <option value="cash">Cash</option>
              <option value="upi">UPI</option>
              <option value="bank">Bank</option>
              <option value="other">Other</option>
            </select>
            <input type="number" step="0.01" className="input-field w-full" placeholder="Opening balance" value={acctForm.openingBalance} onChange={(e) => setAcctForm((f) => ({ ...f, openingBalance: e.target.value }))} />
          </form>
        </Modal>
      </div>
    </RequirePermission>
  );
}
