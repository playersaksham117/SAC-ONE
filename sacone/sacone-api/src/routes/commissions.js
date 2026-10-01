import { Router } from 'express';
import { asyncHandler, sendSuccess } from '../core/http.js';
import { authenticate } from '../middleware/auth.js';
import { commissionService } from '../services/commissions.js';

export const salesAgentRouter = Router();
salesAgentRouter.use(authenticate());

salesAgentRouter.get('/', asyncHandler(async (req, res) => {
  sendSuccess(res, commissionService.listAgents(req.query, req.actor));
}));

salesAgentRouter.post('/', asyncHandler(async (req, res) => {
  sendSuccess(res, commissionService.createAgent(req.body, req.actor, req), 201);
}));

salesAgentRouter.get('/:id/dashboard', asyncHandler(async (req, res) => {
  sendSuccess(res, commissionService.agentDashboard(req.params.id, req.query, req.actor));
}));

salesAgentRouter.get('/:id', asyncHandler(async (req, res) => {
  sendSuccess(res, commissionService.getAgent(req.params.id, req.actor));
}));

salesAgentRouter.put('/:id', asyncHandler(async (req, res) => {
  sendSuccess(res, commissionService.updateAgent(req.params.id, req.body, req.actor, req));
}));

export const commissionRouter = Router();
commissionRouter.use(authenticate());

commissionRouter.get('/plans', asyncHandler(async (req, res) => {
  sendSuccess(res, commissionService.listPlans(req.query, req.actor));
}));

commissionRouter.post('/plans', asyncHandler(async (req, res) => {
  sendSuccess(res, commissionService.createPlan(req.body, req.actor, req), 201);
}));

commissionRouter.put('/plans/:id', asyncHandler(async (req, res) => {
  sendSuccess(res, commissionService.updatePlan(req.params.id, req.body, req.actor, req));
}));

commissionRouter.get('/plans/:id/rules', asyncHandler(async (req, res) => {
  sendSuccess(res, commissionService.listRules(req.params.id, req.actor));
}));

commissionRouter.post('/plans/:id/rules', asyncHandler(async (req, res) => {
  sendSuccess(res, commissionService.createRule(req.params.id, req.body, req.actor, req), 201);
}));

commissionRouter.post('/preview', asyncHandler(async (req, res) => {
  sendSuccess(res, commissionService.preview(req.body, req.actor));
}));

commissionRouter.get('/', asyncHandler(async (req, res) => {
  sendSuccess(res, commissionService.listCommissions(req.query, req.actor));
}));

commissionRouter.get('/performance', asyncHandler(async (req, res) => {
  sendSuccess(res, commissionService.performanceReport(req.query, req.actor));
}));

commissionRouter.get('/export.csv', asyncHandler(async (req, res) => {
  const csv = commissionService.reportCsv(req.query, req.actor);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="commissions.csv"');
  res.send(csv);
}));

commissionRouter.get('/:id', asyncHandler(async (req, res) => {
  sendSuccess(res, commissionService.getCommission(req.params.id, req.actor));
}));

commissionRouter.post('/:id/reverse', asyncHandler(async (req, res) => {
  const row = commissionService.getCommission(req.params.id, req.actor);
  sendSuccess(res, commissionService.reverseForReturn(
    row.saleId,
    req.body.returnAmount ?? row.salesAmount,
    req.actor,
    req
  ));
}));

export const commissionPaymentRouter = Router();
commissionPaymentRouter.use(authenticate());

commissionPaymentRouter.get('/', asyncHandler(async (req, res) => {
  sendSuccess(res, commissionService.listPayments(req.query, req.actor));
}));

commissionPaymentRouter.post('/', asyncHandler(async (req, res) => {
  sendSuccess(res, commissionService.createPayment(req.body, req.actor, req), 201);
}));

commissionPaymentRouter.get('/:id', asyncHandler(async (req, res) => {
  sendSuccess(res, commissionService.getPayment(req.params.id, req.actor));
}));

commissionPaymentRouter.post('/:id/post', asyncHandler(async (req, res) => {
  sendSuccess(res, commissionService.postPayment(req.params.id, req.actor, req));
}));
