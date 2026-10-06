import NetInfo from '@react-native-community/netinfo';
import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { ApiError } from '../api/client';
import { sync } from '../api/sacone';
import { sweepSharedDocuments } from '../services/documentShare';
import { useCart } from '../store/cart';
import { useCatalog } from '../store/catalog';
import { deviceConfig, useDevice } from '../store/device';
import { useLedger } from '../store/ledger';
import { useSession } from '../store/session';
import { syncNow } from '../sync/engine';

const STORES = [useDevice, useSession, useCatalog, useLedger, useCart];
const SYNC_EVERY_MS = 60_000;
const LIVE_RETRY_MS = 5_000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Waits for every persisted store + the secure device key, then keeps sync running. */
export function useBootstrap(): boolean {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const hydrated = () => STORES.every((s) => s.persist.hasHydrated());
    const finish = async () => {
      await useDevice.getState().loadSecret();
      if (!cancelled) setReady(true);
    };
    if (hydrated()) finish();
    const unsubs = STORES.map((s) => s.persist.onFinishHydration(() => { if (hydrated()) finish(); }));
    return () => { cancelled = true; unsubs.forEach((u) => u()); };
  }, []);

  // Temporary share PDFs: expire after the TTL, and all go when the terminal is locked
  // (the app always starts locked, so a cold start clears everything left over).
  useEffect(() => {
    if (!ready) return undefined;
    sweepSharedDocuments(true);
    const appSub = AppState.addEventListener('change', (st) => { if (st === 'active') sweepSharedDocuments(); });
    const unsub = useSession.subscribe((s, prev) => {
      if (prev.currentUserId && !s.currentUserId) sweepSharedDocuments(true);
    });
    return () => { appSub.remove(); unsub(); };
  }, [ready]);

  useEffect(() => {
    if (!ready) return undefined;
    const run = () => { if (useDevice.getState().deviceKey) syncNow().catch(() => undefined); };
    run();
    const timer = setInterval(run, SYNC_EVERY_MS);
    const netSub = NetInfo.addEventListener((s) => { if (s.isConnected) run(); });
    const appSub = AppState.addEventListener('change', (st) => { if (st === 'active') run(); });
    return () => { clearInterval(timer); netSub(); appSub.remove(); };
  }, [ready]);

  // Real time: a long-poll wakes this phone as soon as products, prices, stock,
  // customers or staff change on the server; the timer above stays as a fallback.
  useEffect(() => {
    if (!ready) return undefined;
    let stopped = false;
    (async () => {
      let since: number | undefined;
      while (!stopped) {
        const cfg = deviceConfig();
        if (!cfg || AppState.currentState !== 'active') {
          await sleep(LIVE_RETRY_MS);
          continue;
        }
        try {
          const feed = await sync.changes(cfg, since);
          since = feed.seq;
          if (feed.changed && !stopped) syncNow().catch(() => undefined);
        } catch (e) {
          if (e instanceof ApiError && e.status === 404) return; // older server: timer sync only
          await sleep(LIVE_RETRY_MS);
        }
      }
    })();
    return () => { stopped = true; };
  }, [ready]);

  return ready;
}
