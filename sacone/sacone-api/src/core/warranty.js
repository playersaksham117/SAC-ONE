import { AppError } from './http.js';

/** Warranty / guarantee periods: a whole number of days, months or years from the invoice date. */
export const PERIOD_UNITS = ['days', 'months', 'years'];

/**
 * Clean a period from the product form or CSV. Accepts { value, unit } or text like "1 year",
 * "18 months", "90 days". Blank / 0 → no period ({ value: null, unit: null }).
 */
export function periodFrom(value, unit, label = 'Warranty') {
  let v = value;
  let u = unit;
  if ((u === undefined || u === null || u === '') && typeof v === 'string') {
    const m = v.trim().toLowerCase().match(/^(\d+)\s*(d|day|days|m|mon|month|months|y|yr|yrs|year|years)?$/);
    if (v.trim() && !m) throw new AppError(`${label}: write a number of days, months or years (e.g. 1 year)`, 400);
    if (m) { v = m[1]; u = m[2] || 'months'; }
  }
  const n = v === '' || v === null || v === undefined ? 0 : Number(v);
  if (!n) return { value: null, unit: null };
  if (!Number.isInteger(n) || n < 1 || n > 999) throw new AppError(`${label} must be a whole number from 1 to 999`, 400);
  const key = String(u || '').toLowerCase();
  const normal = key.startsWith('d') ? 'days' : key.startsWith('y') ? 'years' : key.startsWith('m') ? 'months' : null;
  if (!normal) throw new AppError(`${label} unit must be days, months or years`, 400);
  return { value: n, unit: normal };
}

/** "1 Year", "18 Months" — or '' for none. */
export function periodText(value, unit) {
  if (!value || !unit) return '';
  const word = { days: 'Day', months: 'Month', years: 'Year' }[unit] || unit;
  return `${value} ${word}${value === 1 ? '' : 's'}`;
}

/** Last day covered: start date + period − 1 day ('YYYY-MM-DD'), e.g. 21-10-2026 + 1 year → 20-10-2027. */
export function periodEnd(startDate, value, unit) {
  if (!value || !unit || !startDate) return null;
  const d = new Date(`${String(startDate).slice(0, 10)}T00:00:00Z`);
  if (unit === 'days') d.setUTCDate(d.getUTCDate() + value);
  else {
    const day = d.getUTCDate();
    d.setUTCDate(1);
    d.setUTCMonth(d.getUTCMonth() + (unit === 'years' ? value * 12 : value));
    const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
    d.setUTCDate(Math.min(day, last));
  }
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}
