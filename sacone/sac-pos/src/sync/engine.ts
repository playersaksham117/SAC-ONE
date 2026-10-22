import { create } from 'zustand';
import { ApiError } from '../api/client';
import { sync, type DeviceConfig } from '../api/sacone';
import { customerPayload, paymentPayload, quotationPayload, returnPayload, salePayload } from '../domain/payloads';
import { erpQuotation, erpSale } from '../domain/serverSale';
import { checkForUpdate } from '../lib/appUpdate';
import type { SyncMeta } from '../domain/types';
import { useCart } from '../store/cart';
import { useCatalog, type LocalCustomer } from '../store/catalog';
import { deviceConfig, useDevice } from '../store/device';
import { useLedger } from '../store/ledger';
import { useUpiQr } from '../store/upiQr';
import { currentUser, useSession } from '../store/session';
import { serverUrlCandidates } from '../lib/serverDiscovery';
import { useSignStamp } from '../store/signStamp';

/**
 * Offline-first sync cycle (all calls use the device key):
 *   1. ping           → company, warehouse, settings
 *   2. staff          → refresh RBAC for every profile on this phone; drop disabled users
 *   3. push           → new customers, sales, returns, payments (idempotent on the server)
 *   4. pull           → products + stock, customers (incremental, server-time cursors)
 *   5. documents      → ERP / other terminals' bills and quotations the signed-in user may see
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
const EPOCH_CURSOR = '1970-01-01T00:00:00.000Z';
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
  kind: 'sales' | 'returns' | 'payments' | 'quotations',
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

/**
 * The saved server address stopped answering (usually the server PC got a new DHCP address).
 * Try the PC that served this app; switch to it only if it accepts this phone's device key.
 */
async function recoverServer(current: DeviceConfig): Promise<DeviceConfig | null> {
  for (const url of serverUrlCandidates(current.baseUrl)) {
    try {
      await useDevice.getState().changeServer(url);
      return deviceConfig();
    } catch { /* try the next candidate */ }
  }
  return null;
}

async function runCycle(): Promise<void> {
  let cfg = deviceConfig();
  if (!cfg) return;
  useSyncStatus.setState({ status: 'syncing', lastError: null });
  try {
    // 1. handshake (with automatic recovery when the server's address changed)
    try {
      const info = await sync.ping(cfg);
      useDevice.getState().setInfo(info);
    } catch (e) {
      const recovered = e instanceof ApiError && e.isNetwork ? await recoverServer(cfg) : null;
      if (!recovered) throw e;
      cfg = recovered;
    }

    // 1a. a newer SAC-POS on the shop server (offered in More → App update; never blocks the sync)
    checkForUpdate(cfg).catch(() => undefined);

    // 1b. the uploaded UPI QR image, only when the ERP has a new one
    const bank = useDevice.getState().info?.settings?.invoice?.bank;
    const wantVersion = bank?.hasQrImage ? bank.qrImageVersion ?? null : null;
    if (wantVersion !== useUpiQr.getState().version) {
      if (!wantVersion) useUpiQr.getState().set(null, null);
      else {
        try {
          const qr = await sync.upiQr(cfg);
          useUpiQr.getState().set(qr.version, qr.image);
        } catch { /* keep the old image; retry next sync */ }
      }
    }

    // 1c. the firm's signature & stamp images, only when the ERP has new ones
    const ss = useDevice.getState().info?.settings?.invoice?.signStamp;
    const wantSign = ss?.version ?? null;
    if (wantSign !== useSignStamp.getState().version) {
      if (!wantSign) useSignStamp.getState().set(null, null, null);
      else {
        try {
          const got = await sync.signStamp(cfg);
          useSignStamp.getState().set(got.version, got.signImage, got.stampImage);
        } catch { /* keep the old images; retry next sync */ }
      }
    }

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
    // Quotations before sales, so a sale made from one can mark it converted.
    const sentQuotes = await pushDocs(cfg, 'quotations', useLedger.getState().quotations ?? [], quotationPayload);
    const ledger = useLedger.getState();
    const sentSales = await pushDocs(cfg, 'sales', ledger.sales, salePayload);
    const sentReturns = await pushDocs(cfg, 'returns', useLedger.getState().returns, returnPayload);
    const sentPayments = await pushDocs(cfg, 'payments', useLedger.getState().payments, paymentPayload);

    // 3c. bills edited or cancelled in the ERP after they synced
    let updatedBills = 0;
    const syncedRefs = useLedger.getState().sales.filter((s) => s.sync === 'synced' && !s.origin).map((s) => s.number);
    try {
      for (let i = 0; i < syncedRefs.length; i += 500) {
        const res = await sync.currentSales(cfg, syncedRefs.slice(i, i + 500));
        updatedBills += useLedger.getState().applyServerSales(res.sales);
      }
    } catch (e) {
      if (!(e instanceof ApiError && e.status === 404)) throw e; // older server: bills are not refreshed
    }

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
      // The phone holds fewer customers than the ERP (missed while offline / clock skew): pull all again.
      const held = Object.values(useCatalog.getState().customers).filter((c) => !(c as LocalCustomer).isLocal).length;
      if (page === 1 && res.all_total != null && held + res.customers.length < res.all_total && useCatalog.getState().customerCursor !== EPOCH_CURSOR) {
        useCatalog.getState().setCursors({ customerCursor: EPOCH_CURSOR });
        page = 0;
        continue;
      }
      const remap = useCatalog.getState().applyCustomers(res.customers);
      const cartCustomer = useCart.getState().customerId;
      if (cartCustomer && remap[cartCustomer]) useCart.getState().setCustomer(remap[cartCustomer]);
      if (!res.has_more) break;
    }
    useCatalog.getState().setCursors({ productCursor, customerCursor });
    try {
      useCatalog.getState().setMinPrices((await sync.minPrices(cfg)).prices);
    } catch (e) {
      if (!(e instanceof ApiError && e.status === 404)) throw e; // older server: no minimum prices
    }
    // 5. bills & quotations made in the ERP or on other terminals (by the signed-in user's ERP role)
    const me = useSession.getState().currentUserId;
    if (me) {
      try {
        const docs = await sync.documents(cfg, me);
        useLedger.getState().applyErpDocs(
          docs.sales ? docs.sales.map((s) => ({ ...erpSale(s, s.source === 'erp' ? 'erp' : 'terminal', s.createdBy), phoneRef: s.phoneRef ?? null })) : null,
          docs.quotations ? docs.quotations.map(erpQuotation) : null,
        );
      } catch (e) {
        if (!(e instanceof ApiError && e.status === 404)) throw e; // older server: phone documents only
      }
    }
    useLedger.getState().prune(30);

    const parts = [
      sentSales && `${sentSales} sale(s)`,
      sentReturns && `${sentReturns} return(s)`,
      sentPayments && `${sentPayments} payment(s)`,
      sentQuotes && `${sentQuotes} quotation(s)`,
    ].filter(Boolean);
    const updatedNote = updatedBills ? `${updatedBills} bill(s) updated from ERP. ` : '';
    useSyncStatus.setState({
      status: 'idle',
      lastSyncAt: new Date().toISOString(),
      lastSummary: `${parts.length ? `Sent ${parts.join(', ')}. ` : ''}${updatedNote}${pulledProducts} product update(s).`,
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
