import fs from 'fs';
import path from 'path';
import { Router } from 'express';
import { asyncHandler, sendSuccess } from '../core/http.js';
import { authenticate } from '../middleware/auth.js';
import { exportService } from '../services/export.js';

export const exportRouter = Router();
exportRouter.use(authenticate());

exportRouter.get('/datasets', asyncHandler(async (req, res) => {
  sendSuccess(res, exportService.listDatasets(req.actor));
}));

exportRouter.get('/logs', asyncHandler(async (req, res) => {
  sendSuccess(res, exportService.listLogs(req.actor, req.query));
}));

exportRouter.get('/:id', asyncHandler(async (req, res) => {
  sendSuccess(res, exportService.getExport(req.params.id, req.actor));
}));

exportRouter.post('/', asyncHandler(async (req, res) => {
  sendSuccess(res, exportService.runExport({
    datasets: req.body?.datasets,
    complete: Boolean(req.body?.complete),
    dateFrom: req.body?.dateFrom || req.query.dateFrom || null,
    dateTo: req.body?.dateTo || req.query.dateTo || null,
  }, req.actor), 201);
}));

exportRouter.get('/:id/files/:filename', asyncHandler(async (req, res) => {
  const filePath = exportService.getFilePath(req.params.id, req.params.filename, req.actor);
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${path.basename(filePath)}"`);
  fs.createReadStream(filePath).pipe(res);
}));
