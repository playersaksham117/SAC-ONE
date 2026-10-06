import { describe, expect, it } from 'vitest';
import { cleanText, invoiceShareMessage, isExpiredShareFile, SHARE_FILE_TTL_MS, shareFileName } from '../src/domain/share';

describe('share file names', () => {
  it('keeps only safe characters and never produces a path', () => {
    expect(shareFileName('INV/24-25/1025')).toBe('Invoice-INV-24-25-1025.pdf');
    expect(shareFileName('../../etc/passwd')).toBe('Invoice-etc-passwd.pdf');
    expect(shareFileName('A1-0007')).toBe('Invoice-A1-0007.pdf');
    expect(shareFileName('')).toBe('Invoice-document.pdf');
    expect(shareFileName('x'.repeat(500)).length).toBeLessThanOrEqual('Invoice-'.length + 60 + 4);
  });
});

describe('share caption', () => {
  it('has number, amount and thanks only', () => {
    const msg = invoiceShareMessage('INV-1025', 12500);
    expect(msg).toMatch(/^Invoice INV-1025 \| Amount .*12,500\.00 \| Thank you for your business\.$/);
  });

  it('strips control and bidi characters from the number', () => {
    expect(invoiceShareMessage('INV\n1025\u202e', 1)).toMatch(/^Invoice INV 1025 \|/);
    expect(cleanText('a\u0000b\tc')).toBe('a b c');
  });
});

describe('temporary file expiry', () => {
  it('expires after the TTL and treats unknown times as expired', () => {
    const now = 1_000_000_000;
    expect(isExpiredShareFile(now - SHARE_FILE_TTL_MS + 1000, now)).toBe(false);
    expect(isExpiredShareFile(now - SHARE_FILE_TTL_MS - 1000, now)).toBe(true);
    expect(isExpiredShareFile(null, now)).toBe(true);
  });
});
