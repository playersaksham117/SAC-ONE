import { create } from 'zustand';
import { ApiError } from '../api/client';
import { sync, type DeviceConfig } from '../api/sacone';
import { customerPayload, paymentPayload, returnPayload, salePayload } from '../domain/payloads';
import type { SyncMeta } from '../domain/types';
import { useCart } from '../store/cart';
import { useCatalog, type LocalCustomer } from '../store/catalog';
import { deviceConfig, useDevice } from '../store/device';
import { useLedger } from '../store/ledger';
import { currentUser, useSession } from '../store/session';

/**
 * Offline-first sync cycle (all calls use the device key):
 *   1. ping           → company, warehouse, settings
 *   2. staff          → refresh RBAC for every profile on this phone; drop disabled users
 *   3. push           → new customers, sales, returns, payments (idempotent on the server)
 *   4. pull           → products + stock, customers (incremental, server-time cursors)
 */

type Status = 'idle' | 'syncing' | 'offline' | 'error';

interface SyncStatusState {
  status: Status;
  lastSyncAt: string | null;
  lastError: string | null;
  lastSummary: string | null;
}

export const useSyncStatus = create<SyncStatusState>(() => ({
  status: 'idle',
  lastSyncAt: null,
  lastError: null,
  lastSummary: null,
}));

const BATCH = 50;
let running: Promise<void> | null = null;
let again = false;

/**
 * Start a sync cycle. If one is already running, another cycle is queued to run
 * right after it, so records created mid-cycle (e.g. a sale just completed) go out immediately.
 */
export function syncNow(): Promise<void> {
  if (running) {
    again = true;
    return running;
  }
  running = runCycle().finally(() => {
    running = null;
    if (again) {
      again = false;
      syncNow().catch(() => undefined);
    }
  });
  return running;
}

async function pushDocs<T extends SyncMeta & { id: string; number: string; userId: string }>(
  cfg: DeviceConfig,
  kind: 'sales' | 'returns' | 'payments',
  docs: T[],
  build: (d: T, userId: string) => unknown,
): Promise<number> {
  const pending = docs.filter((d) => d.sync === 'pending').reverse(); // oldest first
  let sent = 0;
  for (let i = 0; i < pending.length; i += BATCH) {
    const chunk = pending.slice(i, i + BATCH);
    const refToId = Object.fromEntries(chunk.map((d) => [d.number, d.id]));
    const res = await sync.push(cfg, kind, chunk.map((d) => build(d, d.userId)));
    useLedger.getState().applyPushResults(kind, refToId, res);
    sent += chunk.length;
  }
  return sent;
}

async function runCycle(): Promise<void> {
  const cfg = deviceConfig();
  if (!cfg) return;
  useSyncStatus.setState({ status: 'syncing', lastError: null });
  try {
    // 1. handshake
    const info = await sync.ping(cfg);
    useDevice.getState().setInfo(info);

    // 2. RBAC refresh for all staff profiles on this phone
    const ids = Object.keys(useSession.getState().profiles);
    if (ids.length) {
      const { staff } = await sync.staff(cfg, ids);
      useSession.getState().applyStaffStatus(staff);
    }

    // 3a. new customers first so credit sales can reference them
    const catalog = useCatalog.getState();
    const localCustomers = Object.values(catalog.customers).filter(
      (c): c is LocalCustomer => Boolean(c.isLocal) && (c as LocalCustomer).sync === 'pending',
    );
    if (localCustomers.length) {
      const res = await sync.push(cfg, 'customers', localCustomers.map((c) => customerPayload(c, c.createdBy)));
      const byRef = Object.fromEntries(res.results.filter((r) => r.ref).map((r) => [r.ref!, r]));
      catalog.markCustomers(localCustomers.map((c) => {
        const r = byRef[c.code ?? c.id];
        if (!r?.stored) return { id: c.id, sync: 'pending' as const };
        return r.status === 'failed'
          ? { id: c.id, sync: 'review' as const, syncError: r.error ?? 'Failed' }
          : { id: c.id, sync: 'synced' as const };
      }));
    }

    // 3b. documents
    const ledger = useLedger.getState();
    const sentSales = await pushDocs(cfg, 'sales', ledger.sales, salePayload);
    const sentReturns = await pushDocs(cfg, 'returns', useLedger.getState().returns, returnPayload);
    const sentPayments = await pushDocs(cfg, 'payments', useLedger.getState().payments, paymentPayload);

    // 4. pull catalogue + customers
    let pulledProducts = 0;
    let productCursor: string | undefined;
    for (let page = 1; page < 200; page++) {
      const res = await sync.products(cfg, useCatalog.getState().productCursor, page);
      productCursor ??= res.server_time;
      useCatalog.getState().applyProducts(res.products);
      pulledProducts += res.products.length;
      if (!res.has_more) break;
    }
    let customerCursor: string | undefined;
    for (let page = 1; page < 200; page++) {
      const res = await sync.customers(cfg, useCatalog.getState().customerCursor, page);
      customerCursor ??= res.server_time;
      const remap = useCatalog.getState().applyCustomers(res.customers);
      const cartCustomer = useCart.getState().customerId;
      if (cartCustomer && remap[cartCustomer]) useCart.getState().setCustomer(remap[cartCustomer]);
      if (!res.has_more) break;
    }
    useCatalog.getState().setCursors({ productCursor, customerCursor });
    useLedger.getState().prune(30);

    const parts = [
      sentSales && `${sentSales} sale(s)`,
      sentReturns && `${sentReturns} return(s)`,
      sentPayments && `${sentPayments} payment(s)`,
    ].filter(Boolean);
    useSyncStatus.setState({
      status: 'idle',
      lastSyncAt: new Date().toISOString(),
      lastSummary: `${parts.length ? `Sent ${parts.join(', ')}. ` : ''}${pulledProducts} product update(s).`,
    });
  } catch (e) {
    const err = e as ApiError;
    if (err instanceof ApiError && err.status === 401) {
      useSyncStatus.setState({ status: 'error', lastError: 'Device key revoked or invalid — re-connect this phone in More → Device' });
    } else if (err instanceof ApiError && err.isNetwork) {
      useSyncStatus.setState({ status: 'offline', lastError: 'Offline — sales are saved on the phone and will sync automatically' });
    } else {
      useSyncStatus.setState({ status: 'error', lastError: err?.message ?? 'Sync failed' });
    }
  }
}

/** For callers that need to know who is acting (e.g. building documents). */
export function actingUser() {
  const u = currentUser();
  if (!u) throw new Error('Not signed in');
  return u;
}
