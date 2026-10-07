import { getCoreDatabase } from '../../database/connection.js';
import { nowIso } from '../../core/utils.js';

function mapFirm(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    isPrimary: Boolean(row.is_primary),
    isActive: Boolean(row.is_active),
    hasOwnFile: Boolean(row.db_file),
    firstFinancialYear: row.first_financial_year,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** The firm list, who may open which firm, and the firm/year chosen for each session (core file). */
export class FirmRepository {
  findAll({ includeInactive = false } = {}) {
    return getCoreDatabase().prepare(`
      SELECT * FROM firms ${includeInactive ? '' : 'WHERE is_active = 1'}
      ORDER BY is_primary DESC, created_at ASC
    `).all().map(mapFirm);
  }

  findById(id) {
    return mapFirm(getCoreDatabase().prepare('SELECT * FROM firms WHERE id = ?').get(id));
  }

  create({ id, name, dbFile, firstFinancialYear, createdBy }) {
    const now = nowIso();
    getCoreDatabase().prepare(`
      INSERT INTO firms (id, name, db_file, is_primary, is_active, first_financial_year, created_at, updated_at, created_by)
      VALUES (?, ?, ?, 0, 1, ?, ?, ?, ?)
    `).run(id, name, dbFile, firstFinancialYear, now, now, createdBy || null);
    return this.findById(id);
  }

  update(id, { name, isActive, firstFinancialYear }) {
    getCoreDatabase().prepare(`
      UPDATE firms SET
        name = COALESCE(?, name),
        is_active = COALESCE(?, is_active),
        first_financial_year = COALESCE(?, first_financial_year),
        updated_at = ?
      WHERE id = ?
    `).run(name ?? null, isActive === undefined ? null : (isActive ? 1 : 0), firstFinancialYear ?? null, nowIso(), id);
    return this.findById(id);
  }

  /** Firm ids explicitly assigned to a user (empty = none assigned yet). */
  firmIdsForUser(userId) {
    return getCoreDatabase().prepare('SELECT firm_id FROM user_firms WHERE user_id = ?').all(userId).map((r) => r.firm_id);
  }

  setUserFirms(userId, firmIds) {
    const db = getCoreDatabase();
    db.transaction(() => {
      db.prepare('DELETE FROM user_firms WHERE user_id = ?').run(userId);
      const insert = db.prepare('INSERT INTO user_firms (user_id, firm_id, created_at) VALUES (?, ?, ?)');
      for (const firmId of new Set(firmIds)) insert.run(userId, firmId, nowIso());
    })();
  }

  /** Point a session at a firm and financial year (null clears the choice). */
  selectForSession(token, firmId, financialYear) {
    getCoreDatabase().prepare('UPDATE sessions SET firm_id = ?, financial_year = ? WHERE token = ?')
      .run(firmId || null, financialYear || null, token);
  }

  /** Sign out every session sitting in a firm (when it is switched off). */
  clearSessionsForFirm(firmId) {
    getCoreDatabase().prepare('UPDATE sessions SET firm_id = NULL, financial_year = NULL WHERE firm_id = ?').run(firmId);
  }
}
