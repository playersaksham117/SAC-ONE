import { Router } from 'express';
import { asyncHandler, sendSuccess } from '../core/http.js';
import { authenticate } from '../middleware/auth.js';
import { inventoryMovementService } from '../services/inventory.js';
import { MOVEMENT_TYPES } from '../core/inventory-constants.js';

export const inventoryRouter = Router();
inventoryRouter.use(authenticate());

inventoryRouter.get('/movement-types', asyncHandler(async (req, res) => {
  sendSuccess(res, inventoryMovementService.getMovementTypes(
    { scope: req.query.scope || 'all' },
    req.actor
  ));
}));

inventoryRouter.get('/warehouses', asyncHandler(async (req, res) => {
  sendSuccess(res, inventoryMovementService.listWarehouses(req.actor));
}));

inventoryRouter.get('/stock', asyncHandler(async (req, res) => {
  sendSuccess(res, inventoryMovementService.getStock(req.query, req.actor));
}));

inventoryRouter.get('/stock/product/:productId', asyncHandler(async (req, res) => {
  sendSuccess(res, inventoryMovementService.getProductStock(
    req.params.productId,
    req.actor,
    req.query.warehouseId || null
  ));
}));

inventoryRouter.get('/stock/warehouse/:warehouseId', asyncHandler(async (req, res) => {
  sendSuccess(res, inventoryMovementService.getWarehouseStock(req.params.warehouseId, req.actor));
}));

inventoryRouter.get('/movements', asyncHandler(async (req, res) => {
  sendSuccess(res, inventoryMovementService.listMovements(req.query, req.actor));
}));

inventoryRouter.get('/movements/:id', asyncHandler(async (req, res) => {
  sendSuccess(res, inventoryMovementService.getMovement(req.params.id, req.actor));
}));

inventoryRouter.post('/movements', asyncHandler(async (req, res) => {
  sendSuccess(res, inventoryMovementService.createMovement(req.body, req.actor, req), 201);
}));

// Convenience endpoints for common movement types
inventoryRouter.post('/movements/opening-stock', asyncHandler(async (req, res) => {
  sendSuccess(res, inventoryMovementService.recordOpeningStock(req.body, req.actor, req), 201);
}));

inventoryRouter.post('/movements/pos-sale', asyncHandler(async (req, res) => {
  sendSuccess(res, inventoryMovementService.recordPosSale(req.body, req.actor, req), 201);
}));

inventoryRouter.post('/movements/sales-return', asyncHandler(async (req, res) => {
  sendSuccess(res, inventoryMovementService.recordSalesReturn(req.body, req.actor, req), 201);
}));

inventoryRouter.post('/movements/adjustment', asyncHandler(async (req, res) => {
  const direction = req.body.direction || (req.body.quantity > 0 ? 'increase' : 'decrease');
  const quantity = Math.abs(Number(req.body.quantity));
  const movementType = direction === 'increase' || direction === 'up'
    ? MOVEMENT_TYPES.ADJUSTMENT_INCREASE
    : MOVEMENT_TYPES.ADJUSTMENT_DECREASE;

  sendSuccess(res, inventoryMovementService.createMovement({
    ...req.body,
    quantity,
    movementType,
  }, req.actor, req), 201);
}));

inventoryRouter.get('/adjustments/pending', asyncHandler(async (req, res) => {
  sendSuccess(res, inventoryMovementService.listPendingAdjustments(req.actor));
}));

inventoryRouter.post('/adjustments/:id/approve', asyncHandler(async (req, res) => {
  sendSuccess(res, inventoryMovementService.approveAdjustment(req.params.id, req.actor, req));
}));

inventoryRouter.post('/adjustments/:id/reject', asyncHandler(async (req, res) => {
  sendSuccess(res, inventoryMovementService.rejectAdjustment(
    req.params.id,
    req.body?.reason,
    req.actor,
    req
  ));
}));

inventoryRouter.post('/stock/recompute', asyncHandler(async (req, res) => {
  const { productId, warehouseId } = req.body;
  sendSuccess(res, inventoryMovementService.recomputeStock(productId, warehouseId, req.actor));
}));
