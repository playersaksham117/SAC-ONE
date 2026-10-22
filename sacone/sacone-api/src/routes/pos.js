import { Router } from 'express';
import { asyncHandler, sendSuccess } from '../core/http.js';
import { noStore, rateLimit } from '../core/rate-limit.js';
import { authenticate } from '../middleware/auth.js';
import { documentLinkService } from '../services/document-links.js';
import { customerService, supplierService } from '../services/parties.js';
import { posService, settingsService } from '../services/pos.js';
import { priceRealisationService } from '../services/price-realisation.js';
import { saleProfitService } from '../services/sale-profit.js';
import { customerInvoiceService } from '../services/customer-invoices.js';
import { supplierBillService } from '../services/supplier-bills.js';
import { partyStatementService } from '../services/party-statements.js';
import { warrantyService } from '../services/warranty.js';

export const customerRouter = Router();
customerRouter.use(authenticate());

customerRouter.get('/', asyncHandler(async (req, res) => {
  sendSuccess(res, customerService.list(req.query, req.actor));
}));

customerRouter.get('/lookup', asyncHandler(async (req, res) => {
  sendSuccess(res, customerService.lookup(req.query.q || req.query.search || '', req.actor, {
    limit: req.query.limit,
  }));
}));

customerRouter.get('/walk-in', asyncHandler(async (req, res) => {
  sendSuccess(res, customerService.getWalkIn(req.actor));
}));

customerRouter.get('/outstanding', asyncHandler(async (req, res) => {
  sendSuccess(res, partyStatementService.customerOutstanding(req.query, req.actor));
}));

customerRouter.post('/import', asyncHandler(async (req, res) => {
  sendSuccess(res, customerService.importCsv(req.body?.csv, req.actor, req));
}));

customerRouter.post('/', asyncHandler(async (req, res) => {
  sendSuccess(res, customerService.create(req.body, req.actor, req), 201);
}));

customerRouter.post('/:id/credit-approval', asyncHandler(async (req, res) => {
  sendSuccess(res, customerService.setCreditApproval(req.params.id, req.body || {}, req.actor, req));
}));

customerRouter.get('/:id/summary', asyncHandler(async (req, res) => {
  sendSuccess(res, customerService.getSummary(req.params.id, req.actor));
}));

customerRouter.get('/:id/sales', asyncHandler(async (req, res) => {
  sendSuccess(res, customerService.getSalesHistory(req.params.id, req.query, req.actor));
}));

customerRouter.get('/:id/invoices', asyncHandler(async (req, res) => {
  sendSuccess(res, customerService.getInvoiceHistory(req.params.id, req.query, req.actor));
}));

// Customer screen: invoices with balance left, payments with the invoice balance after each,
// and a plain history of what happened to the invoices (the ledger stays on /statement).
customerRouter.get('/:id/invoice-balances', asyncHandler(async (req, res) => {
  sendSuccess(res, customerInvoiceService.invoices(req.params.id, req.query, req.actor));
}));
customerRouter.get('/:id/payment-history', asyncHandler(async (req, res) => {
  sendSuccess(res, customerInvoiceService.payments(req.params.id, req.actor));
}));
customerRouter.get('/:id/invoice-history', asyncHandler(async (req, res) => {
  sendSuccess(res, customerInvoiceService.history(req.params.id, req.actor));
}));

customerRouter.get('/:id/payments', asyncHandler(async (req, res) => {
  sendSuccess(res, customerService.getPaymentHistory(req.params.id, req.query, req.actor));
}));

customerRouter.get('/:id/statement', asyncHandler(async (req, res) => {
  const statement = partyStatementService.customerStatement(req.params.id, req.query, req.actor);
  if (req.query.format === 'csv') {
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="customer-statement.csv"');
    return res.send(partyStatementService.statementCsv(statement));
  }
  sendSuccess(res, statement);
}));

customerRouter.get('/:id/outstanding', asyncHandler(async (req, res) => {
  sendSuccess(res, partyStatementService.customerOutstanding({
    ...req.query,
    customerId: req.params.id,
  }, req.actor));
}));

customerRouter.get('/:id', asyncHandler(async (req, res) => {
  sendSuccess(res, customerService.getById(req.params.id, req.actor));
}));

customerRouter.put('/:id', asyncHandler(async (req, res) => {
  sendSuccess(res, customerService.update(req.params.id, req.body, req.actor, req));
}));

