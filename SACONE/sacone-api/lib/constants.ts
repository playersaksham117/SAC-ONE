export const COMPANY = {
  name: "Try Sachin Electricals",
  tagline: "Premium Electrical & Industrial Spares",
  address: "Industrial Area, Phase II, New Delhi, India - 110020",
  phone: "+91 98765 43210",
  email: "info@trysachinelectricals.com",
  gstin: "07AABCT1234F1Z5",
  website: "www.trysachinelectricals.com",
};

export const QUOTE_TERMS = [
  "Prices are valid for the period mentioned in this quotation only.",
  "Delivery timeline will be confirmed upon order confirmation.",
  "Payment terms: 50% advance, balance before dispatch unless credit approved.",
  "Goods once sold will not be taken back unless manufacturing defect is found.",
  "Freight charges are extra unless specified in writing.",
  "Subject to New Delhi jurisdiction only.",
];

export const GST_NOTE =
  "GST @ 18% applicable as per government norms. Prices shown are exclusive of GST unless stated otherwise.";

export function formatINR(amount: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(amount);
}

export async function generateOrderNumber(): Promise<string> {
  const { prisma } = await import("@/lib/db");
  const year = new Date().getFullYear();
  const count = await prisma.order.count();
  return `ORD-${year}-${String(count + 1).padStart(4, "0")}`;
}

export async function generateQuoteNumber(): Promise<string> {
  const { prisma } = await import("@/lib/db");
  const year = new Date().getFullYear();
  const count = await prisma.quoteRequest.count();
  return `QUO-${year}-${String(count + 1).padStart(4, "0")}`;
}

export async function generateInvoiceNumber(): Promise<string> {
  const { prisma } = await import("@/lib/db");
  const year = new Date().getFullYear();
  const count = await prisma.invoice.count();
  return `INV-${year}-${String(count + 1).padStart(4, "0")}`;
}

export function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

export function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}
