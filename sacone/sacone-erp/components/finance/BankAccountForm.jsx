'use client';

import { useEffect, useMemo, useState } from 'react';
import { apiRequest } from '../../lib/api';
import { Alert, Modal } from '../ui';

const IFSC = /^[A-Z]{4}0[A-Z0-9]{6}$/;
const UPI = /^[a-zA-Z0-9._-]{2,256}@[a-zA-Z][a-zA-Z0-9.-]{1,64}$/;
const KINDS = [['savings', 'Savings'], ['current', 'Current'], ['od', 'Overdraft (OD)'], ['cc', 'Cash Credit (CC)']];
const OTHER = '__other__';

/** Shrink an uploaded QR picture in the browser (max 700 px, PNG, else JPEG) before saving. */
function readQrImage(file) {
  return new Promise((resolve, reject) => {
    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) { reject(new Error('Choose a PNG, JPG or WebP image of your UPI QR')); return; }
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read the image'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('That file is not a readable image'));
      img.onload = () => {
        const scale = Math.min(1, 700 / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        let url = canvas.toDataURL('image/png');
        if (url.length > 450000) url = canvas.toDataURL('image/jpeg', 0.9);
        if (url.length > 650000) { reject(new Error('The image is too large even after shrinking; crop it to just the QR')); return; }
        resolve(url);
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

/**
 * Create or edit a cash / bank / UPI account. Bank accounts carry the bank, holder, account number
 * (typed twice), IFSC (fills the bank), branch, account type, UPI ID and the firm's default flag.
 */
export default function BankAccountForm({ account, onClose, onSaved }) {
  const editing = Boolean(account);
  const [banks, setBanks] = useState([]);
  const [form, setForm] = useState(() => ({
    name: account?.name || '',
    accountType: account?.accountType || 'bank',
    openingBalance: account?.openingBalance ?? 0,
    bankName: account?.bankName || '',
    accountHolder: account?.accountHolder || '',
    accountNumber: account?.accountNumber || '',
    accountNumberConfirm: '',
    ifsc: account?.ifsc || '',
    branch: account?.branch || '',
    bankAccountType: account?.bankAccountType || 'current',
    upiId: account?.upiId || '',
    isDefault: Boolean(account?.isDefault),
  }));
  const [bankChoice, setBankChoice] = useState('');
  // undefined = unchanged, '' = removed, data URL = new upload
  const [qrImage, setQrImage] = useState(undefined);
  const [qrPreview, setQrPreview] = useState(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  useEffect(() => {
    if (account?.hasUpiQrImage) {
      apiRequest(`/api/finance/accounts/${account.id}/upi-qr`).then((r) => setQrPreview(r?.image || null)).catch(() => {});
    }
  }, [account]);

  const pickQr = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const url = await readQrImage(file);
      setQrImage(url);
      setQrPreview(url);
      setError('');
    } catch (err) {
      setError(err.message);
    }
  };

  useEffect(() => {
    apiRequest('/api/finance/banks').then((list) => {
      setBanks(list || []);
      if (account?.bankName) setBankChoice((list || []).some((b) => b.name === account.bankName) ? account.bankName : OTHER);
    }).catch(() => setBanks([]));
  }, [account]);

  const isBank = form.accountType === 'bank';
  const hasUpi = isBank || form.accountType === 'upi';
  const ifsc = form.ifsc.trim().toUpperCase();
  const ifscBank = useMemo(() => (IFSC.test(ifsc) ? banks.find((b) => b.code === ifsc.slice(0, 4)) : null), [ifsc, banks]);
  const numberChanged = form.accountNumber.replace(/[\s-]/g, '') !== (account?.accountNumber || '');
  const needConfirm = isBank && form.accountNumber.trim() && numberChanged;

  // A recognised IFSC decides the bank.
  useEffect(() => {
    if (ifscBank) { setBankChoice(ifscBank.name); set({ bankName: ifscBank.name }); }
  }, [ifscBank]); // eslint-disable-line react-hooks/exhaustive-deps

  const problems = [];
  if (isBank && ifsc && !IFSC.test(ifsc)) problems.push('IFSC should be 11 characters like SBIN0001234 (5th is zero).');
  if (isBank && form.accountNumber.trim() && !/^[0-9]{9,18}$/.test(form.accountNumber.replace(/[\s-]/g, ''))) problems.push('Account number should be 9 to 18 digits.');
  if (needConfirm && form.accountNumberConfirm && form.accountNumberConfirm.replace(/[\s-]/g, '') !== form.accountNumber.replace(/[\s-]/g, '')) problems.push('The two account numbers do not match.');
  if (hasUpi && form.upiId.trim() && !UPI.test(form.upiId.trim())) problems.push('UPI ID should look like name@bank.');
  if (form.isDefault && (!form.accountNumber.trim() || !IFSC.test(ifsc))) problems.push('The default bank needs its account number and IFSC.');

  const submit = async (e) => {
    e.preventDefault();
    if (problems.length) { setError(problems[0]); return; }
    if (needConfirm && !form.accountNumberConfirm.trim()) { setError('Type the account number again to confirm it.'); return; }
    setSaving(true);
    setError('');
    const body = {
      name: form.name.trim(),
      openingBalance: Number(form.openingBalance || 0),
      ...(editing ? {} : { accountType: form.accountType }),
      ...(hasUpi ? { upiId: form.upiId.trim() } : {}),
      ...(hasUpi && qrImage !== undefined ? { upiQrImage: qrImage } : {}),
      ...(isBank ? {
        bankName: bankChoice === OTHER ? form.bankName.trim() : (bankChoice || form.bankName),
        accountHolder: form.accountHolder.trim(),
        accountNumber: form.accountNumber.replace(/[\s-]/g, ''),
        accountNumberConfirm: form.accountNumberConfirm.replace(/[\s-]/g, ''),
        ifsc,
        branch: form.branch.trim(),
        bankAccountType: form.bankAccountType,
        isDefault: form.isDefault,
      } : {}),
    };
    try {
      const saved = editing
        ? await apiRequest(`/api/finance/accounts/${account.id}`, { method: 'PUT', body: JSON.stringify(body) })
        : await apiRequest('/api/finance/accounts', { method: 'POST', body: JSON.stringify(body) });
      onSaved?.(saved);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      size="lg"
      title={editing ? `Edit ${account.name}` : 'New account'}
      onClose={onClose}
      footer={(
        <>
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" form="bank-account-form" className="btn-primary" disabled={saving}>{saving ? 'Saving…' : editing ? 'Save' : 'Create'}</button>
        </>
      )}
    >
      <form id="bank-account-form" onSubmit={submit} className="space-y-4">
        <Alert message={error} />
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="sm:col-span-2">
            <label className="label" htmlFor="ba-name">Account name *</label>
            <input id="ba-name" required className="input-field" placeholder={isBank ? 'e.g. HDFC Current A/c' : 'e.g. Cash in hand'} value={form.name} onChange={(e) => set({ name: e.target.value })} />
          </div>
          <div>
            <label className="label" htmlFor="ba-type">Type</label>
            <select id="ba-type" className="input-field" disabled={editing} value={form.accountType} onChange={(e) => set({ accountType: e.target.value, isDefault: false })}>
              <option value="bank">Bank</option>
              <option value="upi">UPI</option>
              <option value="cash">Cash</option>
              <option value="other">Other</option>
            </select>
          </div>
        </div>

        {isBank && (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor="ba-ifsc">IFSC</label>
                <input id="ba-ifsc" className="input-field font-mono uppercase" maxLength={11} placeholder="SBIN0001234" value={form.ifsc} onChange={(e) => set({ ifsc: e.target.value.toUpperCase() })} />
                {ifscBank && <p className="mt-1 text-xs text-emerald-700">{ifscBank.name}</p>}
              </div>
              <div>
                <label className="label" htmlFor="ba-bank">Bank</label>
                <select id="ba-bank" className="input-field" value={bankChoice} disabled={Boolean(ifscBank)} onChange={(e) => { setBankChoice(e.target.value); if (e.target.value !== OTHER) set({ bankName: e.target.value }); }}>
                  <option value="">Select bank</option>
                  {banks.map((b) => <option key={b.code} value={b.name}>{b.name}</option>)}
                  <option value={OTHER}>Other bank…</option>
                </select>
                {bankChoice === OTHER && (
                  <input className="input-field mt-2" placeholder="Bank name" value={form.bankName} onChange={(e) => set({ bankName: e.target.value })} />
                )}
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor="ba-holder">Account holder</label>
                <input id="ba-holder" className="input-field" placeholder="As printed on the cheque book" value={form.accountHolder} onChange={(e) => set({ accountHolder: e.target.value })} />
              </div>
              <div>
                <label className="label" htmlFor="ba-branch">Branch</label>
                <input id="ba-branch" className="input-field" value={form.branch} onChange={(e) => set({ branch: e.target.value })} />
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor="ba-no">Account number</label>
                <input id="ba-no" className="input-field font-mono" inputMode="numeric" autoComplete="off" value={form.accountNumber} onChange={(e) => set({ accountNumber: e.target.value })} />
              </div>
              <div>
                <label className="label" htmlFor="ba-no2">Account number again{needConfirm ? ' *' : ''}</label>
                <input
                  id="ba-no2"
                  className="input-field font-mono"
                  inputMode="numeric"
                  autoComplete="off"
                  disabled={!needConfirm}
                  placeholder={needConfirm ? 'Type it again to confirm' : 'Only when the number changes'}
                  value={form.accountNumberConfirm}
                  onPaste={(e) => e.preventDefault()}
                  onChange={(e) => set({ accountNumberConfirm: e.target.value })}
                />
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor="ba-kind">Account type</label>
                <select id="ba-kind" className="input-field" value={form.bankAccountType} onChange={(e) => set({ bankAccountType: e.target.value })}>
                  {KINDS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </div>
              <div>
                <label className="label" htmlFor="ba-upi">UPI ID (for the pay QR on invoices)</label>
                <input id="ba-upi" className="input-field" placeholder="yourname@hdfcbank" value={form.upiId} onChange={(e) => set({ upiId: e.target.value })} />
              </div>
            </div>
            <label className="flex items-start gap-2 rounded-lg border border-slate-200 p-3 text-sm">
              <input type="checkbox" className="mt-1" checked={form.isDefault} onChange={(e) => set({ isDefault: e.target.checked })} />
              <span>
                <span className="font-medium">Default bank of this firm</span>
                <span className="block text-xs text-slate-500">Printed under &ldquo;Our Bankers&rdquo; on invoices (with a UPI pay QR when it has a UPI ID), and used for UPI / bank sale payments when a terminal has no bank of its own.</span>
              </span>
            </label>
          </>
        )}

        {form.accountType === 'upi' && (
          <div>
            <label className="label" htmlFor="ba-upi2">UPI ID</label>
            <input id="ba-upi2" className="input-field" placeholder="yourname@okaxis" value={form.upiId} onChange={(e) => set({ upiId: e.target.value })} />
          </div>
        )}

        {hasUpi && (
          <div className="rounded-lg border border-slate-200 p-3">
            <div className="text-sm font-medium">UPI QR image (optional)</div>
            <p className="mt-1 text-xs text-slate-500">
              Upload the QR your bank, PhonePe, Paytm or GPay business gave you. Settings → Invoice printing decides whether bills and SAC-POS show this image or a QR made from the UPI ID.
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              {qrPreview && qrImage !== '' ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={qrPreview} alt="Uploaded UPI QR" className="h-28 w-28 rounded border border-slate-200 bg-white object-contain" />
              ) : <div className="flex h-28 w-28 items-center justify-center rounded border border-dashed border-slate-300 text-xs text-slate-400">No image</div>}
              <div className="flex flex-col gap-2">
                <label className="btn-secondary !min-h-0 cursor-pointer !px-3 !py-1.5 text-xs">
                  {qrPreview && qrImage !== '' ? 'Replace image' : 'Upload QR image'}
                  <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={pickQr} />
                </label>
                {qrPreview && qrImage !== '' && (
                  <button type="button" className="text-left text-xs font-medium text-red-600 hover:underline" onClick={() => { setQrImage(''); }}>Remove image</button>
                )}
              </div>
            </div>
          </div>
        )}

        <div className="max-w-xs">
          <label className="label" htmlFor="ba-open">Opening balance</label>
          <input id="ba-open" type="number" step="0.01" className="input-field" value={form.openingBalance} onChange={(e) => set({ openingBalance: e.target.value })} />
        </div>
        {problems.length > 0 && <p className="text-xs text-amber-700">{problems[0]}</p>}
      </form>
    </Modal>
  );
}
