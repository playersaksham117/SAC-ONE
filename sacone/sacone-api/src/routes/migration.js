import { Router } from 'express';
import { asyncHandler, sendSuccess } from '../core/http.js';
import { authenticate } from '../middleware/auth.js';
import { migrationProvisionService } from '../services/migration-provision.js';

export const migrationRouter = Router();
migrationRouter.use(authenticate());

/** Architecture status + migration-ready module inventory */
migrationRouter.get('/architecture', asyncHandler(async (req, res) => {
  sendSuccess(res, migrationProvisionService.getArchitecture(req.actor));
}));

migrationRouter.get('/ping', asyncHandler(async (req, res) => {
  sendSuccess(res, await migrationProvisionService.ping(req.actor));
}));

migrationRouter.get('/logs', asyncHandler(async (req, res) => {
  sendSuccess(res, migrationProvisionService.listLogs(req.actor, req.query));
}));

migrationRouter.get('/checkpoints/:batchId', asyncHandler(async (req, res) => {
  sendSuccess(res, migrationProvisionService.listCheckpoints(req.params.batchId, req.actor));
}));

/** Plan a future batch — does not migrate data */
migrationRouter.post('/plan', asyncHandler(async (req, res) => {
  sendSuccess(res, migrationProvisionService.planBatch(req.body || {}, req.actor), 201);
}));

/** Dry-run validate a Phase 10 export envelope in memory */
migrationRouter.post('/dry-run/validate', asyncHandler(async (req, res) => {
  sendSuccess(res, migrationProvisionService.dryRunValidate(req.body || {}, req.actor));
}));

/** Dry-run validate an on-disk export folder (EXP-#####) */
migrationRouter.post('/dry-run/directory', asyncHandler(async (req, res) => {
  sendSuccess(res, migrationProvisionService.dryRunValidateDirectory(req.body || {}, req.actor));
}));

/**
 * Import JSON export → MongoDB.
 * Body: { exportDir, dryRun?: true, dropCollections?: false, datasets?: string[] }
 */
migrationRouter.post('/import', asyncHandler(async (req, res) => {
  sendSuccess(res, await migrationProvisionService.importFromExport(req.body || {}, req.actor));
}));
