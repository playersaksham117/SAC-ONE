/** Core SAC-POS domain types (pure — no React Native imports). */

export type PaymentMethod = 'cash' | 'upi' | 'bank' | 'credit';
export type RefundMethod = 'cash' | 'upi' | 'bank' | 'credit_note';
export type SyncState = 'pending' | 'synced' | 'review' ;

export interface Product {
  id: string;            // SACONE product id
  name: string;
  sku: string;
  barcode?: string | null;
  category?: string | null;
  brand?: string | null;
  unit: string;
  hsn?: string | null;
  gstRate: number;
  mrp: number;
  price: number;         // selling price, GST-exclusive
  minPrice?: number;     // floor for the net unit price (GST-exclusive); 0 = price is the floor
  onHand: number;
  available: number;     // server stock for this device's warehouse
  isActive: boolean;
  updatedAt: string;
}

export interface Customer {
  id: string;            // SACONE id, or `local-…` until synced
  code?: string | null;
  name: string;
  phone?: string | null;
  email?: string | null;
  gstin?: string | null;
  gstStateCode?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  creditLimit: number;
  outstanding: number;
  isActive: boolean;
  isLocal?: boolean;
  updatedAt: string;
}

export interface CartLine {
  productId: string;
  name: string;
  sku: string;
  barcode?: string | null;
  hsn?: string | null;
  unit: string;
  quantity: number;
  unitPrice: number;
  listPrice: number;     // catalog price when added (to detect overrides)
  discountAmount: number;
  gstRate: number;
}

export interface ComputedLine extends CartLine {
  gross: number;
  invoiceDiscountShare: number;
  taxableAmount: number;
  gstAmount: number;
  lineTotal: number;
}

export interface CartTotals {
  lines: ComputedLine[];
  subtotal: number;
  itemDiscountTotal: number;
  invoiceDiscount: number;
  taxableAmount: number;
  cgstAmount: number;
  sgstAmount: number;
  igstAmount: number;
  gstAmount: number;
  grandTotal: number;
  taxSplit: 'cgst_sgst' | 'igst';
}

export interface Payment {
  method: PaymentMethod;
  amount: number;
  reference?: string | null;
}

export interface SyncMeta {
  sync: SyncState;
  serverNumber?: string | null;
  serverId?: string | null;
  syncError?: string | null;
  syncWarnings?: string[];
  syncedAt?: string | null;
}

/** Who approved a return / exchange on the phone (a user with "POS Returns – approve"). */
export interface Approval {
  userId: string;
  name: string;
  at: string;
}

export interface Sale extends SyncMeta {
  id: string;
  number: string;
  createdAt: string;
  userId: string;
  userName: string;
  customer: Pick<Customer, 'id' | 'name' | 'phone' | 'gstin' | 'gstStateCode'> | null;
  totals: CartTotals;
  payments: Payment[];
  amountPaid: number;
  amountDue: number;
  tendered?: number;
  change?: number;
  /** Notes/coins counted into and out of the cash drawer for this bill. */
  cashDrawer?: { received: Record<string, number>; change: Record<string, number> };
  /** Set when this bill is the new half of an exchange: the return that paid for part of it. */
  exchange?: { returnId: string; returnNumber: string; credit: number } | null;
  notes?: string | null;
  returned: Record<string, number>;   // productId → qty returned
}

export interface ReturnLine {
  productId: string;
  sku: string;
  name: string;
  quantity: number;
  amount: number;
}

export interface SaleReturn extends SyncMeta {
  id: string;
  number: string;
  saleId: string;
  saleNumber: string;
  createdAt: string;
  userId: string;
  userName: string;
  lines: ReturnLine[];
  refundMethod: RefundMethod;
  reason: string;
  total: number;
  /** 'exchange': the value goes into a new bill instead of back to the customer. */
  type?: 'return' | 'exchange';
  approvedBy?: Approval | null;
}

export interface CustomerPayment extends SyncMeta {
  id: string;
  number: string;
  createdAt: string;
  userId: string;
  userName: string;
  customerId: string;
  customerName: string;
  customerPhone?: string | null;
  invoiceNumber?: string | null;
  amount: number;
  method: Exclude<PaymentMethod, 'credit'>;
  reference?: string | null;
  notes?: string | null;
}

export interface HeldBill {
  id: string;
  createdAt: string;
  label: string;
  lines: CartLine[];
  customerId: string | null;
  invoiceDiscount: number;
}
