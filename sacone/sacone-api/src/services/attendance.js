import { AppError } from '../core/http.js';
import { generateId, nowIso } from '../core/utils.js';
import {
  daysOfMonth, isDate, isHhmm, isMonth, istDate, istHhmm, istMinutes, istToIso, weekdayOf,
} from '../core/ist.js';
import { currentFirmId } from '../database/context.js';
import { getDatabase } from '../database/connection.js';
import { repos } from '../repositories/index.js';
import { authService } from './index.js';

/**
 * Attendance of the firm's users (User Management). Staff check in / out from the ERP or SAC-POS;
 * managers mark or correct the daily register; the monthly summary counts days and hours.
 * Times are kept as ISO timestamps; dates and office hours follow IST.
 */

export const STATUSES = ['present', 'half_day', 'absent', 'leave', 'holiday', 'week_off'];
const SETTINGS = {
  start: ['attendance.start_time', '10:00'],
  grace: ['attendance.grace_minutes', '15'],
  halfDayHours: ['attendance.half_day_hours', '4'],
  weekOff: ['attendance.week_off', '0'],
};

const need = (actor, key) => authService.checkPermission(actor.permissions, key);
const db = () => getDatabase();
const settingsRepo = repos.systemSettings;

function mapRecord(r) {
  if (!r) return null;
  return {
    id: r.id,
    userId: r.user_id,
    date: r.work_date,
    status: r.status,
    checkIn: r.check_in,
    checkOut: r.check_out,
    inTime: istHhmm(r.check_in),
    outTime: istHhmm(r.check_out),
    minutes: Number(r.minutes || 0),
    late: Boolean(r.late),
    source: r.source,
    note: r.note,
    markedBy: r.marked_by,
    updatedAt: r.updated_at,
  };
}

const toMinutes = (hhmm) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

export class AttendanceService {
  settings() {
    const get = ([key, fallback]) => settingsRepo.get(key)?.value ?? fallback;
    return {
      startTime: isHhmm(get(SETTINGS.start)) ? get(SETTINGS.start) : '10:00',
      graceMinutes: Math.max(0, Number(get(SETTINGS.grace)) || 0),
      halfDayHours: Math.max(0, Number(get(SETTINGS.halfDayHours)) || 0),
      weekOff: String(get(SETTINGS.weekOff)).split(',').map((d) => d.trim()).filter((d) => /^[0-6]$/.test(d)).map(Number),
    };
  }

  saveSettings(data, actor) {
    need(actor, 'attendance.register.edit');
    if (!isHhmm(data.startTime)) throw new AppError('Office start time must be HH:MM', 400);
    const grace = Number(data.graceMinutes);
    const half = Number(data.halfDayHours);
    if (!(grace >= 0 && grace <= 240)) throw new AppError('Grace minutes must be 0–240', 400);
    if (!(half >= 0 && half <= 12)) throw new AppError('Half-day hours must be 0–12', 400);
    const weekOff = [...new Set((data.weekOff || []).map(Number).filter((d) => d >= 0 && d <= 6))].sort();
    settingsRepo.upsert(SETTINGS.start[0], data.startTime, 'Office start time (IST)', actor.user.id);
    settingsRepo.upsert(SETTINGS.grace[0], grace, 'Minutes after start before a check-in is late', actor.user.id);
    settingsRepo.upsert(SETTINGS.halfDayHours[0], half, 'Worked hours below this count as a half day', actor.user.id);
    settingsRepo.upsert(SETTINGS.weekOff[0], weekOff.join(','), 'Weekly off days (0 = Sunday)', actor.user.id);
    return this.settings();
  }

