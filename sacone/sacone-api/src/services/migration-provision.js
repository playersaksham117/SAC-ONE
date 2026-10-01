import { generateId, nowIso } from '../core/utils.js';
import { AppError } from '../core/http.js';
import { authService } from './index.js';
import { config } from '../config/index.js';
import { repos, listMigrationReadyModules, REPOSITORY_CONTRACTS } from '../repositories/index.js';
import { ID_STRATEGY, MONGO_COLLECTION_ORDER, JSON_TO_MONGO_MAP } from '../migration/mapping.js';
import { dryRunValidateDataset, validateExportEnvelope } from '../migration/validate.js';
import {
  dryRunValidateExportDir,
  importJsonToMongo,
  resolveExportDir,
} from '../migration/importer.js';
import { getMongoConfigStatus, pingMongo } from '../database/mongo.js';

/**
 * Migration service — plan, dry-run, and optional JSON → Mongo import.
 * Application runtime stays on SQLite until DATABASE_DRIVER cutover.
 */
export class MigrationProvisionService {
  getArchitecture(actor) {
    authService.checkPermission(actor.permissions, 'core.system_settings.view');
    const mongo = getMongoConfigStatus();
    return {
      runtimeDriver: repos.driver,
      pattern: [
        'Application',
        'Service Layer',
        'Repository Interface (contracts)',
        'SQLite Repository (active)',
        'MongoDB Repository (future runtime)',
        'JSON interchange (Phase 10 exports)',
      ],
      pipeline: [
        '1. SQLite (system of record)',
        '2. POST /api/exports complete → data/exports/EXP-#####/*.json',
        '3. POST /api/migration/import dryRun=true → validate',
        '4. POST /api/migration/import dryRun=false → Mongo write (MONGODB_URI + WRITE_ENABLED)',
        '5. Dual-read verification (manual)',
        '6. DATABASE_DRIVER=mongodb only after repos are fully implemented',
      ],
      idStrategy: ID_STRATEGY,
      collectionOrder: MONGO_COLLECTION_ORDER,
      jsonToMongoDatasets: Object.keys(JSON_TO_MONGO_MAP),
      modules: listMigrationReadyModules(),
      contracts: REPOSITORY_CONTRACTS,
      mongo,
      rollback: {
        principle: 'Keep SQLite as system of record until Mongo cutover is verified',
        steps: [
          'Tag migration batch_id and retain Phase 10 JSON snapshots',
          'Import to Mongo in dry_run then write mode with checkpoints',
          'Dual-run read verification before switching DATABASE_DRIVER',
          'On failure: mark batch failed/rolled_back; do not delete SQLite DB',
          'Mongo data for a failed batch may be dropped — SQLite untouched',
        ],
      },
      status: {
        productionMigrationEnabled: Boolean(mongo.configured && mongo.writeEnabled),
        mongodbDriverEnabled: config.databaseDriver === 'mongodb',
        jsonExportReady: true,
        jsonToMongoImporterReady: true,
        runtimeReposOnMongo: false,
        message: mongo.configured
          ? (mongo.writeEnabled
            ? 'Mongo URI configured and write gate open — import allowed. Keep DATABASE_DRIVER=sqlite.'
            : 'Mongo URI configured. Set MONGODB_WRITE_ENABLED=true to allow imports.')
          : 'Set MONGODB_URI to enable JSON → Mongo import. Continue using SQLite.',
      },
    };
  }

  async ping(actor) {
    authService.checkPermission(actor.permissions, 'core.system_settings.view');
    return pingMongo();
  }

  listLogs(actor, { limit = 50 } = {}) {
    authService.checkPermission(actor.permissions, 'core.system_settings.view');
    return repos.migrationLogs.list({ limit: parseInt(limit, 10) || 50 });
  }

  listCheckpoints(batchId, actor) {
    authService.checkPermission(actor.permissions, 'core.system_settings.view');
    if (!batchId) throw new AppError('batchId is required', 400);
    return repos.migrationLogs.listCheckpoints(batchId);
  }

