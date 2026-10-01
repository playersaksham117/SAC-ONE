import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { PushResult } from '../api/sacone';
import { dayKey, docNumber } from '../domain/numbering';
import type { CustomerPayment, HeldBill, Sale, SaleReturn, SyncMeta } from '../domain/types';
import { jsonStorage } from './persist';

type Prefix = 'S' | 'R' | 'P' | 'C';
type DocKind = 'sales' | 'returns' | 'payments';

interface LedgerState {
  sales: Sale[];
  returns: SaleReturn[];
  payments: CustomerPayment[];
  held: HeldBill[];
  seq: { day: string; S: number; R: number; P: number; C: number };
  nextNumber: (prefix: Prefix) => string;
  addSale: (sale: Sale) => void;
  addReturn: (ret: SaleReturn) => void;
  addPayment: (p: CustomerPayment) => void;
  hold: (bill: HeldBill) => void;
  removeHeld: (id: string) => void;
  applyPushResults: (kind: DocKind, refToId: Record<string, string>, res: PushResult) => void;
  retry: (kind: DocKind, id: string) => void;
  prune: (keepDays: number) => void;
}

function outcome(r: PushResult['results'][number]): Partial<SyncMeta> {
  const warnings = (r.warnings ?? []).map((w) => w.message);
  if (r.status === 'failed') {
    return { sync: 'review', syncError: r.error ?? 'Failed on server', syncWarnings: warnings };
  }
  return {
    sync: 'synced',
    serverNumber: r.number ?? null,
    serverId: r.id ?? null,
    syncError: null,
    syncWarnings: warnings,
    syncedAt: new Date().toISOString(),
  };
}

export const useLedger = create<LedgerState>()(
  persist(
    (set, get) => ({
      sales: [],
      returns: [],
      payments: [],
      held: [],
      seq: { day: dayKey(), S: 0, R: 0, P: 0, C: 0 },

      nextNumber(prefix) {
        const today = dayKey();
        const s = get().seq;
        const seq = s.day === today ? { ...s } : { day: today, S: 0, R: 0, P: 0, C: 0 };
        seq[prefix] += 1;
        set({ seq });
        return docNumber(prefix, seq[prefix]);
      },

      addSale(sale) {
        set((s) => ({ sales: [sale, ...s.sales] }));
      },

      addReturn(ret) {
        set((s) => ({
          returns: [ret, ...s.returns],
          sales: s.sales.map((sale) => {
            if (sale.id !== ret.saleId) return sale;
            const returned = { ...sale.returned };
            for (const l of ret.lines) returned[l.productId] = (returned[l.productId] || 0) + l.quantity;
            return { ...sale, returned };
          }),
        }));
      },

      addPayment(p) {
        set((s) => ({ payments: [p, ...s.payments] }));
      },

      hold(bill) {
        set((s) => ({ held: [bill, ...s.held].slice(0, 30) }));
      },

      removeHeld(id) {
        set((s) => ({ held: s.held.filter((h) => h.id !== id) }));
      },

      applyPushResults(kind, refToId, res) {
        const byId: Record<string, Partial<SyncMeta>> = {};
        for (const r of res.results) {
          if (!r.ref || !r.stored) continue;
          const id = refToId[r.ref];
          if (id) byId[id] = outcome(r);
        }
        set((s) => ({
          [kind]: (s[kind] as (SyncMeta & { id: string })[]).map((d) => (byId[d.id] ? { ...d, ...byId[d.id] } : d)),
        }) as Partial<LedgerState>);
      },

      retry(kind, id) {
        set((s) => ({
          [kind]: (s[kind] as (SyncMeta & { id: string })[]).map((d) => (d.id === id ? { ...d, sync: 'pending', syncError: null } : d)),
        }) as Partial<LedgerState>);
      },

      /** Drop synced documents older than `keepDays` to keep the phone light. */
      prune(keepDays) {
        const cutoff = Date.now() - keepDays * 86400000;
        const keep = <T extends SyncMeta & { createdAt: string }>(d: T) => d.sync !== 'synced' || new Date(d.createdAt).getTime() >= cutoff;
        set((s) => ({ sales: s.sales.filter(keep), returns: s.returns.filter(keep), payments: s.payments.filter(keep) }));
      },
    }),
    { name: 'sacpos.ledger', storage: jsonStorage },
  ),
);

/** Quantity per product sold/returned on this phone that the ERP has not applied yet. */
export function pendingQty(sales: Sale[], returns: SaleReturn[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const s of sales) {
    if (s.sync === 'synced') continue;
    for (const l of s.totals.lines) out[l.productId] = (out[l.productId] || 0) + l.quantity;
  }
  for (const r of returns) {
    if (r.sync === 'synced') continue;
    for (const l of r.lines) out[l.productId] = (out[l.productId] || 0) - l.quantity;
  }
  return out;
}

export function pendingCount(s: Pick<LedgerState, 'sales' | 'returns' | 'payments'>): { pending: number; review: number } {
  const all = [...s.sales, ...s.returns, ...s.payments];
  return {
    pending: all.filter((d) => d.sync === 'pending').length,
    review: all.filter((d) => d.sync === 'review').length,
  };
}
