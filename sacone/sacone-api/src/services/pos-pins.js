import bcrypt from 'bcryptjs';
import { AppError } from '../core/http.js';
import { nowIso } from '../core/utils.js';
import { getCoreDatabase } from '../database/connection.js';
import { currentFirmId } from '../database/context.js';
import { FIRM_ADMIN } from '../database/firm-identity.js';
import { repos } from '../repositories/index.js';
import { authService, isFirmAdmin } from './index.js';

/**
 * SAC-POS sign-in by Login ID (or email) + PIN. The PIN is set only by an admin in ERP → Users,
 * never on the phone. Lives in the main database only; wrong PINs lock the login for a while.
 */

export const MAX_PIN_FAILS = 5;
const LOCK_MINUTES = 15;
const db = () => getCoreDatabase();

/** 4–6 digits; not all the same digit, not 1234 / 123456 / 0000. */
export function checkPinRules(pin) {
  const p = String(pin ?? '');
  if (!/^\d{4,6}$/.test(p)) throw new AppError('PIN must be 4 to 6 digits', 400);
  if (/^(\d)\1+$/.test(p) || ['1234', '12345', '123456', '4321', '654321'].includes(p)) {
    throw new AppError('Choose a less obvious PIN (not 1234 or repeated digits)', 400);
  }
  return p;
}

const normaliseLoginId = (v) => String(v ?? '').trim().toUpperCase();

function row(userId) {
  return db().prepare('SELECT * FROM user_pos_pins WHERE user_id = ?').get(userId);
}

