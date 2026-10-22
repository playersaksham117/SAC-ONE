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
  // e-way bill: approximate road distance, transporter's GSTIN / TRANSIN, delivery pincode, EWB date
  const distance = clean(pick(raw, 'distanceKm', 'distance_km'), 6);
  if (distance && !(/^\d+$/.test(distance) && Number(distance) <= 4000)) throw new AppError('Distance must be whole kilometres (up to 4000)', 400);
  const transporterId = clean(pick(raw, 'transporterId', 'transporter_id'), 15).toUpperCase().replace(/\s/g, '');
  if (transporterId && !/^[0-9A-Z]{15}$/.test(transporterId)) throw new AppError('Transporter ID must be the 15-character GSTIN / TRANSIN', 400);
  const deliveryPincode = clean(pick(raw, 'deliveryPincode', 'delivery_pincode'), 6);
  if (deliveryPincode && !/^[1-9]\d{5}$/.test(deliveryPincode)) throw new AppError('Delivery pincode must be 6 digits', 400);
  const ewayBillDate = clean(pick(raw, 'ewayBillDate', 'eway_bill_date'), 10);
  if (ewayBillDate && !/^\d{4}-\d{2}-\d{2}$/.test(ewayBillDate)) throw new AppError('E-way bill date must be a date', 400);
  return compact({
    mode: clean(pick(raw, 'mode'), 30),
    transporter: clean(pick(raw, 'transporter', 'transporter_name'), 80),
    transporterId,
    vehicleNumber: clean(pick(raw, 'vehicleNumber', 'vehicle_number'), 20).toUpperCase().replace(/[\s-]/g, ''),
    lrNumber: clean(pick(raw, 'lrNumber', 'lr_number'), 40),
    lrDate,
    distanceKm: distance ? Number(distance) : '',
    deliveryPincode,
    ewayBillNumber: clean(pick(raw, 'ewayBillNumber', 'eway_bill_number'), 20),
    ewayBillDate,
  });
}

export function shipToFrom(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const gstin = clean(pick(raw, 'gstin', 'gstNumber'), 15).toUpperCase().replace(/\s/g, '');
  if (gstin && !/^[0-9]{2}[A-Z0-9]{13}$/.test(gstin)) throw new AppError('Ship-to GSTIN must be 15 characters', 400);
  const stateCode = clean(pick(raw, 'stateCode', 'state_code'), 2) || (gstin ? gstin.slice(0, 2) : '');
  const out = compact({
    name: clean(pick(raw, 'name'), 120),
    address: clean(pick(raw, 'address'), 300),
    city: clean(pick(raw, 'city'), 80),
    state: clean(pick(raw, 'state'), 60),
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
