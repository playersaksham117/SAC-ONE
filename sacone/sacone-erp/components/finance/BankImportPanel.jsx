'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiRequest } from '../../lib/api';
import { useLiveRefresh } from '../../lib/live';
import { SectionCard, StatCard, EmptyPanel } from '../module-ui';

function money(n) {
  return `₹${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const STATUS_LABEL = {
  unmatched: 'Unmatched',
  matched: 'Matched',
  partially_allocated: 'Partially Allocated',
  fully_allocated: 'Fully Allocated',
  other_income: 'Other Income',
  other_expense: 'Other Expense',
  bank_transfer: 'Bank Transfer',
  ignored: 'Ignored',
  duplicate: 'Duplicate',
};

const STATUS_CLASS = {
  unmatched: 'bg-amber-100 text-amber-800',
  matched: 'bg-emerald-100 text-emerald-800',
  partially_allocated: 'bg-sky-100 text-sky-800',
  fully_allocated: 'bg-emerald-100 text-emerald-800',
  other_income: 'bg-indigo-100 text-indigo-800',
  other_expense: 'bg-rose-100 text-rose-800',
  bank_transfer: 'bg-violet-100 text-violet-800',
  ignored: 'bg-slate-200 text-slate-600',
};

const MAP_FIELDS = [
  { key: 'date', label: 'Date / Transaction Date' },
  { key: 'valueDate', label: 'Value Date' },
  { key: 'narration', label: 'Narration / Description' },
  { key: 'reference', label: 'Reference Number' },
  { key: 'utr', label: 'UTR' },
  { key: 'cheque', label: 'Cheque Number' },
  { key: 'debit', label: 'Debit' },
  { key: 'credit', label: 'Credit' },
  { key: 'amount', label: 'Amount (signed)' },
  { key: 'balance', label: 'Balance' },
];

const STEPS = ['account', 'map', 'preview', 'statement'];

export default function BankImportPanel({ accounts = [], categories = {}, onMessage, onError }) {
  const [step, setStep] = useState('statement');
  const [accountsList, setAccountsList] = useState(accounts);
  const [form, setForm] = useState({
    paymentAccountId: '',
    statementFrom: '',
    statementTo: '',
    fileName: '',
    csvText: '',
    skipRows: 0,
  });
  const [headers, setHeaders] = useState([]);
  const [mapping, setMapping] = useState({});
  const [preview, setPreview] = useState(null);
  const [dashboard, setDashboard] = useState(null);
  const [txns, setTxns] = useState({ items: [], total: 0 });
  const [filters, setFilters] = useState({
    paymentAccountId: '',
    status: '',
    direction: '',
    dateFrom: '',
    dateTo: '',
    search: '',
  });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selected, setSelected] = useState(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const bankAccounts = useMemo(
    () => (accountsList || []).filter((a) => a.accountType === 'bank' || a.accountType === 'upi' || a.accountType === 'cash'),
    [accountsList]
  );

  const loadDashboard = useCallback(async () => {
    const q = new URLSearchParams();
    if (filters.paymentAccountId) q.set('paymentAccountId', filters.paymentAccountId);
    if (filters.dateFrom) q.set('dateFrom', filters.dateFrom);
    if (filters.dateTo) q.set('dateTo', filters.dateTo);
    setDashboard(await apiRequest(`/api/bank-import/dashboard?${q}`));
  }, [filters.paymentAccountId, filters.dateFrom, filters.dateTo]);

  const loadTransactions = useCallback(async () => {
    const q = new URLSearchParams({ limit: '100' });
    Object.entries(filters).forEach(([k, v]) => { if (v) q.set(k, v); });
    setTxns(await apiRequest(`/api/bank-transactions?${q}`));
  }, [filters]);

  const refreshStatement = useCallback(async () => {
    setLoading(true);
    try {
      await Promise.all([loadDashboard(), loadTransactions()]);
    } catch (e) {
      onError?.(e.message);
    } finally {
      setLoading(false);
    }
  }, [loadDashboard, loadTransactions, onError]);

  useEffect(() => {
    if (!accountsList?.length) {
      apiRequest('/api/bank-import/accounts')
        .then(setAccountsList)
        .catch(() => {});
    }
  }, [accountsList?.length]);

  useEffect(() => {
    if (step === 'statement') refreshStatement();
  }, [step, refreshStatement]);

  // Only the statement view refreshes live; the upload/mapping/preview steps are in-progress work.
  useLiveRefresh(() => {
    if (step === 'statement') Promise.all([loadDashboard(), loadTransactions()]).catch(() => {});
  });

  const onFile = async (file) => {
    if (!file) return;
    const text = await file.text();
    setForm((f) => ({ ...f, csvText: text, fileName: file.name }));
    const first = text.replace(/^\uFEFF/, '').split(/\r?\n/)[0] || '';
    const cols = [];
    let cur = '';
    let inQ = false;
    for (let i = 0; i < first.length; i += 1) {
      const ch = first[i];
      if (ch === '"') inQ = !inQ;
      else if (ch === ',' && !inQ) { cols.push(cur.trim()); cur = ''; }
      else cur += ch;
    }
    cols.push(cur.trim());
    setHeaders(cols);

    let saved = null;
    if (form.paymentAccountId) {
      try {
        saved = await apiRequest(`/api/bank-import/mapping/${form.paymentAccountId}`);
      } catch { /* no saved mapping */ }
    }
    if (saved?.mapping) {
      setMapping(saved.mapping);
      setForm((f) => ({ ...f, skipRows: saved.skipRows || 0 }));
    } else {
      const lower = cols.map((h) => String(h || '').toLowerCase());
      const aliases = {
        date: ['date', 'txn date', 'transaction date', 'tran date'],
        valueDate: ['value date', 'value_date'],
        narration: ['narration', 'description', 'particulars'],
        reference: ['reference', 'ref no', 'reference number'],
        utr: ['utr', 'utr number', 'transaction id'],
        cheque: ['cheque', 'cheque no', 'cheque number'],
        debit: ['debit', 'withdrawal', 'dr'],
        credit: ['credit', 'deposit', 'cr'],
        amount: ['amount'],
        balance: ['balance', 'closing balance'],
      };
      const auto = {};
      for (const [k, list] of Object.entries(aliases)) {
        const idx = lower.findIndex((h) => list.includes(h));
        if (idx >= 0) auto[k] = cols[idx];
      }
      setMapping(auto);
    }
    setStep('map');
  };

  const runPreview = async () => {
    if (!form.paymentAccountId) {
      onError?.('Select a bank account before import');
      return;
    }
    if (!form.csvText) {
      onError?.('Upload a CSV file');
      return;
    }
    setSaving(true);
    try {
      const data = await apiRequest('/api/bank-import/preview', {
        method: 'POST',
        body: JSON.stringify({
          paymentAccountId: form.paymentAccountId,
          statementFrom: form.statementFrom || null,
          statementTo: form.statementTo || null,
          csvText: form.csvText,
          mapping,
          skipRows: form.skipRows,
          fileName: form.fileName,
        }),
      });
      setPreview(data);
      setHeaders(data.headers || headers);
      if (data.suggestedMapping && !Object.keys(mapping).length) setMapping(data.suggestedMapping);
      setStep('preview');
    } catch (e) {
      onError?.(e.message);
    } finally {
      setSaving(false);
    }
  };

  const confirmImport = async () => {
    setSaving(true);
    try {
      const result = await apiRequest('/api/bank-import/import', {
        method: 'POST',
        body: JSON.stringify({
          paymentAccountId: form.paymentAccountId,
          statementFrom: form.statementFrom || null,
          statementTo: form.statementTo || null,
          csvText: form.csvText,
          mapping,
          skipRows: form.skipRows,
          fileName: form.fileName,
          confirm: true,
        }),
      });
      onMessage?.(`Imported ${result.imported} transactions (${result.duplicates} duplicates skipped)`);
      setFilters((f) => ({ ...f, paymentAccountId: form.paymentAccountId }));
      setPreview(null);
      setForm((f) => ({ ...f, csvText: '', fileName: '' }));
      setStep('statement');
    } catch (e) {
      onError?.(e.message);
    } finally {
      setSaving(false);
    }
  };

  const openAllocate = async (txn) => {
    try {
      const full = await apiRequest(`/api/bank-transactions/${txn.id}`);
      setSelected(full);
      setDrawerOpen(true);
    } catch (e) {
      onError?.(e.message);
    }
  };

  const onAllocated = async (result) => {
    const voucherNo = result?.voucher?.voucherNumber;
    onMessage?.(voucherNo
      ? `Allocated — voucher ${voucherNo}`
      : `Updated: ${STATUS_LABEL[result?.transaction?.reconciliationStatus] || 'done'}`);
    setDrawerOpen(false);
    setSelected(null);
    await refreshStatement();
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="btn-primary"
          onClick={() => setStep('account')}
        >
          + Import Statement
        </button>
        <button
          type="button"
          className={`rounded-lg px-3 py-1.5 text-sm font-medium ${step === 'statement' ? 'bg-slate-900 text-white' : 'bg-slate-100'}`}
          onClick={() => setStep('statement')}
        >
          Bank Statement
        </button>
        {STEPS.includes(step) && step !== 'statement' && (
          <span className="self-center text-xs text-slate-500">
            Step: {step === 'account' ? '1. Account' : step === 'map' ? '2. Column mapping' : '3. Preview'}
          </span>
        )}
      </div>

      {(step === 'account' || step === 'map') && (
        <SectionCard title="Bank Account & CSV">
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            <label className="text-sm">
              <span className="mb-1 block text-slate-600">Bank Account *</span>
              <select
                className="input w-full"
                value={form.paymentAccountId}
                onChange={(e) => setForm((f) => ({ ...f, paymentAccountId: e.target.value }))}
              >
                <option value="">Select bank account</option>
                {bankAccounts.map((a) => (
                  <option key={a.id} value={a.id}>{a.name} ({a.accountType})</option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-slate-600">Statement From</span>
              <input type="date" className="input w-full" value={form.statementFrom} onChange={(e) => setForm((f) => ({ ...f, statementFrom: e.target.value }))} />
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-slate-600">Statement To</span>
              <input type="date" className="input w-full" value={form.statementTo} onChange={(e) => setForm((f) => ({ ...f, statementTo: e.target.value }))} />
            </label>
            <label className="text-sm md:col-span-2">
              <span className="mb-1 block text-slate-600">Upload CSV *</span>
              <input
                type="file"
                accept=".csv,text/csv"
                className="input w-full"
                disabled={!form.paymentAccountId}
                onChange={(e) => onFile(e.target.files?.[0])}
              />
              {!form.paymentAccountId && (
                <p className="mt-1 text-xs text-amber-700">Select the exact bank account before uploading.</p>
              )}
              {form.fileName && <p className="mt-1 text-xs text-slate-500">{form.fileName}</p>}
            </label>
          </div>

          {step === 'map' && headers.length > 0 && (
            <div className="mt-4 space-y-3 border-t border-slate-100 pt-4">
              <h4 className="font-medium text-slate-800">Column mapping</h4>
              <p className="text-xs text-slate-500">Mapping is remembered per bank account for future imports.</p>
              <div className="grid gap-2 md:grid-cols-2">
                {MAP_FIELDS.map((f) => (
                  <label key={f.key} className="text-sm">
                    <span className="mb-1 block text-slate-600">{f.label}</span>
                    <select
                      className="input w-full"
                      value={mapping[f.key] || ''}
                      onChange={(e) => setMapping((m) => ({ ...m, [f.key]: e.target.value || undefined }))}
                    >
                      <option value="">— not mapped —</option>
                      {headers.map((h) => (
                        <option key={h} value={h}>{h}</option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>
              <label className="inline-flex items-center gap-2 text-sm">
                Skip header rows after first
                <input
                  type="number"
                  min={0}
                  className="input w-20"
                  value={form.skipRows}
                  onChange={(e) => setForm((f) => ({ ...f, skipRows: Number(e.target.value) || 0 }))}
                />
              </label>
              <div className="flex gap-2">
                <button type="button" className="btn-primary" disabled={saving} onClick={runPreview}>
                  {saving ? 'Working…' : 'Preview import'}
                </button>
                <button type="button" className="btn-secondary" onClick={() => setStep('statement')}>Cancel</button>
              </div>
            </div>
          )}
        </SectionCard>
      )}

      {step === 'preview' && preview && (
        <SectionCard title="Import preview — confirm before posting">
          <div className="mb-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <StatCard label="Transactions" value={preview.summary?.totalTransactions || 0} compact />
            <StatCard label="Credits" value={money(preview.summary?.totalCredits)} tone="success" compact />
            <StatCard label="Debits" value={money(preview.summary?.totalDebits)} tone="danger" compact />
            <StatCard label="Duplicates" value={preview.summary?.duplicates || 0} tone="warning" compact />
            <StatCard label="Invalid" value={preview.summary?.invalid || 0} tone="danger" compact />
          </div>
          <p className="mb-2 text-xs text-slate-500">
            Preview only — no accounting entries are created until you confirm.
            Account: <strong>{preview.paymentAccount?.name}</strong>
          </p>
          <div className="max-h-80 overflow-auto rounded-xl border border-slate-200">
            <table className="min-w-full text-sm">
              <thead className="sticky top-0 bg-slate-50 text-left">
                <tr>
                  <th className="px-3 py-2">Date</th>
                  <th className="px-3 py-2">Narration</th>
                  <th className="px-3 py-2">Ref / UTR</th>
                  <th className="px-3 py-2 text-right">Debit</th>
                  <th className="px-3 py-2 text-right">Credit</th>
                  <th className="px-3 py-2 text-right">Balance</th>
                  <th className="px-3 py-2">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(preview.rows || []).slice(0, 200).map((r, i) => (
                  <tr key={i} className={r.status === 'invalid' ? 'bg-rose-50' : r.status === 'duplicate' ? 'bg-amber-50' : ''}>
                    <td className="px-3 py-1.5 whitespace-nowrap">{r.transactionDate || '—'}</td>
                    <td className="px-3 py-1.5 max-w-xs truncate">{r.narration}</td>
                    <td className="px-3 py-1.5 font-mono text-xs">{r.utrNumber || r.referenceNumber || '—'}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{r.debitAmount ? money(r.debitAmount) : '—'}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{r.creditAmount ? money(r.creditAmount) : '—'}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{r.balanceAfter != null ? money(r.balanceAfter) : '—'}</td>
                    <td className="px-3 py-1.5 uppercase text-xs">{r.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" className="btn-primary" disabled={saving || !(preview.summary?.importable > 0)} onClick={confirmImport}>
              {saving ? 'Importing…' : `Confirm import (${preview.summary?.importable || 0})`}
            </button>
            <button type="button" className="btn-secondary" onClick={() => setStep('map')}>Back to mapping</button>
          </div>
        </SectionCard>
      )}

      {step === 'statement' && (
        <>
          {dashboard && (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">
              <StatCard label="Imported" value={dashboard.totalCount} compact />
              <StatCard label="Credits" value={money(dashboard.totalCredit)} tone="success" compact />
              <StatCard label="Debits" value={money(dashboard.totalDebit)} tone="danger" compact />
              <StatCard label="Reconciled" value={money(dashboard.reconciledAmount)} tone="success" compact />
              <StatCard label="Unreconciled" value={money(dashboard.unreconciledAmount)} tone="warning" compact />
              <StatCard label="Unmatched" value={dashboard.byStatus?.unmatched?.count || 0} tone="warning" compact />
            </div>
          )}

          {dashboard?.byStatus && (
            <div className="flex flex-wrap gap-2 text-xs">
              {Object.entries(STATUS_LABEL).filter(([k]) => k !== 'duplicate').map(([k, label]) => (
                <button
                  key={k}
                  type="button"
                  className={`rounded-full px-2.5 py-1 ${filters.status === k ? 'bg-slate-900 text-white' : STATUS_CLASS[k] || 'bg-slate-100'}`}
                  onClick={() => setFilters((f) => ({ ...f, status: f.status === k ? '' : k }))}
                >
                  {label} ({dashboard.byStatus[k]?.count || 0})
                </button>
              ))}
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <select className="input" value={filters.paymentAccountId} onChange={(e) => setFilters((f) => ({ ...f, paymentAccountId: e.target.value }))}>
              <option value="">All bank accounts</option>
              {bankAccounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
            <select className="input" value={filters.direction} onChange={(e) => setFilters((f) => ({ ...f, direction: e.target.value }))}>
              <option value="">Credit / Debit</option>
              <option value="credit">Credit</option>
              <option value="debit">Debit</option>
            </select>
            <input type="date" className="input" value={filters.dateFrom} onChange={(e) => setFilters((f) => ({ ...f, dateFrom: e.target.value }))} />
            <input type="date" className="input" value={filters.dateTo} onChange={(e) => setFilters((f) => ({ ...f, dateTo: e.target.value }))} />
            <input className="input min-w-[160px]" placeholder="UTR / Reference / Narration" value={filters.search} onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))} />
            <button type="button" className="btn-secondary" onClick={refreshStatement} disabled={loading}>Refresh</button>
          </div>

          <div className="overflow-auto rounded-xl border border-slate-200">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left">
                <tr>
                  <th className="px-3 py-2">Date</th>
                  <th className="px-3 py-2">Value Date</th>
                  <th className="px-3 py-2">Narration</th>
                  <th className="px-3 py-2">Ref / UTR</th>
                  <th className="px-3 py-2 text-right">Debit</th>
                  <th className="px-3 py-2 text-right">Credit</th>
                  <th className="px-3 py-2 text-right">Balance</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Party</th>
                  <th className="px-3 py-2 text-right">Allocated</th>
                  <th className="px-3 py-2 text-right">Unalloc.</th>
                  <th className="px-3 py-2">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(txns.items || []).map((t) => (
                  <tr key={t.id}>
                    <td className="px-3 py-2 whitespace-nowrap">{t.transactionDate}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-slate-500">{t.valueDate || '—'}</td>
                    <td className="px-3 py-2 max-w-[220px] truncate" title={t.narration}>{t.narration}</td>
                    <td className="px-3 py-2 font-mono text-xs">{t.utrNumber || t.referenceNumber || '—'}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-rose-700">{t.debitAmount ? money(t.debitAmount) : '—'}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-emerald-700">{t.creditAmount ? money(t.creditAmount) : '—'}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{t.balanceAfter != null ? money(t.balanceAfter) : '—'}</td>
                    <td className="px-3 py-2">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_CLASS[t.reconciliationStatus] || 'bg-slate-100'}`}>
                        {STATUS_LABEL[t.reconciliationStatus] || t.reconciliationStatus}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-xs">{t.customerName || t.supplierName || t.voucherNumber || '—'}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{money(t.allocatedAmount)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{money(t.unallocatedAmount)}</td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-1">
                        {['unmatched', 'partially_allocated'].includes(t.reconciliationStatus) && (
                          <button type="button" className="btn-primary !px-2 !py-1 text-xs" onClick={() => openAllocate(t)}>
                            Mark / Allocate
                          </button>
                        )}
                        {t.voucherId && (
                          <a
                            className="btn-secondary !px-2 !py-1 text-xs"
                            href={t.voucherType === 'customer_receipt' ? '/business/crm' : '/operations/purchases'}
                          >
                            Voucher
                          </a>
                        )}
                        <button type="button" className="btn-secondary !px-2 !py-1 text-xs" onClick={() => openAllocate(t)}>View</button>
                      </div>
                    </td>
                  </tr>
                ))}
                {!txns.items?.length && !loading && (
                  <tr>
                    <td colSpan={12} className="px-3 py-10 text-center text-slate-500">
                      No bank transactions yet. Import a CSV linked to a bank account.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-slate-500">{txns.total || 0} transactions</p>
        </>
      )}

      {drawerOpen && selected && (
        <AllocateDrawer
          txn={selected}
          accounts={bankAccounts}
          categories={categories}
          onClose={() => { setDrawerOpen(false); setSelected(null); }}
          onDone={onAllocated}
          onError={onError}
        />
      )}
    </div>
  );
}

