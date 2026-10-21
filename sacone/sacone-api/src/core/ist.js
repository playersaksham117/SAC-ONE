/** India Standard Time helpers (UTC+5:30): working days and office hours follow IST wherever the server runs. */
const IST_OFFSET_MS = 330 * 60000;

const ist = (date = new Date()) => new Date(date.getTime() + IST_OFFSET_MS);

/** 'YYYY-MM-DD' in IST. */
export const istDate = (date = new Date()) => ist(date).toISOString().slice(0, 10);

/** Minutes since midnight in IST. */
export const istMinutes = (date = new Date()) => {
  const d = ist(date);
  return d.getUTCHours() * 60 + d.getUTCMinutes();
};

/** ISO timestamp for an IST date + 'HH:MM'. */
export const istToIso = (date, hhmm) => new Date(`${date}T${hhmm}:00+05:30`).toISOString();

/** 'HH:MM' (IST) of an ISO timestamp. */
export const istHhmm = (iso) => (iso ? ist(new Date(iso)).toISOString().slice(11, 16) : null);

/** Day of week (0 = Sunday) of an IST 'YYYY-MM-DD'. */
export const weekdayOf = (date) => new Date(`${date}T00:00:00Z`).getUTCDay();

/** Every 'YYYY-MM-DD' of a 'YYYY-MM' month. */
export function daysOfMonth(month) {
  const [y, m] = month.split('-').map(Number);
  const count = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return Array.from({ length: count }, (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`);
}

export const isDate = (v) => /^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`))
  && new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) === v; // no 31 Feb
export const isMonth = (v) => /^\d{4}-(0[1-9]|1[0-2])$/.test(String(v || ''));
export const isHhmm = (v) => /^([01]\d|2[0-3]):[0-5]\d$/.test(String(v || ''));
