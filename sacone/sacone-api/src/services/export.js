import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { AppError } from '../core/http.js';
import { config } from '../config/index.js';
import { nowIso } from '../core/utils.js';
import {
  EXPORT_VERSION,
  EXPORT_DATASETS,
  COMPLETE_EXPORT_ORDER,
} from '../core/export-datasets.js';
import { repos } from '../repositories/index.js';
import { authService } from './index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataRepo = repos.exportData;
const logRepo = repos.exportLogs;

function resolveExportRoot() {
  const configured = config.exportDir || './data/exports';
  if (path.isAbsolute(configured)) return configured;
  return path.resolve(path.join(__dirname, '../..'), configured);
}

function countRecords(data) {
  return Object.values(data).reduce((sum, value) => {
    if (Array.isArray(value)) return sum + value.length;
    return sum;
  }, 0);
}

/**
 * Validate export envelope is valid JSON and structurally sound.
 * Throws AppError on failure. Does not mutate DB.
 */
export function validateExportEnvelope(envelope, datasetKey) {
  let serialized;
  try {
    serialized = JSON.stringify(envelope);
    JSON.parse(serialized);
  } catch (err) {
    throw new AppError(`JSON validation failed: ${err.message}`, 500, 'EXPORT_INVALID_JSON');
  }

  if (!envelope || typeof envelope !== 'object' || Array.isArray(envelope)) {
    throw new AppError('Export envelope must be an object', 500, 'EXPORT_INVALID_SCHEMA');
  }
  if (envelope.export_version !== EXPORT_VERSION) {
    throw new AppError('Invalid export_version', 500, 'EXPORT_INVALID_SCHEMA');
  }
  if (!envelope.exported_at || Number.isNaN(Date.parse(envelope.exported_at))) {
    throw new AppError('Invalid exported_at', 500, 'EXPORT_INVALID_SCHEMA');
  }
  if (!envelope.company_id) {
    throw new AppError('company_id is required', 500, 'EXPORT_INVALID_SCHEMA');
  }
  if (!envelope.data || typeof envelope.data !== 'object' || Array.isArray(envelope.data)) {
    throw new AppError('data must be an object', 500, 'EXPORT_INVALID_SCHEMA');
  }
  if (!envelope.meta || typeof envelope.meta !== 'object') {
    throw new AppError('meta (import-ready metadata) is required', 500, 'EXPORT_INVALID_SCHEMA');
  }
  if (envelope.meta.import_ready !== true) {
    throw new AppError('meta.import_ready must be true for valid exports', 500, 'EXPORT_INVALID_SCHEMA');
  }

  // Ensure no secrets leaked into payload
  const blob = serialized.toLowerCase();
  const forbidden = ['password_hash', '"password"', 'sk_live_', 'key_hash', 'session_token'];
  for (const token of forbidden) {
    if (blob.includes(token)) {
      throw new AppError(`Export blocked: sensitive field detected (${token})`, 500, 'EXPORT_SECRET_LEAK');
    }
  }

  if (datasetKey && datasetKey !== 'complete') {
    const def = EXPORT_DATASETS[datasetKey];
    if (!def) throw new AppError(`Unknown dataset: ${datasetKey}`, 400);
  }

  return {
    valid: true,
    bytes: Buffer.byteLength(serialized, 'utf8'),
    recordCount: countRecords(envelope.data),
  };
}

function buildMeta({ dataset, datasets, dateFrom, dateTo, recordCount, relationships, schema }) {
  return {
    import_ready: true,
    schema: schema || 'sacone.export.v1',
    dataset: dataset || null,
    datasets: datasets || (dataset ? [dataset] : []),
    record_count: recordCount,
    date_from: dateFrom || null,
    date_to: dateTo || null,
    uuid_relationships_preserved: true,
    source: 'sqlite',
    read_only_export: true,
    relationships: relationships || [],
    notes: 'Safe for import tooling. Passwords and API secrets are excluded.',
  };
}

