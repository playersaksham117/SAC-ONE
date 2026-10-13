import { Router } from 'express';
import { asyncHandler, sendSuccess } from '../core/http.js';
import { authenticate } from '../middleware/auth.js';
import { noteService } from '../services/notes.js';

/** GST credit notes (customer returns) and debit notes (returns to suppliers). */
export const noteRouter = Router();
noteRouter.use(authenticate());

noteRouter.get('/financial-years', asyncHandler(async (req, res) => {
  sendSuccess(res, noteService.financialYears(req.actor));
}));

noteRouter.get('/credit', asyncHandler(async (req, res) => {
  sendSuccess(res, noteService.listCreditNotes(req.query, req.actor));
}));

noteRouter.get('/credit/:id', asyncHandler(async (req, res) => {
  sendSuccess(res, noteService.getCreditNote(req.params.id, req.actor));
}));

noteRouter.get('/debit', asyncHandler(async (req, res) => {
  sendSuccess(res, noteService.listDebitNotes(req.query, req.actor));
}));

noteRouter.get('/debit/:id', asyncHandler(async (req, res) => {
  sendSuccess(res, noteService.getDebitNote(req.params.id, req.actor));
}));
