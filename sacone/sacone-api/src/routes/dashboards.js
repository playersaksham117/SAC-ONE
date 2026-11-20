import { Router } from 'express';
import { asyncHandler, sendSuccess } from '../core/http.js';
import { authenticate } from '../middleware/auth.js';
import { dashboardService } from '../services/dashboards.js';

/** Sales and inventory dashboards (charts in the ERP). Query: dateFrom, dateTo (IST), warehouseId. */
export const dashboardRouter = Router();
dashboardRouter.use(authenticate());

dashboardRouter.get('/sales', asyncHandler(async (req, res) => {
  sendSuccess(res, dashboardService.sales(req.query, req.actor));
}));

dashboardRouter.get('/inventory', asyncHandler(async (req, res) => {
  sendSuccess(res, dashboardService.inventory(req.query, req.actor));
}));
