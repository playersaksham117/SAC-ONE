import { parsePoDate } from './po';

/** Transport / dispatch details printed on a GST bill. */
export interface Transport {
  mode?: string;
  transporter?: string;
  vehicleNumber?: string;
  lrNumber?: string;
  /** YYYY-MM-DD */
  lrDate?: string;
  ewayBillNumber?: string;
}

/** Consignee ("Shipped To") when goods go somewhere other than the buyer (Bill To). */
export interface ShipTo {
  name: string;
  address?: string;
  city?: string;
  state?: string;
  stateCode?: string;
  gstin?: string;
  phone?: string;
}

export const TRANSPORT_MODES = ['By Road', 'By Hand', 'Courier', 'Rail', 'Air'] as const;

export interface TransportDraft { mode: string; transporter: string; vehicleNumber: string; lrNumber: string; lrDate: string; ewayBillNumber: string }
export interface ShipToDraft { name: string; address: string; city: string; state: string; gstin: string; phone: string }

export const emptyTransport = (): TransportDraft => ({ mode: '', transporter: '', vehicleNumber: '', lrNumber: '', lrDate: '', ewayBillNumber: '' });
export const emptyShipTo = (): ShipToDraft => ({ name: '', address: '', city: '', state: '', gstin: '', phone: '' });

const t = (v: string, max: number) => v.replace(/\s+/g, ' ').trim().slice(0, max);
function compact<T extends object>(o: T): T | null {
  const out = Object.fromEntries(Object.entries(o).filter(([, v]) => v)) as T;
  return Object.keys(out).length ? out : null;
}

/** Checks the Transport form: empty → null; LR date typed as DD/MM/YYYY. */
export function readTransport(d: TransportDraft): { value: Transport | null; error: string | null } {
  const lrDateText = d.lrDate.trim();
  const lrDate = lrDateText ? parsePoDate(lrDateText) : null;
  if (lrDateText && !lrDate) return { value: null, error: 'LR / GR date: use DD/MM/YYYY' };
  const ewb = t(d.ewayBillNumber, 20).replace(/\s/g, '');
  if (ewb && !/^\d{12}$/.test(ewb)) return { value: null, error: 'E-way bill number has 12 digits' };
  return {
    value: compact<Transport>({
      mode: t(d.mode, 30),
      transporter: t(d.transporter, 80),
      vehicleNumber: t(d.vehicleNumber, 20).toUpperCase(),
      lrNumber: t(d.lrNumber, 40),
      lrDate: lrDate ?? undefined,
      ewayBillNumber: ewb,
    }),
    error: null,
  };
}

/** Checks the Ship To form: needs a name; GSTIN (optional) is 15 characters and gives the state code. */
export function readShipTo(d: ShipToDraft): { value: ShipTo | null; error: string | null } {
  const gstin = t(d.gstin, 15).toUpperCase().replace(/\s/g, '');
  const filled = [d.name, d.address, d.city, d.state, d.gstin, d.phone].some((v) => v.trim());
  if (!filled) return { value: null, error: null };
  if (!t(d.name, 120)) return { value: null, error: 'Ship To needs a name' };
  if (gstin && !/^\d{2}[A-Z0-9]{13}$/.test(gstin)) return { value: null, error: 'Ship To GSTIN must be 15 characters' };
  return {
    value: compact<ShipTo>({
      name: t(d.name, 120),
      address: t(d.address, 300),
      city: t(d.city, 80),
      state: t(d.state, 60),
      stateCode: gstin ? gstin.slice(0, 2) : undefined,
      gstin,
      phone: t(d.phone, 20),
    }),
    error: null,
  };
}

/** SACONE sync payload (snake_case). */
export const transportPayload = (x?: Transport | null) => (x ? {
  mode: x.mode ?? null, transporter: x.transporter ?? null, vehicle_number: x.vehicleNumber ?? null,
  lr_number: x.lrNumber ?? null, lr_date: x.lrDate ?? null, eway_bill_number: x.ewayBillNumber ?? null,
} : null);
export const shipToPayload = (x?: ShipTo | null) => (x ? {
  name: x.name, address: x.address ?? null, city: x.city ?? null, state: x.state ?? null,
  state_code: x.stateCode ?? null, gstin: x.gstin ?? null, phone: x.phone ?? null,
} : null);
