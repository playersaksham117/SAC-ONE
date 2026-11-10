import { describe, expect, it } from 'vitest';
import { invoiceWhatsAppText, whatsAppUrl } from '../src/domain/share';

const bill = {
  number: 'MB/QB/0008/26-27', createdAt: '2026-11-07T13:56:49.000Z', customer: { name: 'Ravi Kumar' },
  totals: { lines: [{ name: 'ADDR ITEM 6LDK7', quantity: 2, unit: 'pcs', lineTotal: 260 }, { name: 'Basmati Rice 5kg', quantity: 1.5, unit: 'kg', lineTotal: 628.95 }], grandTotal: 889 },
  amountPaid: 889, amountDue: 0,
};

describe('WhatsApp bill text', () => {
  it('has invoice, date, customer, each product with qty and amount, and the total', () => {
    const t = invoiceWhatsAppText(bill, 'My Shop');
    expect(t).toContain('*My Shop*');
    expect(t).toContain('Invoice: *MB/QB/0008/26-27*');
    expect(t).toContain('Date: 07-Nov-2026');
    expect(t).toContain('Customer: Ravi Kumar');
    expect(t).toContain('1. ADDR ITEM 6LDK7\n    Qty 2 pcs | Amt ₹260.00');
    expect(t).toContain('2. Basmati Rice 5kg\n    Qty 1.5 kg | Amt ₹628.95');
    expect(t).toContain('*Total: ₹889.00*');
    expect(t).not.toContain('Due');
  });
  it('walk-in and credit bills', () => {
    const t = invoiceWhatsAppText({ ...bill, customer: null, amountPaid: 500, amountDue: 389 });
    expect(t).toContain('Customer: Walk-in customer');
    expect(t).toContain('Paid: ₹500.00 | Due: ₹389.00');
  });
  it('opens WhatsApp to the customer when the mobile is known', () => {
    expect(whatsAppUrl('Hi & bye', '9876543210')).toBe('whatsapp://send?phone=919876543210&text=Hi%20%26%20bye');
    expect(whatsAppUrl('Hi', null)).toBe('whatsapp://send?text=Hi');
  });
});
