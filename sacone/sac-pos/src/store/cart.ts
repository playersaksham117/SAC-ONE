import { Platform } from 'react-native';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { CartLine, HeldBill, Product, Quotation } from '../domain/types';

/** Value of returned goods that pays for part of the next bill (exchange). */
export interface ExchangeCredit {
  returnId: string;
  returnNumber: string;
  saleNumber: string;
  amount: number;
}
import { MAX_QTY } from '../domain/validation';
import { jsonStorage } from './persist';

interface CartState {
  lines: CartLine[];
  customerId: string | null;
  invoiceDiscount: number;
  notes: string;
  exchange: ExchangeCredit | null;
  /** Sale (bill) or quotation: the toggle on the Sell screen. */
  mode: 'sale' | 'quotation';
  /** The phone quotation this cart was loaded from (the sale converts it). */
  fromQuotation: { id: string; number: string } | null;
  /** Bill type for sales: GST invoice or Quick Bill (walk-in / unregistered); stays as chosen. */
  series: 'gst' | 'quick';
  setSeries: (series: 'gst' | 'quick') => void;
  setMode: (mode: 'sale' | 'quotation') => void;
  loadQuotation: (q: Quotation) => void;
  /** Adds to the product's last line, or (newLine) as a separate line under it. */
  add: (p: Product, qty?: number, opts?: { newLine?: boolean; after?: string }) => void;
  /** key = lineKey(line); a product's first line is keyed by its productId. */
  setQty: (key: string, qty: number) => void;
  updateLine: (key: string, patch: Partial<Pick<CartLine, 'unitPrice' | 'discountAmount' | 'serialNumbers' | 'shortDescription' | 'costAmount' | 'batchNumber'>>) => void;
  remove: (key: string) => void;
  /** Put the lines back as they were (undo of a triple tap's first two taps). */
  restoreLines: (lines: CartLine[]) => void;
  setCustomer: (id: string | null) => void;
  setInvoiceDiscount: (amount: number) => void;
  setNotes: (notes: string) => void;
  load: (bill: HeldBill) => void;
  startExchange: (credit: ExchangeCredit, customerId: string | null) => void;
  clear: () => void;
}

/** GST invoices are made on SAC-POS web only; the phone / tablet app makes Quick Bills and quotations. */
export const GST_BILLS_HERE = Platform.OS === 'web';
const allowedSeries = (series: 'gst' | 'quick' | null | undefined): 'gst' | 'quick' => (GST_BILLS_HERE && series !== 'quick' ? 'gst' : 'quick');

/** A cart line's key: the product id, or its own id when it is an extra line of that product. */
export const lineKey = (l: Pick<CartLine, 'productId' | 'lineId'>) => l.lineId ?? l.productId;

const clampQty = (q: number) => Math.min(Math.max(Math.round(q * 1000) / 1000, 0), MAX_QTY);

export const useCart = create<CartState>()(
  persist(
    (set) => ({
      lines: [],
      customerId: null,
      invoiceDiscount: 0,
      notes: '',
      exchange: null,
      mode: 'sale',
      fromQuotation: null,
      series: allowedSeries('gst'),

      setSeries(series) {
        set({ series: allowedSeries(series) });
      },

      setMode(mode) {
        set((s) => (s.exchange && mode === 'quotation' ? {} : { mode, fromQuotation: mode === 'quotation' ? null : s.fromQuotation }));
      },

      loadQuotation(q) {
        set({
          lines: q.totals.lines.map((l) => ({
            productId: l.productId, name: l.name, sku: l.sku, barcode: l.barcode, hsn: l.hsn, unit: l.unit,
            quantity: l.quantity, unitPrice: l.unitPrice, listPrice: l.listPrice ?? l.unitPrice, discountAmount: l.discountAmount, gstRate: l.gstRate,
            shortDescription: l.shortDescription ?? null, itemType: l.itemType,
          })),
          customerId: q.customer?.id ?? null,
          invoiceDiscount: q.totals.invoiceDiscount,
          notes: q.notes ?? '',
          exchange: null,
          mode: 'sale',
          fromQuotation: { id: q.id, number: q.number },
        });
      },

      add(p, qty = 1, opts) {
        set((s) => {
          const same = s.lines.filter((l) => l.productId === p.id);
          const existing = same[same.length - 1];
          if (existing && !opts?.newLine) {
            const key = lineKey(existing);
            return { lines: s.lines.map((l) => (lineKey(l) === key ? { ...l, quantity: clampQty(l.quantity + qty) } : l)) };
          }
          const taken = new Set(s.lines.map(lineKey));
          let lineId: string | undefined;
          if (taken.has(p.id)) {
            let n = 2;
            while (taken.has(`${p.id}#${n}`)) n += 1;
            lineId = `${p.id}#${n}`;
          }
          const line: CartLine = {
            productId: p.id, ...(lineId ? { lineId } : {}), name: p.name, sku: p.sku, barcode: p.barcode, hsn: p.hsn, unit: p.unit,
            quantity: clampQty(qty), unitPrice: p.price, listPrice: p.price, discountAmount: 0, gstRate: p.gstRate,
            warranty: p.warranty ?? null, guarantee: p.guarantee ?? null, shortDescription: null, itemType: p.itemType, // typed per bill in the cart, not taken from the product
          };
          const at = opts?.after ? s.lines.findIndex((l) => lineKey(l) === opts.after) : -1;
          if (at >= 0) return { lines: [...s.lines.slice(0, at + 1), line, ...s.lines.slice(at + 1)] };
          return { lines: [...s.lines, line] };
        });
      },

      setQty(key, qty) {
        set((s) => ({
          lines: qty <= 0
            ? s.lines.filter((l) => lineKey(l) !== key)
            : s.lines.map((l) => (lineKey(l) === key ? { ...l, quantity: clampQty(qty) } : l)),
        }));
      },

      updateLine(key, patch) {
        set((s) => ({ lines: s.lines.map((l) => (lineKey(l) === key ? { ...l, ...patch } : l)) }));
      },

      remove(key) {
        set((s) => ({ lines: s.lines.filter((l) => lineKey(l) !== key) }));
      },

      restoreLines(lines) {
        set({ lines });
      },

      setCustomer(id) {
        set({ customerId: id });
      },

      setInvoiceDiscount(amount) {
        set({ invoiceDiscount: Math.max(0, Number(amount) || 0) });
      },

      setNotes(notes) {
        set({ notes });
      },

      load(bill) {
        set({ lines: bill.lines, customerId: bill.customerId, invoiceDiscount: bill.invoiceDiscount, notes: '' });
      },

      startExchange(credit, customerId) {
        set({ lines: [], customerId, invoiceDiscount: 0, notes: `Exchange for ${credit.saleNumber} (return ${credit.returnNumber})`, exchange: credit });
      },

      clear() {
        set({ lines: [], customerId: null, invoiceDiscount: 0, notes: '', exchange: null, fromQuotation: null });
      },
    }),
    {
      name: 'sacpos.cart',
      storage: jsonStorage,
      // a cart saved as a GST bill on a phone becomes a Quick Bill there
      merge: (saved, current) => {
        const s = (saved ?? {}) as Partial<CartState>;
        return { ...current, ...s, series: allowedSeries(s.series ?? current.series) };
      },
    },
  ),
);
