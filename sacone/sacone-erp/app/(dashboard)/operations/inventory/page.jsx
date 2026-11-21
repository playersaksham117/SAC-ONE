'use client';

import ModuleHub from '../../../../components/ModuleHub';
import InventoryWorkspace from '../../../../components/inventory/InventoryWorkspace';
import WarehouseWorkspace from '../../../../components/inventory/WarehouseWorkspace';
import { useAuth } from '../../../../lib/auth-context';

/** Inventory and Warehouse in one module. Old address /operations/warehouse opens ?view=warehouse. */
export default function InventoryHubPage() {
  const { checkPermission } = useAuth();
  const canInventory = ['inventory.stock.view', 'inventory.movements.view', 'inventory.adjustments.view'].some((p) => checkPermission(p));
  return (
    <ModuleHub
      title="Inventory & Warehouse"
      icon="📊"
      views={[
        { id: 'inventory', label: 'Inventory', icon: '📦', description: 'Stock levels, stock ledger, adjustments and HSN summary', allowed: canInventory, render: () => <InventoryWorkspace /> },
        { id: 'warehouse', label: 'Warehouse', icon: '🏭', description: 'Warehouses, locations, transfers and stock counts', allowed: checkPermission('warehouse.warehouses.view'), render: () => <WarehouseWorkspace /> },
      ]}
    />
  );
}
