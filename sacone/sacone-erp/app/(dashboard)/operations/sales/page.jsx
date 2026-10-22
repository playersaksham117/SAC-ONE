'use client';

import { useEffect, useState } from 'react';
import { RequirePermission, useAuth } from '../../../../lib/auth-context';
import SalesInvoices from '../../../../components/sales/SalesInvoices';
import SalesQuotations from '../../../../components/sales/SalesQuotations';
import SoldAbovePrice from '../../../../components/sales/SoldAbovePrice';
import SaleProfit from '../../../../components/sales/SaleProfit';
import PageHeader from '../../../../components/ui';

export default function Page() {
  const { checkPermission } = useAuth();
  const canQuotes = checkPermission('pos.quotations.view');
  const canSales = checkPermission('pos.sales.view');
  const canProfit = canSales && checkPermission('purchases.bills.view');
  const [tab, setTab] = useState('invoices');
  const tabs = [
    ['invoices', 'Invoices'],
    ...(canQuotes ? [['quotations', 'Quotations']] : []),
    ...(canSales ? [['above', 'Sold Above Price']] : []),
    ...(canProfit ? [['profit', 'Profit / Loss']] : []),
  ];

  // Open a tab straight from a link: /operations/sales?tab=above
  useEffect(() => {
    const wanted = new URLSearchParams(window.location.search).get('tab');
    if (wanted && tabs.some(([id]) => id === wanted)) setTab(wanted);
  }, [canQuotes, canSales, canProfit]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <RequirePermission permissions={['pos.sales.view', 'sales.orders.view']}>
      {tabs.length > 1 && (
        <div className="mb-4 flex flex-wrap gap-2">
          {tabs.map(([id, label]) => (
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
      ) : tab === 'above' && canSales ? <SoldAbovePrice /> : tab === 'profit' && canProfit ? <SaleProfit /> : <SalesInvoices />}
    </RequirePermission>
  );
}
