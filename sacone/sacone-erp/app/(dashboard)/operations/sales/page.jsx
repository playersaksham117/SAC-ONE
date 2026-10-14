'use client';

import { useState } from 'react';
import { RequirePermission, useAuth } from '../../../../lib/auth-context';
import SalesInvoices from '../../../../components/sales/SalesInvoices';
import SalesQuotations from '../../../../components/sales/SalesQuotations';
import PageHeader from '../../../../components/ui';

export default function Page() {
  const { checkPermission } = useAuth();
  const canQuotes = checkPermission('pos.quotations.view');
  const [tab, setTab] = useState('invoices');

  return (
    <RequirePermission permissions={['pos.sales.view', 'sales.orders.view']}>
      {canQuotes && (
        <div className="mb-4 flex gap-2">
          {[['invoices', 'Invoices'], ['quotations', 'Quotations']].map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition ${tab === id ? 'bg-brand-600 text-white' : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}
            >
              {label}
            </button>
          ))}
        </div>
      )}
      {tab === 'quotations' && canQuotes ? (
        <>
          <PageHeader title="Quotations" description="Quotations from SAC-POS phones (Sale / Quotation toggle). Selling one on the phone marks it converted." />
          <SalesQuotations />
        </>
      ) : <SalesInvoices />}
    </RequirePermission>
  );
}
