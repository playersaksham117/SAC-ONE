/**
 * Pairing QR shown by SACONE ERP when a terminal is registered (or its key is renewed):
 *
 *   sacpos://connect?k=<sync key>&u=<server url>,<other server url>&n=<device name>&f=<firm>
 *
 * It is a link in the app's own scheme, so scanning it with the phone's camera app opens
 * SAC-POS on the Connect screen, and the in-app scanner reads the same text. The key works for
 * the first phone that connects with it only (the server binds it to that phone).
 */

export const PAIRING_PREFIX = 'sacpos://connect';

export interface Pairing {
  /** Server addresses to try in order (LAN, Tailscale …). */
  urls: string[];
  key: string;
  deviceName: string | null;
  firm: string | null;
}

const KEY = /^sk_live_[A-Za-z0-9_-]{20,}$/;
const MAX_URLS = 6;

function validUrl(raw: string): string | null {
  const url = raw.trim().replace(/\/+$/, '');
  return /^https?:\/\/[^\s/?#]+(:\d+)?(\/[^\s?#]*)?$/i.test(url) ? url : null;
}

const clean = (v: string | undefined, max = 80): string | null => {
  const s = (v ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max);
  return s || null;
};

/** Build the QR text (the ERP builds the same string). */
export function buildPairingLink({ urls, key, deviceName, firm }: { urls: string[]; key: string; deviceName?: string | null; firm?: string | null }): string {
  const q = [`k=${encodeURIComponent(key)}`, `u=${urls.map(encodeURIComponent).join(',')}`];
  if (deviceName) q.push(`n=${encodeURIComponent(deviceName)}`);
  if (firm) q.push(`f=${encodeURIComponent(firm)}`);
  return `${PAIRING_PREFIX}?${q.join('&')}`;
}

/** Turn already-decoded link parameters (expo-router route params) into a Pairing. */
export function pairingFromParams(params: { k?: string; u?: string; n?: string; f?: string }): Pairing {
  const key = (params.k ?? '').trim();
  if (!KEY.test(key)) throw new Error('This QR code has no valid device key. Show the QR from SACONE ERP → POS Devices again.');
  const urls = [...new Set(String(params.u ?? '').split(',').map(validUrl).filter((u): u is string => Boolean(u)))].slice(0, MAX_URLS);
  if (!urls.length) throw new Error('This QR code has no server address. Show the QR from SACONE ERP → POS Devices again.');
  return { urls, key, deviceName: clean(params.n), firm: clean(params.f, 120) };
}

/** Read a scanned QR. Throws a message for the cashier when it is not a SAC-POS pairing code. */
export function parsePairingCode(text: string): Pairing {
  const raw = String(text ?? '').trim();
  if (!raw.toLowerCase().startsWith(PAIRING_PREFIX)) {
    throw new Error('That is not a SAC-POS connection code. Scan the QR shown in SACONE ERP → POS Devices.');
  }
  const query = raw.slice(raw.indexOf('?') + 1);
  if (!raw.includes('?') || !query) throw new Error('This QR code is incomplete. Show it again in SACONE ERP.');
  const params: Record<string, string> = {};
  for (const part of query.split('&')) {
    const eq = part.indexOf('=');
    if (eq <= 0) continue;
    const name = part.slice(0, eq);
    let value = part.slice(eq + 1);
    try {
      value = decodeURIComponent(value.replace(/\+/g, ' '));
    } catch {
      throw new Error('This QR code is damaged. Show it again in SACONE ERP.');
    }
    // u holds comma-separated, individually encoded URLs; keep the commas.
    params[name] = name === 'u' ? part.slice(eq + 1).split(',').map((u) => { try { return decodeURIComponent(u); } catch { return ''; } }).join(',') : value;
  }
  return pairingFromParams(params);
}
