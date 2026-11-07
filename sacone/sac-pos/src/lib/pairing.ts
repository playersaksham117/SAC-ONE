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
      // a pairing code is exchanged on the first address that answers, then that key connects
      const key = pairing.key || (await useDevice.getState().exchangeCode(url, pairing.code ?? '')).key;
      await useDevice.getState().connect(url, key);
      return url;
    } catch (e) {
      const err = e as ApiError;
      if (err.status === 401 || err.status === 429) {
        throw new Error(pairing.code
          ? err.message
          : 'ERP did not accept this key. It may have been renewed or revoked: in SACONE ERP → POS Devices choose “Connect a device” for a pairing code.');
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

/**
 * The device lost its connection (its terminal got a new key: another device connected, Rotate key,
 * or switched off). A pairing code for the SAME terminal reconnects it keeping its bills; for another
 * terminal it switches as usual (needs everything synced first).
 */
export async function reconnectWithCode(urls: string | string[], code: string): Promise<'same' | 'switched'> {
  const device = useDevice.getState();
  const currentId = device.info?.device.id ?? null;
  // send what can still be sent before the code is used (a switch needs nothing left)
  if (unsyncedOnPhone().total) await syncNow().catch(() => undefined);
  const left = unsyncedOnPhone();
  // the code is used on the first server address that answers
  let url = '';
  let exchanged: { key: string; terminalId: string } | null = null;
  const tried: string[] = [];
  for (const u of Array.isArray(urls) ? urls : [urls]) {
    try {
      exchanged = await device.exchangeCode(u, code);
      url = u;
      break;
    } catch (e) {
      const err = e as ApiError;
      if (!err.isNetwork) throw e;
      tried.push(u);
    }
  }
  if (!exchanged) throw new Error(`Could not reach SACONE at ${tried.join(' or ')}. Is this phone on the shop Wi-Fi (or Tailscale) and is the SACONE PC on?`);
  const { key, terminalId } = exchanged;
  if (!currentId || terminalId === currentId) {
    await device.connect(url, key);
    syncNow().catch(() => undefined);
    return 'same';
  }
  if (left.total) {
    throw new Error(`This code is for another terminal, but ${left.total} record(s) here belong to ${device.info?.device.name ?? 'this terminal'} and are not synced yet. Ask for a pairing code for ${device.info?.device.name ?? 'this terminal'} instead.`);
  }
  await switchTerminal({ urls: [url], key, deviceName: null, firm: null });
  syncNow().catch(() => undefined);
  return 'switched';
}
