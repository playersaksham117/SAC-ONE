/** Minimal fetch wrapper for the SACONE `{ success, data | error }` envelope. */

export class ApiError extends Error {
  status: number;
  code: string;
  constructor(message: string, status = 0, code = 'NETWORK') {
    super(message);
    this.status = status;
    this.code = code;
  }
  get isNetwork() {
    return this.status === 0;
  }
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT';
  body?: unknown;
  headers?: Record<string, string>;
  query?: Record<string, string | number | undefined>;
  timeoutMs?: number;
}

export function joinUrl(base: string, path: string, query?: RequestOptions['query']): string {
  const root = base.trim().replace(/\/+$/, '');
  const qs = query
    ? Object.entries(query)
      .filter(([, v]) => v !== undefined && v !== '')
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
      .join('&')
    : '';
  return `${root}${path}${qs ? `?${qs}` : ''}`;
}

export async function request<T>(baseUrl: string, path: string, opts: RequestOptions = {}): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 25000);
  let res: Response;
  try {
    res = await fetch(joinUrl(baseUrl, path, opts.query), {
      method: opts.method ?? 'GET',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...(opts.headers ?? {}) },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      signal: controller.signal,
    });
  } catch (e) {
    const aborted = (e as Error)?.name === 'AbortError';
    throw new ApiError(aborted ? 'Server did not respond in time' : 'Cannot reach the SACONE server', 0, aborted ? 'TIMEOUT' : 'NETWORK');
  } finally {
    clearTimeout(timer);
  }

  let json: any = null;
  try {
    json = await res.json();
  } catch {
    /* non-JSON body */
  }
  if (!res.ok || json?.success === false) {
    const message = json?.error?.message || json?.message || `Request failed (${res.status})`;
    throw new ApiError(message, res.status, json?.error?.code || 'HTTP_ERROR');
  }
  return (json && 'data' in json ? json.data : json) as T;
}
