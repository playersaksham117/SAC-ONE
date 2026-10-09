/**
 * JSON → MongoDB importer.
 * Validates Phase 10 export envelopes, writes with preserve_uuid, records checkpoints.
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { AppError } from '../core/http.js';
import { generateId, nowIso } from '../core/utils.js';
import { config } from '../config/index.js';
import { connectMongo, closeMongo, isMongoConfigured, getMongoConfigStatus } from '../database/mongo.js';
import { currentFirmId } from '../database/context.js';
import { firmMongoDatabase } from '../cloud/mongo-export.js';
import { FirmRepository } from '../repositories/sqlite/firms.js';
import {
  ID_STRATEGY,
  JSON_TO_MONGO_MAP,
  MONGO_COLLECTION_ORDER,
  listMappedIndexes,
  toMongoDocument,
} from './mapping.js';
import { dryRunValidateDataset, validateExportEnvelope } from './validate.js';
import { COMPLETE_EXPORT_ORDER, EXPORT_DATASETS } from '../core/export-datasets.js';
import { repos } from '../repositories/index.js';

function checksumRows(rows) {
  return crypto.createHash('sha256').update(JSON.stringify(rows)).digest('hex').slice(0, 32);
}

function loadEnvelopeFromFile(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(raw);
}

/**
 * Resolve export directory path: absolute, or relative to process cwd / sacone-api.
 */
export function resolveExportDir(exportNumberOrPath) {
  if (path.isAbsolute(exportNumberOrPath) && fs.existsSync(exportNumberOrPath)) {
    return exportNumberOrPath;
  }
  const root = path.isAbsolute(config.exportDir)
    ? config.exportDir
    : path.resolve(process.cwd(), config.exportDir);
  const candidate = path.join(root, exportNumberOrPath);
  if (fs.existsSync(candidate)) return candidate;
  throw new AppError(`Export directory not found: ${exportNumberOrPath}`, 404, 'EXPORT_DIR_NOT_FOUND');
}

export function loadExportBatch(exportDir) {
  const dir = resolveExportDir(exportDir);
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json'));
  const envelopes = {};

  const completePath = path.join(dir, 'complete_system.json');
  if (fs.existsSync(completePath)) {
    envelopes.complete = loadEnvelopeFromFile(completePath);
  }

  for (const [key, def] of Object.entries(EXPORT_DATASETS)) {
    const filePath = path.join(dir, def.filename);
    if (fs.existsSync(filePath)) {
      envelopes[key] = loadEnvelopeFromFile(filePath);
    }
  }

  return { dir, files, envelopes };
}

/**
 * Dry-run validate all dataset files in an export folder.
 */
export function dryRunValidateExportDir(exportDir) {
  const { dir, envelopes } = loadExportBatch(exportDir);
  const reports = {};
  const errors = [];

  for (const key of Object.keys(JSON_TO_MONGO_MAP)) {
    const envelope = envelopes[key] || (envelopes.complete ? {
      ...envelopes.complete,
      data: pickDataKeys(envelopes.complete.data, Object.keys(JSON_TO_MONGO_MAP[key].collections)),
      meta: { ...envelopes.complete.meta, dataset: key, datasets: [key] },
    } : null);

    if (!envelope) {
      reports[key] = { ok: true, skipped: true, reason: 'file not present in export' };
      continue;
    }
    const report = dryRunValidateDataset(key, envelope);
    reports[key] = report;
    if (!report.ok) errors.push(...report.errors.map((e) => `${key}: ${e}`));
  }

  return {
    ok: errors.length === 0,
    exportDir: dir,
    reports,
    errors,
    idStrategy: ID_STRATEGY.name,
  };
}

function pickDataKeys(data, keys) {
  const out = {};
  for (const key of keys) {
    if (data?.[key]) out[key] = data[key];
  }
  return out;
}

/**
 * Import validated export JSON into MongoDB.
 * @param {object} options
 * @param {string} options.exportDir - EXP-##### folder or absolute path
 * @param {boolean} [options.dryRun=true]
 * @param {boolean} [options.dropCollections=false] - dangerous; only for empty target DBs
 * @param {string|null} [options.createdBy]
 */
