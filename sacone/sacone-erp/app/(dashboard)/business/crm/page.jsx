'use client';

import { useEffect, useState } from 'react';
import { apiRequest } from '../../../../lib/api';
import { useLiveRefresh } from '../../../../lib/live';
import { useAuth, RequirePermission } from '../../../../lib/auth-context';
import PageHeader, { Alert, LoadingState, Modal, StatusBadge } from '../../../../components/ui';
import CustomerReceiptPanel from '../../../../components/parties/CustomerReceiptPanel';
import SupplierPaymentPanel from '../../../../components/parties/SupplierPaymentPanel';
import OutstandingPanel from '../../../../components/parties/OutstandingPanel';
import PartyStatementView from '../../../../components/parties/PartyStatementView';
import PartyCsvImport from '../../../../components/parties/PartyCsvImport';
import CustomerActivity from '../../../../components/crm/CustomerActivity';
import EditInvoiceDialog from '../../../../components/sales/EditInvoiceDialog';
import { CustomerInvoices, CustomerPayments, CustomerSalesHistory } from '../../../../components/customers/CustomerInvoicePanels';

function money(n) {
  return `₹${Number(n || 0).toFixed(2)}`;
}

const EMPTY_CUSTOMER = {
  code: '', name: '', phone: '', email: '', gstNumber: '', gstStateCode: '',
  address: '', city: '', state: '', creditLimit: '', notes: '', isActive: true, sourceChannel: 'manual',
};

const EMPTY_SUPPLIER = {
  code: '', name: '', contactName: '', phone: '', email: '', gstNumber: '', gstStateCode: '',
  address: '', city: '', state: '', paymentTerms: '', notes: '', isActive: true,
};

