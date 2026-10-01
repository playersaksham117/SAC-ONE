/**
 * SACONE export dataset definitions.
 * All exporters are SELECT-only — never UPDATE/DELETE business data.
 */

export const EXPORT_VERSION = '1.0';

/** Datasets available for separate or complete export */
export const EXPORT_DATASETS = {
  company: {
    filename: 'company.json',
    schema: 'sacone.company.v1',
    supportsDateRange: false,
    description: 'Company profile and GST settings',
    relationships: [],
  },
  products: {
    filename: 'products.json',
    schema: 'sacone.products.v1',
    supportsDateRange: false,
    description: 'Product master (categories/brands/units as related lookups)',
    relationships: ['category_id→categories.id', 'brand_id→brands.id', 'unit_id→units.id'],
  },
  customers: {
    filename: 'customers.json',
    schema: 'sacone.customers.v1',
    supportsDateRange: false,
    description: 'Central customer master (shared by POS and web store)',
    relationships: [],
  },
  suppliers: {
    filename: 'suppliers.json',
    schema: 'sacone.suppliers.v1',
    supportsDateRange: false,
    description: 'Supplier master',
    relationships: [],
  },
  warehouses: {
    filename: 'warehouses.json',
    schema: 'sacone.warehouses.v1',
    supportsDateRange: false,
    description: 'Warehouses and warehouse_locations',
    relationships: ['warehouse_locations.warehouse_id→warehouses.id', 'warehouse_locations.parent_id→warehouse_locations.id'],
  },
  inventory_movements: {
    filename: 'inventory_movements.json',
    schema: 'sacone.inventory_movements.v1',
    supportsDateRange: true,
    dateField: 'created_at',
    description: 'Inventory movement ledger (source of truth for stock)',
    relationships: [
      'product_id→products.id',
      'warehouse_id→warehouses.id',
      'source_location_id→warehouse_locations.id',
      'destination_location_id→warehouse_locations.id',
    ],
  },
  stock_levels: {
    filename: 'stock_levels.json',
    schema: 'sacone.stock_levels.v1',
    supportsDateRange: false,
    description: 'Derived stock cache (rebuild from movements after Mongo import preferred)',
    relationships: ['product_id→products.id', 'warehouse_id→warehouses.id'],
  },
  sales: {
    filename: 'sales.json',
    schema: 'sacone.sales.v1',
    supportsDateRange: true,
    dateField: 'created_at',
    description: 'POS sales / invoices (pos_sales)',
    relationships: ['customer_id→customers.id', 'warehouse_id→warehouses.id'],
  },
  sales_items: {
    filename: 'sales_items.json',
    schema: 'sacone.sales_items.v1',
    supportsDateRange: true,
    dateField: 'sale.created_at',
    description: 'POS sale line items (pos_sale_items)',
    relationships: ['sale_id→pos_sales.id', 'product_id→products.id', 'movement_id→inventory_movements.id'],
  },
  payments: {
    filename: 'payments.json',
    schema: 'sacone.payments.v1',
    supportsDateRange: true,
    dateField: 'created_at',
    description: 'POS payments (pos_payments)',
    relationships: ['sale_id→pos_sales.id'],
  },
  supplier_bills: {
    filename: 'supplier_bills.json',
    schema: 'sacone.supplier_bills.v1',
    supportsDateRange: true,
    dateField: 'bill_date',
    description: 'Supplier purchase bills and line items',
    relationships: ['supplier_id→suppliers.id', 'bill_id→supplier_bills.id'],
  },
  supplier_payments: {
    filename: 'supplier_payments.json',
    schema: 'sacone.supplier_payments.v1',
    supportsDateRange: true,
    dateField: 'payment_date',
    description: 'Supplier payment ledger',
    relationships: ['supplier_id→suppliers.id', 'bill_id→supplier_bills.id'],
  },
  purchase_orders: {
    filename: 'purchase_orders.json',
    schema: 'sacone.purchase_orders.v1',
    supportsDateRange: true,
    dateField: 'order_date',
    description: 'Purchase orders and line items',
    relationships: ['supplier_id→suppliers.id', 'purchase_order_id→purchase_orders.id'],
  },
  system_settings: {
    filename: 'system_settings.json',
    schema: 'sacone.system_settings.v1',
    supportsDateRange: false,
    description: 'Non-secret system settings key/value pairs',
    relationships: [],
  },
  users: {
    filename: 'users.json',
    schema: 'sacone.users.v1',
    supportsDateRange: false,
    description: 'Users without passwords or secrets',
    relationships: ['role_id→roles.id'],
  },
};

export const COMPLETE_EXPORT_ORDER = [
  'company',
  'products',
  'customers',
  'suppliers',
  'warehouses',
  'inventory_movements',
  'stock_levels',
  'sales',
  'sales_items',
  'payments',
  'supplier_bills',
  'supplier_payments',
  'purchase_orders',
  'system_settings',
  'users',
];
