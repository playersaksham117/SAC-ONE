import { Router } from 'express';
import { asyncHandler, sendSuccess } from '../core/http.js';
import { authenticate } from '../middleware/auth.js';
import { crmService } from '../services/crm.js';
import { attendanceService } from '../services/attendance.js';

/** CRM: leads, follow-ups and customer activity. */
export const crmRouter = Router();
crmRouter.use(authenticate());

crmRouter.get('/summary', asyncHandler(async (req, res) => sendSuccess(res, crmService.summary(req.actor))));
crmRouter.get('/users', asyncHandler(async (req, res) => sendSuccess(res, crmService.users(req.actor))));
crmRouter.get('/leads', asyncHandler(async (req, res) => sendSuccess(res, crmService.listLeads(req.query, req.actor))));
crmRouter.post('/leads', asyncHandler(async (req, res) => sendSuccess(res, crmService.createLead(req.body || {}, req.actor), 201)));
crmRouter.get('/leads/:id', asyncHandler(async (req, res) => sendSuccess(res, crmService.getLead(req.params.id, req.actor))));
crmRouter.put('/leads/:id', asyncHandler(async (req, res) => sendSuccess(res, crmService.updateLead(req.params.id, req.body || {}, req.actor))));
crmRouter.delete('/leads/:id', asyncHandler(async (req, res) => sendSuccess(res, crmService.deleteLead(req.params.id, req.actor))));
crmRouter.post('/leads/:id/convert', asyncHandler(async (req, res) => sendSuccess(res, crmService.convertLead(req.params.id, req.actor, req))));
crmRouter.post('/activities', asyncHandler(async (req, res) => sendSuccess(res, crmService.addActivity(req.body || {}, req.actor), 201)));
crmRouter.get('/follow-ups', asyncHandler(async (req, res) => sendSuccess(res, crmService.followUps(req.query, req.actor))));
crmRouter.post('/follow-ups', asyncHandler(async (req, res) => sendSuccess(res, crmService.addFollowUp(req.body || {}, req.actor), 201)));
crmRouter.post('/follow-ups/:id/done', asyncHandler(async (req, res) => sendSuccess(res, crmService.completeFollowUp(req.params.id, req.body || {}, req.actor))));
crmRouter.post('/follow-ups/:id/cancel', asyncHandler(async (req, res) => sendSuccess(res, crmService.cancelFollowUp(req.params.id, req.actor))));
crmRouter.get('/customers/:id/timeline', asyncHandler(async (req, res) => sendSuccess(res, crmService.customerTimeline(req.params.id, req.actor))));

/** Attendance of the firm's users. */
export const attendanceRouter = Router();
attendanceRouter.use(authenticate());

attendanceRouter.get('/me', asyncHandler(async (req, res) => sendSuccess(res, attendanceService.me(req.query, req.actor))));
attendanceRouter.post('/check-in', asyncHandler(async (req, res) => sendSuccess(res, attendanceService.checkIn(req.actor))));
attendanceRouter.post('/check-out', asyncHandler(async (req, res) => sendSuccess(res, attendanceService.checkOut(req.actor))));
attendanceRouter.get('/register', asyncHandler(async (req, res) => sendSuccess(res, attendanceService.register(req.query, req.actor))));
attendanceRouter.put('/register', asyncHandler(async (req, res) => sendSuccess(res, attendanceService.saveRegister(req.body || {}, req.actor))));
attendanceRouter.get('/summary', asyncHandler(async (req, res) => sendSuccess(res, attendanceService.summary(req.query, req.actor))));
attendanceRouter.get('/settings', asyncHandler(async (req, res) => sendSuccess(res, attendanceService.settings())));
attendanceRouter.put('/settings', asyncHandler(async (req, res) => sendSuccess(res, attendanceService.saveSettings(req.body || {}, req.actor))));
