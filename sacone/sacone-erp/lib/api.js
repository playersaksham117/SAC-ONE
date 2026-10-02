const LOOPBACK = /^(localhost|127\.0\.0\.1|\[::1\])$/;
const IPV4 = /^\d+\.\d+\.\d+\.\d+$/;
const APP_SUBDOMAINS = ['erp', 'owner', 'api', 'www'];

/**
 * URL of a SACONE app as seen from this browser, so one build works everywhere:
 *   erp.sacone.local / sacone.local → <app>.sacone.local   (local-domain gateway, same port)
 *   localhost or 192.168.x.x        → same host, the app's own port (this PC / shop LAN)
 * A configured URL wins, unless it is a localhost URL and this page is on another device.
 */
export function siblingAppUrl(app, port, configured = '') {
  const fallback = configured || `http://localhost:${port}`;
  if (typeof window === 'undefined') return fallback.replace(/\/$/, '');
  const { protocol, hostname, port: pagePort } = window.location;
  if (configured && (!LOOPBACK.test(new URL(configured).hostname) || LOOPBACK.test(hostname))) {
    return configured.replace(/\/$/, '');
  }
  // A machine name, not an app subdomain: IPs, Tailscale MagicDNS (*.ts.net), bare hosts.
  if (LOOPBACK.test(hostname) || IPV4.test(hostname) || hostname.endsWith('.ts.net') || !hostname.includes('.')) {
    return `${protocol}//${hostname}:${port}`;
  }
  const labels = hostname.split('.');
  const domain = APP_SUBDOMAINS.includes(labels[0]) && labels.length > 2 ? labels.slice(1).join('.') : hostname;
  return `${protocol}//${app}.${domain}${pagePort ? `:${pagePort}` : ''}`;
}

export function getApiBase() {
  return siblingAppUrl('api', 4000, process.env.NEXT_PUBLIC_API_URL || '');
}

export function getToken() {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('sacone_token');
}

export function setToken(token) {
  if (typeof window === 'undefined') return;
  if (token) localStorage.setItem('sacone_token', token);
  else localStorage.removeItem('sacone_token');
}

export function getStoredSession() {
  if (typeof window === 'undefined') return null;
  const raw = localStorage.getItem('sacone_session');
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function setStoredSession(session) {
  if (typeof window === 'undefined') return;
  if (session) localStorage.setItem('sacone_session', JSON.stringify(session));
  else localStorage.removeItem('sacone_session');
}

export async function apiRequest(path, options = {}) {
  const token = getToken();
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${getApiBase()}${path}`, {
    ...options,
    headers,
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message = payload?.error?.message || 'Request failed';
    const error = new Error(message);
    error.status = response.status;
    error.code = payload?.error?.code;
    throw error;
  }

  return payload.data;
}

export async function apiDownload(path, filename) {
  const token = getToken();
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(`${getApiBase()}${path}`, { headers });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload?.error?.message || 'Download failed');
  }

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function hasPermission(permissions, key) {
  if (!permissions) return false;
  if (permissions.includes('*')) return true;
  return permissions.includes(key);
}

export function canAccess(permissions, keyOrKeys) {
  if (Array.isArray(keyOrKeys)) {
    return keyOrKeys.some((key) => hasPermission(permissions, key));
  }
  return hasPermission(permissions, keyOrKeys);
}