function buildEnvelope(data, metaExtras = {}) {
  const companyId = dataRepo.getCompanyId();
  if (!companyId) throw new AppError('Company record missing', 500);

  const recordCount = countRecords(data);
  const envelope = {
    export_version: EXPORT_VERSION,
    exported_at: nowIso(),
    company_id: companyId,
    meta: buildMeta({ ...metaExtras, recordCount }),
    data,
  };

  validateExportEnvelope(envelope, metaExtras.dataset || 'complete');
  return envelope;
}

function fetchDataset(key, { dateFrom, dateTo } = {}) {
  switch (key) {
    case 'company':
      return dataRepo.fetchCompany();
    case 'products':
      return dataRepo.fetchProducts();
    case 'customers':
      return dataRepo.fetchCustomers();
    case 'suppliers':
      return dataRepo.fetchSuppliers();
    case 'warehouses':
      return dataRepo.fetchWarehouses();
    case 'inventory_movements':
      return dataRepo.fetchInventoryMovements({ dateFrom, dateTo });
    case 'stock_levels':
      return dataRepo.fetchStockLevels();
    case 'sales':
      return dataRepo.fetchSales({ dateFrom, dateTo });
    case 'sales_items':
      return dataRepo.fetchSalesItems({ dateFrom, dateTo });
    case 'payments':
      return dataRepo.fetchPayments({ dateFrom, dateTo });
    case 'supplier_bills':
      return dataRepo.fetchSupplierBills({ dateFrom, dateTo });
    case 'supplier_payments':
      return dataRepo.fetchSupplierPayments({ dateFrom, dateTo });
    case 'purchase_orders':
      return dataRepo.fetchPurchaseOrders({ dateFrom, dateTo });
    case 'system_settings':
      return dataRepo.fetchSystemSettings();
    case 'users':
      return dataRepo.fetchUsers();
    default:
      throw new AppError(`Unknown dataset: ${key}`, 400);
  }
}

export class ExportService {
  listDatasets(actor) {
    authService.checkPermission(actor.permissions, 'core.data_export.view');
    return Object.entries(EXPORT_DATASETS).map(([key, def]) => ({
      key,
      filename: def.filename,
      schema: def.schema,
      supportsDateRange: def.supportsDateRange,
      description: def.description,
      relationships: def.relationships,
    }));
  }

  listLogs(actor, { limit = 50 } = {}) {
    authService.checkPermission(actor.permissions, 'core.data_export.view');
    return logRepo.list({ limit: parseInt(limit, 10) || 50 });
  }

  getExport(id, actor) {
    authService.checkPermission(actor.permissions, 'core.data_export.view');
    const row = logRepo.findById(id);
    if (!row) throw new AppError('Export not found', 404);
    return row;
  }

