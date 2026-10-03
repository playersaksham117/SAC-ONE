import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { CartLine, HeldBill, Product } from '../domain/types';

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
  add: (p: Product, qty?: number) => void;
  setQty: (productId: string, qty: number) => void;
  updateLine: (productId: string, patch: Partial<Pick<CartLine, 'unitPrice' | 'discountAmount'>>) => void;
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

      add(p, qty = 1) {
        set((s) => {
          const existing = s.lines.find((l) => l.productId === p.id);
          if (existing) {
            return { lines: s.lines.map((l) => (l.productId === p.id ? { ...l, quantity: clampQty(l.quantity + qty) } : l)) };
          }
          const line: CartLine = {
            productId: p.id, name: p.name, sku: p.sku, barcode: p.barcode, hsn: p.hsn, unit: p.unit,
            quantity: clampQty(qty), unitPrice: p.price, listPrice: p.price, discountAmount: 0, gstRate: p.gstRate,
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
        set({ lines: [], customerId: null, invoiceDiscount: 0, notes: '', exchange: null });
      },
    }),
    { name: 'sacpos.cart', storage: jsonStorage },
  ),
);
