'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiRequest, getApiBase } from '../../lib/api';
import { useLiveRefresh } from '../../lib/live';

function money(n) {
  return `₹${Number(n || 0).toFixed(2)}`;
}

export default function PartyStatementView({ partyType = 'customer', partyId, onError }) {
  const [filters, setFilters] = useState({
    dateFrom: '',
    dateTo: '',
    transactionType: '',
  });
  const [statement, setStatement] = useState(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async (silent = false) => {
    if (!partyId) return;
    if (silent !== true) setLoading(true);
    try {
      const q = new URLSearchParams();
      if (filters.dateFrom) q.set('dateFrom', filters.dateFrom);
      if (filters.dateTo) q.set('dateTo', filters.dateTo);
      if (filters.transactionType) q.set('transactionType', filters.transactionType);
      const base = partyType === 'customer' ? `/api/customers/${partyId}/statement` : `/api/suppliers/${partyId}/statement`;
      setStatement(await apiRequest(`${base}?${q}`));
    } catch (e) {
      onError?.(e.message);
    } finally {
      setLoading(false);
    }
  }, [partyId, partyType, filters, onError]);

  useEffect(() => { load(); }, [load]);
  useLiveRefresh(() => load(true));

  const exportCsv = () => {
    const q = new URLSearchParams({ format: 'csv' });
    if (filters.dateFrom) q.set('dateFrom', filters.dateFrom);
    if (filters.dateTo) q.set('dateTo', filters.dateTo);
    if (filters.transactionType) q.set('transactionType', filters.transactionType);
    const base = partyType === 'customer' ? `/api/customers/${partyId}/statement` : `/api/suppliers/${partyId}/statement`;
    window.open(`${getApiBase()}${base}?${q}`, '_blank');
  };

  if (!partyId) return <p className="text-sm text-slate-500">Select a party to view statement.</p>;

  const summary = statement?.summary || {};

  return (
    <div className="space-y-4 print:space-y-2">
      <div className="flex flex-wrap items-end gap-3 print:hidden">
        <div>
          <label className="label">From</label>
          <input type="date" className="input-field" value={filters.dateFrom} onChange={(e) => setFilters({ ...filters, dateFrom: e.target.value })} />
        </div>
        <div>
          <label className="label">To</label>
          <input type="date" className="input-field" value={filters.dateTo} onChange={(e) => setFilters({ ...filters, dateTo: e.target.value })} />
        </div>
        <div>
          <label className="label">Type</label>
          <select className="input-field" value={filters.transactionType} onChange={(e) => setFilters({ ...filters, transactionType: e.target.value })}>
            <option value="">All</option>
            {partyType === 'customer'
              ? ['sales', 'sales_return', 'receipt', 'advance', 'adjustment'].map((t) => <option key={t} value={t}>{t}</option>)
              : ['purchase', 'purchase_return', 'payment', 'advance', 'adjustment'].map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <button type="button" className="btn-secondary" onClick={load}>Apply</button>
        <button type="button" className="btn-secondary" onClick={() => window.print()}>Print</button>
        <button type="button" className="btn-secondary" onClick={exportCsv}>CSV</button>
      </div>

      {loading && <p className="text-sm text-slate-500">Loading statement…</p>}

      {statement && (
        <>
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <h3 className="text-lg font-semibold">
              {partyType === 'customer' ? 'CUSTOMER STATEMENT' : 'SUPPLIER STATEMENT'}
            </h3>
            <p className="text-sm text-slate-600">
              {statement.customer?.name || statement.supplier?.name}
            </p>
            <div className="mt-3 grid gap-2 sm:grid-cols-3 lg:grid-cols-6 text-sm">
              <div>Opening<br /><strong>{money(summary.openingBalance)}</strong></div>
              <div>{partyType === 'customer' ? 'Sales' : 'Purchases'}<br /><strong>{money(summary.totalSales || summary.totalPurchases)}</strong></div>
              <div>Returns<br /><strong>{money(summary.totalReturns)}</strong></div>
              <div>{partyType === 'customer' ? 'Receipts' : 'Payments'}<br /><strong>{money(summary.totalReceipts || summary.totalPayments)}</strong></div>
              <div>Adjustments<br /><strong>{money(summary.adjustments)}</strong></div>
              <div>{partyType === 'customer' ? 'Receivable' : 'Payable'}<br /><strong>{money(summary.closingBalance)}</strong></div>
            </div>
          </div>

          <div className="overflow-auto rounded-xl border border-slate-200">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left">
                <tr>
                  <th className="px-3 py-2">Date</th>
                  <th className="px-3 py-2">Particulars</th>
                  <th className="px-3 py-2 text-right">Debit</th>
                  <th className="px-3 py-2 text-right">Credit</th>
                  <th className="px-3 py-2 text-right">Balance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(statement.lines || []).map((line, idx) => (
                  <tr key={`${line.documentId || 'x'}-${idx}`}>
                    <td className="px-3 py-2 whitespace-nowrap">{line.date}</td>
                    <td className="px-3 py-2">
                      {line.documentNumber ? (
                        <span className="font-medium text-brand-700">{line.particulars}</span>
                      ) : line.particulars}
                    </td>
                    <td className="px-3 py-2 text-right">{line.debit ? money(line.debit) : ''}</td>
                    <td className="px-3 py-2 text-right">{line.credit ? money(line.credit) : ''}</td>
                    <td className="px-3 py-2 text-right font-medium">{money(line.balance)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="text-sm font-semibold">
            Closing {partyType === 'customer' ? 'Due' : 'Payable'}: {money(statement.closingBalance)}
          </div>
        </>
      )}
    </div>
  );
}
