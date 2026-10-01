import { Router } from 'express';
import { asyncHandler, sendSuccess } from '../core/http.js';
import { authenticate } from '../middleware/auth.js';
import { purchaseService } from '../services/purchases.js';

export const purchaseRouter = Router();
purchaseRouter.use(authenticate());

purchaseRouter.get('/bootstrap', asyncHandler(async (req, res) => {
  sendSuccess(res, purchaseService.bootstrap(req.actor));
}));

purchaseRouter.get('/dashboard', asyncHandler(async (req, res) => {
  sendSuccess(res, purchaseService.dashboard(req.actor));
}));

purchaseRouter.post('/preview', asyncHandler(async (req, res) => {
  sendSuccess(res, purchaseService.previewLines(req.body, req.actor));
}));

purchaseRouter.get('/orders', asyncHandler(async (req, res) => {
  sendSuccess(res, purchaseService.listOrders(req.query, req.actor));
}));

purchaseRouter.post('/orders', asyncHandler(async (req, res) => {
  sendSuccess(res, purchaseService.createOrder(req.body, req.actor, req), 201);
}));

purchaseRouter.get('/orders/:id', asyncHandler(async (req, res) => {
  sendSuccess(res, purchaseService.getOrder(req.params.id, req.actor));
}));

purchaseRouter.put('/orders/:id', asyncHandler(async (req, res) => {
  sendSuccess(res, purchaseService.updateOrder(req.params.id, req.body, req.actor, req));
}));

purchaseRouter.post('/orders/:id/approve', asyncHandler(async (req, res) => {
  sendSuccess(res, purchaseService.approveOrder(req.params.id, req.actor, req));
}));

purchaseRouter.post('/orders/:id/cancel', asyncHandler(async (req, res) => {
  sendSuccess(res, purchaseService.cancelOrder(req.params.id, req.actor, req));
}));

purchaseRouter.post('/orders/:id/bill', asyncHandler(async (req, res) => {
  sendSuccess(res, purchaseService.createBillFromPo(req.params.id, req.body, req.actor, req), 201);
}));

purchaseRouter.get('/bills', asyncHandler(async (req, res) => {
  sendSuccess(res, purchaseService.listBills(req.query, req.actor));
}));

purchaseRouter.post('/bills', asyncHandler(async (req, res) => {
  sendSuccess(res, purchaseService.createBill(req.body, req.actor, req), 201);
}));

purchaseRouter.get('/bills/:id', asyncHandler(async (req, res) => {
  sendSuccess(res, purchaseService.getBill(req.params.id, req.actor));
}));

purchaseRouter.post('/price-lists/parse', asyncHandler(async (req, res) => {
  sendSuccess(res, purchaseService.parsePriceList(req.body, req.actor));
}));

purchaseRouter.get('/price-lists', asyncHandler(async (req, res) => {
  sendSuccess(res, purchaseService.listPriceLists(req.query, req.actor));
}));

purchaseRouter.post('/price-lists', asyncHandler(async (req, res) => {
  sendSuccess(res, purchaseService.savePriceList(req.body, req.actor, req), 201);
}));

purchaseRouter.get('/price-lists/:id', asyncHandler(async (req, res) => {
  sendSuccess(res, purchaseService.getPriceList(req.params.id, req.actor));
}));

purchaseRouter.post('/price-lists/:id/create-po', asyncHandler(async (req, res) => {
  sendSuccess(res, purchaseService.createPoFromPriceList(req.params.id, req.body, req.actor, req), 201);
}));

purchaseRouter.get('/returns', asyncHandler(async (req, res) => {
  sendSuccess(res, purchaseService.listReturns(req.query, req.actor));
}));

purchaseRouter.post('/returns', asyncHandler(async (req, res) => {
  sendSuccess(res, purchaseService.createReturn(req.body, req.actor, req), 201);
}));

purchaseRouter.get('/suppliers/:id/ledger', asyncHandler(async (req, res) => {
  sendSuccess(res, purchaseService.getSupplierLedger(req.params.id, req.query, req.actor));
}));

purchaseRouter.get('/reports/summary', asyncHandler(async (req, res) => {
  sendSuccess(res, purchaseService.reports(req.query, req.actor));
}));
