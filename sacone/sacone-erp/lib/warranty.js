/** Warranty / guarantee periods from the invoice date (same rules as the API's core/warranty.js and SAC-POS). */

export function periodOf(value, unit) {
  return value && value > 0 && ['days', 'months', 'years'].includes(unit) ? { value, unit } : null;
}

/** "1 Year", "18 Months" — or '' for none. */
export function periodText(p) {
  if (!p) return '';
  const word = { days: 'Day', months: 'Month', years: 'Year' }[p.unit] || p.unit;
  return `${p.value} ${word}${p.value === 1 ? '' : 's'}`;
}

/** Last day covered ('YYYY-MM-DD'): start + period − 1 day; the start is the bill's date (IST). */
export function periodEnd(startIso, p) {
  if (!p || !startIso) return null;
  const ist = new Date(new Date(startIso).getTime() + 330 * 60000).toISOString().slice(0, 10);
  const d = new Date(`${ist}T00:00:00Z`);
  if (p.unit === 'days') d.setUTCDate(d.getUTCDate() + p.value);
  else {
    const day = d.getUTCDate();
    d.setUTCDate(1);
    d.setUTCMonth(d.getUTCMonth() + (p.unit === 'years' ? p.value * 12 : p.value));
    d.setUTCDate(Math.min(day, new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate()));
  }
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

const ddmmyyyy = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

/** "Warranty 1 Year (till 20/10/2027) · Guarantee 6 Months (till 20/04/2027)" for an invoice line, or ''. */
export function periodNote(line, startIso) {
  return [
    ['Warranty', periodOf(line.warrantyValue, line.warrantyUnit)],
    ['Guarantee', periodOf(line.guaranteeValue, line.guaranteeUnit)],
  ]
    .filter(([, p]) => p)
    .map(([label, p]) => `${label} ${periodText(p)} (till ${ddmmyyyy(periodEnd(startIso, p))})`)
    .join(' · ');
}