export default function PartiesPage() {
  const { checkPermission, session } = useAuth();
  // Credit (udhar) approval is for the firm admin or the group owner.
  const canApproveCredit = ['owner_admin', 'firm_admin'].includes(session?.user?.roleSlug) && checkPermission('parties.customers.edit');
  const [creditFilter, setCreditFilter] = useState('');
  const [importOpen, setImportOpen] = useState(false);
  // Edit bill: firm admin / group owner only (the server checks too).
  const isAdmin = ['owner_admin', 'firm_admin'].includes(session?.user?.roleSlug);
  const [editSaleId, setEditSaleId] = useState(null);
  const canViewCustomers = checkPermission('parties.customers.view');
  const canViewSuppliers = checkPermission('parties.suppliers.view');
  const canCreateCustomer = checkPermission('parties.customers.create');
  const canEditCustomer = checkPermission('parties.customers.edit');
  const canCreateSupplier = checkPermission('parties.suppliers.create');
  const canEditSupplier = checkPermission('parties.suppliers.edit');

  const [tab, setTab] = useState(canViewCustomers ? 'customers' : 'suppliers');
  const [hubTab, setHubTab] = useState('master');
  const [search, setSearch] = useState('');
  const [includeInactive, setIncludeInactive] = useState(false);
  const [customers, setCustomers] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [selected, setSelected] = useState(null);
  const [detailTab, setDetailTab] = useState('summary');
  const [summary, setSummary] = useState(null);
  const [history, setHistory] = useState([]);
  const [statement, setStatement] = useState(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_CUSTOMER);
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);

  const [billModal, setBillModal] = useState(false);
  const [payModal, setPayModal] = useState(false);
  const [billForm, setBillForm] = useState({ grandTotal: '', billDate: '', notes: '' });
  const [payForm, setPayForm] = useState({ amount: '', method: 'bank', paymentDate: '', reference: '', billId: '' });

  const loadList = async (silent = false) => {
    if (silent !== true) setLoading(true);
    setError('');
    try {
      const q = new URLSearchParams({
        search,
        includeInactive: includeInactive ? 'true' : 'false',
        limit: '200',
      });
      if (tab === 'customers' && canViewCustomers) {
        if (creditFilter) q.set('credit', creditFilter);
        const data = await apiRequest(`/api/customers?${q}`);
        setCustomers(data.items || []);
      } else if (tab === 'suppliers' && canViewSuppliers) {
        const data = await apiRequest(`/api/suppliers?${q}`);
        setSuppliers(data.items || []);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadList();
    setSelected(null);
    setSummary(null);
    setHistory([]);
    setStatement(null);
    setDetailTab('summary');
  }, [tab, includeInactive, creditFilter]);

  const openCreate = () => {
    setEditingId(null);
    setForm(tab === 'customers' ? { ...EMPTY_CUSTOMER } : { ...EMPTY_SUPPLIER });
    setModalOpen(true);
  };

  const openEdit = (row) => {
    setEditingId(row.id);
    if (tab === 'customers') {
      setForm({
        code: row.code || '',
        name: row.name || '',
        phone: row.phone || '',
        email: row.email || '',
        gstNumber: row.gstNumber || '',
        gstStateCode: row.gstStateCode || '',
        address: row.address || '',
        city: row.city || '',
        state: row.state || '',
        creditLimit: row.creditLimit ?? '',
        notes: row.notes || '',
        isActive: row.isActive,
        sourceChannel: row.sourceChannel || 'manual',
      });
    } else {
      setForm({
        code: row.code || '',
        name: row.name || '',
        contactName: row.contactName || '',
        phone: row.phone || '',
        email: row.email || '',
        gstNumber: row.gstNumber || '',
        gstStateCode: row.gstStateCode || '',
        address: row.address || '',
        city: row.city || '',
        state: row.state || '',
        paymentTerms: row.paymentTerms || '',
        notes: row.notes || '',
        isActive: row.isActive,
      });
    }
    setModalOpen(true);
  };

  const setCredit = async (approved) => {
    let creditLimit;
    if (approved) {
      const answer = window.prompt(`Approve ${selected.name} for credit. Credit limit in ₹ (0 = no limit):`, String(selected.creditLimit || 0));
      if (answer === null) return;
      creditLimit = Number(answer || 0);
    } else if (!window.confirm(`Withdraw credit for ${selected.name}? Their dues stay; new bills must be paid in full.`)) {
      return;
    }
    setError('');
    try {
      const updated = await apiRequest(`/api/customers/${selected.id}/credit-approval`, { method: 'POST', body: JSON.stringify({ approved, creditLimit }) });
      setMessage(approved ? `${updated.name} can now buy on credit.` : `Credit withdrawn for ${updated.name}.`);
      setSelected((s) => ({ ...s, ...updated }));
      await loadList(true);
    } catch (err) {
      setError(err.message);
    }
  };

  const saveParty = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const base = tab === 'customers' ? '/api/customers' : '/api/suppliers';
      const body = tab === 'customers'
        ? {
            ...form,
            creditLimit: form.creditLimit === '' ? 0 : Number(form.creditLimit),
            code: form.code || undefined,
          }
        : {
            ...form,
            code: form.code || undefined,
          };

      if (editingId) {
        await apiRequest(`${base}/${editingId}`, { method: 'PUT', body: JSON.stringify(body) });
        setMessage('Updated successfully');
      } else {
        await apiRequest(base, { method: 'POST', body: JSON.stringify(body) });
        setMessage('Created successfully');
      }
      setModalOpen(false);
      await loadList();
      if (selected?.id === editingId) {
        await selectRow({ id: editingId });
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const selectRow = async (row, firstTab = 'summary') => {
    setSelected(row);
    setDetailTab(firstTab);
    setError('');
    try {
      if (tab === 'customers') {
        setSummary(await apiRequest(`/api/customers/${row.id}/summary`));
      } else {
        setSummary(await apiRequest(`/api/suppliers/${row.id}/summary`));
      }
      setHistory([]);
      setStatement(null);
    } catch (err) {
      setError(err.message);
    }
  };

  const loadDetail = async (kind) => {
    if (!selected) return;
    setDetailTab(kind);
    setError('');
    try {
      if (tab === 'customers') {
        if (kind === 'summary') {
          setSummary(await apiRequest(`/api/customers/${selected.id}/summary`));
        } else if (kind === 'statement') {
          setStatement(await apiRequest(`/api/customers/${selected.id}/statement`));
        }
      } else {
        if (kind === 'summary') {
          setSummary(await apiRequest(`/api/suppliers/${selected.id}/summary`));
        } else if (kind === 'statement') {
          setStatement(await apiRequest(`/api/suppliers/${selected.id}/statement`));
        }
      }
    } catch (err) {
      setError(err.message);
    }
  };

  useLiveRefresh(() => {
    loadList(true);
    if (selected && detailTab !== 'activity') loadDetail(detailTab);
  });

  // Opened from CRM (lead → customer, a customer follow-up): /business/crm?customer=<id>
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('customer');
    if (!id || !canViewCustomers) return;
    apiRequest(`/api/customers/${id}`).then((c) => selectRow(c, checkPermission('crm.activities.view') ? 'activity' : 'summary')).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const saveBill = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await apiRequest(`/api/suppliers/${selected.id}/bills`, {
        method: 'POST',
        body: JSON.stringify({
          grandTotal: Number(billForm.grandTotal),
          billDate: billForm.billDate || undefined,
          notes: billForm.notes,
        }),
      });
      setBillModal(false);
      setBillForm({ grandTotal: '', billDate: '', notes: '' });
      setMessage('Purchase bill recorded');
      await selectRow(selected);
      await loadDetail('purchases');
      await loadList();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const savePayment = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await apiRequest(`/api/suppliers/${selected.id}/payments`, {
        method: 'POST',
        body: JSON.stringify({
          amount: Number(payForm.amount),
          method: payForm.method,
          paymentDate: payForm.paymentDate || undefined,
          reference: payForm.reference,
          billId: payForm.billId || undefined,
        }),
      });
      setPayModal(false);
      setPayForm({ amount: '', method: 'bank', paymentDate: '', reference: '', billId: '' });
      setMessage('Supplier payment recorded');
      await selectRow(selected);
      await loadDetail('payments');
      await loadList();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const list = tab === 'customers' ? customers : suppliers;
  const canCreate = tab === 'customers' ? canCreateCustomer : canCreateSupplier;
  const canEdit = tab === 'customers' ? canEditCustomer : canEditSupplier;

  if (!canViewCustomers && !canViewSuppliers) {
    return <Alert type="error" message="You do not have permission to view customers or suppliers." />;
  }

  return (
    <RequirePermission
      permission={canViewCustomers ? 'parties.customers.view' : 'parties.suppliers.view'}
    >
      <PageHeader
        title="Customers & Suppliers"
        description="Customer master, receipt vouchers, statements, outstanding & sales history"
        actions={(
          <div className="flex flex-wrap gap-2">
            {canCreate && hubTab === 'master' && (
              <button type="button" className="btn-secondary" onClick={() => { setMessage(''); setImportOpen(true); }}>
                Import CSV
              </button>
            )}
            {canCreate && hubTab === 'master' && (
              <button type="button" className="btn-primary" onClick={openCreate}>
                {tab === 'customers' ? 'New customer' : 'New supplier'}
              </button>
            )}
          </div>
        )}
      />

      <Alert type="error" message={error} />
      <Alert type="success" message={message} />
      {editSaleId && (
        <EditInvoiceDialog
          saleId={editSaleId}
          onClose={() => setEditSaleId(null)}
          onSaved={(saved) => { setEditSaleId(null); setMessage(`Bill ${saved.invoiceNumber} updated; stock adjusted.`); loadDetail(detailTab); loadList(true); }}
        />
      )}
      {importOpen && (
        <PartyCsvImport
          kind={tab}
          onClose={() => setImportOpen(false)}
          onImported={async (r) => {
            setMessage(`Import complete: ${r.created} created, ${r.updated} updated${r.errors?.length ? `, ${r.errors.length} with errors` : ''}.`);
            await loadList(true);
          }}
        />
      )}

      <div className="mb-3 flex flex-wrap gap-2">
        {[
          { id: 'master', label: 'Master' },
          { id: 'receipts', label: 'Customer Receipts', show: canViewCustomers },
          { id: 'supplier-payments', label: 'Supplier Payments', show: canViewSuppliers },
          { id: 'outstanding', label: 'Outstanding' },
          { id: 'statements', label: 'Statements' },
        ].filter((t) => t.show !== false).map((t) => (
          <button
            key={t.id}
            type="button"
            className={`rounded-lg px-3 py-1.5 text-sm font-medium ${hubTab === t.id ? 'bg-brand-700 text-white' : 'bg-slate-100'}`}
            onClick={() => setHubTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {hubTab === 'receipts' && (
        <CustomerReceiptPanel
          customers={customers}
          onMessage={setMessage}
          onError={setError}
        />
      )}

      {hubTab === 'supplier-payments' && (
        <SupplierPaymentPanel
          suppliers={suppliers}
          onMessage={setMessage}
          onError={setError}
        />
      )}

      {hubTab === 'outstanding' && (
        <div className="space-y-4">
          <div className="flex gap-2">
            {canViewCustomers && (
              <button type="button" className={`rounded-lg px-3 py-1.5 text-sm ${tab === 'customers' ? 'bg-slate-900 text-white' : 'bg-slate-100'}`} onClick={() => setTab('customers')}>Customer AR</button>
            )}
            {canViewSuppliers && (
              <button type="button" className={`rounded-lg px-3 py-1.5 text-sm ${tab === 'suppliers' ? 'bg-slate-900 text-white' : 'bg-slate-100'}`} onClick={() => setTab('suppliers')}>Supplier AP</button>
            )}
          </div>
          <OutstandingPanel partyType={tab === 'customers' ? 'customer' : 'supplier'} onError={setError} />
        </div>
      )}

      {hubTab === 'statements' && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2 items-end">
            {canViewCustomers && (
              <button type="button" className={`rounded-lg px-3 py-1.5 text-sm ${tab === 'customers' ? 'bg-slate-900 text-white' : 'bg-slate-100'}`} onClick={() => setTab('customers')}>Customer</button>
            )}
            {canViewSuppliers && (
              <button type="button" className={`rounded-lg px-3 py-1.5 text-sm ${tab === 'suppliers' ? 'bg-slate-900 text-white' : 'bg-slate-100'}`} onClick={() => setTab('suppliers')}>Supplier</button>
            )}
            <select
              className="input-field max-w-md"
              value={selected?.id || ''}
              onChange={(e) => {
                const id = e.target.value;
                const row = (tab === 'customers' ? customers : suppliers).find((r) => r.id === id);
                setSelected(row || null);
              }}
            >
              <option value="">Select {tab === 'customers' ? 'customer' : 'supplier'}</option>
              {(tab === 'customers' ? customers : suppliers).map((r) => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
            </select>
          </div>
          <PartyStatementView
            partyType={tab === 'customers' ? 'customer' : 'supplier'}
            partyId={selected?.id}
            onError={setError}
          />
        </div>
      )}

      {hubTab === 'master' && (
      <>
      <div className="mb-4 flex flex-wrap gap-2">
        {canViewCustomers && (
          <button
            type="button"
            className={`rounded-lg px-3 py-1.5 text-sm font-medium ${tab === 'customers' ? 'bg-slate-900 text-white' : 'bg-slate-100'}`}
            onClick={() => setTab('customers')}
          >
            Customers
          </button>
        )}
        {canViewSuppliers && (
          <button
            type="button"
            className={`rounded-lg px-3 py-1.5 text-sm font-medium ${tab === 'suppliers' ? 'bg-slate-900 text-white' : 'bg-slate-100'}`}
            onClick={() => setTab('suppliers')}
          >
            Suppliers
          </button>
        )}
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        <input
          className="input-field max-w-sm"
          placeholder="Search name, code, phone, GST…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && loadList()}
        />
        <button type="button" className="btn-secondary" onClick={loadList}>Search</button>
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input type="checkbox" checked={includeInactive} onChange={(e) => setIncludeInactive(e.target.checked)} />
          Include inactive
        </label>
        {tab === 'customers' && (
          <select className="input-field max-w-[13rem]" value={creditFilter} onChange={(e) => setCreditFilter(e.target.value)} aria-label="Credit">
            <option value="">All customers</option>
            <option value="pending">Awaiting credit approval</option>
            <option value="approved">Credit approved</option>
          </select>
        )}
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_1.1fr]">
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          {loading ? <LoadingState /> : (
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-3 py-2">ID</th>
                  <th className="px-3 py-2">Name</th>
                  <th className="px-3 py-2">Phone</th>
                  <th className="px-3 py-2">{tab === 'customers' ? 'Outstanding' : 'Payable'}</th>
                  <th className="px-3 py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {list.map((row) => (
                  <tr
                    key={row.id}
                    className={`cursor-pointer border-t border-slate-100 hover:bg-slate-50 ${selected?.id === row.id ? 'bg-blue-50' : ''}`}
                    onClick={() => selectRow(row)}
                  >
                    <td className="px-3 py-2 font-mono text-xs">{row.code}</td>
                    <td className="px-3 py-2 font-medium">
                      {row.name}
                      {row.isWalkIn && <span className="ml-2 text-[10px] uppercase text-slate-400">Walk-in</span>}
                      {tab === 'customers' && !row.isWalkIn && (
                        row.creditApproved
                          ? <span className="ml-2 rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">Credit</span>
                          : <span className="ml-2 rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">Cash only</span>
                      )}
                      {row.sourceChannel === 'pos' && <span className="ml-1 text-[10px] uppercase text-slate-400">SAC-POS</span>}
                    </td>
                    <td className="px-3 py-2">{row.phone || '—'}</td>
                    <td className="px-3 py-2">
                      {money(tab === 'customers' ? row.outstandingBalance : row.outstandingPayable)}
                    </td>
                    <td className="px-3 py-2"><StatusBadge active={row.isActive} /></td>
                  </tr>
                ))}
                {!list.length && (
                  <tr><td colSpan={5} className="px-3 py-8 text-center text-slate-400">No records</td></tr>
                )}
              </tbody>
            </table>
          )}
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          {!selected && <p className="text-sm text-slate-500">Select a record to view history and statement.</p>}
          {selected && (
            <>
              <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h3 className="text-lg font-semibold">{selected.name}</h3>
                  <p className="font-mono text-xs text-slate-500">{selected.code}</p>
                  {selected.gstNumber && <p className="text-xs text-slate-500">GSTIN {selected.gstNumber}</p>}
                </div>
                {canEdit && (
                  <button type="button" className="btn-secondary text-xs" onClick={() => openEdit(selected)}>Edit</button>
                )}
              </div>

              {tab === 'customers' && !selected.isWalkIn && (
                <div className={`mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg p-3 text-sm ${selected.creditApproved ? 'bg-emerald-50' : 'bg-amber-50'}`}>
                  <div>
                    <div className="font-medium">{selected.creditApproved ? 'Approved for credit (udhar)' : 'Cash only: not approved for credit'}</div>
                    <div className="text-xs text-slate-600">
                      {selected.creditApproved
                        ? `Limit ${selected.creditLimit > 0 ? money(selected.creditLimit) : 'none'}${selected.creditApprovedAt ? ` · since ${new Date(selected.creditApprovedAt).toLocaleDateString('en-IN')}` : ''}`
                        : 'SAC-POS and the ERP will not sell to them on credit until an admin approves.'}
                    </div>
                  </div>
                  {canApproveCredit && (selected.creditApproved
                    ? <button type="button" className="btn-secondary !min-h-0 !px-3 !py-1.5 text-xs" onClick={() => setCredit(false)}>Withdraw credit</button>
                    : <button type="button" className="btn-primary !min-h-0 !px-3 !py-1.5 text-xs" onClick={() => setCredit(true)}>Approve credit</button>)}
                </div>
              )}

              <div className="mb-3 flex flex-wrap gap-1">
                  {(tab === 'customers'
                    ? [['summary', 'Summary'], ['invoices', 'Invoices'], ['payments', 'Payments'], ['sales', 'Sales History'], ['returns', 'Returns'], ['statement', 'Ledger'], ...(checkPermission('crm.activities.view') ? [['activity', 'Activity']] : [])]
                    : [['summary', 'Summary'], ['bills', 'Bills'], ['payments', 'Payments'], ['purchases', 'Purchase History'], ['returns', 'Returns'], ['statement', 'Ledger']]
                  ).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    className={`rounded-md px-2.5 py-1 text-xs font-medium ${detailTab === id ? 'bg-slate-900 text-white' : 'bg-slate-100'}`}
                    onClick={() => loadDetail(id)}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {tab === 'suppliers' && canEdit && (
                <div className="mb-3 flex gap-2">
                  <button type="button" className="btn-secondary text-xs" onClick={() => setBillModal(true)}>Record bill</button>
                  <button type="button" className="btn-secondary text-xs" onClick={() => setPayModal(true)}>Record payment</button>
                </div>
              )}

              {detailTab === 'activity' && tab === 'customers' && <CustomerActivity customerId={selected.id} />}
              {tab === 'customers' && detailTab === 'invoices' && <CustomerInvoices customerId={selected.id} canEdit={isAdmin} onEdit={setEditSaleId} />}
              {tab === 'customers' && detailTab === 'payments' && <CustomerPayments customerId={selected.id} />}
              {tab === 'customers' && detailTab === 'sales' && <CustomerSalesHistory customerId={selected.id} />}
              {tab === 'customers' && detailTab === 'returns' && <CustomerSalesHistory customerId={selected.id} only={['returned']} />}
              {tab === 'suppliers' && detailTab === 'bills' && <CustomerInvoices party="supplier" customerId={selected.id} />}
              {tab === 'suppliers' && detailTab === 'payments' && <CustomerPayments party="supplier" customerId={selected.id} />}
              {tab === 'suppliers' && detailTab === 'purchases' && <CustomerSalesHistory party="supplier" customerId={selected.id} />}
              {tab === 'suppliers' && detailTab === 'returns' && <CustomerSalesHistory party="supplier" customerId={selected.id} only={['returned']} />}

              {detailTab === 'summary' && summary && (
                <div className="grid grid-cols-2 gap-3 text-sm">
                  {tab === 'customers' ? (
                    <>
                      <div className="rounded-lg bg-slate-50 p-3"><div className="text-xs text-slate-500">Outstanding</div><div className="font-semibold">{money(summary.outstandingBalance)}</div></div>
                      <div className="rounded-lg bg-slate-50 p-3"><div className="text-xs text-slate-500">Credit limit</div><div className="font-semibold">{money(summary.customer?.creditLimit)}</div></div>
                      <div className="rounded-lg bg-slate-50 p-3"><div className="text-xs text-slate-500">Invoices</div><div className="font-semibold">{summary.invoiceCount}</div></div>
                      <div className="rounded-lg bg-slate-50 p-3"><div className="text-xs text-slate-500">Sales total</div><div className="font-semibold">{money(summary.salesTotal)}</div></div>
                      <div className="rounded-lg bg-slate-50 p-3"><div className="text-xs text-slate-500">Paid</div><div className="font-semibold">{money(summary.paidTotal)}</div></div>
                      <div className="rounded-lg bg-slate-50 p-3"><div className="text-xs text-slate-500">Returns</div><div className="font-semibold">{money(summary.returnTotal)}</div></div>
                    </>
                  ) : (
                    <>
                      <div className="rounded-lg bg-slate-50 p-3"><div className="text-xs text-slate-500">Outstanding payable</div><div className="font-semibold">{money(summary.outstandingPayable)}</div></div>
                      <div className="rounded-lg bg-slate-50 p-3"><div className="text-xs text-slate-500">Payment terms</div><div className="font-semibold">{summary.supplier?.paymentTerms || '—'}</div></div>
                      <div className="rounded-lg bg-slate-50 p-3"><div className="text-xs text-slate-500">Bills</div><div className="font-semibold">{summary.billCount}</div></div>
                      <div className="rounded-lg bg-slate-50 p-3"><div className="text-xs text-slate-500">Purchases</div><div className="font-semibold">{money(summary.purchaseTotal)}</div></div>
                      <div className="rounded-lg bg-slate-50 p-3"><div className="text-xs text-slate-500">Payments</div><div className="font-semibold">{money(summary.paymentTotal)}</div></div>
                      <div className="rounded-lg bg-slate-50 p-3"><div className="text-xs text-slate-500">Contact</div><div className="font-semibold">{summary.supplier?.contactName || '—'}</div></div>
                    </>
                  )}
                  <div className="col-span-2 rounded-lg border border-slate-100 p-3 text-xs text-slate-600">
                    <div>{selected.address || 'No address'}</div>
                    <div>{[selected.city, selected.state].filter(Boolean).join(', ')}</div>
                    <div>{selected.email || ''} {selected.phone ? `· ${selected.phone}` : ''}</div>
                    {selected.notes && <div className="mt-1 italic">{selected.notes}</div>}
                  </div>
                </div>
              )}

              {detailTab === 'statement' && statement && (
                <div className="max-h-96 overflow-auto">
                  <div className="mb-2 text-sm">
                    Closing: <strong>{money(statement.closingBalance)}</strong>
                    {tab === 'customers'
                      ? ` (ledger) · Outstanding ${money(statement.customer?.outstandingBalance)}`
                      : ` (ledger) · Payable ${money(statement.supplier?.outstandingPayable)}`}
                  </div>
                  <table className="min-w-full text-xs">
                    <thead className="bg-slate-50 text-left uppercase text-slate-500">
                      <tr>
                        <th className="px-2 py-1">Date</th>
                        <th className="px-2 py-1">Particulars</th>
                        <th className="px-2 py-1 text-right">Debit</th>
                        <th className="px-2 py-1 text-right">Credit</th>
                        <th className="px-2 py-1 text-right">Balance</th>
                      </tr>
                    </thead>
                    <tbody>
                      {statement.lines?.map((line, idx) => (
                        <tr key={`${line.recordId}-${idx}`} className="border-t border-slate-100">
                          <td className="px-2 py-1">{String(line.date).slice(0, 10)}</td>
                          <td className="px-2 py-1">{line.particulars || line.description}</td>
                          <td className="px-2 py-1 text-right">{line.debit ? money(line.debit) : ''}</td>
                          <td className="px-2 py-1 text-right">{line.credit ? money(line.credit) : ''}</td>
                          <td className="px-2 py-1 text-right">{money(line.balance)}</td>
                        </tr>
                      ))}
                      {!statement.lines?.length && (
                        <tr><td colSpan={5} className="px-2 py-6 text-center text-slate-400">No statement lines</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
      </div>
      </>
      )}

      <Modal
        open={modalOpen}
        title={editingId ? `Edit ${tab === 'customers' ? 'customer' : 'supplier'}` : `New ${tab === 'customers' ? 'customer' : 'supplier'}`}
        onClose={() => setModalOpen(false)}
        size="lg"
        footer={(
          <>
            <button type="button" className="btn-secondary" onClick={() => setModalOpen(false)}>Cancel</button>
            <button type="submit" form="party-form" className="btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
          </>
        )}
      >
        <form id="party-form" onSubmit={saveParty} className="grid gap-3 sm:grid-cols-2">
          <input className="input-field" placeholder="Code (auto if blank)" value={form.code} onChange={(e) => setForm((p) => ({ ...p, code: e.target.value }))} />
          <input className="input-field" placeholder="Name *" required value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} />
          {tab === 'suppliers' && (
            <input className="input-field" placeholder="Contact name" value={form.contactName || ''} onChange={(e) => setForm((p) => ({ ...p, contactName: e.target.value }))} />
          )}
          <input className="input-field" placeholder="Phone" value={form.phone} onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))} />
          <input className="input-field" placeholder="Email" type="email" value={form.email} onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))} />
          <input className="input-field" placeholder="GST Number" value={form.gstNumber} onChange={(e) => setForm((p) => ({ ...p, gstNumber: e.target.value }))} />
          <input className="input-field" placeholder="GST state code" value={form.gstStateCode} onChange={(e) => setForm((p) => ({ ...p, gstStateCode: e.target.value }))} />
          <input className="input-field sm:col-span-2" placeholder="Address" value={form.address} onChange={(e) => setForm((p) => ({ ...p, address: e.target.value }))} />
          <input className="input-field" placeholder="City" value={form.city} onChange={(e) => setForm((p) => ({ ...p, city: e.target.value }))} />
          <input className="input-field" placeholder="State" value={form.state} onChange={(e) => setForm((p) => ({ ...p, state: e.target.value }))} />
          {tab === 'customers' ? (
            <>
              <input className="input-field" placeholder="Credit limit" type="number" value={form.creditLimit} onChange={(e) => setForm((p) => ({ ...p, creditLimit: e.target.value }))} />
              {canApproveCredit && !editingId && (
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={Boolean(form.creditApproved)} onChange={(e) => setForm((p) => ({ ...p, creditApproved: e.target.checked }))} />
                  Approve for credit (udhar)
                </label>
              )}
              <select className="input-field" value={form.sourceChannel} onChange={(e) => setForm((p) => ({ ...p, sourceChannel: e.target.value }))}>
                <option value="manual">Source: Manual</option>
                <option value="pos">Source: POS</option>
                <option value="web">Source: Web store</option>
                <option value="import">Source: Import</option>
              </select>
            </>
          ) : (
            <input className="input-field sm:col-span-2" placeholder="Payment terms (e.g. Net 30)" value={form.paymentTerms || ''} onChange={(e) => setForm((p) => ({ ...p, paymentTerms: e.target.value }))} />
          )}
          <textarea className="input-field sm:col-span-2" rows={2} placeholder="Notes" value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} />
          {editingId && (
            <label className="flex items-center gap-2 text-sm sm:col-span-2">
              <input type="checkbox" checked={form.isActive} onChange={(e) => setForm((p) => ({ ...p, isActive: e.target.checked }))} />
              Active
            </label>
          )}
        </form>
      </Modal>

      <Modal open={billModal} title="Record purchase bill" onClose={() => setBillModal(false)} footer={(
        <>
          <button type="button" className="btn-secondary" onClick={() => setBillModal(false)}>Cancel</button>
          <button type="submit" form="bill-form" className="btn-primary" disabled={saving}>Save</button>
        </>
      )}>
        <form id="bill-form" onSubmit={saveBill} className="space-y-3">
          <input className="input-field" type="number" step="0.01" required placeholder="Grand total" value={billForm.grandTotal} onChange={(e) => setBillForm((p) => ({ ...p, grandTotal: e.target.value }))} />
          <input className="input-field" type="date" value={billForm.billDate} onChange={(e) => setBillForm((p) => ({ ...p, billDate: e.target.value }))} />
          <textarea className="input-field" rows={2} placeholder="Notes" value={billForm.notes} onChange={(e) => setBillForm((p) => ({ ...p, notes: e.target.value }))} />
        </form>
      </Modal>

      <Modal open={payModal} title="Record supplier payment" onClose={() => setPayModal(false)} footer={(
        <>
          <button type="button" className="btn-secondary" onClick={() => setPayModal(false)}>Cancel</button>
          <button type="submit" form="pay-form" className="btn-primary" disabled={saving}>Save</button>
        </>
      )}>
        <form id="pay-form" onSubmit={savePayment} className="space-y-3">
          <input className="input-field" type="number" step="0.01" required placeholder="Amount" value={payForm.amount} onChange={(e) => setPayForm((p) => ({ ...p, amount: e.target.value }))} />
          <select className="input-field" value={payForm.method} onChange={(e) => setPayForm((p) => ({ ...p, method: e.target.value }))}>
            <option value="cash">Cash</option>
            <option value="upi">UPI</option>
            <option value="bank">Bank</option>
            <option value="cheque">Cheque</option>
            <option value="other">Other</option>
          </select>
          <input className="input-field" type="date" value={payForm.paymentDate} onChange={(e) => setPayForm((p) => ({ ...p, paymentDate: e.target.value }))} />
          <input className="input-field" placeholder="Reference" value={payForm.reference} onChange={(e) => setPayForm((p) => ({ ...p, reference: e.target.value }))} />
        </form>
      </Modal>
    </RequirePermission>
  );
}
