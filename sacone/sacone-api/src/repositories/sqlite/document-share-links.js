import { getDatabase } from '../../database/connection.js';
import { generateId, nowIso } from '../../core/utils.js';

function mapLink(row) {
  if (!row) return null;
  return {
    id: row.id,
    documentType: row.document_type,
    documentId: row.document_id,
    expiresAt: row.expires_at,
    revokedAt: row.revoked_at,
    accessCount: Number(row.access_count || 0),
    lastAccessedAt: row.last_accessed_at,
    createdBy: row.created_by,
    createdAt: row.created_at,
  };
}

export class DocumentShareLinkRepository {
  create({ tokenHash, documentType, documentId, expiresAt, createdBy }) {
    const id = generateId();
    getDatabase().prepare(`
      INSERT INTO document_share_links (id, token_hash, document_type, document_id, expires_at, created_by, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, tokenHash, documentType, documentId, expiresAt, createdBy || null, nowIso());
    return mapLink(getDatabase().prepare('SELECT * FROM document_share_links WHERE id = ?').get(id));
  }

  findByTokenHash(tokenHash) {
    return mapLink(getDatabase().prepare('SELECT * FROM document_share_links WHERE token_hash = ?').get(tokenHash));
  }

  recordAccess(id) {
    getDatabase().prepare(`
      UPDATE document_share_links SET access_count = access_count + 1, last_accessed_at = ? WHERE id = ?
    `).run(nowIso(), id);
  }

  /** Revoke every live link to one document; returns how many were revoked. */
  revokeForDocument(documentType, documentId) {
    return getDatabase().prepare(`
      UPDATE document_share_links SET revoked_at = ?
      WHERE document_type = ? AND document_id = ? AND revoked_at IS NULL AND expires_at > ?
    `).run(nowIso(), documentType, documentId, nowIso()).changes;
  }

  activeCount(documentType, documentId) {
    return getDatabase().prepare(`
      SELECT COUNT(*) AS count FROM document_share_links
      WHERE document_type = ? AND document_id = ? AND revoked_at IS NULL AND expires_at > ?
    `).get(documentType, documentId, nowIso()).count;
  }

  /** Expired or revoked links are useless; drop them after a week so the table stays small. */
  purgeOld() {
    const cutoff = new Date(Date.now() - 7 * 86400000).toISOString();
    return getDatabase().prepare(`
      DELETE FROM document_share_links WHERE expires_at < ? OR (revoked_at IS NOT NULL AND revoked_at < ?)
    `).run(cutoff, cutoff).changes;
  }
}
