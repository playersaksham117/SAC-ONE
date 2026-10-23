import { AppError } from './http.js';

/**
 * Transport details and Ship-to (consignee) of a GST bill. Accepts camelCase (ERP) or
 * snake_case (SAC-POS) keys; blank fields are dropped and an all-blank block becomes null.
 */

const clean = (v, max) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const pick = (o, ...keys) => keys.map((k) => o?.[k]).find((v) => v != null && v !== '');
const compact = (o) => {
  const out = Object.fromEntries(Object.entries(o).filter(([, v]) => v));
  return Object.keys(out).length ? out : null;
};

export function transportFrom(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const lrDate = clean(pick(raw, 'lrDate', 'lr_date'), 10);
  if (lrDate && !/^\d{4}-\d{2}-\d{2}$/.test(lrDate)) throw new AppError('LR / GR date must be a date', 400);
  return compact({
    mode: clean(pick(raw, 'mode'), 30),
    transporter: clean(pick(raw, 'transporter', 'transporter_name'), 80).toUpperCase(),
    vehicleNumber: clean(pick(raw, 'vehicleNumber', 'vehicle_number'), 20).toUpperCase(),
    lrNumber: clean(pick(raw, 'lrNumber', 'lr_number'), 40),
    lrDate,
    ewayBillNumber: clean(pick(raw, 'ewayBillNumber', 'eway_bill_number'), 20),
  });
}

export function shipToFrom(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const gstin = clean(pick(raw, 'gstin', 'gstNumber'), 15).toUpperCase().replace(/\s/g, '');
  if (gstin && !/^[0-9]{2}[A-Z0-9]{13}$/.test(gstin)) throw new AppError('Ship-to GSTIN must be 15 characters', 400);
  const stateCode = clean(pick(raw, 'stateCode', 'state_code'), 2) || (gstin ? gstin.slice(0, 2) : '');
  const out = compact({
    name: clean(pick(raw, 'name'), 120).toUpperCase(),
    address: clean(pick(raw, 'address'), 300).toUpperCase(),
    city: clean(pick(raw, 'city'), 80).toUpperCase(),
    state: clean(pick(raw, 'state'), 60).toUpperCase(),
    stateCode,
    gstin,
    phone: clean(pick(raw, 'phone'), 20),
  });
  if (out && !out.name) throw new AppError('Ship-to needs a name', 400);
  return out;
}

export const parseJsonObject = (text) => {
  if (!text) return null;
  try { const v = JSON.parse(text); return v && typeof v === 'object' ? v : null; } catch { return null; }
};
