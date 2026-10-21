import { describe, expect, it } from 'vitest';
import { billTimestamp, daysAgo, isAdminRole, istToday } from '../src/domain/billDate';

// 21 Oct 2026, 15:30 IST
const now = new Date('2026-10-21T10:00:00.000Z');

describe('admin bill date', () => {
  it('only the firm admin and the group owner', () => {
    expect(isAdminRole('firm_admin')).toBe(true);
    expect(isAdminRole('owner_admin')).toBe(true);
    expect(isAdminRole('manager')).toBe(false);
    expect(isAdminRole(undefined)).toBe(false);
  });
  it('today or nothing keeps the current time', () => {
    expect(billTimestamp(null, now)).toEqual({ iso: now.toISOString(), error: null });
    expect(billTimestamp(istToday(now), now).iso).toBe(now.toISOString());
  });
  it('a past day is stamped at 12:00 noon IST (same date everywhere)', () => {
    expect(billTimestamp('2026-10-18', now)).toEqual({ iso: '2026-10-18T06:30:00.000Z', error: null });
  });
  it('future and invalid dates are refused', () => {
    expect(billTimestamp('2026-10-22', now).error).toMatch(/future/);
    expect(billTimestamp('2026-02-31', now).error).toMatch(/not valid/);
    expect(billTimestamp('21/10/2026', now).error).toMatch(/not valid/);
  });
  it('yesterday chip', () => {
    expect(daysAgo(1, now)).toBe('2026-10-20');
  });
});
