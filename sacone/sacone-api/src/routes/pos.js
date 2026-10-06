import { Router } from 'express';
import { asyncHandler, sendSuccess } from '../core/http.js';
import { authenticate } from '../middleware/auth.js';
import { customerService, supplierService } from '../services/parties.js';
import { posService, settingsService } from '../services/pos.js';
import { partyStatementService } from '../services/party-statements.js';

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

customerRouter.post('/', asyncHandler(async (req, res) => {
  sendSuccess(res, customerService.create(req.body, req.actor, req), 201);
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

supplierRouter.post('/', asyncHandler(async (req, res) => {
  sendSuccess(res, supplierService.create(req.body, req.actor, req), 201);
}));

supplierRouter.get('/:id/summary', asyncHandler(async (req, res) => {
  sendSuccess(res, supplierService.getSummary(req.params.id, req.actor));
}));

supplierRouter.get('/:id/purchases', asyncHandler(async (req, res) => {
  sendSuccess(res, supplierService.getPurchaseHistory(req.params.id, req.query, req.actor));
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

settingsRouter.get('/invoice', asyncHandler(async (req, res) => {
  sendSuccess(res, settingsService.getInvoiceSettings());
}));

settingsRouter.put('/:key', asyncHandler(async (req, res) => {
  sendSuccess(res, settingsService.update(req.params.key, req.body?.value, req.actor, req));
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

posRouter.get('/sales', asyncHandler(async (req, res) => {
  sendSuccess(res, posService.listSales(req.query, req.actor));
}));

posRouter.get('/sales/:id', asyncHandler(async (req, res) => {
  sendSuccess(res, posService.getSale(req.params.id, req.actor));
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
