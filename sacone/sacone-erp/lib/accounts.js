/** "HDFC Current · HDFC Bank ••6789 (default)" for account pickers. */
export function accountLabel(a) {
  if (!a) return '';
  const bank = [a.bankName, a.accountNumberLast4 ? `••${a.accountNumberLast4}` : ''].filter(Boolean).join(' ');
  return `${a.name}${bank ? ` · ${bank}` : a.accountType ? ` (${a.accountType})` : ''}${a.isDefault ? ' · default' : ''}`;
}

/** The account a payment of this mode most likely uses: cash → a cash account, else the default bank. */
export function defaultAccountFor(accounts = [], mode = 'cash') {
  const active = accounts.filter((a) => a.isActive !== false);
  if (mode === 'cash') return active.find((a) => a.accountType === 'cash') || null;
  return active.find((a) => a.isDefault)
    || active.find((a) => a.accountType === (mode === 'upi' ? 'upi' : 'bank'))
    || active.find((a) => a.accountType === 'bank' || a.accountType === 'upi')
    || null;
}
