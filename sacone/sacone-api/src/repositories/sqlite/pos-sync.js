import { getDatabase } from '../../database/connection.js';
import { generateId, nowIso, parseJson, toJson } from '../../core/utils.js';

/* ───────────────────────── mappers ───────────────────────── */

function mapDevice(row) {
  if (!row) return null;
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    warehouseId: row.warehouse_id,
    warehouseName: row.warehouse_name || null,
    actingUserId: row.acting_user_id,
    actingUserName: row.acting_user_name || null,
    keyPrefix: row.key_prefix,
    deviceFingerprint: row.device_fingerprint,
    platform: row.platform,
    appVersion: row.app_version,
    isActive: Boolean(row.is_active),
    lastSeenAt: row.last_seen_at,
    lastPushAt: row.last_push_at,
    lastPullAt: row.last_pull_at,
    notes: row.notes,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    revokedAt: row.revoked_at,
    failedCount: row.failed_count != null ? Number(row.failed_count) : undefined,
    pendingReviewCount: row.pending_review_count != null ? Number(row.pending_review_count) : undefined,
  };
}

function mapPosUser(row, { includeHash = false } = {}) {
  if (!row) return null;
  return {
    id: row.id,
    loginId: row.login_id,
    displayName: row.display_name,
    role: row.role,
    permissions: parseJson(row.permissions, null),
    warehouseId: row.warehouse_id,
    warehouseName: row.warehouse_name || null,
    linkedUserId: row.linked_user_id,
    isActive: Boolean(row.is_active),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ...(includeHash ? { pinHash: row.pin_hash } : {}),
  };
}

function mapInbox(row) {
  if (!row) return null;
  return {
    id: row.id,
    deviceId: row.device_id,
    deviceCode: row.device_code || null,
    deviceName: row.device_name || null,
    entityType: row.entity_type,
    externalRef: row.external_ref,
    payload: parseJson(row.payload_json, {}),
    status: row.status,
    resultType: row.result_type,
    resultId: row.result_id,
    warnings: parseJson(row.warnings_json, []),
    errorCode: row.error_code,
    errorMessage: row.error_message,
    attempts: Number(row.attempts || 0),
    reviewedBy: row.reviewed_by,
    reviewedAt: row.reviewed_at,
    receivedAt: row.received_at,
    updatedAt: row.updated_at,
  };
}

const DEVICE_SELECT = `
  SELECT d.*, w.name AS warehouse_name, u.full_name AS acting_user_name,
    (SELECT COUNT(*) FROM pos_sync_inbox i WHERE i.device_id = d.id AND i.status = 'failed') AS failed_count,
    (SELECT COUNT(*) FROM pos_sync_inbox i WHERE i.device_id = d.id AND i.status = 'pending_review') AS pending_review_count
  FROM pos_devices d
  LEFT JOIN warehouses w ON w.id = d.warehouse_id
  LEFT JOIN users u ON u.id = d.acting_user_id
`;

/* ───────────────────────── devices ───────────────────────── */

export class PosDeviceRepository {
  findAll({ includeInactive = true } = {}) {
    const where = includeInactive ? '' : 'WHERE d.is_active = 1';
    return getDatabase().prepare(`${DEVICE_SELECT} ${where} ORDER BY d.created_at DESC`).all().map(mapDevice);
  }

  findById(id) {
    return mapDevice(getDatabase().prepare(`${DEVICE_SELECT} WHERE d.id = ?`).get(id));
  }

  findActiveByKeyHash(keyHash) {
    return mapDevice(getDatabase().prepare(`
      ${DEVICE_SELECT} WHERE d.key_hash = ? AND d.is_active = 1 AND d.revoked_at IS NULL
    `).get(keyHash));
  }

  codeExists(code, excludeId = null) {
    const row = getDatabase().prepare(
      'SELECT id FROM pos_devices WHERE UPPER(code) = UPPER(?) AND (? IS NULL OR id <> ?)'
    ).get(code, excludeId, excludeId);
    return Boolean(row);
  }

  nextCode() {
    const count = getDatabase().prepare('SELECT COUNT(*) AS c FROM pos_devices').get().c;
    let n = count + 1;
    while (this.codeExists(`POS${n}`)) n += 1;
    return `POS${n}`;
  }

  create(data) {
    const id = generateId();
    const now = nowIso();
    getDatabase().prepare(`
      INSERT INTO pos_devices (
        id, code, name, warehouse_id, acting_user_id, key_prefix, key_hash,
        is_active, notes, created_by, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)
    `).run(
      id, data.code, data.name, data.warehouseId, data.actingUserId,
      data.keyPrefix, data.keyHash, data.notes || null, data.createdBy || null, now, now
    );
    return this.findById(id);
  }

