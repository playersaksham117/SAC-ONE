import { warrantyService } from '../services/warranty.js';
import { signStampForPrint } from '../services/pos.js';
import { posPins } from '../services/pos-pins.js';
import { authService } from '../services/index.js';
import { AppError } from '../core/http.js';
import { Router } from 'express';
import { asyncHandler, sendSuccess } from '../core/http.js';
import { authenticate } from '../middleware/auth.js';
import { authenticateDevice } from '../middleware/device-auth.js';
import { posSyncService, posDeviceAdminService } from '../services/pos-sync.js';
import { currentSeq, waitForChange } from '../realtime/change-feed.js';
import { currentFirmId } from '../database/context.js';
import { serverAddresses } from '../core/server-addresses.js';
import { attendanceService } from '../services/attendance.js';

/** Tables behind what a terminal pulls (catalogue, stock, customers, staff, settings). */
const POS_PULL_TABLES = new Set([
  'products', 'categories', 'brands', 'units', 'stock_levels', 'location_stock_levels',
  'customers', 'users', 'roles', 'role_permissions', 'pos_users', 'system_settings',
  'companies', 'warehouses', 'min_selling_prices',
  // bills and quotations made or edited in the ERP: the phone refreshes its copies
  'pos_sales', 'pos_quotations',
]);

/* ───────────── Terminal-facing: /api/v1/sync (device key auth) ───────────── */

export const posSyncRouter = Router();
posSyncRouter.use(authenticateDevice());

const ping = asyncHandler(async (req, res) => sendSuccess(res, posSyncService.ping(req.device, req)));
posSyncRouter.get('/ping', ping);
posSyncRouter.post('/ping', ping);
posSyncRouter.get('/bootstrap', ping);
/** The firm's signature and stamp images, fetched by phones only when their version changes. */
posSyncRouter.get('/sign-stamp', asyncHandler(async (req, res) => {
  sendSuccess(res, signStampForPrint());
}));
posSyncRouter.get('/upi-qr', asyncHandler(async (req, res) => {
  sendSuccess(res, posSyncService.upiQrImage(req.device));
}));

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
posSyncRouter.post('/push/quotations', asyncHandler(async (req, res) => {
  sendSuccess(res, posSyncService.pushQuotations(req.device, req.body || {}, req));
}));
/** The ERP's current copy of this phone's synced bills (edited / cancelled in the ERP). */
posSyncRouter.post('/sales/current', asyncHandler(async (req, res) => {
  sendSuccess(res, posSyncService.currentSales(req.device, req.body || {}));
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
    firmId: currentFirmId(),
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
/** No separate minimum prices: the selling price is the minimum. Older phones still ask, so answer with none. */
posSyncRouter.get('/min-prices', asyncHandler(async (req, res) => {
  sendSuccess(res, { prices: {} });
}));

/**
 * Staff sign-in on a paired terminal: Login ID or email + the PIN set in ERP → Users.
 * Only staff who may open this terminal's firm and use the POS terminal get a session.
 */
posSyncRouter.post('/login', asyncHandler(async (req, res) => {
  const { userRow, pinSetAt } = posPins.verify(req.body?.identifier, req.body?.pin);
  const staff = posSyncService.staffStatus(req.device, { ids: userRow.id }).staff[0];
  if (!staff?.isActive) throw new AppError('You do not have access to this firm in SACONE. Ask the owner to add it in Users → Edit.', 403, 'FIRM_FORBIDDEN');
  if (!staff.permissions.includes('pos.terminal.view')) throw new AppError('Your ERP role does not allow POS access (needs "POS Terminal – view").', 403, 'FORBIDDEN');
  const session = authService.openSession(userRow, req, { firmId: currentFirmId(), method: 'pos_pin' });
  sendSuccess(res, { ...session, pinSetAt });
}));

/** Warranty Check from the terminal: invoice number or serial number. */
posSyncRouter.get('/warranty', asyncHandler(async (req, res) => {
  sendSuccess(res, warrantyService.lookup(req.query.q));
}));

/** Attendance from the terminal for the signed-in staff member: action 'in' | 'out' | 'status'. */
posSyncRouter.post('/attendance', asyncHandler(async (req, res) => {
  const userId = String(req.body?.userId || '');
  const staff = posSyncService.staffStatus(req.device, { ids: userId }).staff[0];
  sendSuccess(res, attendanceService.posPunch(staff, String(req.body?.action || 'status')));
}));

posSyncRouter.get('/staff', asyncHandler(async (req, res) => {
  sendSuccess(res, posSyncService.staffStatus(req.device, req.query));
}));
/** ERP / other terminals' bills and quotations the signed-in staff member may see (?userId=). */
posSyncRouter.get('/documents', asyncHandler(async (req, res) => {
  sendSuccess(res, posSyncService.pullDocuments(req.device, req.query));
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

// This PC's current LAN / Tailscale addresses, for the SAC-POS "Server URL" field.
posDeviceAdminRouter.get('/server-addresses', asyncHandler(async (req, res) => {
  sendSuccess(res, serverAddresses());
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

// SAC-POS staff are ERP users: add and manage them in User Management (/api/users).
posDeviceAdminRouter.all(['/users', '/users/:id'], (req, res) => {
  res.status(410).json({ success: false, error: { message: 'POS users are managed in User Management. Give the user a role with SAC-POS access.', code: 'MOVED_TO_USERS' } });
});

posDeviceAdminRouter.put('/:id', asyncHandler(async (req, res) => {
  sendSuccess(res, posDeviceAdminService.update(req.params.id, req.body, req.actor, req));
}));
posDeviceAdminRouter.post('/:id/rotate-key', asyncHandler(async (req, res) => {
  sendSuccess(res, posDeviceAdminService.rotateKey(req.params.id, req.actor, req));
}));
posDeviceAdminRouter.post('/:id/revoke', asyncHandler(async (req, res) => {
  sendSuccess(res, posDeviceAdminService.revoke(req.params.id, req.actor, req));
}));