function AllocateDrawer({ txn, accounts, categories, onClose, onDone, onError }) {
  const defaultParty = txn.direction === 'credit' ? 'customer' : 'supplier';
  const [partyType, setPartyType] = useState(defaultParty);
  const [partyQuery, setPartyQuery] = useState('');
  const [partyHits, setPartyHits] = useState([]);
  const [customerId, setCustomerId] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [customerMeta, setCustomerMeta] = useState(null);
  const [supplierMeta, setSupplierMeta] = useState(null);
  const [openDocs, setOpenDocs] = useState([]);
  const [allocMap, setAllocMap] = useState({});
  const [categoryId, setCategoryId] = useState('');
  const [destAccountId, setDestAccountId] = useState('');
  const [remarks, setRemarks] = useState('');
  const [ignoreReason, setIgnoreReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [linkVoucherId, setLinkVoucherId] = useState('');

  const remaining = Number(txn.unallocatedAmount ?? txn.amount);

  useEffect(() => {
    if (!partyQuery || partyQuery.length < 2) { setPartyHits([]); return; }
    const t = setTimeout(async () => {
      try {
        const path = partyType === 'customer'
          ? `/api/customers?q=${encodeURIComponent(partyQuery)}&limit=15`
          : `/api/suppliers?q=${encodeURIComponent(partyQuery)}&limit=15`;
        const data = await apiRequest(path);
        setPartyHits(Array.isArray(data) ? data : (data.items || data.results || []));
      } catch {
        setPartyHits([]);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [partyQuery, partyType]);

  const selectCustomer = async (c) => {
    setCustomerId(c.id);
    setCustomerMeta(c);
    setPartyQuery(c.name || c.businessName || '');
    setPartyHits([]);
    try {
      const [inv, out] = await Promise.all([
        apiRequest(`/api/customer-receipts/open-invoices/${c.id}`),
        apiRequest(`/api/customers/${c.id}/outstanding`).catch(() => null),
      ]);
      setOpenDocs(inv || []);
      setCustomerMeta((m) => ({ ...m, outstanding: out?.totalOutstanding ?? out?.outstanding ?? m?.outstanding }));
      const auto = {};
      let left = remaining;
      for (const doc of (inv || [])) {
        if (left <= 0) break;
        const due = Number(doc.dueAmount ?? doc.balance ?? 0);
        const take = Math.min(due, left);
        if (take > 0) {
          auto[doc.id || doc.documentId] = take;
          left = Math.round((left - take) * 100) / 100;
        }
      }
      setAllocMap(auto);
    } catch (e) {
      onError?.(e.message);
    }
  };

  const selectSupplier = async (s) => {
    setSupplierId(s.id);
    setSupplierMeta(s);
    setPartyQuery(s.name || s.businessName || '');
    setPartyHits([]);
    try {
      const [bills, out] = await Promise.all([
        apiRequest(`/api/supplier-payment-vouchers/open-bills/${s.id}`),
        apiRequest(`/api/suppliers/${s.id}/outstanding`).catch(() => null),
      ]);
      setOpenDocs(bills || []);
      setSupplierMeta((m) => ({ ...m, payable: out?.totalOutstanding ?? out?.outstanding ?? m?.payable }));
      const auto = {};
      let left = remaining;
      for (const doc of (bills || [])) {
        if (left <= 0) break;
        const due = Number(doc.dueAmount ?? doc.balance ?? 0);
        const take = Math.min(due, left);
        if (take > 0) {
          auto[doc.id || doc.documentId] = take;
          left = Math.round((left - take) * 100) / 100;
        }
      }
      setAllocMap(auto);
    } catch (e) {
      onError?.(e.message);
    }
  };

  const allocatedSum = useMemo(
    () => Object.values(allocMap).reduce((s, n) => s + Number(n || 0), 0),
    [allocMap]
  );
  const advanceAmount = Math.max(0, Math.round((remaining - allocatedSum) * 100) / 100);

  const submit = async () => {
    setSaving(true);
    try {
      let result;
      if (partyType === 'customer') {
        if (!customerId) throw new Error('Select a customer');
        if (allocatedSum > remaining + 0.01) throw new Error('Allocation exceeds bank amount');
        result = await apiRequest(`/api/bank-transactions/${txn.id}/allocate-customer`, {
          method: 'POST',
          body: JSON.stringify({
            customerId,
            amount: remaining,
            allocations: Object.entries(allocMap)
              .filter(([, amt]) => Number(amt) > 0)
              .map(([documentId, allocatedAmount]) => ({ documentId, allocatedAmount: Number(allocatedAmount) })),
            remarks,
          }),
        });
      } else if (partyType === 'supplier') {
        if (!supplierId) throw new Error('Select a supplier');
        result = await apiRequest(`/api/bank-transactions/${txn.id}/allocate-supplier`, {
          method: 'POST',
          body: JSON.stringify({
            supplierId,
            amount: remaining,
            allocations: Object.entries(allocMap)
              .filter(([, amt]) => Number(amt) > 0)
              .map(([documentId, allocatedAmount]) => ({ documentId, allocatedAmount: Number(allocatedAmount) })),
            remarks,
          }),
        });
      } else if (partyType === 'other_income') {
        if (!categoryId) throw new Error('Income category required');
        result = await apiRequest(`/api/bank-transactions/${txn.id}/mark-other-income`, {
          method: 'POST',
          body: JSON.stringify({ categoryId, remarks, description: txn.narration }),
        });
      } else if (partyType === 'other_expense') {
        if (!categoryId) throw new Error('Expense category required');
        result = await apiRequest(`/api/bank-transactions/${txn.id}/mark-other-expense`, {
          method: 'POST',
          body: JSON.stringify({ categoryId, remarks, description: txn.narration }),
        });
      } else if (partyType === 'bank_transfer') {
        if (!destAccountId) throw new Error('Destination account required');
        result = await apiRequest(`/api/bank-transactions/${txn.id}/bank-transfer`, {
          method: 'POST',
          body: JSON.stringify({ destinationAccountId: destAccountId, remarks }),
        });
      } else if (partyType === 'ignore') {
        result = await apiRequest(`/api/bank-transactions/${txn.id}/ignore`, {
          method: 'POST',
          body: JSON.stringify({ reason: ignoreReason || 'Ignored', remarks }),
        });
        result = { transaction: result };
      } else if (partyType === 'link') {
        const v = (txn.possibleVouchers || []).find((x) => x.id === linkVoucherId);
        if (!v) throw new Error('Select an existing voucher');
        result = await apiRequest(`/api/bank-transactions/${txn.id}/link-existing-voucher`, {
          method: 'POST',
          body: JSON.stringify({ voucherId: v.id, voucherType: v.voucherType, remarks }),
        });
      } else {
        throw new Error('Unsupported party type');
      }
      onDone(result);
    } catch (e) {
      onError?.(e.message);
    } finally {
      setSaving(false);
    }
  };

  const incomeCats = categories?.income || [];
  const expenseCats = categories?.expense || [];
  const canAllocate = ['unmatched', 'partially_allocated'].includes(txn.reconciliationStatus);

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30">
      <button type="button" className="flex-1 cursor-default" aria-label="Close" onClick={onClose} />
      <aside className="flex h-full w-full max-w-lg flex-col bg-white shadow-2xl">
        <div className="flex items-start justify-between border-b border-slate-200 px-4 py-3">
          <div>
            <h3 className="font-semibold text-slate-900">Mark / Allocate</h3>
            <p className="text-xs text-slate-500">{txn.paymentAccountName}</p>
          </div>
          <button type="button" className="text-slate-400 hover:text-slate-700" onClick={onClose}>✕</button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4 text-sm">
          <div className="rounded-xl bg-slate-50 p-3 space-y-1">
            <div className="flex justify-between"><span className="text-slate-500">Date</span><span>{txn.transactionDate}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">Direction</span><span className="uppercase">{txn.direction}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">Amount</span><span className="font-semibold tabular-nums">{money(txn.amount)}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">Already allocated</span><span>{money(txn.allocatedAmount)}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">Remaining</span><span className="font-semibold text-amber-800">{money(remaining)}</span></div>
            <div className="pt-1 text-xs text-slate-600">{txn.narration}</div>
            <div className="font-mono text-xs text-slate-500">{txn.utrNumber || txn.referenceNumber || '—'}</div>
            <div className="pt-1">
              <span className={`inline-flex rounded-full px-2 py-0.5 text-xs ${STATUS_CLASS[txn.reconciliationStatus]}`}>
                {STATUS_LABEL[txn.reconciliationStatus]}
              </span>
              {txn.voucherNumber && <span className="ml-2 text-xs text-emerald-700">Voucher {txn.voucherNumber}</span>}
            </div>
          </div>

          {(txn.possibleVouchers || []).length > 0 && canAllocate && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
              <div className="font-medium text-amber-900">Possible existing payment found</div>
              <ul className="mt-2 space-y-1">
                {txn.possibleVouchers.map((v) => (
                  <li key={v.id} className="flex items-center justify-between gap-2 text-xs">
                    <label className="flex items-center gap-2">
                      <input type="radio" name="linkV" checked={linkVoucherId === v.id} onChange={() => { setLinkVoucherId(v.id); setPartyType('link'); }} />
                      {v.voucherNumber} · {money(v.amount)} · {v.date}
                    </label>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {canAllocate ? (
            <>
              <label className="block">
                <span className="mb-1 block text-slate-600">Party type</span>
                <select
                  className="input w-full"
                  value={partyType}
                  onChange={(e) => {
                    setPartyType(e.target.value);
                    setOpenDocs([]);
                    setAllocMap({});
                    setCustomerId('');
                    setSupplierId('');
                  }}
                >
                  {txn.direction === 'credit' && <option value="customer">Customer</option>}
                  {txn.direction === 'debit' && <option value="supplier">Supplier</option>}
                  {txn.direction === 'credit' && <option value="other_income">Other Income</option>}
                  {txn.direction === 'debit' && <option value="other_expense">Other Expense</option>}
                  <option value="bank_transfer">Bank Transfer</option>
                  <option value="ignore">Ignore</option>
                  {(txn.possibleVouchers || []).length > 0 && <option value="link">Link existing voucher</option>}
                </select>
              </label>

              {(partyType === 'customer' || partyType === 'supplier') && (
                <div className="space-y-2">
                  <label className="block">
                    <span className="mb-1 block text-slate-600">Search {partyType}</span>
                    <input
                      className="input w-full"
                      placeholder="Name, mobile, GSTIN, code…"
                      value={partyQuery}
                      onChange={(e) => setPartyQuery(e.target.value)}
                    />
                  </label>
                  {partyHits.length > 0 && (
                    <ul className="max-h-40 overflow-auto rounded-lg border border-slate-200 bg-white">
                      {partyHits.map((p) => (
                        <li key={p.id}>
                          <button
                            type="button"
                            className="w-full px-3 py-2 text-left hover:bg-slate-50"
                            onClick={() => (partyType === 'customer' ? selectCustomer(p) : selectSupplier(p))}
                          >
                            <div className="font-medium">{p.name || p.businessName}</div>
                            <div className="text-xs text-slate-500">{p.phone || p.mobile || ''} {p.gstin || ''}</div>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                  {customerMeta && partyType === 'customer' && (
                    <div className="rounded-lg bg-emerald-50 px-3 py-2 text-xs">
                      {customerMeta.name} · Outstanding {money(customerMeta.outstanding)}
                      {customerMeta.creditLimit != null && ` · Credit limit ${money(customerMeta.creditLimit)}`}
                    </div>
                  )}
                  {supplierMeta && partyType === 'supplier' && (
                    <div className="rounded-lg bg-rose-50 px-3 py-2 text-xs">
                      {supplierMeta.name} · Payable {money(supplierMeta.payable)}
                    </div>
                  )}

                  {openDocs.length > 0 && (
                    <div className="space-y-2">
                      <div className="font-medium text-slate-700">
                        {partyType === 'customer' ? 'Open sales invoices' : 'Open purchase bills'}
                      </div>
                      {openDocs.map((doc) => {
                        const id = doc.id || doc.documentId;
                        const due = Number(doc.dueAmount ?? doc.balance ?? 0);
                        const num = doc.documentNumber || doc.invoiceNumber || doc.billNumber || id;
                        return (
                          <div key={id} className="flex items-center gap-2 rounded-lg border border-slate-100 px-2 py-1.5">
                            <input
                              type="checkbox"
                              checked={Number(allocMap[id] || 0) > 0}
                              onChange={(e) => {
                                setAllocMap((m) => {
                                  const next = { ...m };
                                  if (e.target.checked) next[id] = due;
                                  else delete next[id];
                                  return next;
                                });
                              }}
                            />
                            <div className="min-w-0 flex-1">
                              <div className="truncate font-medium">{num}</div>
                              <div className="text-xs text-slate-500">Due {doc.dueDate || '—'} · {money(due)}</div>
                            </div>
                            <input
                              type="number"
                              className="input w-24 text-right"
                              step="0.01"
                              value={allocMap[id] ?? ''}
                              onChange={(e) => setAllocMap((m) => ({ ...m, [id]: e.target.value }))}
                            />
                          </div>
                        );
                      })}
                      <div className="rounded-lg bg-slate-50 px-3 py-2 text-xs space-y-1">
                        <div className="flex justify-between"><span>Allocated to docs</span><span>{money(allocatedSum)}</span></div>
                        <div className="flex justify-between"><span>Advance / on-account</span><span>{money(advanceAmount)}</span></div>
                        <div className="flex justify-between font-medium"><span>Bank remaining used</span><span>{money(Math.min(remaining, allocatedSum + advanceAmount))}</span></div>
                      </div>
                    </div>
                  )}
                  {(customerId || supplierId) && !openDocs.length && (
                    <EmptyPanel title="No open documents" description="Full amount will post as advance / on-account." />
                  )}
                </div>
              )}

              {partyType === 'other_income' && (
                <label className="block">
                  <span className="mb-1 block text-slate-600">Income category *</span>
                  <select className="input w-full" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
                    <option value="">Select</option>
                    {incomeCats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </label>
              )}

              {partyType === 'other_expense' && (
                <label className="block">
                  <span className="mb-1 block text-slate-600">Expense category *</span>
                  <select className="input w-full" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
                    <option value="">Select</option>
                    {expenseCats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </label>
              )}

              {partyType === 'bank_transfer' && (
                <label className="block">
                  <span className="mb-1 block text-slate-600">
                    {txn.direction === 'debit' ? 'Destination account *' : 'Linked counter-account *'}
                  </span>
                  <select className="input w-full" value={destAccountId} onChange={(e) => setDestAccountId(e.target.value)}>
                    <option value="">Select account</option>
                    {accounts.filter((a) => a.id !== txn.paymentAccountId).map((a) => (
                      <option key={a.id} value={a.id}>{a.name}</option>
                    ))}
                  </select>
                </label>
              )}

              {partyType === 'ignore' && (
                <label className="block">
                  <span className="mb-1 block text-slate-600">Reason</span>
                  <input className="input w-full" value={ignoreReason} onChange={(e) => setIgnoreReason(e.target.value)} placeholder="Why ignore?" />
                </label>
              )}

              <label className="block">
                <span className="mb-1 block text-slate-600">Remarks</span>
                <textarea className="input w-full" rows={2} value={remarks} onChange={(e) => setRemarks(e.target.value)} />
              </label>
            </>
          ) : (
            <p className="text-slate-500">This transaction is already reconciled and cannot be re-allocated here.</p>
          )}
        </div>

        {canAllocate && (
          <div className="border-t border-slate-200 px-4 py-3">
            <button type="button" className="btn-primary w-full" disabled={saving} onClick={submit}>
              {saving ? 'Posting…' : (
                partyType === 'customer' ? 'Mark payment received'
                  : partyType === 'supplier' ? 'Mark supplier payment'
                    : partyType === 'link' ? 'Link to existing voucher'
                      : partyType === 'ignore' ? 'Ignore transaction'
                        : 'Confirm'
              )}
            </button>
          </div>
        )}
      </aside>
    </div>
  );
}
