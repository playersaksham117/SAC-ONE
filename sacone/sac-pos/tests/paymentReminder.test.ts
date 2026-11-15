import { describe, expect, it } from 'vitest';
import { paymentReminderText } from '../src/domain/share';

const bills = [
  { number: 'MB/0852/26-27', createdAt: '2026-11-07T06:00:00.000Z', amountDue: 1000, dueDate: '2026-11-10' },
  { number: 'MB/0800/26-27', createdAt: '2026-10-01T06:00:00.000Z', amountDue: 1500 },
  { number: 'MB/0900/26-27', createdAt: '2026-11-12T06:00:00.000Z', amountDue: 0 },
];

describe('WhatsApp payment reminder', () => {
  it('has the balance, the unpaid bills oldest first with overdue days, and the UPI ID', () => {
    const t = paymentReminderText({ customerName: 'Ravi Kumar', outstanding: 2500, bills, shopName: 'My Shop', upiId: 'shop@icici', today: '2026-11-15', creditDays: 15 });
    expect(t).toContain('*My Shop*\n*Payment reminder*');
    expect(t).toContain('Dear Ravi Kumar,');
    expect(t).toContain('Your balance due with us is *₹2,500.00*.');
    expect(t).toContain('1. MB/0800/26-27 | 01-Oct-2026 | Due ₹1,500.00 (30 days overdue)');
    expect(t).toContain('2. MB/0852/26-27 | 07-Nov-2026 | Due ₹1,000.00 (5 days overdue)');
    expect(t).not.toContain('MB/0900');
    expect(t).toContain('Pay by UPI: shop@icici');
    expect(t).toContain('already paid');
  });
  it('leaves the bill list out when the phone\'s bills claim more than the balance', () => {
    const t = paymentReminderText({ customerName: 'Ravi', outstanding: 1000, bills, today: '2026-11-15' });
    expect(t).toContain('*₹1,000.00*');
    expect(t).not.toContain('Pending bills');
    expect(t).not.toContain('UPI');
  });
  it('no overdue note before the due date', () => {
    const t = paymentReminderText({ customerName: 'Ravi', outstanding: 1000, bills: [bills[0]], today: '2026-11-09' });
    expect(t).toContain('Due ₹1,000.00\n');
    expect(t).not.toContain('overdue');
  });
});
