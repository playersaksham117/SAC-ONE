/** Warranty / guarantee periods from the invoice date (same rules as the ERP's core/warranty.js). */
export type PeriodUnit = 'days' | 'months' | 'years';
export interface Period { value: number; unit: PeriodUnit }

export function periodOf(value?: number | null, unit?: string | null): Period | null {
  return value && value > 0 && (unit === 'days' || unit === 'months' || unit === 'years') ? { value, unit } : null;
}

/** "1 Year", "18 Months" — or '' for none. */
export function periodText(p?: Period | null): string {
  if (!p) return '';
  const word = { days: 'Day', months: 'Month', years: 'Year' }[p.unit];
  return `${p.value} ${word}${p.value === 1 ? '' : 's'}`;
}

/** Last day covered ('YYYY-MM-DD'): start + period − 1 day; the start is the bill's date (IST). */
export function periodEnd(startIso: string, p?: Period | null): string | null {
  if (!p) return null;
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

const ddmmyyyy = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

/** On a quotation (not sold yet): "Warranty 1 Year · Guarantee 6 Months (from invoice date)", or ''. */
export function quoteNote(line: { warranty?: Period | null; guarantee?: Period | null }): string {
  const parts = [line.warranty ? `Warranty ${periodText(line.warranty)}` : '', line.guarantee ? `Guarantee ${periodText(line.guarantee)}` : ''].filter(Boolean);
  return parts.length ? `${parts.join(' · ')} (from invoice date)` : '';
}

/** Under an item on the bill: its serial numbers and warranty / guarantee. */
export function lineNote(line: { warranty?: Period | null; guarantee?: Period | null; serialNumbers?: string[] }, startIso: string): string {
  return [line.serialNumbers?.length ? `S/N ${line.serialNumbers.join(', ')}` : '', periodNote(line, startIso)].filter(Boolean).join(' · ');
}

/** "Warranty 1 Year (till 20/10/2027) · Guarantee 6 Months (till 20/04/2027)" for a bill line, or ''. */
export function periodNote(line: { warranty?: Period | null; guarantee?: Period | null }, startIso: string): string {
  return [['Warranty', line.warranty], ['Guarantee', line.guarantee]]
    .filter(([, p]) => p)
    .map(([label, p]) => `${label} ${periodText(p as Period)} (till ${ddmmyyyy(periodEnd(startIso, p as Period)!)})`)
    .join(' · ');
}
