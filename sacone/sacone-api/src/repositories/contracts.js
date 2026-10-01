/**
 * Repository contracts (Phase 11).
 *
 * Services depend on these shapes — not on SQLite or MongoDB APIs.
 * SQLite implementations live in ../sqlite/
 * Future MongoDB implementations will live in ../mongodb/
 *
 * Method lists are the migration-ready surface area for each module.
 */

export const REPOSITORY_CONTRACTS = {
  company: {
    module: 'core',
    migrationReady: true,
    methods: ['get', 'upsert'],
  },
  users: {
    module: 'core',
    migrationReady: true,
    methods: ['findAll', 'findById', 'findByEmailWithPassword', 'emailExists', 'create', 'update', 'updateLastLogin'],
    notes: 'password_hash remains application-hashed; never store plaintext',
  },
  sessions: {
    module: 'core',
    migrationReady: true,
    methods: ['create', 'findByToken', 'deleteByToken', 'deleteByUserId', 'purgeExpired'],
  },
  roles: {
    module: 'core',
    migrationReady: true,
    methods: ['findAll', 'findById', 'slugExists', 'create', 'update', 'delete', 'getPermissions', 'setPermissions', 'getPermissionTree'],
  },
  auditLogs: {
    module: 'core',
    migrationReady: true,
    methods: ['create', 'findAll'],
  },
  categories: {
    module: 'products',
    migrationReady: true,
    methods: ['findAll', 'findById', 'findByName', 'nameExists', 'create', 'update'],
  },
  brands: {
    module: 'products',
    migrationReady: true,
    methods: ['findAll', 'findById', 'findByName', 'nameExists', 'create', 'update'],
  },
  units: {
    module: 'products',
    migrationReady: true,
    methods: ['findAll', 'findById', 'findByName', 'nameExists', 'create', 'update'],
  },
  products: {
    module: 'products',
    migrationReady: true,
    methods: ['findAll', 'findById', 'findBySku', 'findByBarcode', 'skuExists', 'create', 'update'],
  },
  warehouses: {
    module: 'warehouse',
    migrationReady: true,
    methods: ['findAll', 'findById', 'findDefault', 'codeExists', 'create', 'update', 'getSummary'],
  },
  warehouseLocations: {
    module: 'warehouse',
    migrationReady: true,
    methods: ['findAll', 'findById', 'findDefault', 'findByQrPayload', 'create', 'update', 'getHierarchy'],
  },
  stockLevels: {
    module: 'inventory',
    migrationReady: true,
    methods: ['ensureRow', 'applyDelta', 'listProductStock', 'recomputeFromMovements'],
    notes: 'Derived cache — rebuildable from inventory_movements',
  },
  locationStock: {
    module: 'inventory',
    migrationReady: true,
    methods: ['findByProductLocation', 'applyDelta', 'list'],
  },
  inventoryMovements: {
    module: 'inventory',
    migrationReady: true,
    methods: ['create', 'findById', 'findAll', 'updateStatus'],
    notes: 'Source of truth for stock; migrate before stock_levels',
  },
  customers: {
    module: 'parties',
    migrationReady: true,
    methods: ['findAll', 'lookup', 'findById', 'findWalkIn', 'codeExists', 'nextCode', 'create', 'update', 'adjustOutstanding', 'getSummary', 'listSales', 'listPayments', 'buildStatement'],
  },
  suppliers: {
    module: 'parties',
    migrationReady: true,
    methods: ['findAll', 'lookup', 'findById', 'codeExists', 'nextCode', 'create', 'update', 'adjustPayable', 'getSummary'],
  },
  supplierBills: {
    module: 'parties',
    migrationReady: true,
    methods: ['nextBillNumber', 'findById', 'listBySupplier', 'create', 'applyPayment'],
  },
  supplierPayments: {
    module: 'parties',
    migrationReady: true,
    methods: ['listBySupplier', 'create', 'buildStatement'],
  },
  posSales: {
    module: 'pos',
    migrationReady: true,
    methods: ['nextInvoiceNumber', 'findById', 'findByInvoiceNumber', 'findAll', 'create', 'updateItemMovement', 'updateStatus', 'addReturnedQuantity', 'listItems', 'listPayments'],
  },
  posHeldBills: {
    module: 'pos',
    migrationReady: true,
    methods: ['nextHoldNumber', 'findById', 'findHeld', 'create', 'markResumed', 'cancel'],
  },
  posReturns: {
    module: 'pos',
    migrationReady: true,
    methods: ['nextReturnNumber', 'findById', 'findAll', 'create', 'updateItemMovement'],
  },
  systemSettings: {
    module: 'core',
    migrationReady: true,
    methods: ['get', 'getAll', 'getBoolean', 'upsert'],
  },
  apiKeys: {
    module: 'webstore',
    migrationReady: true,
    methods: ['findById', 'findByHash', 'list', 'create', 'touchLastUsed', 'revoke'],
    notes: 'Export/migrate key_hash only — never raw secrets',
  },
  apiRequestLogs: {
    module: 'webstore',
    migrationReady: true,
    methods: ['create', 'list'],
  },
  webOrderProvisions: {
    module: 'webstore',
    migrationReady: true,
    methods: ['nextNumber', 'create', 'findById'],
  },
  warehouseTransfers: {
    module: 'warehouse',
    migrationReady: true,
    methods: ['nextNumber', 'findById', 'findAll', 'create', 'updateStatus'],
  },
  stockCounts: {
    module: 'warehouse',
    migrationReady: true,
    methods: ['nextNumber', 'findById', 'findAll', 'create', 'updateItem', 'updateStatus', 'setItemAdjustment'],
  },
  ceoDashboard: {
    module: 'reports',
    migrationReady: false,
    methods: [
      'salesTotals', 'purchasesTotals', 'estimatedGrossProfit', 'cashCollections', 'cashFlowSummary',
      'upiFlowSummary', 'inventoryValue', 'inventoryHealthCounts', 'receivablesAging', 'payablesAging',
      'profitabilityByInvoice', 'salesPurchaseTrend', 'alerts', 'getCeoSettings',
    ],
    notes: 'Read-model / aggregations — reimplement as Mongo aggregation pipelines; not a 1:1 document migrate',
  },
  exportData: {
    module: 'core',
    migrationReady: false,
    methods: ['fetchProducts', 'fetchCustomers', 'fetchSuppliers', 'fetchWarehouses', 'fetchInventoryMovements', 'fetchSales', 'fetchSalesItems', 'fetchPayments', 'fetchUsers', 'getCompanyId'],
    notes: 'Export extractors stay SQLite/source-specific until dual-read is designed',
  },
  exportLogs: {
    module: 'core',
    migrationReady: true,
    methods: ['nextNumber', 'create', 'findById', 'list'],
  },
  migrationLogs: {
    module: 'core',
    migrationReady: true,
    methods: ['create', 'updateStatus', 'findById', 'findByBatchId', 'list'],
  },
  financeCategories: {
    module: 'finance',
    migrationReady: true,
    methods: ['findAll', 'findById', 'codeExists', 'create', 'update'],
  },
  financeAccounts: {
    module: 'finance',
    migrationReady: true,
    methods: ['findAll', 'findById', 'codeExists', 'create', 'update'],
  },
  financeTransactions: {
    module: 'finance',
    migrationReady: true,
    methods: [
      'nextNumber', 'findById', 'findAll', 'create', 'updateDraft', 'updateStatus',
      'postedTotals', 'postedFlowByMode', 'summaryByCategory', 'summaryByPaymentMode',
      'expenseTrend', 'accountBalances', 'pendingApprovalCount',
    ],
    notes: 'Manual income/expense only — excludes POS, sales, purchase, and party payments',
  },
  financeSettings: {
    module: 'finance',
    migrationReady: true,
    methods: ['getApprovalSettings'],
  },
};

export function listMigrationReadyModules() {
  const byModule = {};
  for (const [key, def] of Object.entries(REPOSITORY_CONTRACTS)) {
    if (!byModule[def.module]) {
      byModule[def.module] = { module: def.module, repositories: [], ready: true };
    }
    byModule[def.module].repositories.push({
      key,
      migrationReady: def.migrationReady,
      notes: def.notes || null,
    });
    if (!def.migrationReady) byModule[def.module].ready = false;
  }
  return Object.values(byModule);
}
