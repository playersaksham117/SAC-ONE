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
  setMode: (mode: 'sale' | 'quotation') => void;
  loadQuotation: (q: Quotation) => void;
  add: (p: Product, qty?: number) => void;
  setQty: (productId: string, qty: number) => void;
  updateLine: (productId: string, patch: Partial<Pick<CartLine, 'unitPrice' | 'discountAmount' | 'serialNumbers' | 'shortDescription' | 'costAmount'>>) => void;
  remove: (productId: string) => void;
  setCustomer: (id: string | null) => void;
  setInvoiceDiscount: (amount: number) => void;
  setNotes: (notes: string) => void;
  load: (bill: HeldBill) => void;
  startExchange: (credit: ExchangeCredit, customerId: string | null) => void;
  clear: () => void;
}

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

      add(p, qty = 1) {
        set((s) => {
          const existing = s.lines.find((l) => l.productId === p.id);
          if (existing) {
            return { lines: s.lines.map((l) => (l.productId === p.id ? { ...l, quantity: clampQty(l.quantity + qty) } : l)) };
          }
          const line: CartLine = {
            productId: p.id, name: p.name, sku: p.sku, barcode: p.barcode, hsn: p.hsn, unit: p.unit,
            quantity: clampQty(qty), unitPrice: p.price, listPrice: p.price, discountAmount: 0, gstRate: p.gstRate,
            warranty: p.warranty ?? null, guarantee: p.guarantee ?? null, shortDescription: null, itemType: p.itemType, // typed per bill in the cart, not taken from the product
          };
          return { lines: [...s.lines, line] };
        });
      },

      setQty(productId, qty) {
        set((s) => ({
          lines: qty <= 0
            ? s.lines.filter((l) => l.productId !== productId)
            : s.lines.map((l) => (l.productId === productId ? { ...l, quantity: clampQty(qty) } : l)),
        }));
      },

      updateLine(productId, patch) {
        set((s) => ({ lines: s.lines.map((l) => (l.productId === productId ? { ...l, ...patch } : l)) }));
      },

      remove(productId) {
        set((s) => ({ lines: s.lines.filter((l) => l.productId !== productId) }));
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
    { name: 'sacpos.cart', storage: jsonStorage },
  ),
);
