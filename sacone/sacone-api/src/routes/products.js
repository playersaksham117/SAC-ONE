import { Router } from 'express';
import { asyncHandler, sendSuccess } from '../core/http.js';
import { authenticate } from '../middleware/auth.js';
import {
  categoryService,
  brandService,
  unitService,
  productService,
} from '../services/products.js';
import { commissionService } from '../services/commissions.js';

function lookupRouter(service) {
  const router = Router();
  router.use(authenticate());

  router.get('/', asyncHandler(async (req, res) => {
    sendSuccess(res, service.list(req.actor, {
      includeInactive: req.query.includeInactive !== 'false',
    }));
  }));

  router.get('/:id', asyncHandler(async (req, res) => {
    sendSuccess(res, service.getById(req.params.id, req.actor));
  }));

  router.post('/', asyncHandler(async (req, res) => {
    sendSuccess(res, service.create(req.body, req.actor, req), 201);
  }));

  router.put('/:id', asyncHandler(async (req, res) => {
    sendSuccess(res, service.update(req.params.id, req.body, req.actor, req));
  }));

  router.delete('/:id', asyncHandler(async (req, res) => {
    sendSuccess(res, service.delete(req.params.id, req.actor, req));
  }));

  return router;
}

export const categoryRouter = lookupRouter(categoryService);
export const brandRouter = lookupRouter(brandService);
export const unitRouter = lookupRouter(unitService);

export const productRouter = Router();
productRouter.use(authenticate());

productRouter.post('/generate-sku', asyncHandler(async (req, res) => {
  sendSuccess(res, productService.previewGenerateSku(req.body, req.actor));
}));

productRouter.post('/generate-barcode', asyncHandler(async (req, res) => {
  sendSuccess(res, productService.generateBarcode(req.actor));
}));

productRouter.post('/check-duplicate', asyncHandler(async (req, res) => {
  sendSuccess(res, productService.checkDuplicate(req.body, req.actor));
}));

productRouter.get('/sku-config/families', asyncHandler(async (req, res) => {
  sendSuccess(res, productService.listFamilyCodes(req.actor));
}));

productRouter.post('/sku-config/families', asyncHandler(async (req, res) => {
  sendSuccess(res, productService.createFamilyCode(req.body, req.actor, req), 201);
}));

productRouter.put('/sku-config/families/:id', asyncHandler(async (req, res) => {
  sendSuccess(res, productService.updateFamilyCode(req.params.id, req.body, req.actor));
}));

productRouter.get('/export', asyncHandler(async (req, res) => {
  const csv = productService.exportCsv(req.actor);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="products.csv"');
  res.send(csv);
}));

productRouter.post('/import', asyncHandler(async (req, res) => {
  const csvText = typeof req.body?.csv === 'string' ? req.body.csv : req.body?.content;
  sendSuccess(res, productService.importCsv(csvText, req.actor, req));
}));

productRouter.get('/barcode/:barcode', asyncHandler(async (req, res) => {
  sendSuccess(res, productService.searchByBarcode(req.params.barcode, req.actor));
}));

productRouter.get('/sku/:sku', asyncHandler(async (req, res) => {
  sendSuccess(res, productService.searchBySku(req.params.sku, req.actor));
}));

productRouter.post('/bulk-delete', asyncHandler(async (req, res) => {
  sendSuccess(res, productService.bulkDelete(req.body?.ids || [], req.actor, req));
}));

productRouter.post('/bulk-update', asyncHandler(async (req, res) => {
  sendSuccess(res, productService.bulkUpdate(req.body?.ids || [], req.body?.patch || {}, req.actor, req));
}));

// Minimum selling prices: product > brand > category, a fixed price or % of MRP.
productRouter.get('/min-prices', asyncHandler(async (req, res) => {
  sendSuccess(res, commissionService.listMinPrices(req.actor));
}));
productRouter.post('/min-prices', asyncHandler(async (req, res) => {
  sendSuccess(res, commissionService.saveMinPrice(req.body || {}, req.actor, req), 201);
}));
productRouter.delete('/min-prices/:id', asyncHandler(async (req, res) => {
  sendSuccess(res, commissionService.deleteMinPrice(req.params.id, req.actor, req));
}));

productRouter.get('/', asyncHandler(async (req, res) => {
  sendSuccess(res, productService.list(req.query, req.actor));
}));

productRouter.get('/:id', asyncHandler(async (req, res) => {
  sendSuccess(res, productService.getById(req.params.id, req.actor));
}));

productRouter.post('/', asyncHandler(async (req, res) => {
  sendSuccess(res, productService.create(req.body, req.actor, req), 201);
}));

productRouter.put('/:id', asyncHandler(async (req, res) => {
  sendSuccess(res, productService.update(req.params.id, req.body, req.actor, req));
}));

productRouter.post('/:id/deactivate', asyncHandler(async (req, res) => {
  sendSuccess(res, productService.deactivate(req.params.id, req.actor, req));
}));

productRouter.post('/:id/activate', asyncHandler(async (req, res) => {
  sendSuccess(res, productService.activate(req.params.id, req.actor, req));
}));

productRouter.delete('/:id', asyncHandler(async (req, res) => {
  sendSuccess(res, productService.delete(req.params.id, req.actor, req));
}));
