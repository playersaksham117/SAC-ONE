import { getDatabase } from '../../database/connection.js';
import { generateId, nowIso, parseJson } from '../../core/utils.js';

function mapUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    fullName: row.full_name,
    phone: row.phone,
    roleId: row.role_id,
    roleName: row.role_name,
    roleSlug: row.role_slug,
    isActive: Boolean(row.is_active),
    lastLoginAt: row.last_login_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    createdBy: row.created_by,
  };
}

export class UserRepository {
  findAll({ includeInactive = false } = {}) {
    const db = getDatabase();
    const sql = `
      SELECT u.*, r.name as role_name, r.slug as role_slug
      FROM users u
      JOIN roles r ON r.id = u.role_id
      ${includeInactive ? '' : 'WHERE u.is_active = 1'}
      ORDER BY u.full_name ASC
    `;
    return db.prepare(sql).all().map(mapUser);
  }

  findById(id) {
    const db = getDatabase();
    const row = db.prepare(`
      SELECT u.*, r.name as role_name, r.slug as role_slug
      FROM users u
      JOIN roles r ON r.id = u.role_id
      WHERE u.id = ?
    `).get(id);
    return mapUser(row);
  }

  findByEmail(email) {
    const db = getDatabase();
    const row = db.prepare(`
      SELECT u.*, r.name as role_name, r.slug as role_slug
      FROM users u
      JOIN roles r ON r.id = u.role_id
      WHERE LOWER(u.email) = LOWER(?)
    `).get(email);
    return mapUser(row);
  }

  findByEmailWithPassword(email) {
    const db = getDatabase();
    return db.prepare(`
      SELECT u.*, r.name as role_name, r.slug as role_slug
      FROM users u
      JOIN roles r ON r.id = u.role_id
      WHERE LOWER(u.email) = LOWER(?)
    `).get(email);
  }

  create({ email, passwordHash, fullName, phone, roleId, createdBy }) {
    const db = getDatabase();
    const id = generateId();
    const now = nowIso();
    db.prepare(`
      INSERT INTO users (id, email, password_hash, full_name, phone, role_id, is_active, created_at, updated_at, created_by)
      VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?)
    `).run(id, email, passwordHash, fullName, phone || null, roleId, now, now, createdBy || null);
    return this.findById(id);
  }

  update(id, { fullName, phone, roleId, isActive, passwordHash }) {
    const db = getDatabase();
    const existing = this.findById(id);
    if (!existing) return null;

    const now = nowIso();
    db.prepare(`
      UPDATE users SET
        full_name = ?,
        phone = ?,
        role_id = ?,
        is_active = ?,
        password_hash = COALESCE(?, password_hash),
        updated_at = ?
      WHERE id = ?
    `).run(
      fullName ?? existing.fullName,
      phone !== undefined ? phone : existing.phone,
      roleId ?? existing.roleId,
      isActive !== undefined ? (isActive ? 1 : 0) : (existing.isActive ? 1 : 0),
      passwordHash || null,
      now,
      id
    );
    return this.findById(id);
  }

  updateLastLogin(id) {
    const db = getDatabase();
    db.prepare('UPDATE users SET last_login_at = ? WHERE id = ?').run(nowIso(), id);
  }

  emailExists(email, excludeId = null) {
    const db = getDatabase();
    const row = excludeId
      ? db.prepare('SELECT id FROM users WHERE LOWER(email) = LOWER(?) AND id != ?').get(email, excludeId)
      : db.prepare('SELECT id FROM users WHERE LOWER(email) = LOWER(?)').get(email);
    return Boolean(row);
  }
}

