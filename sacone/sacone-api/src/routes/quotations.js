import { Router } from 'express';
import { asyncHandler, sendSuccess } from '../core/http.js';
import { authenticate } from '../middleware/auth.js';
import { quotationService } from '../services/quotations.js';
import { documentNumberingService } from '../services/document-numbering.js';

export const quotationRouter = Router();
quotationRouter.use(authenticate());

quotationRouter.get('/', asyncHandler(async (req, res) => {
  sendSuccess(res, quotationService.list(req.query, req.actor));
}));

quotationRouter.post('/preview', asyncHandler(async (req, res) => {
  sendSuccess(res, quotationService.preview(req.body, req.actor));
}));

quotationRouter.post('/', asyncHandler(async (req, res) => {
  sendSuccess(res, quotationService.create(req.body, req.actor, req), 201);
}));

quotationRouter.get('/:id', asyncHandler(async (req, res) => {
  sendSuccess(res, quotationService.getById(req.params.id, req.actor));
}));

quotationRouter.put('/:id', asyncHandler(async (req, res) => {
  sendSuccess(res, quotationService.update(req.params.id, req.body, req.actor, req));
}));

quotationRouter.post('/:id/cancel', asyncHandler(async (req, res) => {
  sendSuccess(res, quotationService.cancel(req.params.id, req.actor, req));
}));

quotationRouter.get('/:id/document', asyncHandler(async (req, res) => {
  const html = quotationService.getDocumentHtml(req.params.id, req.actor);
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(html);
}));

quotationRouter.post('/:id/print', asyncHandler(async (req, res) => {
  sendSuccess(res, quotationService.recordPrint(req.params.id, req.actor, req));
}));

quotationRouter.post('/:id/pdf', asyncHandler(async (req, res) => {
  const result = quotationService.recordPdf(req.params.id, req.actor, req);
  sendSuccess(res, result);
}));

quotationRouter.get('/:id/whatsapp', asyncHandler(async (req, res) => {
  sendSuccess(res, quotationService.getWhatsAppShare(req.params.id, req.actor));
}));

quotationRouter.post('/:id/email', asyncHandler(async (req, res) => {
  sendSuccess(res, quotationService.sendEmail(req.params.id, req.body, req.actor, req));
}));

quotationRouter.post('/:id/convert', asyncHandler(async (req, res) => {
  sendSuccess(res, quotationService.convertToSale(req.params.id, req.body, req.actor, req));
}));

export const documentNumberingRouter = Router();
documentNumberingRouter.use(authenticate());

documentNumberingRouter.get('/', asyncHandler(async (req, res) => {
  sendSuccess(res, documentNumberingService.getSettings(req.actor));
}));

documentNumberingRouter.put('/firm', asyncHandler(async (req, res) => {
  sendSuccess(res, documentNumberingService.updateFirmSettings(req.body, req.actor, req));
}));

documentNumberingRouter.put('/series/:documentType', asyncHandler(async (req, res) => {
  sendSuccess(res, documentNumberingService.updateSeries(req.params.documentType, req.body, req.actor, req));
}));
