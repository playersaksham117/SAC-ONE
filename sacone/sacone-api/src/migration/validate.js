/**
 * Validation strategy for future JSON → MongoDB imports (Phase 11).
 * Dry-run safe — does not write to MongoDB.
 */

import { EXPORT_VERSION } from '../core/export-datasets.js';
import { JSON_TO_MONGO_MAP, toMongoDocument } from './mapping.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(value) {
  return typeof value === 'string' && UUID_RE.test(value);
}

export function validateExportEnvelope(envelope) {
  const errors = [];
  if (!envelope || typeof envelope !== 'object') {
    return { ok: false, errors: ['Envelope must be an object'] };
  }
  if (envelope.export_version !== EXPORT_VERSION) {
    errors.push(`Unsupported export_version: ${envelope.export_version}`);
  }
  if (!envelope.company_id || !isUuid(envelope.company_id)) {
    errors.push('company_id must be a UUID');
  }
  if (!envelope.meta?.import_ready) {
    errors.push('meta.import_ready must be true');
  }
  if (!envelope.data || typeof envelope.data !== 'object') {
    errors.push('data object required');
  }
  const blob = JSON.stringify(envelope).toLowerCase();
  if (blob.includes('password_hash') || blob.includes('sk_live_')) {
    errors.push('Secrets detected in payload');
  }
  return { ok: errors.length === 0, errors };
}

export function validateCollectionRows(collectionKey, rows) {
  const errors = [];
  const ids = new Set();
  if (!Array.isArray(rows)) {
    return { ok: false, errors: [`${collectionKey} must be an array`], count: 0 };
  }
  rows.forEach((row, index) => {
    const id = row.id || row._id;
    if (!isUuid(id)) errors.push(`${collectionKey}[${index}]: invalid UUID id`);
    if (ids.has(id)) errors.push(`${collectionKey}[${index}]: duplicate id ${id}`);
    ids.add(id);
    try {
      toMongoDocument(row);
    } catch (err) {
      errors.push(`${collectionKey}[${index}]: ${err.message}`);
    }
  });
  return { ok: errors.length === 0, errors, count: rows.length, uniqueIds: ids.size };
}

/**
 * Dry-run validation of a Phase 10 dataset file payload against mapping rules.
 */
export function dryRunValidateDataset(datasetKey, envelope) {
  const map = JSON_TO_MONGO_MAP[datasetKey];
  const envelopeCheck = validateExportEnvelope(envelope);
  if (!map) {
    return {
      ok: false,
      datasetKey,
      errors: [`No MongoDB mapping for dataset ${datasetKey}`, ...envelopeCheck.errors],
    };
  }
  if (!envelopeCheck.ok) {
    return { ok: false, datasetKey, errors: envelopeCheck.errors };
  }

  const collectionReports = {};
  const allErrors = [];
  for (const [dataKey, spec] of Object.entries(map.collections)) {
    const rows = envelope.data?.[dataKey] || [];
    const report = validateCollectionRows(spec.collection, rows);
    collectionReports[spec.collection] = {
      ...report,
      sourceKey: dataKey,
      indexes: spec.indexes || [],
      notes: spec.notes || null,
    };
    allErrors.push(...report.errors);
  }

  return {
    ok: allErrors.length === 0,
    datasetKey,
    exportFile: map.exportFile,
    collections: collectionReports,
    errors: allErrors,
    idStrategy: 'preserve_uuid',
  };
}
