/**
 * Users, roles and permissions live in the core (main) database. Each extra firm's database keeps
 * a read-only copy so its records can point at users (created_by, sales agent logins …) and so
 * firm-side reads such as the POS staff list see the same people and permissions.
 *
 * The copy never carries passwords: sign-in always checks the core. Users and roles are only
 * upserted, never deleted, because the firm's records may reference them.
 */

/** Parent tables first. */
const TABLES = ['modules', 'features', 'permissions', 'roles', 'users', 'role_permissions'];
/** Not referenced by firm records, so rows removed from the core are removed here too. */
const PRUNE = new Set(['modules', 'features', 'permissions', 'role_permissions']);

export const IDENTITY_TABLES = new Set(TABLES);

function columnsOf(db, table) {
  return db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
}

export function mirrorIdentity(coreDb, firmDb) {
  if (coreDb === firmDb) return;
  const copy = firmDb.transaction(() => {
    for (const table of TABLES) {
      const target = new Set(columnsOf(firmDb, table));
      const cols = columnsOf(coreDb, table).filter((c) => target.has(c));
      const rows = coreDb.prepare(`SELECT ${cols.join(', ')} FROM ${table}`).all();
      if (PRUNE.has(table)) {
        // Drop stale rows first so a re-created row (new id, same unique key) can be inserted.
        const keep = new Set(rows.map((r) => r.id));
        const remove = firmDb.prepare(`DELETE FROM ${table} WHERE id = ?`);
        for (const { id } of firmDb.prepare(`SELECT id FROM ${table}`).all()) {
          if (!keep.has(id)) remove.run(id);
        }
      }
      const updates = cols.filter((c) => c !== 'id').map((c) => `${c} = excluded.${c}`).join(', ');
      const upsert = firmDb.prepare(`
        INSERT INTO ${table} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})
        ON CONFLICT(id) DO UPDATE SET ${updates}
      `);
      for (const row of rows) {
        if (table === 'users') row.password_hash = '!';
        upsert.run(...cols.map((c) => row[c]));
      }
    }
  });
  copy();
}
