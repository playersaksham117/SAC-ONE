import { describe, expect, it } from 'vitest';
import {
  emptyShipTo, emptyTransport, readShipTo, readTransport, shipToPayload, transportPayload,
} from '../src/domain/dispatch';

describe('transport details', () => {
  it('empty form means no transport', () => {
    expect(readTransport(emptyTransport())).toEqual({ value: null, error: null });
  });
  it('cleans and reads the LR date', () => {
    const r = readTransport({ ...emptyTransport(), mode: 'By Road', transporter: ' Shree  Ganesh Roadways ', vehicleNumber: 'pb08ab1234', lrNumber: '551', lrDate: '19/10/2026', ewayBillNumber: '1234 5678 9012' });
    expect(r.error).toBeNull();
    expect(r.value).toEqual({ mode: 'By Road', transporter: 'Shree Ganesh Roadways', vehicleNumber: 'PB08AB1234', lrNumber: '551', lrDate: '2026-10-19', ewayBillNumber: '123456789012' });
  });
  it('rejects a bad LR date or e-way bill number', () => {
    expect(readTransport({ ...emptyTransport(), lrDate: '31/02/2026' }).error).toMatch(/LR/);
    expect(readTransport({ ...emptyTransport(), ewayBillNumber: '12345' }).error).toMatch(/12 digits/);
  });
  it('sync payload is snake_case', () => {
    expect(transportPayload({ vehicleNumber: 'PB08AB1234', lrDate: '2026-10-19' })).toMatchObject({ vehicle_number: 'PB08AB1234', lr_date: '2026-10-19', transporter: null });
    expect(transportPayload(null)).toBeNull();
  });
});

describe('ship to', () => {
  it('empty form means ship to the buyer', () => {
    expect(readShipTo(emptyShipTo())).toEqual({ value: null, error: null });
  });
  it('needs a name once anything is typed', () => {
    expect(readShipTo({ ...emptyShipTo(), city: 'Ludhiana' }).error).toMatch(/name/);
  });
  it('GSTIN gives the state code', () => {
    const r = readShipTo({ ...emptyShipTo(), name: 'Site Office', city: 'Ludhiana', gstin: '03aabcf1234g1z2' });
    expect(r.value).toEqual({ name: 'Site Office', city: 'Ludhiana', gstin: '03AABCF1234G1Z2', stateCode: '03' });
    expect(readShipTo({ ...emptyShipTo(), name: 'X', gstin: '03ABC' }).error).toMatch(/15/);
    expect(shipToPayload(r.value)).toMatchObject({ name: 'Site Office', state_code: '03', gstin: '03AABCF1234G1Z2', address: null });
  });
});