export async function importJsonToMongo({
  exportDir,
  dryRun = true,
  dropCollections = false,
  createdBy = null,
  datasets = null,
} = {}) {
  const batchId = generateId();
  const startedAt = nowIso();
  const logRepo = repos.migrationLogs;

  const validation = dryRunValidateExportDir(exportDir);
  const log = logRepo.create({
    batchId,
    direction: dryRun ? 'dry_run' : 'json_to_mongo',
    status: 'running',
    phase: dryRun ? 'validation' : 'import',
    collections: MONGO_COLLECTION_ORDER,
    idStrategy: ID_STRATEGY.name,
    validationReport: validation,
    canRollback: !dryRun,
    notes: dryRun
      ? 'Dry-run validation of export directory'
      : 'JSON → MongoDB write import',
    createdBy,
    startedAt,
  });

  if (!validation.ok) {
    logRepo.updateStatus(log.id, {
      status: 'failed',
      phase: 'validation',
      recordsFailed: validation.errors.length,
      errorMessage: validation.errors.slice(0, 30).join('; '),
      completedAt: nowIso(),
    });
    return {
      ok: false,
      batchId,
      dryRun,
      validation,
      message: 'Validation failed — no Mongo writes performed',
    };
  }

  if (dryRun) {
    logRepo.updateStatus(log.id, {
      status: 'completed',
      phase: 'validation',
      recordsProcessed: Object.values(validation.reports).reduce((s, r) => {
        if (!r.collections) return s;
        return s + Object.values(r.collections).reduce((a, c) => a + (c.count || 0), 0);
      }, 0),
      completedAt: nowIso(),
      outputSummary: { mode: 'dry_run', exportDir: validation.exportDir },
    });
    return {
      ok: true,
      batchId,
      dryRun: true,
      validation,
      mongo: getMongoConfigStatus(),
      message: 'Dry-run OK. Re-run with dryRun=false and MONGODB_URI set to import.',
    };
  }

  if (!isMongoConfigured()) {
    logRepo.updateStatus(log.id, {
      status: 'failed',
      errorMessage: 'MONGODB_URI not configured',
      completedAt: nowIso(),
    });
    throw new AppError('MONGODB_URI is required for write import', 400, 'MONGODB_URI_MISSING');
  }

  if (!config.mongodbWriteEnabled) {
    logRepo.updateStatus(log.id, {
      status: 'failed',
      errorMessage: 'MONGODB_WRITE_ENABLED is not true',
      completedAt: nowIso(),
    });
    throw new AppError(
      'Set MONGODB_WRITE_ENABLED=true to allow JSON → Mongo writes (safety gate).',
      400,
      'MONGODB_WRITE_DISABLED'
    );
  }

  const { envelopes } = loadExportBatch(exportDir);
  // JSON exports are made from the firm that is open; import into that firm's own Mongo database
  // (same layout as npm run cloud:export), never into another firm's.
  const { client, db: coreMongo } = await connectMongo();
  const firm = currentFirmId() ? new FirmRepository().findById(currentFirmId()) : null;
  const db = firm && !firm.isPrimary ? client.db(firmMongoDatabase(firm.id)) : coreMongo;
  const summary = { database: db.databaseName, collections: {}, inserted: 0, skipped: 0, failed: 0 };
  const datasetKeys = datasets?.length
    ? datasets
    : COMPLETE_EXPORT_ORDER.filter((k) => JSON_TO_MONGO_MAP[k]);

  try {
    if (dropCollections) {
      for (const name of MONGO_COLLECTION_ORDER) {
        await db.collection(name).drop().catch(() => {});
      }
    }

    // Ensure indexes
    for (const { collection, indexes } of listMappedIndexes()) {
      for (const idx of indexes) {
        await db.collection(collection).createIndex(idx.keys, {
          unique: Boolean(idx.unique),
          sparse: Boolean(idx.sparse),
        });
      }
    }

    for (const datasetKey of datasetKeys) {
      const map = JSON_TO_MONGO_MAP[datasetKey];
      if (!map) continue;

      let envelope = envelopes[datasetKey];
      if (!envelope && envelopes.complete) {
        envelope = {
          ...envelopes.complete,
          data: pickDataKeys(envelopes.complete.data, Object.keys(map.collections)),
        };
      }
      if (!envelope) continue;

      const envCheck = validateExportEnvelope(envelope);
      if (!envCheck.ok) {
        throw new AppError(`Invalid envelope for ${datasetKey}: ${envCheck.errors.join(', ')}`, 400);
      }

      for (const [dataKey, spec] of Object.entries(map.collections)) {
        const rows = envelope.data?.[dataKey] || [];
        const collection = db.collection(spec.collection);
        let inserted = 0;
        let skipped = 0;
        let lastId = null;

        for (const row of rows) {
          const doc = toMongoDocument(row, { idField: spec.idField || 'id' });
          lastId = doc._id;
          try {
            const existing = await collection.findOne({ _id: doc._id });
            if (existing) {
              skipped += 1;
              continue;
            }
            await collection.insertOne(doc);
            inserted += 1;
          } catch (err) {
            summary.failed += 1;
            throw new AppError(
              `Import failed on ${spec.collection}/${doc._id}: ${err.message}`,
              500,
              'MONGO_IMPORT_FAILED'
            );
          }
        }

        summary.collections[spec.collection] = {
          sourceKey: dataKey,
          count: rows.length,
          inserted,
          skipped,
          checksum: checksumRows(rows),
        };
        summary.inserted += inserted;
        summary.skipped += skipped;

        logRepo.upsertCheckpoint({
          batchId,
          collectionName: spec.collection,
          lastSourceId: lastId,
          recordsDone: inserted + skipped,
          status: 'done',
          checksum: checksumRows(rows),
        });
      }
    }

    logRepo.updateStatus(log.id, {
      status: 'completed',
      phase: 'import',
      recordsProcessed: summary.inserted + summary.skipped,
      recordsFailed: summary.failed,
      outputSummary: summary,
      completedAt: nowIso(),
    });

    return {
      ok: true,
      batchId,
      dryRun: false,
      validation,
      summary,
      mongo: getMongoConfigStatus(),
      message: 'Import completed. Keep DATABASE_DRIVER=sqlite until dual-read verification.',
    };
  } catch (err) {
    logRepo.updateStatus(log.id, {
      status: 'failed',
      phase: 'import',
      errorMessage: err.message,
      outputSummary: summary,
      completedAt: nowIso(),
    });
    throw err;
  } finally {
    // Keep connection pooled for process; CLI can close explicitly
    if (process.env.SACONE_CLOSE_MONGO_AFTER_IMPORT === '1') {
      await closeMongo();
    }
  }
}
