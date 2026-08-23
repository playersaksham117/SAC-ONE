-- Default roles / permissions for local Postgres

INSERT INTO public.roles (id, code, name, description, is_system, is_active) VALUES
  ('role-admin', 'admin', 'Administrator', 'Full unrestricted access', true, true),
  ('role-manager', 'manager', 'Manager', 'Operations and reporting', true, true),
  ('role-staff', 'staff', 'Staff Operator', 'Day-to-day stock operations', true, true),
  ('role-viewer', 'viewer', 'Viewer', 'Read-only access', true, true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.permissions (id, module, action, code, label) VALUES
  ('perm-products-view', 'products', 'view', 'products.view', 'View'),
  ('perm-products-create', 'products', 'create', 'products.create', 'Create'),
  ('perm-products-edit', 'products', 'edit', 'products.edit', 'Edit'),
  ('perm-products-delete', 'products', 'delete', 'products.delete', 'Delete'),
  ('perm-products-import', 'products', 'import', 'products.import', 'Import'),
  ('perm-products-export', 'products', 'export', 'products.export', 'Export'),
  ('perm-products-print', 'products', 'print', 'products.print', 'Print'),
  ('perm-inventory-view', 'inventory', 'view', 'inventory.view', 'View'),
  ('perm-inventory-opening', 'inventory', 'opening_stock', 'inventory.opening_stock', 'Opening Stock'),
  ('perm-inventory-adj', 'inventory', 'adjustment', 'inventory.adjustment', 'Stock Adjustment'),
  ('perm-inventory-ver', 'inventory', 'verification', 'inventory.verification', 'Stock Verification'),
  ('perm-inventory-count', 'inventory', 'physical_count', 'inventory.physical_count', 'Physical Count'),
  ('perm-inventory-import', 'inventory', 'import', 'inventory.import', 'Import'),
  ('perm-inventory-export', 'inventory', 'export', 'inventory.export', 'Export'),
  ('perm-warehouse-view', 'warehouse', 'view', 'warehouse.view', 'View'),
  ('perm-warehouse-create', 'warehouse', 'create', 'warehouse.create', 'Create'),
  ('perm-warehouse-edit', 'warehouse', 'edit', 'warehouse.edit', 'Edit'),
  ('perm-warehouse-delete', 'warehouse', 'delete', 'warehouse.delete', 'Delete'),
  ('perm-warehouse-transfer', 'warehouse', 'transfer', 'warehouse.transfer', 'Transfer'),
  ('perm-warehouse-receive', 'warehouse', 'receive', 'warehouse.receive', 'Receive'),
  ('perm-warehouse-dispatch', 'warehouse', 'dispatch', 'warehouse.dispatch', 'Dispatch'),
  ('perm-warehouse-cells', 'warehouse', 'create_cells', 'warehouse.create_cells', 'Create Cells'),
  ('perm-warehouse-zones', 'warehouse', 'create_zones', 'warehouse.create_zones', 'Create Zones'),
  ('perm-purchases-view', 'purchases', 'view', 'purchases.view', 'View'),
  ('perm-purchases-create', 'purchases', 'create', 'purchases.create', 'Create Purchase'),
  ('perm-purchases-edit', 'purchases', 'edit', 'purchases.edit', 'Edit Purchase'),
  ('perm-purchases-receive', 'purchases', 'receive_goods', 'purchases.receive_goods', 'Receive Goods'),
  ('perm-purchases-return', 'purchases', 'purchase_return', 'purchases.purchase_return', 'Purchase Return'),
  ('perm-purchases-cancel', 'purchases', 'cancel', 'purchases.cancel', 'Cancel Purchase'),
  ('perm-suppliers-view', 'suppliers', 'view', 'suppliers.view', 'View'),
  ('perm-suppliers-create', 'suppliers', 'create', 'suppliers.create', 'Create'),
  ('perm-suppliers-edit', 'suppliers', 'edit', 'suppliers.edit', 'Edit'),
  ('perm-suppliers-delete', 'suppliers', 'delete', 'suppliers.delete', 'Delete'),
  ('perm-customers-view', 'customers', 'view', 'customers.view', 'View'),
  ('perm-customers-create', 'customers', 'create', 'customers.create', 'Create'),
  ('perm-customers-edit', 'customers', 'edit', 'customers.edit', 'Edit'),
  ('perm-customers-delete', 'customers', 'delete', 'customers.delete', 'Delete'),
  ('perm-crm-dash', 'crm', 'dashboard', 'crm.dashboard', 'CRM Dashboard'),
  ('perm-crm-follow', 'crm', 'follow_ups', 'crm.follow_ups', 'CRM Follow-ups'),
  ('perm-crm-stmt', 'crm', 'statements', 'crm.statements', 'CRM Statements'),
  ('perm-ledger-view', 'ledger', 'view', 'ledger.view', 'View Ledger'),
  ('perm-ledger-post', 'ledger', 'post', 'ledger.post', 'Post Ledger'),
  ('perm-reports-dash', 'reports', 'dashboard', 'reports.dashboard', 'Dashboard'),
  ('perm-reports-inv', 'reports', 'inventory_reports', 'reports.inventory_reports', 'Inventory Reports'),
  ('perm-reports-pur', 'reports', 'purchase_reports', 'reports.purchase_reports', 'Purchase Reports'),
  ('perm-reports-fin', 'reports', 'financial_reports', 'reports.financial_reports', 'Financial Reports'),
  ('perm-reports-export', 'reports', 'export_reports', 'reports.export_reports', 'Export Reports'),
  ('perm-settings-company', 'settings', 'company_settings', 'settings.company_settings', 'Company Settings'),
  ('perm-settings-backup', 'settings', 'backup', 'settings.backup', 'Backup'),
  ('perm-settings-restore', 'settings', 'restore', 'settings.restore', 'Restore'),
  ('perm-settings-users', 'settings', 'user_management', 'settings.user_management', 'User Management'),
  ('perm-settings-roles', 'settings', 'role_management', 'settings.role_management', 'Role Management'),
  ('perm-approvals-view', 'approvals', 'view', 'approvals.view', 'View Approval Center'),
  ('perm-approvals-approve', 'approvals', 'approve', 'approvals.approve', 'Approve / Reject')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.role_permissions (role_id, permission_id, granted)
SELECT 'role-manager', id, true FROM public.permissions WHERE code != 'settings.role_management'
ON CONFLICT DO NOTHING;

INSERT INTO public.role_permissions (role_id, permission_id, granted) VALUES
  ('role-staff', 'perm-products-view', true),
  ('role-staff', 'perm-products-create', true),
  ('role-staff', 'perm-products-edit', true),
  ('role-staff', 'perm-inventory-view', true),
  ('role-staff', 'perm-inventory-adj', true),
  ('role-staff', 'perm-warehouse-view', true),
  ('role-staff', 'perm-warehouse-receive', true),
  ('role-staff', 'perm-warehouse-dispatch', true),
  ('role-staff', 'perm-purchases-view', true),
  ('role-staff', 'perm-suppliers-view', true),
  ('role-staff', 'perm-customers-view', true),
  ('role-staff', 'perm-crm-dash', true),
  ('role-staff', 'perm-crm-follow', true),
  ('role-staff', 'perm-ledger-view', true),
  ('role-staff', 'perm-reports-dash', true),
  ('role-staff', 'perm-reports-inv', true)
ON CONFLICT DO NOTHING;

INSERT INTO public.role_permissions (role_id, permission_id, granted)
SELECT 'role-viewer', id, true FROM public.permissions
WHERE action = 'view' OR code IN (
  'reports.dashboard', 'reports.inventory_reports', 'reports.purchase_reports', 'reports.financial_reports',
  'crm.dashboard', 'ledger.view'
)
ON CONFLICT DO NOTHING;

INSERT INTO public.user_roles (user_id, role_id, assigned_by)
VALUES ('dev-test-user', 'role-admin', 'dev-test-user')
ON CONFLICT (user_id) DO NOTHING;
