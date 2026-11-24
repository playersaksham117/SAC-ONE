'use client';

import ModuleHub from '../../../../components/ModuleHub';
import SalesWorkspace from '../../../../components/sales/SalesWorkspace';
import WarrantyCheck from '../../../../components/sales/WarrantyCheck';
import BatchRegister from '../../../../components/sales/BatchRegister';
import { useAuth } from '../../../../lib/auth-context';

/** Sales and Warranty Check in one module. Old address /operations/warranty opens ?view=warranty. */
export default function SalesHubPage() {
  const { checkPermission } = useAuth();
  const canSales = checkPermission('pos.sales.view');
  return (
    <ModuleHub
      title="Sales & Warranty"
      icon="💰"
      views={[
        { id: 'sales', label: 'Sales', icon: '🧾', description: 'Invoices, quotations, profit, e-way bills and challans', allowed: canSales || checkPermission('sales.orders.view'), render: () => <SalesWorkspace /> },
        { id: 'warranty', label: 'Warranty Check', icon: '🛡️', description: 'Warranty and guarantee by invoice, serial or batch number', allowed: canSales, render: () => <WarrantyCheck /> },
        { id: 'batches', label: 'Batch Register', icon: '🏷️', description: 'Batches received on purchase bills, sold and left', allowed: canSales || checkPermission('purchases.bills.view'), render: () => <BatchRegister /> },
      ]}
    />
  );
}
