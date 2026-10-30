import { ApiError } from '../api/client';
import type { Pairing } from '../domain/pairing';
import { useCart } from '../store/cart';
import { useCatalog } from '../store/catalog';
import { useDevice } from '../store/device';
import { pendingCount, useLedger } from '../store/ledger';
import { useSession } from '../store/session';
import { syncNow } from '../sync/engine';

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

/** What still has to reach the current terminal's ERP before the phone may change terminal. */
export function unsyncedOnPhone() {
  const ledger = useLedger.getState();
  const { pending, review } = pendingCount(ledger);
  const customers = Object.values(useCatalog.getState().customers)
    .filter((c) => Boolean((c as { isLocal?: boolean }).isLocal) && (c as { sync?: string }).sync === 'pending').length;
  return { pending, review, customers, held: ledger.held.length, total: pending + review + customers + ledger.held.length };
}

/**
 * Make this (already connected) phone another terminal, e.g. move it from one firm to another.
 * Everything on the phone must have reached the current ERP first: bills belong to the firm they
 * were made in and must never be sent to the new one. The new key is tried before anything is
 * cleared, so a failed attempt leaves the phone exactly as it was.
 */
export async function switchTerminal(pairing: Pairing): Promise<string> {
  await syncNow().catch(() => undefined);
  const left = unsyncedOnPhone();
  if (left.total) {
    const parts = [
      left.pending && `${left.pending} bill(s)/payment(s) not synced`,
      left.review && `${left.review} record(s) waiting for review in ERP → POS Devices & Sync → Sync inbox`,
      left.customers && `${left.customers} new customer(s) not synced`,
      left.held && `${left.held} held bill(s) to finish or delete`,
    ].filter(Boolean);
    throw new Error(`Not switched: ${parts.join(', ')}. Sort these out on the current terminal first, then scan again.`);
  }
  const url = await connectWithPairing(pairing); // replaces the key only once the new terminal answers
  useLedger.getState().clearForNewTerminal();
  useCatalog.getState().reset();
  useCart.getState().clear();
  useSession.getState().forgetAll();
  return url;
}

/**
 * Sign-in firm choice: become this device's terminal of another firm it was connected to before
 * (same rules as switchTerminal: everything synced first, the old firm's data cleared).
 */
export async function switchToSavedTerminal(id: string): Promise<void> {
  const device = useDevice.getState();
  const entry = device.saved.find((t) => t.id === id);
  const key = entry ? await device.savedKey(id) : null;
  if (!entry || !key) throw new Error('That firm is not set up on this device any more. A manager can add it: More → Connect to another terminal.');
  const urls = [...new Set([entry.baseUrl, device.baseUrl].filter((u): u is string => Boolean(u)))];
  await switchTerminal({ urls, key, deviceName: entry.deviceName, firm: entry.firm });
  syncNow().catch(() => undefined);
}
