import { Router } from 'express';
import { asyncHandler, sendSuccess } from '../core/http.js';
import { authenticate } from '../middleware/auth.js';
import { authenticateApiKey, logApiRequest } from '../middleware/api-key.js';
import { webstoreService } from '../services/webstore.js';

/** Public web store integration API (API key auth) */
export const webstorePublicRouter = Router();
webstorePublicRouter.use(logApiRequest);

webstorePublicRouter.get('/products', authenticateApiKey(['products.read']), asyncHandler(async (req, res) => {
  sendSuccess(res, webstoreService.listProducts(req.query));
}));

webstorePublicRouter.get('/products/:productId', authenticateApiKey(['products.read']), asyncHandler(async (req, res) => {
  sendSuccess(res, webstoreService.getProduct(req.params.productId));
}));

webstorePublicRouter.get('/inventory', authenticateApiKey(['inventory.read']), asyncHandler(async (req, res) => {
  sendSuccess(res, webstoreService.listInventory(req.query));
}));

webstorePublicRouter.get('/customers', authenticateApiKey(['customers.read']), asyncHandler(async (req, res) => {
  sendSuccess(res, webstoreService.searchCustomers(req.query.q || req.query.search || '', {
    limit: req.query.limit,
  }));
}));

webstorePublicRouter.get('/customers/:customerId', authenticateApiKey(['customers.read']), asyncHandler(async (req, res) => {
  sendSuccess(res, webstoreService.getCustomer(req.params.customerId));
}));

webstorePublicRouter.post('/customers', authenticateApiKey(['customers.write']), asyncHandler(async (req, res) => {
  sendSuccess(res, webstoreService.createCustomer(req.body, req.apiKeyActor), 201);
}));

webstorePublicRouter.patch('/customers/:customerId', authenticateApiKey(['customers.write']), asyncHandler(async (req, res) => {
  sendSuccess(res, webstoreService.updateCustomer(req.params.customerId, req.body, req.apiKeyActor));
}));

webstorePublicRouter.post('/orders/provision', authenticateApiKey(['orders.provision']), asyncHandler(async (req, res) => {
  sendSuccess(res, webstoreService.provisionOrder(req.body, req.apiKeyActor), 202);
}));

/** Admin management (session auth) */
export const webstoreAdminRouter = Router();
webstoreAdminRouter.use(authenticate());

webstoreAdminRouter.get('/scopes', asyncHandler(async (req, res) => {
  sendSuccess(res, webstoreService.getScopes());
}));

webstoreAdminRouter.get('/api-keys', asyncHandler(async (req, res) => {
  sendSuccess(res, webstoreService.listApiKeys(req.actor));
}));

webstoreAdminRouter.post('/api-keys', asyncHandler(async (req, res) => {
  sendSuccess(res, webstoreService.createApiKey(req.body, req.actor, req), 201);
}));

webstoreAdminRouter.post('/api-keys/:id/revoke', asyncHandler(async (req, res) => {
  sendSuccess(res, webstoreService.revokeApiKey(req.params.id, req.actor, req));
}));

webstoreAdminRouter.get('/api-logs', asyncHandler(async (req, res) => {
  sendSuccess(res, webstoreService.listApiLogs(req.query, req.actor));
}));