  update(id, data) {
    const current = this.findById(id);
    if (!current) return null;
    getDatabase().prepare(`
      UPDATE pos_devices
      SET name = ?, warehouse_id = ?, acting_user_id = ?, notes = ?, updated_at = ?
      WHERE id = ?
    `).run(
      data.name ?? current.name,
      data.warehouseId ?? current.warehouseId,
      data.actingUserId ?? current.actingUserId,
      data.notes !== undefined ? data.notes : current.notes,
      nowIso(),
      id
    );
    return this.findById(id);
  }

  rotateKey(id, { keyPrefix, keyHash }) {
    getDatabase().prepare(`
      UPDATE pos_devices
      SET key_prefix = ?, key_hash = ?, device_fingerprint = NULL,
          is_active = 1, revoked_at = NULL, updated_at = ?
      WHERE id = ?
    `).run(keyPrefix, keyHash, nowIso(), id);
    return this.findById(id);
  }

  revoke(id) {
    const now = nowIso();
    getDatabase().prepare(`
      UPDATE pos_devices SET is_active = 0, revoked_at = ?, updated_at = ? WHERE id = ?
    `).run(now, now, id);
    return this.findById(id);
  }

  bindFingerprint(id, fingerprint) {
    getDatabase().prepare(`
      UPDATE pos_devices SET device_fingerprint = ?, updated_at = ? WHERE id = ? AND device_fingerprint IS NULL
    `).run(fingerprint, nowIso(), id);
  }

  touch(id, { kind = 'seen', platform = null, appVersion = null } = {}) {
    const now = nowIso();
    const column = kind === 'push' ? 'last_push_at' : kind === 'pull' ? 'last_pull_at' : null;
    getDatabase().prepare(`
      UPDATE pos_devices
      SET last_seen_at = ?,
          ${column ? `${column} = ?,` : ''}
          platform = COALESCE(?, platform),
          app_version = COALESCE(?, app_version)
      WHERE id = ?
    `).run(...[now, ...(column ? [now] : []), platform, appVersion, id]);
  }
}

/* ───────────────────────── POS users ───────────────────────── */

export class PosUserRepository {
  findAll({ includeInactive = true } = {}) {
    const where = includeInactive ? '' : 'WHERE pu.is_active = 1';
    return getDatabase().prepare(`
      SELECT pu.*, w.name AS warehouse_name
      FROM pos_users pu LEFT JOIN warehouses w ON w.id = pu.warehouse_id
      ${where}
      ORDER BY pu.login_id ASC
    `).all().map((r) => mapPosUser(r));
  }

  findById(id) {
    return mapPosUser(getDatabase().prepare(`
      SELECT pu.*, w.name AS warehouse_name
      FROM pos_users pu LEFT JOIN warehouses w ON w.id = pu.warehouse_id
      WHERE pu.id = ?
    `).get(id));
  }

  loginIdExists(loginId, excludeId = null) {
    const row = getDatabase().prepare(
      'SELECT id FROM pos_users WHERE login_id = ? AND (? IS NULL OR id <> ?)'
    ).get(String(loginId).toUpperCase(), excludeId, excludeId);
    return Boolean(row);
  }

  create(data) {
    const id = generateId();
    const now = nowIso();
    getDatabase().prepare(`
      INSERT INTO pos_users (
        id, login_id, display_name, pin_hash, role, permissions, warehouse_id,
        linked_user_id, is_active, created_by, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)
    `).run(
      id,
      String(data.loginId).toUpperCase(),
      data.displayName,
      data.pinHash,
      data.role || 'cashier',
      data.permissions ? toJson(data.permissions) : null,
      data.warehouseId || null,
      data.linkedUserId || null,
      data.createdBy || null,
      now,
      now
    );
    return this.findById(id);
  }

  update(id, data) {
    const current = getDatabase().prepare('SELECT * FROM pos_users WHERE id = ?').get(id);
    if (!current) return null;
    getDatabase().prepare(`
      UPDATE pos_users
      SET display_name = ?, pin_hash = ?, role = ?, permissions = ?, warehouse_id = ?,
          linked_user_id = ?, is_active = ?, updated_at = ?
      WHERE id = ?
    `).run(
      data.displayName ?? current.display_name,
      data.pinHash ?? current.pin_hash,
      data.role ?? current.role,
      data.permissions !== undefined ? (data.permissions ? toJson(data.permissions) : null) : current.permissions,
      data.warehouseId !== undefined ? (data.warehouseId || null) : current.warehouse_id,
      data.linkedUserId !== undefined ? (data.linkedUserId || null) : current.linked_user_id,
      data.isActive !== undefined ? (data.isActive ? 1 : 0) : current.is_active,
      nowIso(),
      id
    );
    return this.findById(id);
  }

