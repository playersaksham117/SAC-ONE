import { Router } from 'express';
import { asyncHandler, sendSuccess } from '../core/http.js';
import { authenticate } from '../middleware/auth.js';
import { approvalService } from '../services/approvals.js';

export const approvalRouter = Router();
approvalRouter.use(authenticate());

approvalRouter.get('/modules', asyncHandler(async (req, res) => {
  sendSuccess(res, approvalService.listModules());
}));

approvalRouter.get('/role-options', asyncHandler(async (req, res) => {
  sendSuccess(res, approvalService.listRoleOptions(req.actor));
}));

approvalRouter.get('/dashboard', asyncHandler(async (req, res) => {
  sendSuccess(res, approvalService.dashboard(req.query, req.actor));
}));

approvalRouter.get('/rules', asyncHandler(async (req, res) => {
  sendSuccess(res, approvalService.listRules(req.query, req.actor));
}));

approvalRouter.post('/rules', asyncHandler(async (req, res) => {
  sendSuccess(res, approvalService.createRule(req.body, req.actor, req), 201);
}));

approvalRouter.get('/rules/:id', asyncHandler(async (req, res) => {
  sendSuccess(res, approvalService.getRule(req.params.id, req.actor));
}));

approvalRouter.put('/rules/:id', asyncHandler(async (req, res) => {
  sendSuccess(res, approvalService.updateRule(req.params.id, req.body, req.actor, req));
}));

approvalRouter.post('/rules/:id/deactivate', asyncHandler(async (req, res) => {
  sendSuccess(res, approvalService.deactivateRule(req.params.id, req.actor, req));
}));

approvalRouter.post('/rules/:id/duplicate', asyncHandler(async (req, res) => {
  sendSuccess(res, approvalService.duplicateRule(req.params.id, req.actor, req), 201);
}));

approvalRouter.get('/requests', asyncHandler(async (req, res) => {
  sendSuccess(res, approvalService.listRequests(req.query, req.actor));
}));

approvalRouter.get('/requests/:id', asyncHandler(async (req, res) => {
  sendSuccess(res, approvalService.getRequest(req.params.id, req.actor));
}));

approvalRouter.post('/requests/:id/approve', asyncHandler(async (req, res) => {
  sendSuccess(res, await approvalService.approve(req.params.id, req.body, req.actor, req));
}));

approvalRouter.post('/requests/:id/reject', asyncHandler(async (req, res) => {
  sendSuccess(res, await approvalService.reject(req.params.id, req.body, req.actor, req));
}));
