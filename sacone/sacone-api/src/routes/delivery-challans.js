import { Router } from 'express';
import { asyncHandler, sendSuccess } from '../core/http.js';
import { authenticate } from '../middleware/auth.js';
import { deliveryChallanService } from '../services/delivery-challans.js';

/** Delivery challans: goods out without a sale (approval, job work, sample); no GST. */
export const deliveryChallanRouter = Router();
deliveryChallanRouter.use(authenticate());

deliveryChallanRouter.get('/', asyncHandler(async (req, res) => {
  sendSuccess(res, deliveryChallanService.list(req.query, req.actor));
}));

deliveryChallanRouter.post('/', asyncHandler(async (req, res) => {
  sendSuccess(res, deliveryChallanService.create(req.body || {}, req.actor, req), 201);
}));

deliveryChallanRouter.get('/:id', asyncHandler(async (req, res) => {
  sendSuccess(res, deliveryChallanService.get(req.params.id, req.actor));
}));

/** Close as returned / invoiced / kept, or cancel. */
deliveryChallanRouter.post('/:id/close', asyncHandler(async (req, res) => {
  sendSuccess(res, deliveryChallanService.close(req.params.id, req.body || {}, req.actor, req));
}));
