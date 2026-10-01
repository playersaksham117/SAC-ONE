import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ServerCustomer, ServerProduct } from '../api/sacone';
import type { Customer, Product, SyncState } from '../domain/types';
import { normalizePhone } from '../domain/validation';
import { jsonStorage } from './persist';

export const EPOCH = '1970-01-01T00:00:00.000Z';

export interface LocalCustomer extends Customer {
  isLocal: true;
  sync: SyncState;
  syncError?: string | null;
  createdBy: string;
}

interface CatalogState {
  products: Record<string, Product>;
  customers: Record<string, Customer | LocalCustomer>;
  productCursor: string;
  customerCursor: string;
  lastPullAt: string | null;
  applyProducts: (rows: ServerProduct[]) => void;
  /** Returns localId → serverId for local customers now superseded by their ERP record. */
  applyCustomers: (rows: ServerCustomer[]) => Record<string, string>;
  setCursors: (c: { productCursor?: string; customerCursor?: string }) => void;
  addLocalCustomer: (c: LocalCustomer) => void;
  markCustomers: (updates: { id: string; sync: SyncState; syncError?: string | null }[]) => void;
  adjustOutstanding: (customerId: string, delta: number) => void;
  reset: () => void;
}

export function mapServerProduct(p: ServerProduct): Product {
  return {
    id: p.uuid,
    name: p.name,
    sku: p.sku,
    barcode: p.barcode,
    category: p.category,
    brand: p.brand,
    unit: p.unit || 'PCS',
    hsn: p.hsn,
    gstRate: Number(p.gst_rate || 0),
    mrp: Number(p.mrp || 0),
    price: Number(p.selling_price || 0),
    onHand: Number(p.current_stock || 0),
    available: Number(p.available_stock ?? p.current_stock ?? 0),
    isActive: p.is_active !== false && p.approval_status !== 'rejected',
    updatedAt: p.updated_at,
  };
}

export function mapServerCustomer(c: ServerCustomer): Customer {
  return {
    id: c.uuid,
    code: c.code,
    name: c.name,
    phone: c.phone,
    email: c.email,
    gstin: c.gstin,
    gstStateCode: c.gst_state_code || (c.gstin ? c.gstin.slice(0, 2) : null),
    address: c.address,
    city: c.city,
    state: c.state,
    creditLimit: Number(c.credit_limit || 0),
    outstanding: Number(c.outstanding || 0),
    isActive: c.is_active,
    updatedAt: c.updated_at,
  };
}

export const useCatalog = create<CatalogState>()(
  persist(
    (set) => ({
      products: {},
      customers: {},
      productCursor: EPOCH,
      customerCursor: EPOCH,
      lastPullAt: null,

      applyProducts(rows) {
        if (!rows.length) return;
        set((s) => {
          const products = { ...s.products };
          for (const r of rows) {
            if (!r.uuid || (r.approval_status === 'rejected' && !products[r.uuid])) continue;
            products[r.uuid] = mapServerProduct(r);
          }
          return { products };
        });
      },

      applyCustomers(rows) {
        const remap: Record<string, string> = {};
        if (!rows.length) return remap;
        set((s) => {
          const customers = { ...s.customers };
          for (const r of rows) {
            const c = mapServerCustomer(r);
            customers[c.id] = c;
            // A synced local customer is superseded by the ERP record with the same phone.
            const phone = normalizePhone(c.phone);
            for (const [id, existing] of Object.entries(customers)) {
              if (existing.isLocal && (existing as LocalCustomer).sync === 'synced' && phone && normalizePhone(existing.phone) === phone) {
                delete customers[id];
                remap[id] = c.id;
              }
            }
          }
          return { customers };
        });
        return remap;
      },

      setCursors(c) {
        set((s) => ({
          productCursor: c.productCursor ?? s.productCursor,
          customerCursor: c.customerCursor ?? s.customerCursor,
          lastPullAt: new Date().toISOString(),
        }));
      },

      addLocalCustomer(c) {
        set((s) => ({ customers: { ...s.customers, [c.id]: c } }));
      },

      markCustomers(updates) {
        set((s) => {
          const customers = { ...s.customers };
          for (const u of updates) {
            const c = customers[u.id] as LocalCustomer | undefined;
            if (c?.isLocal) customers[u.id] = { ...c, sync: u.sync, syncError: u.syncError ?? null };
          }
          return { customers };
        });
      },

      adjustOutstanding(customerId, delta) {
        set((s) => {
          const c = s.customers[customerId];
          if (!c) return s;
          return { customers: { ...s.customers, [customerId]: { ...c, outstanding: Math.round((c.outstanding + delta) * 100) / 100 } } };
        });
      },

      reset() {
        set({ products: {}, customers: {}, productCursor: EPOCH, customerCursor: EPOCH, lastPullAt: null });
      },
    }),
    { name: 'sacpos.catalog', storage: jsonStorage },
  ),
);

/** Case-insensitive search on name / SKU / barcode / brand, exact barcode first. */
export function searchProducts(products: Record<string, Product>, query: string, limit = 60): Product[] {
  const q = query.trim().toLowerCase();
  const all = Object.values(products).filter((p) => p.isActive);
  if (!q) return all.sort((a, b) => a.name.localeCompare(b.name)).slice(0, limit);
  const exact = all.filter((p) => p.barcode?.toLowerCase() === q || p.sku.toLowerCase() === q);
  const rest = all.filter((p) => !exact.includes(p) && (
    p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q)
    || (p.barcode ?? '').toLowerCase().includes(q) || (p.brand ?? '').toLowerCase().includes(q)
  ));
  return [...exact, ...rest.sort((a, b) => a.name.localeCompare(b.name))].slice(0, limit);
}

export function findByCode(products: Record<string, Product>, code: string): Product | null {
  const c = code.trim().toLowerCase();
  return Object.values(products).find((p) => p.barcode?.toLowerCase() === c || p.sku.toLowerCase() === c) ?? null;
}

export function searchCustomers(customers: Record<string, Customer>, query: string, limit = 60): Customer[] {
  const q = query.trim().toLowerCase();
  const digits = q.replace(/\D/g, '');
  const all = Object.values(customers).filter((c) => c.isActive);
  const hits = !q ? all : all.filter((c) =>
    c.name.toLowerCase().includes(q)
    || (digits.length >= 3 && (c.phone ?? '').replace(/\D/g, '').includes(digits))
    || (c.gstin ?? '').toLowerCase().includes(q)
    || (c.code ?? '').toLowerCase().includes(q));
  return hits.sort((a, b) => a.name.localeCompare(b.name)).slice(0, limit);
}