export const posPins = {
  /** userId → { loginId, pinSet, pinSetAt } for the Users screen. */
  infoFor(userIds) {
    if (!userIds.length) return {};
    const rows = db().prepare(`SELECT user_id, login_id, pin_hash, pin_set_at, locked_until FROM user_pos_pins
      WHERE user_id IN (${userIds.map(() => '?').join(',')})`).all(...userIds);
    return Object.fromEntries(rows.map((r) => [r.user_id, {
      loginId: r.login_id || null,
      pinSet: Boolean(r.pin_hash),
      pinSetAt: r.pin_set_at || null,
      locked: Boolean(r.locked_until && r.locked_until > nowIso()),
    }]));
  },

  /** When this user's PIN was last set or cleared (phones drop a cached PIN when it changes). */
  pinVersion(userId) {
    const r = row(userId);
    return r?.pin_hash ? r.pin_set_at : null;
  },

  /** Admin sets / changes a user's Login ID and PIN (data.pin empty = keep the PIN; data.clear = remove it). */
  set(userId, data, actor, req, { ownVerified = false } = {}) {
    if (!ownVerified) authService.checkPermission(actor.permissions, 'core.users.edit');
    const user = repos.users.findById(userId);
    const self = userId === actor.user.id;
    if (!user || (!self && user.firmId !== currentFirmId())) throw new AppError('User not found', 404);
    if (user.roleSlug === FIRM_ADMIN && !self && !isFirmAdmin(actor.user)) {
      throw new AppError('Only the group owner or a firm admin can change a Firm Admin', 403, 'ADMIN_ONLY');
    }
    const existing = row(userId);
    const loginId = data.loginId !== undefined ? normaliseLoginId(data.loginId) : (existing?.login_id || '');
    if (loginId && !/^[A-Z0-9._-]{2,20}$/.test(loginId)) throw new AppError('Login ID: 2–20 letters or digits', 400);
    if (loginId) {
      const taken = db().prepare('SELECT user_id FROM user_pos_pins WHERE lower(login_id) = lower(?) AND user_id != ?').get(loginId, userId);
      if (taken) throw new AppError(`Login ID ${loginId} is already used by someone else`, 409);
    }
    let pinHash = existing?.pin_hash || null;
    let pinSetAt = existing?.pin_set_at || null;
    if (data.clear) { pinHash = null; pinSetAt = nowIso(); }
    else if (data.pin) { pinHash = bcrypt.hashSync(checkPinRules(data.pin), 10); pinSetAt = nowIso(); }
    const now = nowIso();
    db().prepare(`
      INSERT INTO user_pos_pins (user_id, login_id, pin_hash, pin_set_at, failed_count, locked_until, set_by, updated_at)
      VALUES (?, ?, ?, ?, 0, NULL, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET login_id = excluded.login_id, pin_hash = excluded.pin_hash, pin_set_at = excluded.pin_set_at,
        failed_count = CASE WHEN excluded.pin_set_at IS NOT user_pos_pins.pin_set_at THEN 0 ELSE user_pos_pins.failed_count END,
        locked_until = CASE WHEN excluded.pin_set_at IS NOT user_pos_pins.pin_set_at THEN NULL ELSE user_pos_pins.locked_until END,
        set_by = excluded.set_by, updated_at = excluded.updated_at
    `).run(userId, loginId || null, pinHash, pinSetAt, actor.user.id, now);
    repos.auditLogs.create({
      userId: actor.user.id, userName: actor.user.fullName,
      action: data.clear ? 'clear_pos_pin' : data.pin ? 'set_pos_pin' : 'update_pos_login', module: 'core',
      recordType: 'user', recordId: userId, newValue: { loginId: loginId || null },
      ipAddress: req?.ip || null, userAgent: req?.headers?.['user-agent'] || null,
    });
    return { loginId: loginId || null, ...this.infoFor([userId])[userId] };
  },

  /** Anyone sets their own SAC-POS PIN in the ERP, confirming with their current password. */
  setOwn(actor, data, req) {
    const me = repos.users.findByEmailWithPassword(actor.user.email);
    if (!me || !bcrypt.compareSync(String(data.currentPassword || ''), me.password_hash)) {
      throw new AppError('Current password is wrong', 400, 'BAD_PASSWORD');
    }
    if (!data.pin && !data.clear && data.loginId === undefined) throw new AppError('Enter a PIN', 400);
    return this.set(actor.user.id, { loginId: data.loginId, pin: data.pin, clear: data.clear }, actor, req, { ownVerified: true });
  },

  /** My SAC-POS Login ID and whether my PIN is set. */
  own(actor) {
    return this.infoFor([actor.user.id])[actor.user.id] || { loginId: null, pinSet: false, pinSetAt: null, locked: false };
  },

  /** Check Login ID / email + PIN; returns the user row (as for password sign-in) or throws. */
  verify(identifier, pin) {
    const id = String(identifier ?? '').trim();
    if (!id || !pin) throw new AppError('Enter your Login ID or email and your PIN', 400);
    const byLogin = db().prepare('SELECT user_id FROM user_pos_pins WHERE lower(login_id) = lower(?)').get(id);
    const userRow = byLogin
      ? db().prepare('SELECT u.*, r.name AS role_name, r.slug AS role_slug FROM users u JOIN roles r ON r.id = u.role_id WHERE u.id = ?').get(byLogin.user_id)
      : repos.users.findByEmailWithPassword(id);
    const bad = () => new AppError('Wrong Login ID or PIN', 401, 'INVALID_CREDENTIALS');
    if (!userRow || !userRow.is_active) throw bad();
    const r = row(userRow.id);
    if (!r?.pin_hash) throw new AppError('No SAC-POS PIN is set for you. Ask your admin to set it in ERP → Users.', 403, 'NO_PIN');
    if (r.locked_until && r.locked_until > nowIso()) {
      throw new AppError(`Too many wrong PINs. Try again after ${new Date(r.locked_until).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })} or ask your admin to reset the PIN.`, 423, 'PIN_LOCKED');
    }
    if (!bcrypt.compareSync(String(pin), r.pin_hash)) {
      const fails = r.failed_count + 1;
      const lock = fails >= MAX_PIN_FAILS ? new Date(Date.now() + LOCK_MINUTES * 60000).toISOString() : null;
      db().prepare('UPDATE user_pos_pins SET failed_count = ?, locked_until = ? WHERE user_id = ?').run(lock ? 0 : fails, lock, userRow.id);
      if (lock) throw new AppError(`Too many wrong PINs. This login is locked for ${LOCK_MINUTES} minutes.`, 423, 'PIN_LOCKED');
      throw new AppError(`Wrong Login ID or PIN (${MAX_PIN_FAILS - fails} tries left)`, 401, 'INVALID_CREDENTIALS');
    }
    db().prepare('UPDATE user_pos_pins SET failed_count = 0, locked_until = NULL WHERE user_id = ?').run(userRow.id);
    return { userRow, pinSetAt: r.pin_set_at };
  },
};
