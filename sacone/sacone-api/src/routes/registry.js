/**
 * Single source of truth for every API mount point.
 * Add a module here — app.js wires it up; nothing else needs editing.
 */
import authRouter, { companyRouter, userRouter, roleRouter, auditRouter, firmRouter } from './index.js';
import { categoryRouter, brandRouter, unitRouter, productRouter } from './products.js';
import { inventoryRouter } from './inventory.js';
import { warehouseRouter } from './warehouse.js';
import { posRouter, customerRouter, settingsRouter, supplierRouter } from './pos.js';
import { ceoDashboardRouter } from './ceo-dashboard.js';
import { webstorePublicRouter, webstoreAdminRouter } from './webstore.js';
import { exportRouter } from './export.js';
import { migrationRouter } from './migration.js';
import { financeRouter } from './finance.js';
import { quotationRouter, documentNumberingRouter } from './quotations.js';
import { purchaseRouter } from './purchases.js';
import { customerReceiptRouter, supplierPaymentVoucherRouter, cashBookRouter } from './party-payments.js';
import { bankImportRouter, bankTransactionRouter } from './bank-import.js';
import { approvalRouter } from './approvals.js';
import { salesAgentRouter, commissionRouter, commissionPaymentRouter } from './commissions.js';
import { posSyncRouter, posDeviceAdminRouter } from './pos-sync.js';
import { eventsRouter } from './events.js';
import { openingBalanceRouter } from './opening-balances.js';
import { sharedDocumentRouter } from './shared-documents.js';

export const ROUTES = [
  // Core & security
  ['/api/auth', authRouter],
  ['/api/company', companyRouter],
  ['/api/users', userRouter],
  ['/api/roles', roleRouter],
  ['/api/firms', firmRouter],
  ['/api/audit-logs', auditRouter],
  ['/api/settings', settingsRouter],
  ['/api/approvals', approvalRouter],
  ['/api/document-numbering', documentNumberingRouter],
  ['/api/events', eventsRouter],

  // Catalogue & stock
  ['/api/categories', categoryRouter],
  ['/api/brands', brandRouter],
  ['/api/units', unitRouter],
  ['/api/products', productRouter],
  ['/api/inventory', inventoryRouter],
  ['/api/opening-balances', openingBalanceRouter],
  ['/api/warehouses', warehouseRouter],

  // Sales & POS (quotations must mount before /api/pos)
  ['/api/pos/quotations', quotationRouter],
  ['/api/pos', posRouter],
  ['/api/pos-devices', posDeviceAdminRouter],
  ['/api/sales-agents', salesAgentRouter],
  ['/api/commissions', commissionRouter],
  ['/api/commission-payments', commissionPaymentRouter],

  // Parties & purchasing
  ['/api/customers', customerRouter],
  ['/api/suppliers', supplierRouter],
  ['/api/purchases', purchaseRouter],
  ['/api/customer-receipts', customerReceiptRouter],
  ['/api/supplier-payment-vouchers', supplierPaymentVoucherRouter],

  // Finance, analytics
  ['/api/finance', financeRouter],
  ['/api/cash-book', cashBookRouter],
  ['/api/bank-import', bankImportRouter],
  ['/api/bank-transactions', bankTransactionRouter],
  ['/api/ceo-dashboard', ceoDashboardRouter],

  // Data platform
  ['/api/exports', exportRouter],
  ['/api/migration', migrationRouter],

  // External integrations (API-key / device-key auth)
  ['/api/webstore/v1', webstorePublicRouter],
  ['/api/webstore/admin', webstoreAdminRouter],
  ['/api/v1/sync', posSyncRouter],

  // Public, token-gated: customers opening a shared invoice link
  ['/api/shared-documents', sharedDocumentRouter],
];
