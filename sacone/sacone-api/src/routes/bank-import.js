import { Router } from 'express';
import { asyncHandler, sendSuccess } from '../core/http.js';
import { authenticate } from '../middleware/auth.js';
import { bankImportService } from '../services/bank-import.js';

export const bankImportRouter = Router();
bankImportRouter.use(authenticate());

bankImportRouter.post('/preview', asyncHandler(async (req, res) => {
  sendSuccess(res, bankImportService.preview(req.body, req.actor));
}));

bankImportRouter.post('/import', asyncHandler(async (req, res) => {
  sendSuccess(res, bankImportService.import(req.body, req.actor, req), 201);
}));

bankImportRouter.get('/batches', asyncHandler(async (req, res) => {
  sendSuccess(res, bankImportService.listBatches(req.query, req.actor));
}));

bankImportRouter.get('/mapping/:paymentAccountId', asyncHandler(async (req, res) => {
  sendSuccess(res, bankImportService.getSavedMapping(req.params.paymentAccountId, req.actor));
}));

bankImportRouter.put('/mapping/:paymentAccountId', asyncHandler(async (req, res) => {
  sendSuccess(res, bankImportService.saveMapping(
    req.params.paymentAccountId,
    req.body.mapping || req.body,
    req.body.skipRows,
    req.actor,
    req
  ));
}));

bankImportRouter.get('/accounts', asyncHandler(async (req, res) => {
  sendSuccess(res, bankImportService.listBankAccounts(req.actor));
}));

bankImportRouter.get('/dashboard', asyncHandler(async (req, res) => {
  sendSuccess(res, bankImportService.dashboard(req.query, req.actor));
}));

export const bankTransactionRouter = Router();
bankTransactionRouter.use(authenticate());

bankTransactionRouter.get('/', asyncHandler(async (req, res) => {
  sendSuccess(res, bankImportService.listTransactions(req.query, req.actor));
}));

bankTransactionRouter.get('/:id', asyncHandler(async (req, res) => {
  sendSuccess(res, bankImportService.getTransaction(req.params.id, req.actor));
}));

bankTransactionRouter.post('/:id/allocate', asyncHandler(async (req, res) => {
  sendSuccess(res, bankImportService.allocate(req.params.id, req.body, req.actor, req));
}));

bankTransactionRouter.post('/:id/allocate-customer', asyncHandler(async (req, res) => {
  sendSuccess(res, bankImportService.allocateCustomer(req.params.id, req.body, req.actor, req));
}));

bankTransactionRouter.post('/:id/allocate-supplier', asyncHandler(async (req, res) => {
  sendSuccess(res, bankImportService.allocateSupplier(req.params.id, req.body, req.actor, req));
}));

bankTransactionRouter.post('/:id/mark-other-income', asyncHandler(async (req, res) => {
  sendSuccess(res, bankImportService.markOtherIncome(req.params.id, req.body, req.actor, req));
}));

bankTransactionRouter.post('/:id/mark-other-expense', asyncHandler(async (req, res) => {
  sendSuccess(res, bankImportService.markOtherExpense(req.params.id, req.body, req.actor, req));
}));

bankTransactionRouter.post('/:id/bank-transfer', asyncHandler(async (req, res) => {
  sendSuccess(res, bankImportService.bankTransfer(req.params.id, req.body, req.actor, req));
}));

bankTransactionRouter.post('/:id/ignore', asyncHandler(async (req, res) => {
  sendSuccess(res, bankImportService.ignore(req.params.id, req.body, req.actor, req));
}));

bankTransactionRouter.post('/:id/link-existing-voucher', asyncHandler(async (req, res) => {
  sendSuccess(res, bankImportService.linkExistingVoucher(req.params.id, req.body, req.actor, req));
}));
