import { describe, expect, it } from 'vitest';
import { periodEnd, periodNote, periodOf, periodText } from '../src/domain/warranty';
import * as erp from '../../sacone-erp/lib/warranty.js';

// 21 Oct 2026, 10:00 IST
const sold = '2026-10-21T04:30:00.000Z';

describe('warranty / guarantee periods', () => {
  it('reads periods from the product', () => {
    expect(periodOf(2, 'years')).toEqual({ value: 2, unit: 'years' });
    expect(periodOf(0, 'years')).toBeNull();
    expect(periodOf(3, 'weeks')).toBeNull();
    expect(periodText({ value: 1, unit: 'years' })).toBe('1 Year');
    expect(periodText({ value: 18, unit: 'months' })).toBe('18 Months');
  });
  it('runs from the invoice date to the day before the anniversary', () => {
    expect(periodEnd(sold, { value: 1, unit: 'years' })).toBe('2027-10-20');
    expect(periodEnd(sold, { value: 6, unit: 'months' })).toBe('2027-04-20');
    expect(periodEnd(sold, { value: 90, unit: 'days' })).toBe('2027-01-18');
  });
  it('uses the IST date (a bill at 11 pm UTC on the 20th is the 21st in India)', () => {
    expect(periodEnd('2026-10-20T20:00:00.000Z', { value: 1, unit: 'years' })).toBe('2027-10-20');
  });
  it('month ends clamp (31 Jan + 1 month)', () => {
    expect(periodEnd('2026-01-31T06:00:00.000Z', { value: 1, unit: 'months' })).toBe('2026-02-27');
  });
  it('bill note, same on the phone and in the ERP', () => {
    const line = { warranty: { value: 2, unit: 'years' as const }, guarantee: { value: 6, unit: 'months' as const } };
    const note = periodNote(line, sold);
    expect(note).toBe('Warranty 2 Years (till 20/10/2028) · Guarantee 6 Months (till 20/04/2027)');
    expect(erp.periodNote({ warrantyValue: 2, warrantyUnit: 'years', guaranteeValue: 6, guaranteeUnit: 'months' }, sold)).toBe(note);
    expect(periodNote({}, sold)).toBe('');
  });
});
