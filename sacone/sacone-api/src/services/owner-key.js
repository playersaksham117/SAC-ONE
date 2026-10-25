/**
 * SACONE Owner sign-in with a private owner key (no ERP login). The key opens an ordinary
 * session for the group owner, so the Owner app's live CEO dashboard, firm picker and
 * Income & Expense work as before. Only a SHA-256 hash of the key is stored (owner_access,
 * main database); `npm run owner-key` makes or changes it. Wrong keys are slowed down per
 * address, and every sign-in is in the audit log ("owner_key").
 */
import crypto from 'crypto';
import { AppError } from '../core/http.js';
import { nowIso } from '../core/utils.js';
import { getCoreDatabase as getDatabase } from '../database/connection.js'; // main database, never a firm's
import { GROUP_OWNER } from '../database/firm-identity.js';
import { authService } from './index.js';

const hash = (key) => crypto.createHash('sha256').update(String(key).trim().toUpperCase()).digest('hex');
const MAX_FAILS = 5;
const LOCK_MS = 10 * 60 * 1000;
const fails = new Map(); // ip → { count, until }

/** A new random key, e.g. SO-7KQ2-M9XD-…; stored as a hash, shown once. */
export function createOwnerKey() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.randomBytes(24);
  const chars = [...bytes].map((b) => alphabet[b % alphabet.length]).join('');
  const key = `SO-${chars.match(/.{4}/g).join('-')}`;
  getDatabase().prepare(`
    INSERT INTO owner_access (id, key_hash, key_hint, created_at) VALUES (1, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET key_hash = excluded.key_hash, key_hint = excluded.key_hint, created_at = excluded.created_at
  `).run(hash(key), key.slice(-4), nowIso());
  return key;
}

export function removeOwnerKey() {
  return getDatabase().prepare('DELETE FROM owner_access').run().changes > 0;
}

export function ownerKeyStatus() {
  const row = getDatabase().prepare('SELECT key_hint, created_at FROM owner_access WHERE id = 1').get();
  return row ? { set: true, endsWith: row.key_hint, createdAt: row.created_at } : { set: false };
}

function ownerUser() {
  return getDatabase().prepare(`
    SELECT u.*, r.name AS role_name, r.slug AS role_slug FROM users u JOIN roles r ON r.id = u.role_id
    WHERE r.slug = ? AND u.is_active = 1
    ORDER BY (u.last_login_at IS NULL), u.last_login_at DESC, u.created_at ASC LIMIT 1
  `).get(GROUP_OWNER);
}

export const ownerKeyService = {
  signIn(key, req) {
    const ip = req?.ip || 'unknown';
    const f = fails.get(ip);
    if (f && f.until > Date.now()) throw new AppError('Too many wrong keys. Try again in a few minutes.', 429, 'OWNER_KEY_LOCKED');

    const row = getDatabase().prepare('SELECT key_hash FROM owner_access WHERE id = 1').get();
    const given = Buffer.from(hash(key || ''), 'hex');
    const ok = Boolean(row && key) && crypto.timingSafeEqual(given, Buffer.from(row.key_hash, 'hex'));
    if (!ok) {
      // a lock that has run out starts the count again
      const next = { count: (f?.until && f.until <= Date.now() ? 0 : f?.count || 0) + 1, until: 0 };
      if (next.count >= MAX_FAILS) { next.until = Date.now() + LOCK_MS; next.count = 0; }
      fails.set(ip, next);
      throw new AppError('Wrong owner key', 401, 'INVALID_OWNER_KEY');
    }
    fails.delete(ip);
    const user = ownerUser();
    if (!user) throw new AppError('No active group owner account', 403, 'NO_OWNER');
    return authService.openSession(user, req, { method: 'owner_key' });
  },
};
