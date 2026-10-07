import { withFinancialYear } from '../database/context.js';
import { Router } from 'express';
import { asyncHandler, sendSuccess } from '../core/http.js';
import { authenticate } from '../middleware/auth.js';
import { customerReceiptService } from '../services/customer-receipts.js';
import { supplierPaymentVoucherService } from '../services/supplier-payment-vouchers.js';
import { partyStatementService } from '../services/party-statements.js';
import { repos } from '../repositories/index.js';
import { authService } from '../services/index.js';

export const customerReceiptRouter = Router();
customerReceiptRouter.use(authenticate());

customerReceiptRouter.get('/', asyncHandler(async (req, res) => {
  sendSuccess(res, customerReceiptService.list(req.query, req.actor));
}));

customerReceiptRouter.post('/preview-allocate', asyncHandler(async (req, res) => {
  sendSuccess(res, customerReceiptService.previewAllocate(req.body, req.actor));
}));

customerReceiptRouter.get('/open-invoices/:customerId', asyncHandler(async (req, res) => {
  sendSuccess(res, customerReceiptService.openInvoices(req.params.customerId, req.actor));
}));

customerReceiptRouter.post('/', asyncHandler(async (req, res) => {
  sendSuccess(res, customerReceiptService.create(req.body, req.actor, req), 201);
}));

customerReceiptRouter.get('/:id', asyncHandler(async (req, res) => {
  sendSuccess(res, customerReceiptService.getById(req.params.id, req.actor));
}));

customerReceiptRouter.put('/:id', asyncHandler(async (req, res) => {
  sendSuccess(res, customerReceiptService.update(req.params.id, req.body, req.actor, req));
}));

customerReceiptRouter.post('/:id/post', asyncHandler(async (req, res) => {
  sendSuccess(res, customerReceiptService.post(req.params.id, req.actor, req));
}));

customerReceiptRouter.post('/:id/cancel', asyncHandler(async (req, res) => {
  sendSuccess(res, customerReceiptService.cancel(req.params.id, req.body, req.actor, req));
}));

export const supplierPaymentVoucherRouter = Router();
supplierPaymentVoucherRouter.use(authenticate());

supplierPaymentVoucherRouter.get('/', asyncHandler(async (req, res) => {
  sendSuccess(res, supplierPaymentVoucherService.list(req.query, req.actor));
}));

supplierPaymentVoucherRouter.post('/preview-allocate', asyncHandler(async (req, res) => {
  sendSuccess(res, supplierPaymentVoucherService.previewAllocate(req.body, req.actor));
}));

supplierPaymentVoucherRouter.get('/open-bills/:supplierId', asyncHandler(async (req, res) => {
  sendSuccess(res, supplierPaymentVoucherService.openBills(req.params.supplierId, req.actor));
}));

supplierPaymentVoucherRouter.post('/', asyncHandler(async (req, res) => {
  sendSuccess(res, supplierPaymentVoucherService.create(req.body, req.actor, req), 201);
}));

supplierPaymentVoucherRouter.get('/:id', asyncHandler(async (req, res) => {
  sendSuccess(res, supplierPaymentVoucherService.getById(req.params.id, req.actor));
}));

supplierPaymentVoucherRouter.put('/:id', asyncHandler(async (req, res) => {
  sendSuccess(res, supplierPaymentVoucherService.update(req.params.id, req.body, req.actor, req));
}));

supplierPaymentVoucherRouter.post('/:id/post', asyncHandler(async (req, res) => {
  sendSuccess(res, supplierPaymentVoucherService.post(req.params.id, req.actor, req));
}));

supplierPaymentVoucherRouter.post('/:id/cancel', asyncHandler(async (req, res) => {
  sendSuccess(res, supplierPaymentVoucherService.cancel(req.params.id, req.body, req.actor, req));
}));

export const cashBookRouter = Router();
cashBookRouter.use(authenticate());

cashBookRouter.get('/', asyncHandler(async (req, res) => {
  authService.checkPermission(req.actor.permissions, 'finance.ledger.view');
  const q = withFinancialYear(req.query);
  sendSuccess(res, repos.cashBook.list({
    accountType: req.query.accountType,
    paymentAccountId: req.query.paymentAccountId,
    dateFrom: q.dateFrom,
    dateTo: q.dateTo,
    direction: req.query.direction,
    firmId: req.query.firmId,
    limit: req.query.limit ? parseInt(req.query.limit, 10) : 200,
    offset: req.query.offset ? parseInt(req.query.offset, 10) : 0,
  }));
}));

cashBookRouter.get('/summary', asyncHandler(async (req, res) => {
  authService.checkPermission(req.actor.permissions, 'finance.ledger.view');
  const q = withFinancialYear(req.query);
  sendSuccess(res, repos.cashBook.summaryByAccountType({
    dateFrom: q.dateFrom,
    dateTo: q.dateTo,
  }));
}));

export function attachPartyStatementRoutes(customerRouter, supplierRouter) {
  customerRouter.get('/outstanding', asyncHandler(async (req, res) => {
    sendSuccess(res, partyStatementService.customerOutstanding(req.query, req.actor));
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

  supplierRouter.get('/outstanding', asyncHandler(async (req, res) => {
    sendSuccess(res, partyStatementService.supplierOutstanding(req.query, req.actor));
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
}
