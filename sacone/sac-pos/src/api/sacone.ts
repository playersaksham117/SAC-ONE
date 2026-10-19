import { request } from './client';
import type { PayBank } from '../domain/upi';

/** Typed calls to SACONE. Auth → ERP session; everything else → device sync key (/api/v1/sync). */

export interface DeviceConfig {
  baseUrl: string;
  deviceKey: string;
  deviceId: string;
}

export interface CompanyInfo {
  businessName?: string | null;
  gstNumber?: string | null;
  gstStateCode?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  phone?: string | null;
}

export interface PingResult {
  message: string;
  serverTime: string;
  device: { id: string; code: string; name: string };
  warehouse: { id: string; code: string; name: string } | null;
  company: CompanyInfo | null;
  settings: {
    invoicePrefix: string; allowNegativeStock: boolean;
    invoice?: {
      layout?: 'classic' | 'modern'; copyLabel?: string; bankDetails?: string; terms?: string; declaration?: string;
      /** The terminal's bank (else the firm's default) for "Our Bankers" and the UPI pay QR. */
      bank?: PayBank | null;
      /** Settings → Invoice printing: print the UPI QR on bills / show the scan-to-pay QR here. */
      printUpiQr?: boolean;
      posUpiQr?: boolean;
      /** 'uploaded' = show the firm's own QR image; 'generated' = QR from the UPI ID. */
      upiQrSource?: 'generated' | 'uploaded';
    };
  };
}

export interface LoginResult {
  token: string;
  expiresAt: string;
  user: { id: string; email: string; fullName: string; roleName: string; roleSlug: string };
  permissions: string[];
}

export interface PushResult {
  message: string;
  received: number;
  applied: number;
  duplicate: number;
  failed: number;
  results: { ref: string | null; status: string; stored: boolean; id?: string | null; number?: string | null; error?: string; errorCode?: string; warnings?: { code: string; message: string }[] }[];
}

export interface ServerProduct {
  uuid: string; name: string; sku: string; barcode: string | null; category: string | null; brand: string | null;
  unit: string; hsn: string | null; gst_rate: number; mrp: number; selling_price: number; item_type?: 'goods' | 'service';
  current_stock: number; available_stock: number; is_active: boolean; approval_status?: string; updated_at: string;
}

export interface ServerCustomer {
  uuid: string; code: string; name: string; phone: string | null; email: string | null; gstin: string | null;
  gst_state_code: string | null; address: string | null; city: string | null; state: string | null;
  credit_limit: number; outstanding: number; credit_approved?: boolean; is_active: boolean; updated_at: string;
}

export interface Page {
  page: number; limit: number; total: number; has_more: boolean; server_time: string;
}

export interface StaffStatus {
  id: string; exists: boolean; isActive: boolean; fullName?: string; email?: string; roleName?: string; permissions: string[];
}

/** Long-poll result: `changed` once data this terminal pulls was written on the server. */
/** Today's attendance row for a staff member (times are ISO; inTime / outTime are IST 'HH:MM'). */
export interface AttendanceToday {
  status: 'present' | 'half_day' | 'absent' | 'leave' | 'holiday' | 'week_off';
  checkIn: string | null; checkOut: string | null; inTime: string | null; outTime: string | null;
  minutes: number; late: boolean; source: string;
}

export interface ChangeFeed {
  changed: boolean; seq: number; tables: string[]; reset?: boolean;
}

const deviceHeaders = (c: DeviceConfig) => ({
  'X-API-Key': c.deviceKey,
  'X-Device-Id': c.deviceId,
  'X-App-Version': 'sac-pos/1.0.0',
  'X-Device-Platform': 'sac-pos',
});

export const auth = {
  login: (baseUrl: string, email: string, password: string) =>
    request<LoginResult>(baseUrl, '/api/auth/login', { method: 'POST', body: { email: email.trim(), password } }),
};

export const sync = {
  ping: (c: DeviceConfig) => request<PingResult>(c.baseUrl, '/api/v1/sync/ping', { method: 'POST', body: {}, headers: deviceHeaders(c) }),

  staff: (c: DeviceConfig, ids: string[]) =>
    request<{ staff: StaffStatus[] }>(c.baseUrl, '/api/v1/sync/staff', { query: { ids: ids.join(',') }, headers: deviceHeaders(c) }),

  push: (c: DeviceConfig, kind: 'sales' | 'returns' | 'payments' | 'customers' | 'quotations', records: unknown[]) =>
    request<PushResult>(c.baseUrl, `/api/v1/sync/push/${kind}`, {
      method: 'POST', body: { [kind]: records }, headers: deviceHeaders(c), timeoutMs: 60000,
    }),

  products: (c: DeviceConfig, since: string, page: number) =>
    request<Page & { products: ServerProduct[] }>(c.baseUrl, '/api/v1/sync/products', {
      query: { since, page, limit: 500 }, headers: deviceHeaders(c), timeoutMs: 60000,
    }),

  customers: (c: DeviceConfig, since: string, page: number) =>
    request<Page & { customers: ServerCustomer[] }>(c.baseUrl, '/api/v1/sync/customers', {
      query: { since, page, limit: 500 }, headers: deviceHeaders(c), timeoutMs: 60000,
    }),

  /** The uploaded UPI QR image of this terminal's bank (only fetched when its version changes). */
  upiQr: (c: DeviceConfig) =>
    request<{ accountId: string | null; version: string | null; image: string | null }>(c.baseUrl, '/api/v1/sync/upi-qr', { headers: deviceHeaders(c), timeoutMs: 30000 }),

  /** Check in / out (or read today) for a staff member; the server takes the time. */
  attendance: (c: DeviceConfig, userId: string, action: 'status' | 'in' | 'out') =>
    request<{ today: AttendanceToday | null; date: string }>(c.baseUrl, '/api/v1/sync/attendance', {
      method: 'POST', body: { userId, action }, headers: deviceHeaders(c),
    }),

  /** productId → minimum selling price (before GST, after discounts). Full list every sync. */
  minPrices: (c: DeviceConfig) =>
    request<{ prices: Record<string, number> }>(c.baseUrl, '/api/v1/sync/min-prices', { headers: deviceHeaders(c) }),

  /** Waits up to `wait` seconds for a catalogue / stock / customer / staff change. */
  changes: (c: DeviceConfig, since: number | undefined, wait = 25) =>
    request<ChangeFeed>(c.baseUrl, '/api/v1/sync/changes', {
      query: { since, wait }, headers: deviceHeaders(c), timeoutMs: (wait + 10) * 1000,
    }),
};
