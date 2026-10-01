import { config } from '../config/index.js';
import { AppError } from '../core/http.js';
import { REPOSITORY_CONTRACTS, listMigrationReadyModules } from './contracts.js';

import {
  UserRepository,
  SessionRepository,
  CompanyRepository,
  RoleRepository,
  AuditLogRepository,
} from './sqlite/index.js';
import {
  CategoryRepository,
  BrandRepository,
  UnitRepository,
  ProductRepository,
} from './sqlite/products.js';
import {
  StockLevelRepository,
  InventoryMovementRepository,
} from './sqlite/inventory.js';
import {
  WarehouseRepository,
  WarehouseLocationRepository,
  LocationStockRepository,
  WarehouseTransferRepository,
  StockCountRepository,
} from './sqlite/warehouse.js';
import {
  CustomerRepository,
  SupplierRepository,
  SupplierBillRepository,
  SupplierPaymentRepository,
} from './sqlite/parties.js';
import {
  SystemSettingsRepository,
  PosSaleRepository,
  PosHeldBillRepository,
  PosReturnRepository,
} from './sqlite/pos.js';
import {
  ApiKeyRepository,
  ApiRequestLogRepository,
  WebOrderProvisionRepository,
} from './sqlite/webstore.js';
import { CeoDashboardRepository } from './sqlite/ceo-dashboard.js';
import { ExportDataRepository, ExportLogRepository } from './sqlite/export.js';
import { MigrationLogRepository } from './sqlite/migration.js';
import {
  FinanceCategoryRepository,
  FinancePaymentAccountRepository,
  FinanceTransactionRepository,
  FinanceSettingsRepository,
} from './sqlite/finance.js';
import {
  DocumentNumberingRepository,
  DocumentShareLogRepository,
  EmailSendLogRepository,
} from './sqlite/document-numbering.js';
import { QuotationRepository } from './sqlite/quotations.js';
import { PurchaseRepository } from './sqlite/purchases.js';
import {
  CustomerReceiptRepository,
  SupplierPaymentVoucherRepository,
  CashBookRepository,
} from './sqlite/party-payments.js';
import { BankImportRepository } from './sqlite/bank-import.js';
import { ApprovalRepository } from './sqlite/approvals.js';
import {
  SalesAgentRepository,
  CommissionPlanRepository,
  SaleCommissionRepository,
  CommissionPaymentRepository,
} from './sqlite/commissions.js';
import {
  PosDeviceRepository,
  PosUserRepository,
  PosSyncInboxRepository,
  PosCatalogRepository,
} from './sqlite/pos-sync.js';

/**
 * Build the active repository bag for the configured driver.
 * Default: sqlite — production continues on SQLite unchanged.
 */
export function createSqliteRepositories() {
  return {
    driver: 'sqlite',
    company: new CompanyRepository(),
    users: new UserRepository(),
    sessions: new SessionRepository(),
    roles: new RoleRepository(),
    auditLogs: new AuditLogRepository(),
    categories: new CategoryRepository(),
    brands: new BrandRepository(),
    units: new UnitRepository(),
    products: new ProductRepository(),
    warehouses: new WarehouseRepository(),
    warehouseLocations: new WarehouseLocationRepository(),
    stockLevels: new StockLevelRepository(),
    locationStock: new LocationStockRepository(),
    inventoryMovements: new InventoryMovementRepository(),
    customers: new CustomerRepository(),
    suppliers: new SupplierRepository(),
    supplierBills: new SupplierBillRepository(),
    supplierPayments: new SupplierPaymentRepository(),
    customerReceipts: new CustomerReceiptRepository(),
    supplierPaymentVouchers: new SupplierPaymentVoucherRepository(),
    cashBook: new CashBookRepository(),
    bankImport: new BankImportRepository(),
    approvals: new ApprovalRepository(),
    salesAgents: new SalesAgentRepository(),
    commissionPlans: new CommissionPlanRepository(),
    saleCommissions: new SaleCommissionRepository(),
    commissionPayments: new CommissionPaymentRepository(),
    posSales: new PosSaleRepository(),
    posHeldBills: new PosHeldBillRepository(),
    posReturns: new PosReturnRepository(),
    systemSettings: new SystemSettingsRepository(),
    apiKeys: new ApiKeyRepository(),
    apiRequestLogs: new ApiRequestLogRepository(),
    webOrderProvisions: new WebOrderProvisionRepository(),
    warehouseTransfers: new WarehouseTransferRepository(),
    stockCounts: new StockCountRepository(),
    ceoDashboard: new CeoDashboardRepository(),
    exportData: new ExportDataRepository(),
    exportLogs: new ExportLogRepository(),
    migrationLogs: new MigrationLogRepository(),
    financeCategories: new FinanceCategoryRepository(),
    financeAccounts: new FinancePaymentAccountRepository(),
    financeTransactions: new FinanceTransactionRepository(),
    financeSettings: new FinanceSettingsRepository(),
    documentNumbering: new DocumentNumberingRepository(),
    documentShareLog: new DocumentShareLogRepository(),
    emailSendLog: new EmailSendLogRepository(),
    quotations: new QuotationRepository(),
    purchases: new PurchaseRepository(),
    posDevices: new PosDeviceRepository(),
    posUsers: new PosUserRepository(),
    posSyncInbox: new PosSyncInboxRepository(),
    posCatalog: new PosCatalogRepository(),
  };
}

export function createMongoRepositories() {
  throw new AppError(
    'MongoDB runtime repositories are not enabled. JSON→Mongo import works via /api/migration/import. Keep DATABASE_DRIVER=sqlite for the live ERP.',
    501,
    'MONGODB_NOT_ENABLED'
  );
}

export function createRepositories(driver = config.databaseDriver || 'sqlite') {
  if (driver === 'sqlite') return createSqliteRepositories();
  if (driver === 'mongodb') return createMongoRepositories();
  throw new AppError(`Unknown database driver: ${driver}`, 500, 'INVALID_DB_DRIVER');
}

/** Process-wide repository container (SQLite by default). */
export const repos = createRepositories();

export { REPOSITORY_CONTRACTS, listMigrationReadyModules };
