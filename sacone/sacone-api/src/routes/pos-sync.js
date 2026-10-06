import { Router } from 'express';
import { asyncHandler, sendSuccess } from '../core/http.js';
import { authenticate } from '../middleware/auth.js';
import { authenticateDevice } from '../middleware/device-auth.js';
import { posSyncService, posDeviceAdminService } from '../services/pos-sync.js';
import { currentSeq, waitForChange } from '../realtime/change-feed.js';
import { commissionService } from '../services/commissions.js';

/** Tables behind what a terminal pulls (catalogue, stock, customers, staff, settings). */
const POS_PULL_TABLES = new Set([
  'products', 'categories', 'brands', 'units', 'stock_levels', 'location_stock_levels',
  'customers', 'users', 'roles', 'role_permissions', 'pos_users', 'system_settings',
  'companies', 'warehouses', 'min_selling_prices',
]);

/* ───────────── Terminal-facing: /api/v1/sync (device key auth) ───────────── */

export const posSyncRouter = Router();
posSyncRouter.use(authenticateDevice());

const ping = asyncHandler(async (req, res) => sendSuccess(res, posSyncService.ping(req.device, req)));
posSyncRouter.get('/ping', ping);
posSyncRouter.post('/ping', ping);
posSyncRouter.get('/bootstrap', ping);

posSyncRouter.post('/push', asyncHandler(async (req, res) => {
  sendSuccess(res, posSyncService.pushAll(req.device, req.body || {}, req));
}));
posSyncRouter.post('/push/sales', asyncHandler(async (req, res) => {
  sendSuccess(res, posSyncService.pushSales(req.device, req.body || {}, req));
}));
posSyncRouter.post('/push/returns', asyncHandler(async (req, res) => {
  sendSuccess(res, posSyncService.pushReturns(req.device, req.body || {}, req));
}));
posSyncRouter.post('/push/payments', asyncHandler(async (req, res) => {
  sendSuccess(res, posSyncService.pushPayments(req.device, req.body || {}, req));
}));
posSyncRouter.post('/push/customers', asyncHandler(async (req, res) => {
  sendSuccess(res, posSyncService.pushCustomers(req.device, req.body || {}, req));
}));
posSyncRouter.post('/push/stock-events', asyncHandler(async (req, res) => {
  sendSuccess(res, posSyncService.pushStockEvents(req.device, req.body || {}, req));
}));
posSyncRouter.post('/push/products', asyncHandler(async (req, res) => {
  sendSuccess(res, posSyncService.pushProducts(req.device, req.body || {}, req));
}));

/**
 * Long-poll for real-time pulls: resolves as soon as data a terminal pulls changes
 * (or after `wait` seconds with changed=false). Send back the returned `seq` as `since`.
 */
posSyncRouter.get('/changes', asyncHandler(async (req, res) => {
  const since = Number.parseInt(req.query.since, 10);
  const wait = Math.min(Math.max(Number.parseInt(req.query.wait, 10) || 25, 0), 30);
  const event = await waitForChange({
    since: Number.isFinite(since) ? since : currentSeq(),
    tables: POS_PULL_TABLES,
    timeoutMs: wait * 1000,
  });
  if (res.destroyed) return;
  sendSuccess(res, event
    ? { changed: true, seq: event.seq, tables: event.tables, reset: Boolean(event.reset) }
    : { changed: false, seq: currentSeq(), tables: [] });
}));

posSyncRouter.get('/products', asyncHandler(async (req, res) => {
  sendSuccess(res, posSyncService.pullProducts(req.device, req.query));
}));
posSyncRouter.get('/products/pending-count', asyncHandler(async (req, res) => {
  sendSuccess(res, posSyncService.pendingProductCount(req.device, req.query));
}));
posSyncRouter.post('/products/ack', asyncHandler(async (req, res) => {
  sendSuccess(res, posSyncService.acknowledge(req.device, req.body, 'products'));
}));
/** productId → minimum selling price (before GST, after discounts). Full list, pulled every sync. */
posSyncRouter.get('/min-prices', asyncHandler(async (req, res) => {
  sendSuccess(res, { prices: commissionService.minPriceMap() });
}));

posSyncRouter.get('/staff', asyncHandler(async (req, res) => {
  sendSuccess(res, posSyncService.staffStatus(req.device, req.query));
}));
posSyncRouter.get('/customers', asyncHandler(async (req, res) => {
  sendSuccess(res, posSyncService.pullCustomers(req.device, req.query));
}));
posSyncRouter.get('/users', asyncHandler(async (req, res) => {
  sendSuccess(res, posSyncService.pullUsers(req.device, req.query));
}));
posSyncRouter.post('/users/ack', asyncHandler(async (req, res) => {
  sendSuccess(res, posSyncService.acknowledge(req.device, req.body, 'users'));
}));

/* ───────────── ERP admin: /api/pos-devices (session auth) ───────────── */

export const posDeviceAdminRouter = Router();
posDeviceAdminRouter.use(authenticate());

posDeviceAdminRouter.get('/', asyncHandler(async (req, res) => {
  sendSuccess(res, posDeviceAdminService.list(req.actor));
}));
posDeviceAdminRouter.post('/', asyncHandler(async (req, res) => {
  sendSuccess(res, posDeviceAdminService.create(req.body, req.actor, req), 201);
}));

// Sync inbox (declared before /:id so the paths don't collide)
posDeviceAdminRouter.get('/inbox', asyncHandler(async (req, res) => {
  sendSuccess(res, posSyncService.listInbox(req.query, req.actor));
}));
posDeviceAdminRouter.get('/inbox/summary', asyncHandler(async (req, res) => {
  sendSuccess(res, posSyncService.inboxSummary(req.actor));
}));
posDeviceAdminRouter.post('/inbox/:id/retry', asyncHandler(async (req, res) => {
  sendSuccess(res, posSyncService.retryInboxItem(req.params.id, req.actor, req));
}));
posDeviceAdminRouter.post('/inbox/:id/approve', asyncHandler(async (req, res) => {
  sendSuccess(res, posSyncService.approveProductRequest(req.params.id, req.body || {}, req.actor, req));
}));
posDeviceAdminRouter.post('/inbox/:id/reject', asyncHandler(async (req, res) => {
  sendSuccess(res, posSyncService.rejectInboxItem(req.params.id, req.body?.reason, req.actor));
}));

// POS PIN users
posDeviceAdminRouter.get('/users', asyncHandler(async (req, res) => {
  sendSuccess(res, posDeviceAdminService.listUsers(req.actor));
}));
posDeviceAdminRouter.post('/users', asyncHandler(async (req, res) => {
  sendSuccess(res, posDeviceAdminService.createUser(req.body, req.actor, req), 201);
}));
posDeviceAdminRouter.put('/users/:id', asyncHandler(async (req, res) => {
  sendSuccess(res, posDeviceAdminService.updateUser(req.params.id, req.body, req.actor, req));
}));

posDeviceAdminRouter.put('/:id', asyncHandler(async (req, res) => {
  sendSuccess(res, posDeviceAdminService.update(req.params.id, req.body, req.actor, req));
}));
posDeviceAdminRouter.post('/:id/rotate-key', asyncHandler(async (req, res) => {
  sendSuccess(res, posDeviceAdminService.rotateKey(req.params.id, req.actor, req));
}));
posDeviceAdminRouter.post('/:id/revoke', asyncHandler(async (req, res) => {
  sendSuccess(res, posDeviceAdminService.revoke(req.params.id, req.actor, req));
}));
