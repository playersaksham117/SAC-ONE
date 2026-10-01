import { Router } from 'express';
import { asyncHandler, sendSuccess } from '../core/http.js';
import { authenticate } from '../middleware/auth.js';
import { ceoDashboardService } from '../services/ceo-dashboard.js';

export const ceoDashboardRouter = Router();
ceoDashboardRouter.use(authenticate());

/** Filter option lists for CEO dashboard controls */
ceoDashboardRouter.get('/filters', asyncHandler(async (req, res) => {
  sendSuccess(res, ceoDashboardService.getFilterOptions(req.actor));
}));

/** Full executive dashboard aggregate (read-only) */
ceoDashboardRouter.get('/', asyncHandler(async (req, res) => {
  sendSuccess(res, ceoDashboardService.getDashboard(req.query, req.actor));
}));

/** Invoice / line profitability drill-down */
ceoDashboardRouter.get('/profitability', asyncHandler(async (req, res) => {
  sendSuccess(res, ceoDashboardService.getProfitability(req.query, req.actor));
}));

/** AR / AP aging bucket → party list */
ceoDashboardRouter.get('/aging', asyncHandler(async (req, res) => {
  sendSuccess(res, ceoDashboardService.getAgingDrilldown(req.query, req.actor));
}));
