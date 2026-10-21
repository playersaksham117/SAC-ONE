import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { PushResult } from '../api/sacone';
import { dayKey, docNumber } from '../domain/numbering';
import type { CustomerPayment, HeldBill, Quotation, Sale, SaleReturn, SyncMeta } from '../domain/types';
import { sameDoc, withServerSale, type ServerSaleStatus } from '../domain/serverSale';
import { jsonStorage } from './persist';

type Prefix = 'S' | 'R' | 'P' | 'C' | 'Q';
type DocKind = 'sales' | 'returns' | 'payments' | 'quotations';

interface LedgerState {
  sales: Sale[];
  returns: SaleReturn[];
  payments: CustomerPayment[];
  quotations: Quotation[];
  held: HeldBill[];
  seq: { day: string; S: number; R: number; P: number; C: number; Q?: number };
  nextNumber: (prefix: Prefix) => string;
  addSale: (sale: Sale) => void;
  addReturn: (ret: SaleReturn) => void;
  addPayment: (p: CustomerPayment) => void;
  addQuotation: (q: Quotation) => void;
  markQuotationConverted: (id: string, saleId: string) => void;
  hold: (bill: HeldBill) => void;
  removeHeld: (id: string) => void;
  applyPushResults: (kind: DocKind, refToId: Record<string, string>, res: PushResult) => void;
  retry: (kind: DocKind, id: string) => void;
  /** Bring synced bills up to date with the ERP (an admin edited or cancelled them there). */
  applyServerSales: (statuses: ServerSaleStatus[]) => number;
  prune: (keepDays: number) => void;
  /** Forget every local bill (only after all of them reached the ERP): the phone becomes another terminal. */
  clearForNewTerminal: () => void;
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
      quotations: [],
      held: [],
      seq: { day: dayKey(), S: 0, R: 0, P: 0, C: 0, Q: 0 },

      nextNumber(prefix) {
        const today = dayKey();
        const s = get().seq;
        const seq = s.day === today ? { Q: 0, ...s } : { day: today, S: 0, R: 0, P: 0, C: 0, Q: 0 };
        seq[prefix] = (seq[prefix] ?? 0) + 1;
        set({ seq });
        return docNumber(prefix, seq[prefix] as number);
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

      addQuotation(q) {
        set((s) => ({ quotations: [q, ...(s.quotations ?? [])] }));
      },

      markQuotationConverted(id, saleId) {
        set((s) => ({ quotations: (s.quotations ?? []).map((q) => (q.id === id ? { ...q, status: 'converted', convertedSaleId: saleId } : q)) }));
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
          [kind]: ((s[kind] ?? []) as (SyncMeta & { id: string })[]).map((d) => (byId[d.id] ? { ...d, ...byId[d.id] } : d)),
        }) as Partial<LedgerState>);
      },

      applyServerSales(statuses) {
        const byRef = new Map(statuses.map((st) => [st.ref, st]));
        let changed = 0;
        const sales = get().sales.map((sale) => {
          const st = sale.sync === 'synced' ? byRef.get(sale.number) : undefined;
          if (!st || st.status === 'unknown') return sale;
          const next: Sale = st.status === 'current' ? withServerSale(sale, st.sale) : { ...sale, cancelledInErp: true };
          if (sameDoc(next, sale)) return sale;
          changed += 1;
          return next;
        });
        if (changed) set({ sales });
        return changed;
      },

      retry(kind, id) {
        set((s) => ({
          [kind]: ((s[kind] ?? []) as (SyncMeta & { id: string })[]).map((d) => (d.id === id ? { ...d, sync: 'pending', syncError: null } : d)),
        }) as Partial<LedgerState>);
      },

      /** Drop synced documents older than `keepDays` to keep the phone light. */
      clearForNewTerminal() {
        set({ sales: [], returns: [], payments: [], quotations: [], held: [] });
      },

      prune(keepDays) {
        const cutoff = Date.now() - keepDays * 86400000;
        const keep = <T extends SyncMeta & { createdAt: string }>(d: T) => d.sync !== 'synced' || new Date(d.createdAt).getTime() >= cutoff;
        set((s) => ({ sales: s.sales.filter(keep), returns: s.returns.filter(keep), payments: s.payments.filter(keep), quotations: (s.quotations ?? []).filter(keep) }));
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

export function pendingCount(s: Pick<LedgerState, 'sales' | 'returns' | 'payments'> & { quotations?: Quotation[] }): { pending: number; review: number } {
  const all = [...s.sales, ...s.returns, ...s.payments, ...(s.quotations ?? [])];
  return {
    pending: all.filter((d) => d.sync === 'pending').length,
    review: all.filter((d) => d.sync === 'review').length,
  };
}