  planBatch({ direction = 'dry_run', collections = [], notes } = {}, actor) {
    authService.checkPermission(actor.permissions, 'core.system_settings.edit');
    if (!['dry_run', 'json_to_mongo', 'sqlite_to_mongo'].includes(direction)) {
      throw new AppError('Invalid direction for provision planning', 400);
    }

    const batchId = generateId();
    const log = repos.migrationLogs.create({
      batchId,
      direction,
      status: 'planned',
      phase: 'provision',
      collections: collections.length ? collections : MONGO_COLLECTION_ORDER,
      idStrategy: ID_STRATEGY.name,
      canRollback: true,
      notes: notes || 'Migration plan — no production data migrated yet',
      createdBy: actor.user.id,
      startedAt: null,
      completedAt: null,
    });

    return {
      batchId,
      log,
      message: 'Migration batch planned. No data was migrated.',
    };
  }

  dryRunValidate({ datasetKey, envelope } = {}, actor) {
    authService.checkPermission(actor.permissions, 'core.system_settings.view');
    if (!datasetKey) throw new AppError('datasetKey is required', 400);
    if (!envelope) throw new AppError('envelope is required', 400);

    const report = dryRunValidateDataset(datasetKey, envelope);
    const batchId = generateId();
    const log = repos.migrationLogs.create({
      batchId,
      direction: 'dry_run',
      status: report.ok ? 'completed' : 'failed',
      phase: 'validation',
      collections: Object.keys(report.collections || {}),
      recordsProcessed: Object.values(report.collections || {}).reduce((s, c) => s + (c.count || 0), 0),
      recordsFailed: report.errors?.length || 0,
      idStrategy: ID_STRATEGY.name,
      validationReport: report,
      canRollback: false,
      notes: 'Dry-run validation only',
      createdBy: actor.user.id,
      startedAt: nowIso(),
      completedAt: nowIso(),
      errorMessage: report.ok ? null : report.errors.slice(0, 20).join('; '),
    });

    return { batchId, report, log };
  }

  dryRunValidateDirectory({ exportDir } = {}, actor) {
    authService.checkPermission(actor.permissions, 'core.system_settings.view');
    if (!exportDir) throw new AppError('exportDir is required (e.g. EXP-00001)', 400);
    const dir = resolveExportDir(exportDir);
    const report = dryRunValidateExportDir(dir);
    const batchId = generateId();
    repos.migrationLogs.create({
      batchId,
      direction: 'dry_run',
      status: report.ok ? 'completed' : 'failed',
      phase: 'validation',
      collections: MONGO_COLLECTION_ORDER,
      idStrategy: ID_STRATEGY.name,
      validationReport: report,
      canRollback: false,
      notes: `Dry-run validate directory ${dir}`,
      createdBy: actor.user.id,
      startedAt: nowIso(),
      completedAt: nowIso(),
      errorMessage: report.ok ? null : report.errors.slice(0, 20).join('; '),
    });
    return { batchId, report };
  }

  async importFromExport({ exportDir, dryRun = true, dropCollections = false, datasets } = {}, actor) {
    authService.checkPermission(actor.permissions, 'core.system_settings.edit');
    if (!exportDir) throw new AppError('exportDir is required (e.g. EXP-00001)', 400);
    return importJsonToMongo({
      exportDir,
      dryRun: dryRun !== false && dryRun !== 'false',
      dropCollections: dropCollections === true || dropCollections === 'true',
      datasets: Array.isArray(datasets) ? datasets : null,
      createdBy: actor.user.id,
    });
  }

  validateEnvelopeOnly(envelope, actor) {
    authService.checkPermission(actor.permissions, 'core.system_settings.view');
    return validateExportEnvelope(envelope);
  }
}

export const migrationProvisionService = new MigrationProvisionService();
