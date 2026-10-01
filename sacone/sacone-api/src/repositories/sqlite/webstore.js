import crypto from 'crypto';
import { getDatabase } from '../../database/connection.js';
import { generateId, nowIso, parseJson, toJson } from '../../core/utils.js';

function mapApiKey(row, { includeHash = false } = {}) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    keyPrefix: row.key_prefix,
    scopes: parseJson(row.scopes, []),
    isActive: Boolean(row.is_active),
    lastUsedAt: row.last_used_at,
    expiresAt: row.expires_at,
    createdBy: row.created_by,
    createdAt: row.created_at,
    revokedAt: row.revoked_at,
    notes: row.notes,
    ...(includeHash ? { keyHash: row.key_hash } : {}),
  };
}

export function hashApiKey(rawKey) {
  return crypto.createHash('sha256').update(String(rawKey)).digest('hex');
}

export function generateApiKeySecret() {
  const random = crypto.randomBytes(24).toString('base64url');
  const rawKey = `sk_live_${random}`;
  const keyPrefix = rawKey.slice(0, 16);
  return { rawKey, keyPrefix, keyHash: hashApiKey(rawKey) };
}

export class ApiKeyRepository {
  findById(id) {
    return mapApiKey(getDatabase().prepare('SELECT * FROM api_keys WHERE id = ?').get(id));
  }

  findByHash(keyHash) {
    const row = getDatabase().prepare(`
      SELECT * FROM api_keys WHERE key_hash = ? AND is_active = 1 AND revoked_at IS NULL
    `).get(keyHash);
    if (!row) return null;
    if (row.expires_at && row.expires_at < nowIso()) return null;
    return mapApiKey(row, { includeHash: true });
  }

  list({ includeInactive = false } = {}) {
    const where = includeInactive ? '' : 'WHERE is_active = 1 AND revoked_at IS NULL';
    return getDatabase().prepare(`
      SELECT * FROM api_keys ${where} ORDER BY created_at DESC
    `).all().map((r) => mapApiKey(r));
  }

  create({ name, scopes, notes, createdBy, expiresAt }) {
    const id = generateId();
    const now = nowIso();
    const { rawKey, keyPrefix, keyHash } = generateApiKeySecret();
    getDatabase().prepare(`
      INSERT INTO api_keys (
        id, name, key_prefix, key_hash, scopes, is_active, expires_at,
        created_by, created_at, notes
      ) VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, ?)
    `).run(
      id,
      name,
      keyPrefix,
      keyHash,
      toJson(scopes),
      expiresAt || null,
      createdBy || null,
      now,
      notes || null
    );
    return {
      ...this.findById(id),
      apiKey: rawKey, // shown once
    };
  }

  touchLastUsed(id) {
    getDatabase().prepare('UPDATE api_keys SET last_used_at = ? WHERE id = ?').run(nowIso(), id);
  }

  revoke(id) {
    getDatabase().prepare(`
      UPDATE api_keys SET is_active = 0, revoked_at = ? WHERE id = ?
    `).run(nowIso(), id);
    return this.findById(id);
  }
}

export class ApiRequestLogRepository {
  create(entry) {
    const id = generateId();
    getDatabase().prepare(`
      INSERT INTO api_request_logs (
        id, api_key_id, request_id, method, path, status_code, duration_ms,
        ip_address, user_agent, error_code, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      entry.apiKeyId || null,
      entry.requestId,
      entry.method,
      entry.path,
      entry.statusCode,
      entry.durationMs ?? null,
      entry.ipAddress || null,
      entry.userAgent || null,
      entry.errorCode || null,
      nowIso()
    );
    return id;
  }

  list({ apiKeyId = '', limit = 100, offset = 0 } = {}) {
    const params = [];
    let where = '';
    if (apiKeyId) {
      where = 'WHERE api_key_id = ?';
      params.push(apiKeyId);
    }
    return getDatabase().prepare(`
      SELECT l.*, k.name as api_key_name, k.key_prefix
      FROM api_request_logs l
      LEFT JOIN api_keys k ON k.id = l.api_key_id
      ${where}
      ORDER BY l.created_at DESC
      LIMIT ? OFFSET ?
    `).all(...params, limit, offset).map((row) => ({
      id: row.id,
      apiKeyId: row.api_key_id,
      apiKeyName: row.api_key_name,
      keyPrefix: row.key_prefix,
      requestId: row.request_id,
      method: row.method,
      path: row.path,
      statusCode: row.status_code,
      durationMs: row.duration_ms,
      ipAddress: row.ip_address,
      userAgent: row.user_agent,
      errorCode: row.error_code,
      createdAt: row.created_at,
    }));
  }
}

export class WebOrderProvisionRepository {
  nextNumber() {
    const count = getDatabase().prepare('SELECT COUNT(*) as count FROM web_order_provisions').get().count;
    return `WEB-ORD-${String(count + 1).padStart(5, '0')}`;
  }

  create({ apiKeyId, customerId, externalOrderRef, payload, status, rejectionReason, notes }) {
    const id = generateId();
    const provisionNumber = this.nextNumber();
    getDatabase().prepare(`
      INSERT INTO web_order_provisions (
        id, provision_number, api_key_id, customer_id, external_order_ref,
        payload_json, status, rejection_reason, notes, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      provisionNumber,
      apiKeyId || null,
      customerId || null,
      externalOrderRef || null,
      toJson(payload),
      status || 'received',
      rejectionReason || null,
      notes || null,
      nowIso()
    );
    return this.findById(id);
  }

  findById(id) {
    const row = getDatabase().prepare('SELECT * FROM web_order_provisions WHERE id = ?').get(id);
    if (!row) return null;
    return {
      id: row.id,
      provisionNumber: row.provision_number,
      apiKeyId: row.api_key_id,
      customerId: row.customer_id,
      externalOrderRef: row.external_order_ref,
      payload: parseJson(row.payload_json, {}),
      status: row.status,
      rejectionReason: row.rejection_reason,
      notes: row.notes,
      createdAt: row.created_at,
    };
  }
}
