import { Router } from 'express';
import { asyncHandler, sendSuccess } from '../core/http.js';
import { authenticate } from '../middleware/auth.js';
import { warehouseService } from '../services/warehouse.js';

export const warehouseRouter = Router();
warehouseRouter.use(authenticate());

// Static / collection routes first (before /:id)
warehouseRouter.get('/', asyncHandler(async (req, res) => {
  sendSuccess(res, warehouseService.list(req.actor, {
    includeInactive: req.query.includeInactive !== 'false',
  }));
}));

warehouseRouter.post('/', asyncHandler(async (req, res) => {
  sendSuccess(res, warehouseService.create(req.body, req.actor, req), 201);
}));

warehouseRouter.get('/transfers', asyncHandler(async (req, res) => {
  sendSuccess(res, warehouseService.listTransfers(req.query, req.actor));
}));

warehouseRouter.post('/transfers', asyncHandler(async (req, res) => {
  sendSuccess(res, warehouseService.createTransfer(req.body, req.actor, req), 201);
}));

warehouseRouter.get('/transfers/:id', asyncHandler(async (req, res) => {
  sendSuccess(res, warehouseService.getTransfer(req.params.id, req.actor));
}));

warehouseRouter.post('/transfers/:id/approve', asyncHandler(async (req, res) => {
  sendSuccess(res, warehouseService.approveTransfer(req.params.id, req.actor, req));
}));

warehouseRouter.post('/transfers/:id/reject', asyncHandler(async (req, res) => {
  sendSuccess(res, warehouseService.rejectTransfer(req.params.id, req.body?.reason, req.actor, req));
}));

warehouseRouter.get('/stock-counts', asyncHandler(async (req, res) => {
  sendSuccess(res, warehouseService.listStockCounts(req.query, req.actor));
}));

warehouseRouter.post('/stock-counts', asyncHandler(async (req, res) => {
  sendSuccess(res, warehouseService.createStockCount(req.body, req.actor, req), 201);
}));

warehouseRouter.get('/stock-counts/:id', asyncHandler(async (req, res) => {
  sendSuccess(res, warehouseService.getStockCount(req.params.id, req.actor));
}));

warehouseRouter.put('/stock-counts/:id/items/:itemId', asyncHandler(async (req, res) => {
  sendSuccess(res, warehouseService.updateCountItem(req.params.id, req.params.itemId, req.body, req.actor, req));
}));

warehouseRouter.post('/stock-counts/:id/submit', asyncHandler(async (req, res) => {
  sendSuccess(res, warehouseService.submitStockCount(req.params.id, req.actor, req));
}));

warehouseRouter.post('/stock-counts/:id/approve', asyncHandler(async (req, res) => {
  sendSuccess(res, warehouseService.approveStockCount(req.params.id, req.actor, req));
}));

warehouseRouter.get('/locations/scan', asyncHandler(async (req, res) => {
  sendSuccess(res, warehouseService.scanLocation(req.query.payload, req.actor));
}));

warehouseRouter.get('/location-stock', asyncHandler(async (req, res) => {
  sendSuccess(res, warehouseService.getLocationStock(req.query, req.actor));
}));

warehouseRouter.put('/locations/:locationId', asyncHandler(async (req, res) => {
  sendSuccess(res, warehouseService.updateLocation(req.params.locationId, req.body, req.actor, req));
}));

warehouseRouter.get('/locations/:locationId/qr', asyncHandler(async (req, res) => {
  sendSuccess(res, await warehouseService.getLocationQr(req.params.locationId, req.actor));
}));

// Parameterized warehouse routes
warehouseRouter.get('/:id/summary', asyncHandler(async (req, res) => {
  sendSuccess(res, warehouseService.getSummary(req.params.id, req.actor));
}));

warehouseRouter.get('/:id/hierarchy', asyncHandler(async (req, res) => {
  sendSuccess(res, warehouseService.getHierarchy(req.params.id, req.actor));
}));

warehouseRouter.get('/:id/locations', asyncHandler(async (req, res) => {
  sendSuccess(res, warehouseService.listLocations(req.params.id, req.actor, req.query));
}));

warehouseRouter.post('/:id/locations', asyncHandler(async (req, res) => {
  sendSuccess(res, warehouseService.createLocation({
    ...req.body,
    warehouseId: req.params.id,
  }, req.actor, req), 201);
}));

warehouseRouter.get('/:id/stock', asyncHandler(async (req, res) => {
  sendSuccess(res, warehouseService.getWarehouseStock(req.params.id, req.actor));
}));

warehouseRouter.get('/:id/occupancy', asyncHandler(async (req, res) => {
  sendSuccess(res, warehouseService.getOccupancy(req.params.id, req.actor));
}));

warehouseRouter.get('/:id', asyncHandler(async (req, res) => {
  sendSuccess(res, warehouseService.getById(req.params.id, req.actor));
}));

warehouseRouter.put('/:id', asyncHandler(async (req, res) => {
  sendSuccess(res, warehouseService.update(req.params.id, req.body, req.actor, req));
}));
