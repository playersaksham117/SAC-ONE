import { DEFAULT_ROLES } from '../core/constants.js';
import { generateId, nowIso } from '../core/utils.js';

/**
 * Users and roles per firm (core database).
 *   - The group owner (role 'owner_admin', firm_id NULL) is above every firm.
 *   - Every other user and role has a firm_id; each firm has its own copy of the built-in roles.
 */

export const GROUP_OWNER = 'owner_admin';
export const FIRM_ADMIN = 'firm_admin';
const FIRM_ROLES = DEFAULT_ROLES.filter((r) => !r.groupLevel);

/** system_settings key holding the defaults last applied to a built-in role (see setup). */
export function roleDefaultsKey(role) {
  return role.firm_id ? `role_defaults.${role.firm_id}.${role.slug}` : `role_defaults.${role.slug}`;
}

function defaultKeysFor(roleDef, allPermissions) {
  if (roleDef.allPermissions) return allPermissions.map((p) => p.permission_key);
  if (roleDef.viewOnly) return allPermissions.filter((p) => p.action === 'view').map((p) => p.permission_key);
  const known = new Set(allPermissions.map((p) => p.permission_key));
  return (roleDef.permissionKeys || []).filter((k) => known.has(k));
}

/** Create any built-in role this firm is missing, with its default permissions. Returns how many. */
export function ensureFirmRoles(db, firmId, createdBy = null) {
  const allPermissions = db.prepare('SELECT id, permission_key, action FROM permissions').all();
  const idByKey = Object.fromEntries(allPermissions.map((p) => [p.permission_key, p.id]));
  const exists = db.prepare('SELECT 1 FROM roles WHERE firm_id = ? AND slug = ?');
  const insertRole = db.prepare(`
    INSERT INTO roles (id, firm_id, name, slug, description, is_system, is_active, created_at, updated_at, created_by)
    VALUES (?, ?, ?, ?, ?, 1, 1, ?, ?, ?)
  `);
  const grant = db.prepare('INSERT OR IGNORE INTO role_permissions (id, role_id, permission_id, created_at) VALUES (?, ?, ?, ?)');
  const saveSnapshot = db.prepare(`
    INSERT INTO system_settings (key, value, description, updated_at) VALUES (?, ?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `);
  const now = nowIso();
  let created = 0;
  db.transaction(() => {
    for (const roleDef of FIRM_ROLES) {
      if (exists.get(firmId, roleDef.slug)) continue;
      const id = generateId();
      insertRole.run(id, firmId, roleDef.name, roleDef.slug, roleDef.description, now, now, createdBy);
      const keys = defaultKeysFor(roleDef, allPermissions);
      for (const key of keys) grant.run(generateId(), id, idByKey[key], now);
      saveSnapshot.run(roleDefaultsKey({ firm_id: firmId, slug: roleDef.slug }), JSON.stringify(keys), `Built-in defaults last applied to ${roleDef.name}`, now);
      created += 1;
    }
  })();
  return created;
}

/**
 * Move a database from shared users/roles to per-firm ones (safe to run every setup):
 * roles and users without a firm go to the first firm, except the group owner and its role;
 * then every firm gets any built-in role it lacks (Firm Admin included).
 */
export function scopeIdentityToFirms(db) {
  const primary = db.prepare('SELECT id FROM firms WHERE is_primary = 1').get();
  if (!primary) return { movedRoles: 0, movedUsers: 0, createdRoles: 0 };
  const now = nowIso();
  let movedRoles = 0;
  let movedUsers = 0;

  db.transaction(() => {
    const shared = db.prepare('SELECT id, slug FROM roles WHERE firm_id IS NULL AND slug != ?').all(GROUP_OWNER);
    if (shared.length) {
      // Keep each moved built-in role's applied-defaults record under its new, per-firm key.
      const getSetting = db.prepare('SELECT value, description FROM system_settings WHERE key = ?');
      const putSetting = db.prepare(`
        INSERT INTO system_settings (key, value, description, updated_at) VALUES (?, ?, ?, ?)
        ON CONFLICT(key) DO NOTHING
      `);
      for (const role of shared) {
        const old = getSetting.get(roleDefaultsKey({ firm_id: null, slug: role.slug }));
        if (old) putSetting.run(roleDefaultsKey({ firm_id: primary.id, slug: role.slug }), old.value, old.description, now);
      }
      movedRoles = db.prepare('UPDATE roles SET firm_id = ?, updated_at = ? WHERE firm_id IS NULL AND slug != ?')
        .run(primary.id, now, GROUP_OWNER).changes;
    }

    movedUsers = db.prepare(`
      UPDATE users SET firm_id = ?, updated_at = ?
      WHERE firm_id IS NULL AND role_id NOT IN (SELECT id FROM roles WHERE firm_id IS NULL AND slug = ?)
    `).run(primary.id, now, GROUP_OWNER).changes;

    // The group owner is above the firms.
    db.prepare(`
      UPDATE users SET firm_id = NULL
      WHERE firm_id IS NOT NULL AND role_id IN (SELECT id FROM roles WHERE firm_id IS NULL AND slug = ?)
    `).run(GROUP_OWNER);
    db.prepare(`UPDATE roles SET name = 'Group Owner', description = ? WHERE firm_id IS NULL AND slug = ? AND name = 'Owner/Admin'`)
      .run(DEFAULT_ROLES[0].description, GROUP_OWNER);
  })();

  let createdRoles = 0;
  for (const firm of db.prepare('SELECT id FROM firms ORDER BY created_at').all()) {
    createdRoles += ensureFirmRoles(db, firm.id);
  }
  return { movedRoles, movedUsers, createdRoles };
}
