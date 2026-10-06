import { request } from './client';

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
  settings: { invoicePrefix: string; allowNegativeStock: boolean };
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
  unit: string; hsn: string | null; gst_rate: number; mrp: number; selling_price: number; min_selling_price?: number;
  current_stock: number; available_stock: number; is_active: boolean; approval_status?: string; updated_at: string;
}

export interface ServerCustomer {
  uuid: string; code: string; name: string; phone: string | null; email: string | null; gstin: string | null;
  gst_state_code: string | null; address: string | null; city: string | null; state: string | null;
  credit_limit: number; outstanding: number; is_active: boolean; updated_at: string;
}

export interface Page {
  page: number; limit: number; total: number; has_more: boolean; server_time: string;
}

export interface StaffStatus {
  id: string; exists: boolean; isActive: boolean; fullName?: string; email?: string; roleName?: string; permissions: string[];
}

/** Long-poll result: `changed` once data this terminal pulls was written on the server. */
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

  push: (c: DeviceConfig, kind: 'sales' | 'returns' | 'payments' | 'customers', records: unknown[]) =>
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

  /** productId → minimum selling price (before GST, after discounts). Full list every sync. */
  minPrices: (c: DeviceConfig) =>
    request<{ prices: Record<string, number> }>(c.baseUrl, '/api/v1/sync/min-prices', { headers: deviceHeaders(c) }),

  /** Waits up to `wait` seconds for a catalogue / stock / customer / staff change. */
  changes: (c: DeviceConfig, since: number | undefined, wait = 25) =>
    request<ChangeFeed>(c.baseUrl, '/api/v1/sync/changes', {
      query: { since, wait }, headers: deviceHeaders(c), timeoutMs: (wait + 10) * 1000,
    }),
};
