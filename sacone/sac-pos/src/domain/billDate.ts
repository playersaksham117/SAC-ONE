/** Admin date control on SAC-POS: only the firm admin / group owner may date a bill in the past. */

export const ADMIN_ROLES = ['owner_admin', 'firm_admin'];
export const isAdminRole = (roleSlug?: string | null) => Boolean(roleSlug && ADMIN_ROLES.includes(roleSlug));

/** Today's date in India ('YYYY-MM-DD'). */
export const istToday = (now = new Date()) => new Date(now.getTime() + 330 * 60000).toISOString().slice(0, 10);

/**
 * The bill's timestamp for a chosen day: 12:00 noon IST that day (the same calendar day in every
 * report, as the ERP does). Today (or nothing) keeps "now"; a future day is refused.
 */
export function billTimestamp(date: string | null | undefined, now = new Date()): { iso: string; error: string | null } {
  const today = istToday(now);
  if (!date || date === today) return { iso: now.toISOString(), error: null };
  const real = /^\d{4}-\d{2}-\d{2}$/.test(date) && new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) === date;
  if (!real) return { iso: now.toISOString(), error: 'Bill date is not valid' };
  if (date > today) return { iso: now.toISOString(), error: 'The bill date cannot be in the future' };
  return { iso: new Date(`${date}T12:00:00+05:30`).toISOString(), error: null };
}

/** 'YYYY-MM-DD' that many days before today (IST), for quick chips. */
export const daysAgo = (n: number, now = new Date()) => istToday(new Date(now.getTime() - n * 86400000));