  /** Users visible to a terminal: global users + users pinned to its warehouse. */
  findChangedForWarehouse(warehouseId, since, { limit = 100, offset = 0 } = {}) {
    const db = getDatabase();
    const where = 'WHERE pu.updated_at > ? AND (pu.warehouse_id IS NULL OR pu.warehouse_id = ?)';
    const items = db.prepare(`
      SELECT pu.* FROM pos_users pu ${where}
      ORDER BY pu.updated_at ASC, pu.id ASC LIMIT ? OFFSET ?
    `).all(since, warehouseId, limit, offset).map((r) => mapPosUser(r, { includeHash: true }));
    const total = db.prepare(`SELECT COUNT(*) AS c FROM pos_users pu ${where}`).get(since, warehouseId).c;
    return { items, total };
  }
}

/* ───────────────────────── sync inbox ───────────────────────── */

export class PosSyncInboxRepository {
  find(deviceId, entityType, externalRef) {
    return mapInbox(getDatabase().prepare(`
      SELECT * FROM pos_sync_inbox WHERE device_id = ? AND entity_type = ? AND external_ref = ?
    `).get(deviceId, entityType, String(externalRef)));
  }

  findById(id) {
    return mapInbox(getDatabase().prepare(`
      SELECT i.*, d.code AS device_code, d.name AS device_name
      FROM pos_sync_inbox i LEFT JOIN pos_devices d ON d.id = i.device_id
      WHERE i.id = ?
    `).get(id));
  }

  /** Insert or update the ledger row for this external record. */
  record({ deviceId, entityType, externalRef, payload, status, resultType = null, resultId = null,
    warnings = [], errorCode = null, errorMessage = null }) {
    const db = getDatabase();
    const now = nowIso();
    const existing = this.find(deviceId, entityType, externalRef);
    if (existing) {
      db.prepare(`
        UPDATE pos_sync_inbox
        SET payload_json = ?, status = ?, result_type = ?, result_id = ?, warnings_json = ?,
            error_code = ?, error_message = ?, attempts = attempts + 1, updated_at = ?
        WHERE id = ?
      `).run(
        toJson(payload), status, resultType, resultId, toJson(warnings),
        errorCode, errorMessage, now, existing.id
      );
      return this.findById(existing.id);
    }
    const id = generateId();
    db.prepare(`
      INSERT INTO pos_sync_inbox (
        id, device_id, entity_type, external_ref, payload_json, status, result_type, result_id,
        warnings_json, error_code, error_message, attempts, received_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
    `).run(
      id, deviceId, entityType, String(externalRef), toJson(payload), status, resultType, resultId,
      toJson(warnings), errorCode, errorMessage, now, now
    );
    return this.findById(id);
  }

  review(id, { status, resultType = null, resultId = null, reviewedBy, errorMessage = null }) {
    const now = nowIso();
    getDatabase().prepare(`
      UPDATE pos_sync_inbox
      SET status = ?, result_type = COALESCE(?, result_type), result_id = COALESCE(?, result_id),
          error_message = ?, reviewed_by = ?, reviewed_at = ?, updated_at = ?
      WHERE id = ?
    `).run(status, resultType, resultId, errorMessage, reviewedBy, now, now, id);
    return this.findById(id);
  }

  list({ deviceId = '', entityType = '', status = '', limit = 100, offset = 0 } = {}) {
    const conditions = [];
    const params = [];
    if (deviceId) { conditions.push('i.device_id = ?'); params.push(deviceId); }
    if (entityType) { conditions.push('i.entity_type = ?'); params.push(entityType); }
    if (status) { conditions.push('i.status = ?'); params.push(status); }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const db = getDatabase();
    const items = db.prepare(`
      SELECT i.*, d.code AS device_code, d.name AS device_name
      FROM pos_sync_inbox i LEFT JOIN pos_devices d ON d.id = i.device_id
      ${where}
      ORDER BY i.updated_at DESC LIMIT ? OFFSET ?
    `).all(...params, limit, offset).map(mapInbox);
    const total = db.prepare(`SELECT COUNT(*) AS c FROM pos_sync_inbox i ${where}`).get(...params).c;
    return { items, total, limit, offset };
  }

  summary() {
    const rows = getDatabase().prepare(`
      SELECT entity_type, status, COUNT(*) AS c FROM pos_sync_inbox GROUP BY entity_type, status
    `).all();
    return rows.map((r) => ({ entityType: r.entity_type, status: r.status, count: Number(r.c) }));
  }

