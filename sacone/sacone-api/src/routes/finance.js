import { Router } from 'express';
import { asyncHandler, sendSuccess } from '../core/http.js';
import { authenticate } from '../middleware/auth.js';
import { financeService } from '../services/finance.js';

export const financeRouter = Router();
financeRouter.use(authenticate());

financeRouter.get('/bootstrap', asyncHandler(async (req, res) => {
  sendSuccess(res, financeService.getBootstrap(req.actor));
}));

financeRouter.get('/reports', asyncHandler(async (req, res) => {
  sendSuccess(res, financeService.getReports(req.query, req.actor));
}));

// Categories
financeRouter.get('/categories', asyncHandler(async (req, res) => {
  sendSuccess(res, financeService.listCategories(req.query, req.actor));
}));

financeRouter.post('/categories', asyncHandler(async (req, res) => {
  sendSuccess(res, financeService.createCategory(req.body, req.actor, req), 201);
}));

financeRouter.put('/categories/:id', asyncHandler(async (req, res) => {
  sendSuccess(res, financeService.updateCategory(req.params.id, req.body, req.actor, req));
}));

// Payment accounts
financeRouter.get('/accounts', asyncHandler(async (req, res) => {
  sendSuccess(res, financeService.listAccounts(req.query, req.actor));
}));

financeRouter.post('/accounts', asyncHandler(async (req, res) => {
  sendSuccess(res, financeService.createAccount(req.body, req.actor, req), 201);
}));

financeRouter.put('/accounts/:id', asyncHandler(async (req, res) => {
  sendSuccess(res, financeService.updateAccount(req.params.id, req.body, req.actor, req));
}));

// Transactions
financeRouter.get('/transactions', asyncHandler(async (req, res) => {
  sendSuccess(res, financeService.listTransactions(req.query, req.actor));
}));

financeRouter.get('/transactions/:id', asyncHandler(async (req, res) => {
  sendSuccess(res, financeService.getTransaction(req.params.id, req.actor));
}));

financeRouter.post('/transactions', asyncHandler(async (req, res) => {
  sendSuccess(res, financeService.createTransaction(req.body, req.actor, req), 201);
}));

financeRouter.put('/transactions/:id', asyncHandler(async (req, res) => {
  sendSuccess(res, financeService.updateTransaction(req.params.id, req.body, req.actor, req));
}));

financeRouter.post('/transactions/:id/submit', asyncHandler(async (req, res) => {
  sendSuccess(res, financeService.submitTransaction(req.params.id, req.actor, req));
}));

financeRouter.post('/transactions/:id/approve', asyncHandler(async (req, res) => {
  sendSuccess(res, financeService.approveTransaction(req.params.id, req.actor, req));
}));

financeRouter.post('/transactions/:id/reject', asyncHandler(async (req, res) => {
  sendSuccess(res, financeService.rejectTransaction(req.params.id, req.body, req.actor, req));
}));

financeRouter.post('/transactions/:id/void', asyncHandler(async (req, res) => {
  sendSuccess(res, financeService.voidTransaction(req.params.id, req.body, req.actor, req));
}));
