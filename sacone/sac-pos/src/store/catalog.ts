import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ServerCustomer, ServerProduct } from '../api/sacone';
import type { Customer, Product, SyncState } from '../domain/types';
import { normalizePhone } from '../domain/validation';
import { jsonStorage } from './persist';
import { periodOf } from '../domain/warranty';

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
  /** productId → minimum selling price (before GST), from ERP Product Master. */
  minPrices: Record<string, number>;
  setMinPrices: (prices: Record<string, number>) => void;
  applyProducts: (rows: ServerProduct[]) => void;
  /** After a full pull: drop products the server did not send (removed, or from another firm). */
  keepOnlyProducts: (ids: Set<string>) => number;
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
    minPrice: p.min_selling_price != null ? Number(p.min_selling_price) : null,
    itemType: p.item_type === 'service' ? 'service' : 'goods',
    warranty: periodOf(p.warranty_value, p.warranty_unit),
    guarantee: periodOf(p.guarantee_value, p.guarantee_unit),
    shortDescription: p.short_description || null,
    onHand: Number(p.current_stock || 0),
    available: Number(p.available_stock ?? p.current_stock ?? 0),
    isActive: p.is_active !== false && p.approval_status !== 'rejected',
    updatedAt: p.updated_at,
  };
}

/** A bill / quotation with its buyer's address filled from the customer list when the bill has none. */
export function withBuyerAddress<T extends { customer: { id: string; address?: string | null; city?: string | null; state?: string | null } | null }>(doc: T): T {
  const c = doc.customer;
  if (!c || c.address || c.city) return doc;
  const known = useCatalog.getState().customers[c.id];
  if (!known || !(known.address || known.city)) return doc;
  return { ...doc, customer: { ...c, address: known.address ?? null, city: known.city ?? null, state: known.state ?? null } };
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
    creditDays: c.credit_days ?? null,
    outstanding: Number(c.outstanding || 0),
    creditApproved: c.credit_approved === true,
    isActive: c.is_active,
    updatedAt: c.updated_at,
  };
}

export const useCatalog = create<CatalogState>()(
  persist(
    (set, get) => ({
      products: {},
      customers: {},
      minPrices: {},

      setMinPrices(prices) {
        set({ minPrices: prices || {} });
      },
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

      keepOnlyProducts(ids) {
        const gone = Object.keys(get().products).filter((id) => !ids.has(id));
        if (gone.length) {
          set((s) => {
            const products = { ...s.products };
            for (const id of gone) delete products[id];
            return { products };
          });
        }
        return gone.length;
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
        set({ products: {}, customers: {}, minPrices: {}, productCursor: EPOCH, customerCursor: EPOCH, lastPullAt: null });
      },
    }),
    { name: 'sacpos.catalog', storage: jsonStorage },
  ),
);

/**
 * Products matching every word typed, in any order, in the name, SKU, barcode, brand, HSN or
 * category ("copper lug 16", "ascon ferrule 25"). The exact barcode / SKU comes first, then names
 * starting with what was typed, then the phrase as typed, then names holding most words whole.
 */
export function searchProducts(products: Record<string, Product>, query: string, limit = 60): Product[] {
  const q = query.trim().toLowerCase().replace(/\s+/g, ' ');
  const all = Object.values(products).filter((p) => p.isActive);
  if (!q) return all.sort((a, b) => a.name.localeCompare(b.name)).slice(0, limit);
  const words = q.split(' ').slice(0, 8);
  const hay = (p: Product) => [p.name, p.sku, p.barcode, p.brand, p.hsn, p.category].filter(Boolean).join(' ').toLowerCase();
  const exact = all.filter((p) => p.barcode?.toLowerCase() === q || p.sku.toLowerCase() === q);
  const rank = (p: Product) => {
    const name = p.name.toLowerCase();
    const tier = name.startsWith(q) ? 0 : name.includes(q) ? 1 : 2;
    const padded = ` ${name.replace(/,/g, ' ')} `;
    const whole = words.filter((w) => padded.includes(` ${w} `)).length;
    return { tier, whole };
  };
  const rest = all
    .filter((p) => !exact.includes(p))
    .map((p) => ({ p, h: hay(p) }))
    .filter(({ h }) => words.every((w) => h.includes(w)))
    .map(({ p }) => ({ p, r: rank(p) }))
    .sort((a, b) => a.r.tier - b.r.tier || b.r.whole - a.r.whole || a.p.name.localeCompare(b.p.name))
    .map(({ p }) => p);
  return [...exact, ...rest].slice(0, limit);
}

export function findByCode(products: Record<string, Product>, code: string): Product | null {
  const c = code.trim().toLowerCase();
  return Object.values(products).find((p) => p.barcode?.toLowerCase() === c || p.sku.toLowerCase() === c) ?? null;
}

/**
 * Customers matching every word typed, in the name, address, city, state, phone, GSTIN or code:
 * "pims garha" finds the PIMS on Garha Road and not the other PIMS. Names starting with the
 * first word come first; same names are then ordered by city and address.
 */
export function searchCustomers(customers: Record<string, Customer>, query: string, limit = 60): Customer[] {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const all = Object.values(customers).filter((c) => c.isActive);
  const haystack = (c: Customer) => [c.name, c.address, c.city, c.state, c.gstin, c.code, c.email].filter(Boolean).join(' ').toLowerCase();
  const phone = (c: Customer) => (c.phone ?? '').replace(/\D/g, '');
  const hits = !words.length ? all : all.filter((c) => {
    const text = haystack(c);
    const tel = phone(c);
    // a word of 3+ digits also matches inside the mobile number
    return words.every((w) => text.includes(w) || (/^\+?\d{3,}$/.test(w) && tel.includes(w.replace(/\D/g, ''))));
  });
  const first = words[0] ?? '';
  const rank = (c: Customer) => (first && c.name.toLowerCase().startsWith(first) ? 0 : first && c.name.toLowerCase().includes(first) ? 1 : 2);
  const place = (c: Customer) => `${c.city ?? ''} ${c.address ?? ''}`.toLowerCase();
  return hits
    .sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name) || place(a).localeCompare(place(b)))
    .slice(0, limit);
}

/** How many customers in this list share each name (to mark look-alikes). */
export function sameNameCounts(list: Customer[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const c of list) {
    const k = c.name.trim().toLowerCase();
    counts[k] = (counts[k] ?? 0) + 1;
  }
  return counts;
}
