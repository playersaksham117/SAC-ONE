import crypto from 'crypto';
import { AppError } from '../core/http.js';
import { generateId, nowIso } from '../core/utils.js';
import { getDatabase } from '../database/connection.js';
import { repos } from '../repositories/index.js';
import { generateApiKeySecret, hashApiKey } from '../repositories/sqlite/webstore.js';
import { authService } from './index.js';
import { firmService } from './firms.js';

const deviceRepo = repos.posDevices;
const auditRepo = repos.auditLogs;

/** No 0/O, 1/I/L: easy to read out and type. 31^8 ≈ 8.5e11 codes. */
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 8;
const CODE_MINUTES = 15;

const hashCode = (code) => crypto.createHash('sha256').update(`sacpos-pair:${code}`).digest('hex');
/** "k7qm 3xpd", "K7QM-3XPD" → "K7QM3XPD". */
export const normalizeCode = (raw) => String(raw ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const pretty = (code) => `${code.slice(0, 4)}-${code.slice(4)}`;

function newCode() {
  const bytes = crypto.randomBytes(CODE_LENGTH);
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join('');
}

/* Wrong codes: a few per address, then a 10-minute pause (codes also expire and work once). */
const failures = new Map();
const WINDOW_MS = 10 * 60 * 1000;
const MAX_WRONG = 10;
function assertNotBlocked(ip) {
  const rec = failures.get(ip);
  if (rec && Date.now() - rec.start <= WINDOW_MS && rec.count >= MAX_WRONG) {
    throw new AppError('Too many wrong pairing codes. Wait 10 minutes and ask for a fresh code.', 429, 'TOO_MANY_ATTEMPTS');
  }
}
function recordWrong(ip) {
  const now = Date.now();
  const rec = failures.get(ip);
  if (!rec || now - rec.start > WINDOW_MS) failures.set(ip, { start: now, count: 1 });
  else rec.count += 1;
}

/**
 * A device presents the key held in reserve by a pairing code (scanned from the QR, e.g. by an
 * older SAC-POS): the terminal takes that key now, bound to this device, and the code is used up.
 * Runs inside the firm being searched; returns the terminal or null.
 */
export function promotePendingKey(rawKey, fingerprint) {
  const db = getDatabase();
  const keyHash = hashApiKey(rawKey);
  const row = db.prepare(`
    SELECT * FROM pos_device_pairing_codes
    WHERE pending_key_hash = ? AND used_at IS NULL AND expires_at > ?
  `).get(keyHash, nowIso());
  if (!row) return null;
  db.transaction(() => {
    db.prepare('UPDATE pos_device_pairing_codes SET used_at = ? WHERE id = ? AND used_at IS NULL').run(nowIso(), row.id);
    deviceRepo.rotateKey(row.device_id, { keyPrefix: row.pending_key_prefix, keyHash });
    if (fingerprint) deviceRepo.bindFingerprint(row.device_id, fingerprint);
  })();
  auditRepo.create({
    userId: row.created_by, userName: 'SAC-POS pairing QR', action: 'paired_with_code', module: 'pos',
    recordType: 'pos_device', recordId: row.device_id, newValue: { keyPrefix: row.pending_key_prefix },
  });
  return deviceRepo.findActiveByKeyHash(keyHash);
}

export const posPairing = {
  /**
   * ERP → POS Devices → Connect a device: a fresh one-time code for this terminal (older unused
   * codes stop working). Nothing changes until a device uses it.
   */
  createCode(deviceId, actor, req) {
    authService.checkPermission(actor.permissions, 'pos.devices.edit');
    const device = deviceRepo.findById(deviceId);
    if (!device) throw new AppError('Device not found', 404);
    const db = getDatabase();
    const code = newCode();
    // a key held in reserve for the QR: older SAC-POS apps scan a key; it becomes live only when used
    const pending = generateApiKeySecret();
    const expiresAt = new Date(Date.now() + CODE_MINUTES * 60000).toISOString();
    db.transaction(() => {
      db.prepare('DELETE FROM pos_device_pairing_codes WHERE device_id = ? AND used_at IS NULL').run(deviceId);
      db.prepare(`
        INSERT INTO pos_device_pairing_codes (id, device_id, code_hash, expires_at, created_by, created_at, pending_key_hash, pending_key_prefix)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(generateId(), deviceId, hashCode(code), expiresAt, actor.user.id, nowIso(), pending.keyHash, pending.keyPrefix);
    })();
    auditRepo.create({
      userId: actor.user.id, userName: actor.user.fullName, action: 'pairing_code', module: 'pos',
      recordType: 'pos_device', recordId: deviceId, newValue: { expiresAt },
      ipAddress: req?.ip || null, userAgent: req?.headers?.['user-agent'] || null,
    });
    return {
      code: pretty(code),
      // goes into the QR (and can be typed into an older app); live only once a device uses it
      pendingKey: pending.rawKey,
      expiresAt,
      minutes: CODE_MINUTES,
      device: { id: device.id, code: device.code, name: device.name, lastSeenAt: device.lastSeenAt || null, platform: device.platform || null },
    };
  },

  /**
   * SAC-POS: exchange a pairing code for this terminal's new sync key. The terminal gets a fresh
   * key bound to this device (whatever device used it before is disconnected), and the key goes
   * straight to the device: nobody has to read or type it.
   */
  exchange(rawCode, fingerprint, req) {
    const ip = req?.ip || 'unknown';
    assertNotBlocked(ip);
    const code = normalizeCode(rawCode);
    if (code.length !== CODE_LENGTH) throw new AppError('Enter the 8-character pairing code shown in SACONE ERP → POS Devices.', 400, 'BAD_CODE');
    const deviceKeyId = String(fingerprint || '').trim();
    if (!deviceKeyId) throw new AppError('Device id missing', 400);
    const hash = hashCode(code);
    return firmService.inFirmOf(
      () => getDatabase().prepare('SELECT * FROM pos_device_pairing_codes WHERE code_hash = ?').get(hash),
      (row) => {
        if (!row || row.used_at || row.expires_at < nowIso()) {
          recordWrong(ip);
          throw new AppError('This pairing code is wrong, used or expired. In SACONE ERP → POS Devices choose “Connect a device” for a fresh one.', 401, 'BAD_CODE');
        }
        const db = getDatabase();
        const { rawKey, keyPrefix, keyHash } = generateApiKeySecret();
        const device = db.transaction(() => {
          db.prepare('UPDATE pos_device_pairing_codes SET used_at = ? WHERE id = ? AND used_at IS NULL').run(nowIso(), row.id);
          deviceRepo.rotateKey(row.device_id, { keyPrefix, keyHash });
          deviceRepo.bindFingerprint(row.device_id, deviceKeyId);
          return deviceRepo.findById(row.device_id);
        })();
        auditRepo.create({
          userId: row.created_by, userName: 'SAC-POS pairing code', action: 'paired_with_code', module: 'pos',
          recordType: 'pos_device', recordId: row.device_id, newValue: { keyPrefix },
          ipAddress: req?.ip || null, userAgent: req?.headers?.['user-agent'] || null,
        });
        return { syncKey: rawKey, device: { id: device.id, code: device.code, name: device.name } };
      },
    );
  },
};
