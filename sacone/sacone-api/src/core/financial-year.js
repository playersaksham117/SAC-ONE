/**
 * Indian financial years: 1 April to 31 March, written '2026-27'.
 * Dates are compared as YYYY-MM-DD strings in India time, the way the rest of the app stores them.
 */

const FY_PATTERN = /^(\d{4})-(\d{2})$/;

/** Calendar date in India (UTC+5:30) as YYYY-MM-DD. */
export function indiaDate(date = new Date()) {
  return new Date(new Date(date).getTime() + 330 * 60000).toISOString().slice(0, 10);
}

/** Financial year containing `date` (a Date, ISO timestamp or YYYY-MM-DD). */
export function financialYearOf(date = new Date()) {
  const day = typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : indiaDate(date);
  const year = Number(day.slice(0, 4));
  const start = Number(day.slice(5, 7)) >= 4 ? year : year - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, '0')}`;
}

export function isFinancialYear(code) {
  const m = FY_PATTERN.exec(String(code || ''));
  return Boolean(m) && (Number(m[1]) + 1) % 100 === Number(m[2]);
}

/** { code, from, to, label } for a code like '2026-27', or null when malformed. */
export function financialYearRange(code) {
  if (!isFinancialYear(code)) return null;
  const start = Number(code.slice(0, 4));
  return {
    code,
    from: `${start}-04-01`,
    to: `${start + 1}-03-31`,
    label: `FY ${code} (Apr ${start} – Mar ${start + 1})`,
  };
}

/** Every financial year from `first` up to the current one, newest first. */
export function financialYearsSince(first, now = new Date()) {
  const current = financialYearOf(now);
  const startYear = Number((isFinancialYear(first) ? first : current).slice(0, 4));
  const currentYear = Number(current.slice(0, 4));
  const list = [];
  for (let y = currentYear; y >= Math.min(startYear, currentYear); y -= 1) {
    list.push(financialYearRange(`${y}-${String((y + 1) % 100).padStart(2, '0')}`));
  }
  return list;
}

/* ── Short labels used by document numbering (series restart each year): '26-27' ── */

/** Short label, e.g. 26-27 for the year starting April 2026. */
export function getFinancialYear(dateInput = new Date()) {
  const d = dateInput instanceof Date ? dateInput : new Date(dateInput);
  if (Number.isNaN(d.getTime())) {
    throw new Error('Invalid date for financial year');
  }
  const month = d.getMonth() + 1; // 1-12
  const year = d.getFullYear();
  const startYear = month >= 4 ? year : year - 1;
  const endYear = startYear + 1;
  const yy = (n) => String(n % 100).padStart(2, '0');
  return `${yy(startYear)}-${yy(endYear)}`;
}

export function getFinancialYearRange(fyLabel) {
  const [startYy, endYy] = fyLabel.split('-').map((s) => parseInt(s, 10));
  if (!Number.isFinite(startYy) || !Number.isFinite(endYy)) {
    throw new Error(`Invalid financial year label: ${fyLabel}`);
  }
  const century = new Date().getFullYear() - (new Date().getFullYear() % 100);
  const startYear = century + startYy;
  const endYear = century + endYy;
  return {
    from: new Date(startYear, 3, 1),
    to: new Date(endYear, 2, 31, 23, 59, 59),
    label: fyLabel,
  };
}