  /** Product requests reviewed since a time — pushed back to terminals on pull. */
  reviewedProductRequests(deviceId, since) {
    return getDatabase().prepare(`
      SELECT * FROM pos_sync_inbox
      WHERE device_id = ? AND entity_type = 'product'
        AND status IN ('applied', 'rejected') AND reviewed_at > ?
      ORDER BY reviewed_at ASC
    `).all(deviceId, since).map(mapInbox);
  }
}

/* ───────────────────── product catalogue for terminals ───────────────────── */

export class PosCatalogRepository {
  /**
   * Products changed since `since` — either the product row itself or its stock
   * in the terminal's warehouse. Stock is returned for that warehouse only.
   */
  findChanged(warehouseId, since, { limit = 100, offset = 0 } = {}) {
    const db = getDatabase();
    const where = `
      WHERE p.updated_at > @since
         OR EXISTS (
           SELECT 1 FROM stock_levels s2
           WHERE s2.product_id = p.id AND s2.warehouse_id = @warehouseId AND s2.updated_at > @since
         )
    `;
    const items = db.prepare(`
      SELECT p.*, c.name AS category_name, b.name AS brand_name,
        u.name AS unit_name, u.abbreviation AS unit_abbreviation,
        COALESCE(s.quantity_on_hand, 0) AS quantity_on_hand,
        COALESCE(s.quantity_reserved, 0) AS quantity_reserved,
        COALESCE(s.quantity_available, 0) AS quantity_available,
        MAX(p.updated_at, COALESCE(s.updated_at, p.updated_at)) AS changed_at
      FROM products p
      LEFT JOIN categories c ON c.id = p.category_id
      LEFT JOIN brands b ON b.id = p.brand_id
      LEFT JOIN units u ON u.id = p.unit_id
      LEFT JOIN stock_levels s ON s.product_id = p.id AND s.warehouse_id = @warehouseId
      ${where}
      ORDER BY changed_at ASC, p.id ASC
      LIMIT @limit OFFSET @offset
    `).all({ since, warehouseId, limit, offset });
    const total = db.prepare(`SELECT COUNT(*) AS c FROM products p ${where}`).get({ since, warehouseId }).c;
    return { items, total };
  }

  countChanged(warehouseId, since) {
    return getDatabase().prepare(`
      SELECT COUNT(*) AS c FROM products p
      WHERE p.updated_at > @since
         OR EXISTS (
           SELECT 1 FROM stock_levels s2
           WHERE s2.product_id = p.id AND s2.warehouse_id = @warehouseId AND s2.updated_at > @since
         )
    `).get({ since, warehouseId }).c;
  }

  findCustomerByPhone(phone) {
    const digits = String(phone || '').replace(/\D/g, '').slice(-10);
    if (digits.length < 6) return null;
    return getDatabase().prepare(`
      SELECT id FROM customers
      WHERE is_walk_in = 0 AND REPLACE(REPLACE(REPLACE(COALESCE(phone, ''), ' ', ''), '-', ''), '+', '') LIKE ?
      ORDER BY is_active DESC, created_at ASC LIMIT 1
    `).get(`%${digits}`)?.id || null;
  }

  findCustomerByGst(gst) {
    if (!gst) return null;
    return getDatabase().prepare(
      'SELECT id FROM customers WHERE UPPER(gst_number) = UPPER(?) LIMIT 1'
    ).get(String(gst).trim())?.id || null;
  }

  findSaleByInvoiceNumber(invoiceNumber) {
    return getDatabase().prepare('SELECT id FROM pos_sales WHERE invoice_number = ?').get(invoiceNumber)?.id || null;
  }

  /** Registered (non walk-in) customers changed since `since` — for terminal credit sales. */
  findChangedCustomers(since, { limit = 200, offset = 0 } = {}) {
    const db = getDatabase();
    const where = 'WHERE c.is_walk_in = 0 AND c.updated_at > ?';
    const items = db.prepare(`
      SELECT c.id, c.code, c.name, c.phone, c.email, c.gst_number, c.gst_state_code, c.address,
        c.city, c.state, c.credit_limit, c.outstanding_balance, c.is_active, c.updated_at
      FROM customers c ${where}
      ORDER BY c.updated_at ASC, c.id ASC LIMIT ? OFFSET ?
    `).all(since, limit, offset);
    const total = db.prepare(`SELECT COUNT(*) AS c FROM customers c ${where}`).get(since).c;
    return { items, total };
  }

  findWarehouseByNameOrCode(value) {
    if (!value) return null;
    return getDatabase().prepare(`
      SELECT id FROM warehouses WHERE is_active = 1 AND (UPPER(code) = UPPER(?) OR UPPER(name) = UPPER(?)) LIMIT 1
    `).get(value, value)?.id || null;
  }
}
