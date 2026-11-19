import { describe, expect, it, vi } from 'vitest';

vi.mock('@react-native-async-storage/async-storage', () => ({ default: { getItem: vi.fn(), setItem: vi.fn(), removeItem: vi.fn() } }));

import { sameNameCounts, searchCustomers } from '../src/store/catalog';
import type { Customer } from '../src/domain/types';

const cust = (id: string, name: string, extra: Partial<Customer> = {}): Customer => ({
  id, code: id.toUpperCase(), name, phone: null, email: null, gstin: null, gstStateCode: null,
  address: null, city: null, state: null, creditLimit: 0, creditDays: null, outstanding: 0,
  creditApproved: false, isActive: true, updatedAt: '2026-11-19T00:00:00Z', ...extra,
} as Customer);

const all = Object.fromEntries([
  cust('c1', 'PIMS MEDICAL', { address: 'GARHA ROAD', city: 'JALANDHAR', phone: '7016240995' }),
  cust('c2', 'PIMS MEDICAL', { address: 'MODEL TOWN', city: 'LUDHIANA', phone: '9800011122' }),
  cust('c3', 'SHARMA TRADERS', { city: 'JALANDHAR', gstin: '03ABCDE1234F1Z5' }),
  cust('c4', 'OLD PIMS', { city: 'AMRITSAR', isActive: false }),
].map((c) => [c.id, c]));

describe('searchCustomers', () => {
  it('needs every word, anywhere in name, address or city', () => {
    expect(searchCustomers(all, 'pims garha').map((c) => c.id)).toEqual(['c1']);
    expect(searchCustomers(all, 'pims ludhiana').map((c) => c.id)).toEqual(['c2']);
    expect(searchCustomers(all, 'jalandhar').map((c) => c.id)).toEqual(['c1', 'c3']);
  });

  it('finds by part of the mobile number or GSTIN, skips inactive customers', () => {
    expect(searchCustomers(all, '98000').map((c) => c.id)).toEqual(['c2']);
    expect(searchCustomers(all, '03abcde').map((c) => c.id)).toEqual(['c3']);
    expect(searchCustomers(all, 'pims').map((c) => c.id)).toEqual(['c1', 'c2']);
  });

  it('orders same names by city', () => {
    expect(searchCustomers(all, 'pims medical').map((c) => c.city)).toEqual(['JALANDHAR', 'LUDHIANA']);
  });

  it('counts look-alike names', () => {
    const counts = sameNameCounts(Object.values(all).filter((c) => c.isActive));
    expect(counts['pims medical']).toBe(2);
    expect(counts['sharma traders']).toBe(1);
  });
});