export class SessionRepository {
  create({ userId, token, expiresAt, ipAddress, userAgent }) {
    const db = getDatabase();
    const id = generateId();
    db.prepare(`
      INSERT INTO sessions (id, user_id, token, expires_at, ip_address, user_agent, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, userId, token, expiresAt, ipAddress || null, userAgent || null, nowIso());
    return { id, userId, token, expiresAt };
  }

  findByToken(token) {
    const db = getDatabase();
    return db.prepare(`
      SELECT s.*, u.email, u.full_name, u.is_active, u.role_id,
             r.name as role_name, r.slug as role_slug
      FROM sessions s
      JOIN users u ON u.id = s.user_id
      JOIN roles r ON r.id = u.role_id
      WHERE s.token = ? AND s.expires_at > ?
    `).get(token, nowIso());
  }

  deleteByToken(token) {
    const db = getDatabase();
    db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
  }

  deleteByUserId(userId) {
    const db = getDatabase();
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
  }

  purgeExpired() {
    const db = getDatabase();
    db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(nowIso());
  }
}

export class CompanyRepository {
  get() {
    const db = getDatabase();
    const row = db.prepare('SELECT * FROM companies ORDER BY created_at ASC LIMIT 1').get();
    if (!row) return null;
    return {
      id: row.id,
      businessName: row.business_name,
      legalName: row.legal_name,
      addressLine1: row.address_line1,
      addressLine2: row.address_line2,
      city: row.city,
      state: row.state,
      country: row.country,
      postalCode: row.postal_code,
      gstNumber: row.gst_number,
      gstStateCode: row.gst_state_code,
      panNumber: row.pan_number,
      phone: row.phone,
      email: row.email,
      website: row.website,
      logoUrl: row.logo_url,
      isSetupComplete: Boolean(row.is_setup_complete),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      createdBy: row.created_by,
    };
  }

  upsert(data, userId) {
    const db = getDatabase();
    const existing = this.get();
    const now = nowIso();

    if (!existing) {
      const id = generateId();
      db.prepare(`
        INSERT INTO companies (
          id, business_name, legal_name, address_line1, address_line2, city, state, country,
          postal_code, gst_number, gst_state_code, pan_number, phone, email, website, logo_url,
          is_setup_complete, created_at, updated_at, created_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id,
        data.businessName || '',
        data.legalName || null,
        data.addressLine1 || null,
        data.addressLine2 || null,
        data.city || null,
        data.state || null,
        data.country || 'India',
        data.postalCode || null,
        data.gstNumber || null,
        data.gstStateCode || null,
        data.panNumber || null,
        data.phone || null,
        data.email || null,
        data.website || null,
        data.logoUrl || null,
        data.isSetupComplete ? 1 : 0,
        now,
        now,
        userId || null
      );
      return this.get();
    }

    db.prepare(`
      UPDATE companies SET
        business_name = ?,
        legal_name = ?,
        address_line1 = ?,
        address_line2 = ?,
        city = ?,
        state = ?,
        country = ?,
        postal_code = ?,
        gst_number = ?,
        gst_state_code = ?,
        pan_number = ?,
        phone = ?,
        email = ?,
        website = ?,
        logo_url = ?,
        is_setup_complete = ?,
        updated_at = ?
      WHERE id = ?
    `).run(
      data.businessName ?? existing.businessName,
      data.legalName !== undefined ? data.legalName : existing.legalName,
      data.addressLine1 !== undefined ? data.addressLine1 : existing.addressLine1,
      data.addressLine2 !== undefined ? data.addressLine2 : existing.addressLine2,
      data.city !== undefined ? data.city : existing.city,
      data.state !== undefined ? data.state : existing.state,
      data.country ?? existing.country,
      data.postalCode !== undefined ? data.postalCode : existing.postalCode,
      data.gstNumber !== undefined ? data.gstNumber : existing.gstNumber,
      data.gstStateCode !== undefined ? data.gstStateCode : existing.gstStateCode,
      data.panNumber !== undefined ? data.panNumber : existing.panNumber,
      data.phone !== undefined ? data.phone : existing.phone,
      data.email !== undefined ? data.email : existing.email,
      data.website !== undefined ? data.website : existing.website,
      data.logoUrl !== undefined ? data.logoUrl : existing.logoUrl,
      data.isSetupComplete !== undefined ? (data.isSetupComplete ? 1 : 0) : (existing.isSetupComplete ? 1 : 0),
      now,
      existing.id
    );

    return this.get();
  }
}

export class RoleRepository {
  findAll({ includeInactive = false } = {}) {
    const db = getDatabase();
    const sql = `
      SELECT * FROM roles
      ${includeInactive ? '' : 'WHERE is_active = 1'}
      ORDER BY is_system DESC, name ASC
    `;
    return db.prepare(sql).all().map(this._mapRole);
  }

  findById(id) {
    const db = getDatabase();
    return this._mapRole(db.prepare('SELECT * FROM roles WHERE id = ?').get(id));
  }

  findBySlug(slug) {
    const db = getDatabase();
    return this._mapRole(db.prepare('SELECT * FROM roles WHERE slug = ?').get(slug));
  }

  create({ name, slug, description, isSystem = false, createdBy }) {
    const db = getDatabase();
    const id = generateId();
    const now = nowIso();
    db.prepare(`
      INSERT INTO roles (id, name, slug, description, is_system, is_active, created_at, updated_at, created_by)
      VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?)
    `).run(id, name, slug, description || null, isSystem ? 1 : 0, now, now, createdBy || null);
    return this.findById(id);
  }

  update(id, { name, description, isActive }) {
    const db = getDatabase();
    const existing = this.findById(id);
    if (!existing) return null;

    const now = nowIso();
    db.prepare(`
      UPDATE roles SET
        name = ?,
        description = ?,
        is_active = ?,
        updated_at = ?
      WHERE id = ?
    `).run(
      name ?? existing.name,
      description !== undefined ? description : existing.description,
      isActive !== undefined ? (isActive ? 1 : 0) : (existing.isActive ? 1 : 0),
      now,
      id
    );
    return this.findById(id);
  }

  delete(id) {
    const db = getDatabase();
    const role = this.findById(id);
    if (!role) return false;
    if (role.isSystem) {
      throw new Error('System roles cannot be deleted');
    }
    const userCount = db.prepare('SELECT COUNT(*) as count FROM users WHERE role_id = ?').get(id).count;
    if (userCount > 0) {
      throw new Error('Role is assigned to users and cannot be deleted');
    }
    db.prepare('DELETE FROM role_permissions WHERE role_id = ?').run(id);
    db.prepare('DELETE FROM roles WHERE id = ?').run(id);
    return true;
  }