export const supplierRouter = Router();
supplierRouter.use(authenticate());

supplierRouter.get('/', asyncHandler(async (req, res) => {
  sendSuccess(res, supplierService.list(req.query, req.actor));
}));

supplierRouter.get('/lookup', asyncHandler(async (req, res) => {
  sendSuccess(res, supplierService.lookup(req.query.q || req.query.search || '', req.actor, {
    limit: req.query.limit,
  }));
}));

supplierRouter.get('/outstanding', asyncHandler(async (req, res) => {
  sendSuccess(res, partyStatementService.supplierOutstanding(req.query, req.actor));
}));

supplierRouter.post('/import', asyncHandler(async (req, res) => {
  sendSuccess(res, supplierService.importCsv(req.body?.csv, req.actor, req));
}));

supplierRouter.post('/', asyncHandler(async (req, res) => {
  sendSuccess(res, supplierService.create(req.body, req.actor, req), 201);
}));

supplierRouter.get('/:id/summary', asyncHandler(async (req, res) => {
  sendSuccess(res, supplierService.getSummary(req.params.id, req.actor));
}));

supplierRouter.get('/:id/purchases', asyncHandler(async (req, res) => {
  sendSuccess(res, supplierService.getPurchaseHistory(req.params.id, req.query, req.actor));
}));

// Supplier screen: bills with balance left, payments with the bill balance after each, and a plain
// history of what happened to the bills (the ledger stays on /statement).
supplierRouter.get('/:id/bill-balances', asyncHandler(async (req, res) => {
  sendSuccess(res, supplierBillService.bills(req.params.id, req.query, req.actor));
}));
supplierRouter.get('/:id/payment-history', asyncHandler(async (req, res) => {
  sendSuccess(res, supplierBillService.payments(req.params.id, req.actor));
}));
supplierRouter.get('/:id/bill-history', asyncHandler(async (req, res) => {
  sendSuccess(res, supplierBillService.history(req.params.id, req.actor));
}));

supplierRouter.get('/:id/payments', asyncHandler(async (req, res) => {
  sendSuccess(res, supplierService.getPaymentHistory(req.params.id, req.query, req.actor));
}));

supplierRouter.get('/:id/statement', asyncHandler(async (req, res) => {
  const statement = partyStatementService.supplierStatement(req.params.id, req.query, req.actor);
  if (req.query.format === 'csv') {
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="supplier-statement.csv"');
    return res.send(partyStatementService.statementCsv(statement));
  }
  sendSuccess(res, statement);
}));

supplierRouter.get('/:id/outstanding', asyncHandler(async (req, res) => {
  sendSuccess(res, partyStatementService.supplierOutstanding({
    ...req.query,
    supplierId: req.params.id,
  }, req.actor));
}));

supplierRouter.post('/:id/bills', asyncHandler(async (req, res) => {
  sendSuccess(res, supplierService.createBill(req.params.id, req.body, req.actor, req), 201);
}));

supplierRouter.post('/:id/payments', asyncHandler(async (req, res) => {
  sendSuccess(res, supplierService.createPayment(req.params.id, req.body, req.actor, req), 201);
}));

supplierRouter.get('/:id', asyncHandler(async (req, res) => {
  sendSuccess(res, supplierService.getById(req.params.id, req.actor));
}));

supplierRouter.put('/:id', asyncHandler(async (req, res) => {
  sendSuccess(res, supplierService.update(req.params.id, req.body, req.actor, req));
}));

export const settingsRouter = Router();
settingsRouter.use(authenticate());

settingsRouter.get('/', asyncHandler(async (req, res) => {
  sendSuccess(res, settingsService.list(req.actor));
}));

settingsRouter.get('/labels', asyncHandler(async (req, res) => {
  sendSuccess(res, settingsService.getLabelSettings());
}));

settingsRouter.get('/invoice', asyncHandler(async (req, res) => {
  sendSuccess(res, settingsService.getInvoiceSettings());
}));

settingsRouter.put('/invoice/sign-stamp', asyncHandler(async (req, res) => {
  sendSuccess(res, settingsService.saveSignStamp(req.body || {}, req.actor, req));
}));

settingsRouter.put('/:key', asyncHandler(async (req, res) => {
  sendSuccess(res, settingsService.update(req.params.key, req.body?.value, req.actor, req));
}));

