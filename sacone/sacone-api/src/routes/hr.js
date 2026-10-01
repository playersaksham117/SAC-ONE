import { Router } from 'express';
import { asyncHandler, sendSuccess } from '../core/http.js';
import { authenticate } from '../middleware/auth.js';
import { hrService } from '../services/hr.js';

export const hrRouter = Router();
hrRouter.use(authenticate());

hrRouter.get('/bootstrap', asyncHandler(async (req, res) => {
  sendSuccess(res, hrService.getBootstrap(req.actor));
}));

hrRouter.get('/reports', asyncHandler(async (req, res) => {
  sendSuccess(res, hrService.getReports(req.query, req.actor));
}));

// Employees
hrRouter.get('/employees', asyncHandler(async (req, res) => {
  sendSuccess(res, hrService.listEmployees(req.query, req.actor));
}));

hrRouter.get('/employees/:id', asyncHandler(async (req, res) => {
  sendSuccess(res, hrService.getEmployee(req.params.id, req.actor));
}));

hrRouter.post('/employees', asyncHandler(async (req, res) => {
  sendSuccess(res, hrService.createEmployee(req.body, req.actor, req), 201);
}));

hrRouter.put('/employees/:id', asyncHandler(async (req, res) => {
  sendSuccess(res, hrService.updateEmployee(req.params.id, req.body, req.actor, req));
}));

// Attendance
hrRouter.get('/attendance', asyncHandler(async (req, res) => {
  sendSuccess(res, hrService.listAttendance(req.query, req.actor));
}));

hrRouter.get('/attendance/sheet', asyncHandler(async (req, res) => {
  if (!req.query.date) return res.status(400).json({ error: { message: 'date required' } });
  sendSuccess(res, hrService.getDailySheet(req.query.date, req.query, req.actor));
}));

hrRouter.post('/attendance', asyncHandler(async (req, res) => {
  sendSuccess(res, hrService.markAttendance(req.body, req.actor, req), 201);
}));

hrRouter.post('/attendance/bulk', asyncHandler(async (req, res) => {
  sendSuccess(res, hrService.bulkAttendance(req.body, req.actor, req), 201);
}));

// Advances
hrRouter.get('/advances', asyncHandler(async (req, res) => {
  sendSuccess(res, hrService.listAdvances(req.query, req.actor));
}));

hrRouter.post('/advances', asyncHandler(async (req, res) => {
  sendSuccess(res, hrService.createAdvance(req.body, req.actor, req), 201);
}));

hrRouter.post('/advances/:id/approve', asyncHandler(async (req, res) => {
  sendSuccess(res, hrService.approveAdvance(req.params.id, req.actor, req));
}));

hrRouter.post('/advances/:id/pay', asyncHandler(async (req, res) => {
  sendSuccess(res, hrService.payAdvance(req.params.id, req.body, req.actor, req));
}));

// Payroll
hrRouter.get('/payroll', asyncHandler(async (req, res) => {
  sendSuccess(res, hrService.listPayrollRuns(req.query, req.actor));
}));

hrRouter.get('/payroll/:id', asyncHandler(async (req, res) => {
  sendSuccess(res, hrService.getPayrollRun(req.params.id, req.actor));
}));

hrRouter.post('/payroll', asyncHandler(async (req, res) => {
  sendSuccess(res, hrService.createPayrollRun(req.body, req.actor, req), 201);
}));

hrRouter.post('/payroll/:id/calculate', asyncHandler(async (req, res) => {
  sendSuccess(res, hrService.calculatePayroll(req.params.id, req.actor, req));
}));

hrRouter.post('/payroll/:id/submit', asyncHandler(async (req, res) => {
  sendSuccess(res, hrService.submitPayroll(req.params.id, req.actor, req));
}));

hrRouter.post('/payroll/:id/approve', asyncHandler(async (req, res) => {
  sendSuccess(res, hrService.approvePayroll(req.params.id, req.actor, req));
}));

hrRouter.post('/payroll/:id/reject', asyncHandler(async (req, res) => {
  sendSuccess(res, hrService.rejectPayroll(req.params.id, req.body, req.actor, req));
}));

hrRouter.post('/payroll/lines/:lineId/pay', asyncHandler(async (req, res) => {
  sendSuccess(res, hrService.payPayrollLine(req.params.lineId, req.body, req.actor, req));
}));

hrRouter.post('/payroll/lines/:lineId/adjustments', asyncHandler(async (req, res) => {
  sendSuccess(res, hrService.addAdjustment(req.params.lineId, req.body, req.actor, req), 201);
}));
