/**
 * MongoDB collection catalog for SACONE Atlas preparation.
 * Live ERP remains SQLite (DATABASE_DRIVER=sqlite) until dual-read cutover.
 * These definitions drive index creation / seed on Mongo development clusters.
 */

export const SACONE_COLLECTIONS = [
  { name: 'users', indexes: [
    { key: { email: 1 }, unique: true, name: 'uniq_email' },
    { key: { roleId: 1 }, name: 'idx_role' },
    { key: { isActive: 1 }, name: 'idx_active' },
  ]},
  { name: 'roles', indexes: [
    { key: { slug: 1 }, unique: true, name: 'uniq_slug' },
  ]},
  { name: 'permissions', indexes: [
    { key: { permissionKey: 1 }, unique: true, name: 'uniq_key' },
    { key: { moduleCode: 1, featureCode: 1 }, name: 'idx_module_feature' },
  ]},
  { name: 'firms', indexes: [{ key: { code: 1 }, unique: true, sparse: true, name: 'uniq_code' }] },
  { name: 'branches', indexes: [{ key: { firmId: 1, code: 1 }, name: 'idx_firm_code' }] },
  { name: 'products', indexes: [
    { key: { sku: 1 }, unique: true, name: 'uniq_sku' },
    { key: { barcode: 1 }, unique: true, sparse: true, name: 'uniq_barcode' },
    { key: { name: 1 }, name: 'idx_name' },
    { key: { brandId: 1 }, name: 'idx_brand' },
    { key: { categoryId: 1 }, name: 'idx_category' },
  ]},
  { name: 'categories', indexes: [{ key: { name: 1 }, name: 'idx_name' }] },
  { name: 'brands', indexes: [{ key: { name: 1 }, name: 'idx_name' }] },
  { name: 'customers', indexes: [
    { key: { code: 1 }, unique: true, sparse: true, name: 'uniq_code' },
    { key: { phone: 1 }, name: 'idx_phone' },
    { key: { gstin: 1 }, name: 'idx_gstin' },
  ]},
  { name: 'suppliers', indexes: [
    { key: { code: 1 }, unique: true, sparse: true, name: 'uniq_code' },
    { key: { gstin: 1 }, name: 'idx_gstin' },
  ]},
  { name: 'warehouses', indexes: [{ key: { code: 1 }, unique: true, sparse: true, name: 'uniq_code' }] },
  { name: 'warehouse_locations', indexes: [{ key: { warehouseId: 1, code: 1 }, name: 'idx_wh_code' }] },
  { name: 'inventory', indexes: [
    { key: { productId: 1, warehouseId: 1 }, unique: true, name: 'uniq_product_wh' },
    { key: { warehouseId: 1 }, name: 'idx_warehouse' },
  ]},
  { name: 'inventory_movements', indexes: [
    { key: { productId: 1, createdAt: -1 }, name: 'idx_product_date' },
    { key: { warehouseId: 1, createdAt: -1 }, name: 'idx_wh_date' },
    { key: { movementType: 1 }, name: 'idx_type' },
  ]},
  { name: 'sales', indexes: [
    { key: { invoiceNumber: 1 }, unique: true, sparse: true, name: 'uniq_invoice' },
    { key: { saleDate: -1 }, name: 'idx_date' },
    { key: { customerId: 1 }, name: 'idx_customer' },
  ]},
  { name: 'sale_items', indexes: [{ key: { saleId: 1 }, name: 'idx_sale' }] },
  { name: 'quotations', indexes: [{ key: { quotationNumber: 1 }, unique: true, sparse: true, name: 'uniq_number' }] },
  { name: 'purchases', indexes: [{ key: { purchaseDate: -1 }, name: 'idx_date' }] },
  { name: 'purchase_orders', indexes: [
    { key: { orderNumber: 1 }, unique: true, sparse: true, name: 'uniq_number' },
    { key: { supplierId: 1 }, name: 'idx_supplier' },
  ]},
  { name: 'purchase_bills', indexes: [
    { key: { billNumber: 1 }, unique: true, sparse: true, name: 'uniq_number' },
    { key: { supplierId: 1 }, name: 'idx_supplier' },
    { key: { billDate: -1 }, name: 'idx_date' },
  ]},
  { name: 'purchase_returns', indexes: [{ key: { returnNumber: 1 }, unique: true, sparse: true, name: 'uniq_number' }] },
  { name: 'customer_ledger', indexes: [
    { key: { customerId: 1, entryDate: -1 }, name: 'idx_customer_date' },
  ]},
  { name: 'supplier_ledger', indexes: [
    { key: { supplierId: 1, entryDate: -1 }, name: 'idx_supplier_date' },
  ]},
  { name: 'financial_transactions', indexes: [
    { key: { transactionDate: -1 }, name: 'idx_date' },
    { key: { status: 1 }, name: 'idx_status' },
    { key: { transactionType: 1 }, name: 'idx_type' },
  ]},
  { name: 'employees', indexes: [{ key: { employeeCode: 1 }, unique: true, sparse: true, name: 'uniq_code' }] },
  { name: 'attendance', indexes: [{ key: { employeeId: 1, attendanceDate: 1 }, name: 'idx_emp_date' }] },
  { name: 'payroll', indexes: [{ key: { periodStart: 1, status: 1 }, name: 'idx_period_status' }] },
  { name: 'employee_advances', indexes: [{ key: { employeeId: 1 }, name: 'idx_employee' }] },
  { name: 'approval_rules', indexes: [
    { key: { module: 1, action: 1, isActive: 1 }, name: 'idx_module_action' },
  ]},
  { name: 'approval_requests', indexes: [
    { key: { status: 1 }, name: 'idx_status' },
    { key: { transactionId: 1 }, name: 'idx_txn' },
    { key: { level1RoleSlug: 1, status: 1 }, name: 'idx_l1' },
  ]},
  { name: 'audit_logs', indexes: [
    { key: { createdAt: -1 }, name: 'idx_time' },
    { key: { userId: 1, createdAt: -1 }, name: 'idx_user_time' },
    { key: { module: 1, recordId: 1 }, name: 'idx_module_record' },
  ]},
  { name: 'settings', indexes: [{ key: { key: 1 }, unique: true, name: 'uniq_key' }] },
  { name: 'bank_transactions', indexes: [
    { key: { paymentAccountId: 1, fingerprint: 1 }, unique: true, name: 'uniq_fp' },
    { key: { reconciliationStatus: 1 }, name: 'idx_status' },
  ]},
  { name: 'customer_receipts', indexes: [{ key: { voucherNumber: 1 }, unique: true, sparse: true, name: 'uniq_voucher' }] },
  { name: 'supplier_payment_vouchers', indexes: [{ key: { voucherNumber: 1 }, unique: true, sparse: true, name: 'uniq_voucher' }] },
];

export const SYSTEM_META_COLLECTION = '_sacone_meta';