  getPermissions(roleId) {
    const db = getDatabase();
    return db.prepare(`
      SELECT p.id, p.permission_key, p.action,
             f.code as feature_code, f.name as feature_name,
             m.code as module_code, m.name as module_name
      FROM role_permissions rp
      JOIN permissions p ON p.id = rp.permission_id
      JOIN features f ON f.id = p.feature_id
      JOIN modules m ON m.id = p.module_id
      WHERE rp.role_id = ?
      ORDER BY m.sort_order, f.sort_order, p.action
    `).all(roleId);
  }

  permissionKeysForIds(permissionIds) {
    if (!permissionIds?.length) return [];
    const marks = permissionIds.map(() => '?').join(',');
    return getDatabase().prepare(`SELECT permission_key FROM permissions WHERE id IN (${marks})`)
      .all(...permissionIds).map((r) => r.permission_key);
  }

  setPermissions(roleId, permissionIds) {
    const db = getDatabase();
    const deleteStmt = db.prepare('DELETE FROM role_permissions WHERE role_id = ?');
    const insertStmt = db.prepare(`
      INSERT INTO role_permissions (id, role_id, permission_id, created_at)
      VALUES (?, ?, ?, ?)
    `);

    const tx = db.transaction(() => {
      deleteStmt.run(roleId);
      const now = nowIso();
      for (const permissionId of permissionIds) {
        insertStmt.run(generateId(), roleId, permissionId, now);
      }
    });
    tx();
  }

  slugExists(slug, excludeId = null) {
    const db = getDatabase();
    const row = excludeId
      ? db.prepare('SELECT id FROM roles WHERE slug = ? AND id != ?').get(slug, excludeId)
      : db.prepare('SELECT id FROM roles WHERE slug = ?').get(slug);
    return Boolean(row);
  }

  getPermissionTree() {
    const db = getDatabase();
    const modules = db.prepare(`
      SELECT * FROM modules WHERE is_active = 1 ORDER BY sort_order ASC
    `).all();

    return modules.map((mod) => {
      const features = db.prepare(`
        SELECT * FROM features WHERE module_id = ? AND is_active = 1 ORDER BY sort_order ASC
      `).all(mod.id);

      return {
        id: mod.id,
        code: mod.code,
        name: mod.name,
        features: features.map((feature) => {
          const permissions = db.prepare(`
            SELECT id, action, permission_key FROM permissions
            WHERE feature_id = ? ORDER BY
              CASE action
                WHEN 'view' THEN 1
                WHEN 'create' THEN 2
                WHEN 'edit' THEN 3
                WHEN 'delete' THEN 4
                WHEN 'approve' THEN 5
                ELSE 6
              END
          `).all(feature.id);

          return {
            id: feature.id,
            code: feature.code,
            name: feature.name,
            permissions,
          };
        }),
      };
    });
  }

  _mapRole(row) {
    if (!row) return null;
    return {
      id: row.id,
      name: row.name,
      slug: row.slug,
      description: row.description,
      isSystem: Boolean(row.is_system),
      isActive: Boolean(row.is_active),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      createdBy: row.created_by,
    };
  }
}

export class AuditLogRepository {
  create(entry) {
    const db = getDatabase();
    const id = generateId();
    db.prepare(`
      INSERT INTO audit_logs (
        id, user_id, user_name, action, module, record_type, record_id,
        previous_value, new_value, ip_address, user_agent, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      entry.userId || null,
      entry.userName || null,
      entry.action,
      entry.module,
      entry.recordType || null,
      entry.recordId || null,
      entry.previousValue ? JSON.stringify(entry.previousValue) : null,
      entry.newValue ? JSON.stringify(entry.newValue) : null,
      entry.ipAddress || null,
      entry.userAgent || null,
      nowIso()
    );
    return id;
  }

  findAll({ module, userId, limit = 100, offset = 0 } = {}) {
    const db = getDatabase();
    const conditions = [];
    const params = [];

    if (module) {
      conditions.push('module = ?');
      params.push(module);
    }
    if (userId) {
      conditions.push('user_id = ?');
      params.push(userId);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    params.push(limit, offset);

    const rows = db.prepare(`
      SELECT * FROM audit_logs
      ${where}
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `).all(...params);

    const countParams = params.slice(0, -2);
    const total = db.prepare(`
      SELECT COUNT(*) as count FROM audit_logs ${where}
    `).get(...countParams).count;

    return {
      items: rows.map((row) => ({
        id: row.id,
        userId: row.user_id,
        userName: row.user_name,
        action: row.action,
        module: row.module,
        recordType: row.record_type,
        recordId: row.record_id,
        previousValue: parseJson(row.previous_value),
        newValue: parseJson(row.new_value),
        ipAddress: row.ip_address,
        userAgent: row.user_agent,
        createdAt: row.created_at,
      })),
      total,
      limit,
      offset,
    };
  }
}