  #record(userId, date) {
    return mapRecord(db().prepare('SELECT * FROM attendance WHERE user_id = ? AND work_date = ?').get(userId, date));
  }

  /** Check in (action 'in') or out ('out') now, from the ERP or a SAC-POS terminal. */
  punch(userId, action, source = 'erp') {
    const today = istDate();
    const now = new Date();
    const existing = this.#record(userId, today);
    const s = this.settings();
    if (action === 'in') {
      if (existing?.checkIn) throw new AppError(`Already checked in today at ${existing.inTime}`, 409, 'ALREADY_IN');
      const late = istMinutes(now) > toMinutes(s.startTime) + s.graceMinutes ? 1 : 0;
      if (existing) {
        db().prepare("UPDATE attendance SET status = 'present', check_in = ?, late = ?, source = ?, updated_at = ? WHERE id = ?")
          .run(now.toISOString(), late, source, nowIso(), existing.id);
      } else {
        db().prepare(`INSERT INTO attendance (id, user_id, work_date, status, check_in, late, source, created_at, updated_at)
          VALUES (?, ?, ?, 'present', ?, ?, ?, ?, ?)`).run(generateId(), userId, today, now.toISOString(), late, source, nowIso(), nowIso());
      }
    } else if (action === 'out') {
      if (!existing?.checkIn) throw new AppError('Check in first', 409, 'NOT_IN');
      if (existing.checkOut) throw new AppError(`Already checked out today at ${existing.outTime}`, 409, 'ALREADY_OUT');
      const minutes = Math.max(0, Math.round((now - new Date(existing.checkIn)) / 60000));
      const status = s.halfDayHours > 0 && minutes < s.halfDayHours * 60 ? 'half_day' : 'present';
      db().prepare('UPDATE attendance SET check_out = ?, minutes = ?, status = ?, updated_at = ? WHERE id = ?')
        .run(now.toISOString(), minutes, status, nowIso(), existing.id);
    } else {
      throw new AppError("Action must be 'in' or 'out'", 400);
    }
    return this.#record(userId, today);
  }

  /** My today and my month. */
  me(query, actor) {
    need(actor, 'attendance.self.view');
    const month = isMonth(query.month) ? query.month : istDate().slice(0, 7);
    const rows = db().prepare('SELECT * FROM attendance WHERE user_id = ? AND substr(work_date, 1, 7) = ? ORDER BY work_date DESC')
      .all(actor.user.id, month).map(mapRecord);
    return {
      today: this.#record(actor.user.id, istDate()),
      date: istDate(),
      month,
      records: rows,
      totals: this.#totals(rows),
      settings: this.settings(),
    };
  }

  checkIn(actor) {
    need(actor, 'attendance.self.create');
    return this.punch(actor.user.id, 'in', 'erp');
  }

  checkOut(actor) {
    need(actor, 'attendance.self.create');
    return this.punch(actor.user.id, 'out', 'erp');
  }

  /** The firm's active users, plus anyone else with attendance in the period (e.g. the group owner). */
  #users(recordUserIds = []) {
    const list = repos.users.findAll({ includeInactive: false, firmId: currentFirmId() });
    const known = new Set(list.map((u) => u.id));
    for (const id of new Set(recordUserIds)) {
      if (known.has(id)) continue;
      const u = repos.users.findById(id);
      if (u) list.push(u);
    }
    return list;
  }

  /** Everyone's attendance for one day. */
  register(query, actor) {
    need(actor, 'attendance.register.view');
    const date = isDate(query.date) ? query.date : istDate();
    const byUser = new Map(db().prepare('SELECT * FROM attendance WHERE work_date = ?').all(date).map((r) => [r.user_id, mapRecord(r)]));
    const weekOff = this.settings().weekOff.includes(weekdayOf(date));
    return {
      date,
      isWeekOff: weekOff,
      rows: this.#users([...byUser.keys()]).map((u) => ({ userId: u.id, fullName: u.fullName, roleName: u.roleName, record: byUser.get(u.id) || null })),
    };
  }

  /** Mark or correct a day for several users at once. */
  saveRegister(data, actor) {
    need(actor, 'attendance.register.edit');
    if (!isDate(data.date)) throw new AppError('Choose a date', 400);
    if (data.date > istDate()) throw new AppError('Attendance cannot be marked for a future date', 400);
    const users = new Map(this.#users(db().prepare('SELECT user_id FROM attendance WHERE work_date = ?').all(data.date).map((r) => r.user_id)).map((u) => [u.id, u]));
    const s = this.settings();
    let saved = 0;
    for (const e of data.entries || []) {
      if (!users.has(e.userId)) throw new AppError('Unknown user in the register', 400);
      const existing = this.#record(e.userId, data.date);
      if (!e.status) {
        if (existing) { db().prepare('DELETE FROM attendance WHERE id = ?').run(existing.id); saved += 1; }
        continue;
      }
      if (!STATUSES.includes(e.status)) throw new AppError('Unknown status', 400);
      const working = ['present', 'half_day'].includes(e.status);
      for (const t of [e.inTime, e.outTime]) if (t && !isHhmm(t)) throw new AppError('Times must be HH:MM', 400);
      const checkIn = working && e.inTime ? istToIso(data.date, e.inTime) : null;
      const checkOut = working && e.outTime ? istToIso(data.date, e.outTime) : null;
      if (checkIn && checkOut && checkOut <= checkIn) throw new AppError(`${users.get(e.userId).fullName}: out time must be after in time`, 400);
      const minutes = checkIn && checkOut ? Math.round((new Date(checkOut) - new Date(checkIn)) / 60000) : 0;
      const late = checkIn && toMinutes(e.inTime) > toMinutes(s.startTime) + s.graceMinutes ? 1 : 0;
      const note = String(e.note || '').trim().slice(0, 200) || null;
      const same = existing && existing.status === e.status && existing.inTime === (checkIn ? e.inTime : null)
        && existing.outTime === (checkOut ? e.outTime : null) && (existing.note || null) === note;
      if (same) continue;
      if (existing) {
        db().prepare(`UPDATE attendance SET status = ?, check_in = ?, check_out = ?, minutes = ?, late = ?, note = ?, source = 'admin',
          marked_by = ?, updated_at = ? WHERE id = ?`).run(e.status, checkIn, checkOut, minutes, late, note, actor.user.id, nowIso(), existing.id);
      } else {
        db().prepare(`INSERT INTO attendance (id, user_id, work_date, status, check_in, check_out, minutes, late, source, note, marked_by, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'admin', ?, ?, ?, ?)`)
          .run(generateId(), e.userId, data.date, e.status, checkIn, checkOut, minutes, late, note, actor.user.id, nowIso(), nowIso());
      }
      saved += 1;
    }
    return { saved, ...this.register({ date: data.date }, actor) };
  }

  #totals(records) {
    const t = { present: 0, half_day: 0, absent: 0, leave: 0, holiday: 0, week_off: 0, late: 0, minutes: 0 };
    for (const r of records) {
      t[r.status] += 1;
      if (r.late) t.late += 1;
      t.minutes += r.minutes;
    }
    t.days = t.present + t.half_day / 2;
    return t;
  }

  /** Per user for a month: days present / half / absent / leave, late arrivals, hours, days not marked. */
  summary(query, actor) {
    if (!actor.permissions.includes('attendance.register.view')) need(actor, 'attendance.reports.view');
    const month = isMonth(query.month) ? query.month : istDate().slice(0, 7);
    const today = istDate();
    const { weekOff } = this.settings();
    const days = daysOfMonth(month).filter((d) => d <= today);
    const workingDays = days.filter((d) => !weekOff.includes(weekdayOf(d)));
    const rows = db().prepare('SELECT * FROM attendance WHERE substr(work_date, 1, 7) = ?').all(month).map(mapRecord);
    // Days before attendance was first used in this firm are not counted as "not marked".
    const firstUse = db().prepare('SELECT MIN(work_date) AS d FROM attendance').get()?.d || today;
    const byUser = new Map();
    for (const r of rows) {
      if (!byUser.has(r.userId)) byUser.set(r.userId, []);
      byUser.get(r.userId).push(r);
    }
    return {
      month,
      workingDays: workingDays.length,
      rows: this.#users([...byUser.keys()]).map((u) => {
        const recs = byUser.get(u.id) || [];
        const marked = new Set(recs.map((r) => r.date));
        const joined = String(u.createdAt || '').slice(0, 10);
        const notMarked = workingDays.filter((d) => !marked.has(d) && d >= joined && d >= firstUse && d < today).length;
        return { userId: u.id, fullName: u.fullName, roleName: u.roleName, ...this.#totals(recs), notMarked };
      }),
    };
  }

  /** SAC-POS: check in / out for the signed-in staff member on this terminal. */
  posPunch(staff, action) {
    if (!staff?.exists) throw new AppError('Staff member not found', 404);
    if (!staff.isActive) throw new AppError('This login is not active for this firm', 403);
    if (!staff.permissions.includes('attendance.self.create')) throw new AppError('Your role does not include attendance check-in', 403, 'FORBIDDEN');
    if (action === 'status') return { today: this.#record(staff.id, istDate()), date: istDate() };
    return { today: this.punch(staff.id, action, 'pos'), date: istDate() };
  }
}

export const attendanceService = new AttendanceService();
