import { getDatabase } from '../../database/connection.js';
import { generateId, nowIso, toJson, parseJson } from '../../core/utils.js';

export class MigrationLogRepository {
  create(entry) {
    const id = generateId();
    const now = nowIso();
    getDatabase().prepare(`
      INSERT INTO migration_logs (
        id, batch_id, direction, status, phase, collections_json,
        records_processed, records_failed, id_strategy, validation_report_json,
        output_summary_json, rollback_of_batch_id, can_rollback, error_message,
        notes, started_at, completed_at, created_by, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      entry.batchId,
      entry.direction,
      entry.status || 'planned',
      entry.phase || null,
      toJson(entry.collections || []),
      entry.recordsProcessed || 0,
      entry.recordsFailed || 0,
      entry.idStrategy || 'preserve_uuid',
      entry.validationReport ? toJson(entry.validationReport) : null,
      entry.outputSummary ? toJson(entry.outputSummary) : null,
      entry.rollbackOfBatchId || null,
      entry.canRollback ? 1 : 0,
      entry.errorMessage || null,
      entry.notes || null,
      entry.startedAt || null,
      entry.completedAt || null,
      entry.createdBy || null,
      now
    );
    return this.findById(id);
  }

  updateStatus(id, patch) {
    const existing = this.findById(id);
    if (!existing) return null;
    getDatabase().prepare(`
      UPDATE migration_logs SET
        status = ?,
        phase = ?,
        records_processed = ?,
        records_failed = ?,
        validation_report_json = ?,
        output_summary_json = ?,
        can_rollback = ?,
        error_message = ?,
        notes = ?,
        started_at = ?,
        completed_at = ?
      WHERE id = ?
    `).run(
      patch.status ?? existing.status,
      patch.phase !== undefined ? patch.phase : existing.phase,
      patch.recordsProcessed ?? existing.recordsProcessed,
      patch.recordsFailed ?? existing.recordsFailed,
      patch.validationReport ? toJson(patch.validationReport) : (existing.validationReport ? toJson(existing.validationReport) : null),
      patch.outputSummary ? toJson(patch.outputSummary) : (existing.outputSummary ? toJson(existing.outputSummary) : null),
      patch.canRollback !== undefined ? (patch.canRollback ? 1 : 0) : (existing.canRollback ? 1 : 0),
      patch.errorMessage !== undefined ? patch.errorMessage : existing.errorMessage,
      patch.notes !== undefined ? patch.notes : existing.notes,
      patch.startedAt !== undefined ? patch.startedAt : existing.startedAt,
      patch.completedAt !== undefined ? patch.completedAt : existing.completedAt,
      id
    );
    return this.findById(id);
  }

  findById(id) {
    return mapLog(getDatabase().prepare('SELECT * FROM migration_logs WHERE id = ?').get(id));
  }

  findByBatchId(batchId) {
    return getDatabase().prepare(`
      SELECT * FROM migration_logs WHERE batch_id = ? ORDER BY created_at ASC
    `).all(batchId).map(mapLog);
  }

  list({ limit = 50, offset = 0 } = {}) {
    return getDatabase().prepare(`
      SELECT * FROM migration_logs ORDER BY created_at DESC LIMIT ? OFFSET ?
    `).all(limit, offset).map(mapLog);
  }

  upsertCheckpoint({ batchId, collectionName, lastSourceId, recordsDone, status, checksum }) {
    const db = getDatabase();
    const existing = db.prepare(`
      SELECT id FROM migration_checkpoints WHERE batch_id = ? AND collection_name = ?
    `).get(batchId, collectionName);
    const now = nowIso();
    if (existing) {
      db.prepare(`
        UPDATE migration_checkpoints SET
          last_source_id = ?, records_done = ?, status = ?, checksum = ?, updated_at = ?
        WHERE id = ?
      `).run(lastSourceId || null, recordsDone || 0, status || 'in_progress', checksum || null, now, existing.id);
      return existing.id;
    }
    const id = generateId();
    db.prepare(`
      INSERT INTO migration_checkpoints (
        id, batch_id, collection_name, last_source_id, records_done, status, checksum, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, batchId, collectionName, lastSourceId || null, recordsDone || 0, status || 'pending', checksum || null, now);
    return id;
  }

  listCheckpoints(batchId) {
    return getDatabase().prepare(`
      SELECT * FROM migration_checkpoints WHERE batch_id = ? ORDER BY collection_name
    `).all(batchId).map((row) => ({
      id: row.id,
      batchId: row.batch_id,
      collectionName: row.collection_name,
      lastSourceId: row.last_source_id,
      recordsDone: row.records_done,
      status: row.status,
      checksum: row.checksum,
      updatedAt: row.updated_at,
    }));
  }
}

function mapLog(row) {
  if (!row) return null;
  return {
    id: row.id,
    batchId: row.batch_id,
    direction: row.direction,
    status: row.status,
    phase: row.phase,
    collections: parseJson(row.collections_json, []),
    recordsProcessed: row.records_processed,
    recordsFailed: row.records_failed,
    idStrategy: row.id_strategy,
    validationReport: parseJson(row.validation_report_json, null),
    outputSummary: parseJson(row.output_summary_json, null),
    rollbackOfBatchId: row.rollback_of_batch_id,
    canRollback: Boolean(row.can_rollback),
    errorMessage: row.error_message,
    notes: row.notes,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    createdBy: row.created_by,
    createdAt: row.created_at,
  };
}