/** Warranty Check: an invoice number or a unit's serial number → warranty / guarantee status. */
export const warrantyRouter = Router();
warrantyRouter.use(authenticate());
warrantyRouter.get('/check', asyncHandler(async (req, res) => {
  sendSuccess(res, warrantyService.check(req.query.q, req.actor));
}));

export const posRouter = Router();
posRouter.use(authenticate());

posRouter.get('/bootstrap', asyncHandler(async (req, res) => {
  sendSuccess(res, posService.getBootstrap(req.actor));
}));

posRouter.get('/products', asyncHandler(async (req, res) => {
  sendSuccess(res, posService.searchProducts(req.query.q || req.query.search || '', req.actor));
}));

posRouter.post('/preview', asyncHandler(async (req, res) => {
  sendSuccess(res, posService.preview(req.body, req.actor));
}));

posRouter.post('/checkout', asyncHandler(async (req, res) => {
  sendSuccess(res, posService.checkout(req.body, req.actor, req), 201);
}));

// Every invoice line against the product's base selling price (what sold above it, and by how much).
posRouter.get('/reports/price-realisation', asyncHandler(async (req, res) => {
  sendSuccess(res, priceRealisationService.report(req.query, req.actor));
}));
posRouter.get('/reports/sale-profit', asyncHandler(async (req, res) => {
  sendSuccess(res, saleProfitService.report(req.query, req.actor));
}));

posRouter.get('/sales', asyncHandler(async (req, res) => {
  sendSuccess(res, posService.listSales(req.query, req.actor));
}));

const invoiceReadLimit = rateLimit({ name: 'invoice-read', windowMs: 60_000, max: 120 });
const shareLinkLimit = rateLimit({ name: 'invoice-share-link', windowMs: 60_000, max: 20 });

posRouter.get('/sales/:id', invoiceReadLimit, noStore, asyncHandler(async (req, res) => {
  sendSuccess(res, posService.getSale(req.params.id, req.actor));
}));

// Short-lived customer links to one invoice (see services/document-links.js).
posRouter.get('/sales/:id/share-link', shareLinkLimit, noStore, asyncHandler(async (req, res) => {
  sendSuccess(res, documentLinkService.status(req.params.id, req.actor));
}));
posRouter.post('/sales/:id/share-link', shareLinkLimit, noStore, asyncHandler(async (req, res) => {
  sendSuccess(res, documentLinkService.createSaleLink(req.params.id, req.actor, req), 201);
}));
posRouter.delete('/sales/:id/share-links', shareLinkLimit, noStore, asyncHandler(async (req, res) => {
  sendSuccess(res, documentLinkService.revokeSaleLinks(req.params.id, req.actor, req));
}));

// Owner only: edit or delete (void) an invoice; products go back to stock.
// Serial numbers of one invoice line, added or corrected later (Warranty Check).
posRouter.put('/sales/:id/items/:itemId/serials', asyncHandler(async (req, res) => {
  sendSuccess(res, warrantyService.setSerials(req.params.id, req.params.itemId, req.body?.serialNumbers, req.actor));
}));

posRouter.put('/sales/:id', asyncHandler(async (req, res) => {
  sendSuccess(res, posService.editSale(req.params.id, req.body || {}, req.actor, req));
}));
posRouter.delete('/sales/:id', asyncHandler(async (req, res) => {
  sendSuccess(res, posService.deleteSale(req.params.id, req.body || {}, req.actor, req));
}));

posRouter.post('/hold', asyncHandler(async (req, res) => {
  sendSuccess(res, posService.holdBill(req.body, req.actor, req), 201);
}));

posRouter.get('/held', asyncHandler(async (req, res) => {
  sendSuccess(res, posService.listHeldBills(req.query, req.actor));
}));

posRouter.post('/held/:id/resume', asyncHandler(async (req, res) => {
  sendSuccess(res, posService.resumeHeldBill(req.params.id, req.actor, req));
}));

posRouter.post('/held/:id/cancel', asyncHandler(async (req, res) => {
  sendSuccess(res, posService.cancelHeldBill(req.params.id, req.actor, req));
}));

posRouter.get('/returns', asyncHandler(async (req, res) => {
  sendSuccess(res, posService.listReturns(req.query, req.actor));
}));

posRouter.get('/returns/:id', asyncHandler(async (req, res) => {
  sendSuccess(res, posService.getReturn(req.params.id, req.actor));
}));

posRouter.post('/returns', asyncHandler(async (req, res) => {
  sendSuccess(res, posService.createReturn(req.body, req.actor, req), 201);
}));
