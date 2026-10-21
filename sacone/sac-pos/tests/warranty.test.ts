import { describe, expect, it } from 'vitest';
import { lineNote, periodEnd, periodNote, periodOf, periodText, quoteNote } from '../src/domain/warranty';
import { parseSerials } from '../src/domain/serials';
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


describe('serial numbers', () => {
  it('splits by new line or comma, trims, keeps order', () => {
    expect(parseSerials(' SN-001 \nSN-002, SN-003 ', 3)).toEqual({ serials: ['SN-001', 'SN-002', 'SN-003'], error: null });
  });
  it('refuses repeats and more serials than units', () => {
    expect(parseSerials('A1\na1', 2).error).toMatch(/twice/);
    expect(parseSerials('A1,A2,A3', 2).error).toMatch(/3 serials for 2 units/);
  });
  it('prints serials with the warranty on the bill', () => {
    expect(lineNote({ serialNumbers: ['SN-1'], warranty: { value: 1, unit: 'years' } }, '2026-10-21T04:30:00.000Z'))
      .toBe('S/N SN-1 · Warranty 1 Year (till 20/10/2027)');
  });
});

describe('quotations', () => {
  it('show periods without end dates (not sold yet)', () => {
    expect(quoteNote({ warranty: { value: 2, unit: 'years' }, guarantee: { value: 6, unit: 'months' } })).toBe('Warranty 2 Years · Guarantee 6 Months (from invoice date)');
    expect(quoteNote({})).toBe('');
  });
});