  /**
   * Run export. Writes JSON files under data/exports/{exportNumber}/.
   * Never modifies SQLite business tables.
   */
  runExport({ datasets, complete = false, dateFrom = null, dateTo = null } = {}, actor) {
    authService.checkPermission(actor.permissions, 'core.data_export.create');

    let keys;
    if (complete) {
      keys = [...COMPLETE_EXPORT_ORDER];
    } else if (Array.isArray(datasets) && datasets.length) {
      keys = datasets;
      for (const key of keys) {
        if (!EXPORT_DATASETS[key]) throw new AppError(`Unknown dataset: ${key}`, 400);
      }
    } else {
      throw new AppError('Provide datasets[] or complete=true', 400);
    }

    if ((dateFrom && !dateTo) || (!dateFrom && dateTo)) {
      throw new AppError('Both dateFrom and dateTo are required for date-range export', 400);
    }

    const exportNumber = logRepo.nextNumber();
    const root = resolveExportRoot();
    const outputDir = path.join(root, exportNumber);
    fs.mkdirSync(outputDir, { recursive: true });

    const files = [];
    let totalRecords = 0;
    let validationOk = true;

    try {
      if (complete) {
        // One combined system export + individual files for import tooling
        const combinedData = {};
        const allRelationships = [];
        for (const key of keys) {
          const def = EXPORT_DATASETS[key];
          const supportsRange = def.supportsDateRange;
          const chunk = fetchDataset(key, {
            dateFrom: supportsRange ? dateFrom : null,
            dateTo: supportsRange ? dateTo : null,
          });
          Object.assign(combinedData, chunk);
          allRelationships.push(...def.relationships.map((r) => `${key}: ${r}`));

          const single = buildEnvelope(chunk, {
            dataset: key,
            datasets: [key],
            dateFrom: supportsRange ? dateFrom : null,
            dateTo: supportsRange ? dateTo : null,
            relationships: def.relationships,
            schema: def.schema,
          });
          const filePath = path.join(outputDir, def.filename);
          fs.writeFileSync(filePath, `${JSON.stringify(single, null, 2)}\n`, 'utf8');
          const v = validateExportEnvelope(single, key);
          files.push({
            filename: def.filename,
            dataset: key,
            recordCount: v.recordCount,
            bytes: v.bytes,
            schema: def.schema,
          });
          totalRecords += v.recordCount;
        }

        const completeEnvelope = buildEnvelope(combinedData, {
          dataset: 'complete',
          datasets: keys,
          dateFrom,
          dateTo,
          relationships: allRelationships,
          schema: 'sacone.complete.v1',
        });
        const completeName = 'complete_system.json';
        fs.writeFileSync(
          path.join(outputDir, completeName),
          `${JSON.stringify(completeEnvelope, null, 2)}\n`,
          'utf8'
        );
        const cv = validateExportEnvelope(completeEnvelope, 'complete');
        files.unshift({
          filename: completeName,
          dataset: 'complete',
          recordCount: cv.recordCount,
          bytes: cv.bytes,
          schema: 'sacone.complete.v1',
        });
        totalRecords = cv.recordCount;
      } else {
        for (const key of keys) {
          const def = EXPORT_DATASETS[key];
          const supportsRange = def.supportsDateRange;
          const chunk = fetchDataset(key, {
            dateFrom: supportsRange ? dateFrom : null,
            dateTo: supportsRange ? dateTo : null,
          });
          const envelope = buildEnvelope(chunk, {
            dataset: key,
            datasets: [key],
            dateFrom: supportsRange ? dateFrom : null,
            dateTo: supportsRange ? dateTo : null,
            relationships: def.relationships,
            schema: def.schema,
          });
          const filePath = path.join(outputDir, def.filename);
          fs.writeFileSync(filePath, `${JSON.stringify(envelope, null, 2)}\n`, 'utf8');
          const v = validateExportEnvelope(envelope, key);
          files.push({
            filename: def.filename,
            dataset: key,
            recordCount: v.recordCount,
            bytes: v.bytes,
            schema: def.schema,
          });
          totalRecords += v.recordCount;
        }
      }

      const log = logRepo.create({
        exportNumber,
        exportType: complete ? 'complete' : 'dataset',
        datasets: keys,
        dateFrom,
        dateTo,
        status: 'completed',
        fileCount: files.length,
        recordCount: totalRecords,
        outputDir,
        files,
        validationOk,
        createdBy: actor.user.id,
      });

      return {
        ...log,
        message: 'Export completed. SQLite business data was not modified.',
      };
    } catch (err) {
      validationOk = false;
      logRepo.create({
        exportNumber,
        exportType: complete ? 'complete' : 'dataset',
        datasets: keys,
        dateFrom,
        dateTo,
        status: 'failed',
        fileCount: files.length,
        recordCount: totalRecords,
        outputDir,
        files,
        validationOk: false,
        errorMessage: err.message,
        createdBy: actor.user.id,
      });
      throw err;
    }
  }

  getFilePath(exportId, filename, actor) {
    authService.checkPermission(actor.permissions, 'core.data_export.view');
    const row = logRepo.findById(exportId);
    if (!row) throw new AppError('Export not found', 404);
    if (!row.files?.some((f) => f.filename === filename)) {
      throw new AppError('File not part of this export', 404);
    }
    const full = path.join(row.outputDir, filename);
    const resolved = path.resolve(full);
    if (!resolved.startsWith(path.resolve(row.outputDir))) {
      throw new AppError('Invalid path', 400);
    }
    if (!fs.existsSync(resolved)) throw new AppError('Export file missing on disk', 404);
    return resolved;
  }
}

export const exportService = new ExportService();
