'use client';

import { RequirePermission } from '../../../../lib/auth-context';
import SalesInvoices from '../../../../components/sales/SalesInvoices';

export default function Page() {
  return (
    <RequirePermission permissions={['pos.sales.view', 'sales.orders.view']}>
      <SalesInvoices />
    </RequirePermission>
  );
}
