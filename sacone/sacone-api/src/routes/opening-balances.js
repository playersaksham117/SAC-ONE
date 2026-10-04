import { Router } from 'express';
import { asyncHandler, sendSuccess } from '../core/http.js';
import { authenticate } from '../middleware/auth.js';
import { openingBalanceService } from '../services/opening-balances.js';

export const openingBalanceRouter = Router();
openingBalanceRouter.use(authenticate());

openingBalanceRouter.get('/stock', asyncHandler(async (req, res) => {
  sendSuccess(res, openingBalanceService.stockSheet(req.query, req.actor));
}));

openingBalanceRouter.post('/stock', asyncHandler(async (req, res) => {
  sendSuccess(res, openingBalanceService.postOpeningStock(req.body || {}, req.actor, req), 201);
}));

openingBalanceRouter.get('/parties', asyncHandler(async (req, res) => {
  sendSuccess(res, openingBalanceService.partySheet(req.query, req.actor));
}));

openingBalanceRouter.put('/parties', asyncHandler(async (req, res) => {
  sendSuccess(res, openingBalanceService.saveParty(req.body || {}, req.actor, req));
}));
