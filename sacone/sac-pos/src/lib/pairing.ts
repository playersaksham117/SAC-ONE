import { ApiError } from '../api/client';
import type { Pairing } from '../domain/pairing';
import { useDevice } from '../store/device';

/**
 * Connect with a scanned pairing code: try each server address in turn (shop Wi-Fi first,
 * then Tailscale …) and keep the first that answers. A rejected key stops at once.
 */
export async function connectWithPairing(pairing: Pairing): Promise<string> {
  const tried: string[] = [];
  for (const url of pairing.urls) {
    try {
      await useDevice.getState().connect(url, pairing.key);
      return url;
    } catch (e) {
      const err = e as ApiError;
      if (err.status === 401) {
        throw new Error('ERP did not accept this key. It may have been renewed or revoked: show a fresh QR in SACONE ERP → POS Devices.');
      }
      if (err.status === 403) {
        throw new Error('This key is already used by another phone. In SACONE ERP → POS Devices choose “Rotate key” for this terminal and scan the new QR.');
      }
      if (err.status && !err.isNetwork) throw err;
      tried.push(url);
    }
  }
  throw new Error(`Could not reach SACONE at ${tried.join(' or ')}. Is this phone on the shop Wi-Fi (or Tailscale) and is the SACONE PC on?`);
}
