'use client';

import { useEffect, useState } from 'react';
import { apiRequest } from '../../../../lib/api';
import { RequirePermission, useAuth } from '../../../../lib/auth-context';
import PageHeader, { Alert, LoadingState } from '../../../../components/ui';
import LabelSettingsCard from '../../../../components/products/LabelSettingsCard';

const TERMS_PLACEHOLDER = [
  'All disputes are subject to JALANDHAR jurisdiction.',
  'Goods once sold will not be taken back.',
  'E.&O.E.',
].join('\n');

export default function SettingsPage() {
  const [settings, setSettings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [invoiceForm, setInvoiceForm] = useState(null);
  const { checkPermission } = useAuth();
  const canEdit = checkPermission('core.system_settings.edit');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const list = await apiRequest('/api/settings');
      setSettings(list);
      const value = (key, fallback = '') => list.find((x) => x.key === key)?.value ?? fallback;
      setInvoiceForm({
        'invoice.layout': value('invoice.layout', 'classic'),
        'invoice.copy_label': value('invoice.copy_label', 'ORIGINAL FOR RECIPIENT'),
        'invoice.bank_details': value('invoice.bank_details'),
        'invoice.terms': value('invoice.terms'),
        'invoice.declaration': value('invoice.declaration'),
        'invoice.upi_qr_print': String(value('invoice.upi_qr_print', 'true')) !== 'false' ? 'true' : 'false',
        'pos.upi_qr_screen': String(value('pos.upi_qr_screen', 'true')) !== 'false' ? 'true' : 'false',
        'invoice.upi_qr_source': value('invoice.upi_qr_source', 'generated') === 'uploaded' ? 'uploaded' : 'generated',
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const updateSetting = async (key, value) => {
    setSaving(true);
    setError('');
    try {
      await apiRequest(`/api/settings/${key}`, {
        method: 'PUT',
        body: JSON.stringify({ value }),
      });
      setMessage(`Updated ${key}`);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const saveInvoice = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      for (const [key, value] of Object.entries(invoiceForm)) {
        const current = settings.find((x) => x.key === key)?.value ?? '';
        if (String(current) !== String(value)) {
          await apiRequest(`/api/settings/${key}`, { method: 'PUT', body: JSON.stringify({ value }) });
        }
      }
      setMessage('Invoice printing settings saved');
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };
  const field = (key) => ({
    value: invoiceForm?.[key] ?? '',
    disabled: !canEdit || saving,
    onChange: (e) => setInvoiceForm((f) => ({ ...f, [key]: e.target.value })),
  });

  const allowNegative = settings.find((s) => s.key === 'allow_negative_stock');
  const allowNegativeOn = ['1', 'true', 'yes', 'on'].includes(String(allowNegative?.value || '').toLowerCase());

  return (
    <RequirePermission permission="core.system_settings.view">
      <PageHeader
        title="System Settings"
        description="Global configuration used by POS and inventory"
      />
      <Alert type="error" message={error} />
      <Alert type="success" message={message} />
      {loading ? (
        <LoadingState />
      ) : (
        <div className="max-w-xl rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="font-semibold text-slate-900">Inventory</h3>
          <p className="mt-1 text-sm text-slate-500">
            {allowNegative?.description || 'Control whether stock can go below zero'}
          </p>
          <label className="mt-4 flex items-center justify-between gap-4 rounded-lg bg-slate-50 px-4 py-3 text-sm">
            <span>Allow negative stock</span>
            <input
              type="checkbox"
              className="h-4 w-4"
              checked={allowNegativeOn}
              disabled={saving}
              onChange={(e) => updateSetting('allow_negative_stock', e.target.checked ? 'true' : 'false')}
            />
          </label>
        </div>
      )}

      {!loading && invoiceForm && (
        <form onSubmit={saveInvoice} className="mt-6 max-w-3xl space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <div>
            <h3 className="font-semibold text-slate-900">Invoice printing</h3>
            <p className="mt-1 text-sm text-slate-500">Used on A4 / A5 invoices printed from the ERP and SAC-POS.</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm"><span className="label">Default A4 / A5 layout</span>
              <select className="input-field" {...field('invoice.layout')}>
                <option value="classic">1 · GST classic (boxed tax-invoice grid)</option>
                <option value="modern">2 · Modern</option>
              </select>
            </label>
            <label className="block text-sm"><span className="label">Copy label</span>
              <input className="input-field" placeholder="ORIGINAL FOR RECIPIENT" {...field('invoice.copy_label')} />
            </label>
          </div>
          <label className="block text-sm"><span className="label">Bank details (Our&apos;s Bankers) — used only when no default bank is set</span>
            <input className="input-field" placeholder="ICICI Bank a/c no 151205500585, IFSC ICIC0001512" {...field('invoice.bank_details')} />
          </label>
          <div className="rounded-lg border border-slate-200 p-4">
            <div className="text-sm font-medium text-slate-900">UPI pay QR</div>
            <p className="mt-1 text-xs text-slate-500">
              Uses the UPI ID of the default bank (Banking &amp; Cash → Accounts), or of a terminal&apos;s own bank on SAC-POS. The QR asks for the bill&apos;s balance due.
            </p>
            <label className="mt-3 block text-sm"><span className="label">QR to show</span>
              <select className="input-field max-w-md" {...field('invoice.upi_qr_source')}>
                <option value="generated">Generate from the UPI ID (amount filled in for the customer)</option>
                <option value="uploaded">Use the uploaded QR image (customer types the amount)</option>
              </select>
              <span className="mt-1 block text-xs text-slate-500">Upload the image on the bank in Banking &amp; Cash → Accounts → Edit. Without an uploaded image the generated QR is used.</span>
            </label>
            {[
              ['invoice.upi_qr_print', 'Print the UPI pay QR on bills', 'Under “Our Bankers” on A4 / A5 invoices and at the foot of 58 / 80 mm receipts, from the ERP and SAC-POS.'],
              ['pos.upi_qr_screen', 'Let SAC-POS show a scan-to-pay QR', 'At checkout, when the payment is UPI, the cashier can open a QR with the bill amount for the customer to scan.'],
            ].map(([key, label, hint]) => (
              <label key={key} className="mt-3 flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  className="mt-1"
                  disabled={!canEdit || saving}
                  checked={invoiceForm[key] === 'true'}
                  onChange={(e) => setInvoiceForm((f) => ({ ...f, [key]: e.target.checked ? 'true' : 'false' }))}
                />
                <span><span className="font-medium">{label}</span><span className="block text-xs text-slate-500">{hint}</span></span>
              </label>
            ))}
          </div>
          <label className="block text-sm"><span className="label">Terms &amp; conditions (one per line)</span>
            <textarea
              className="input-field min-h-[110px]"
              placeholder={TERMS_PLACEHOLDER}
              {...field('invoice.terms')}
            />
          </label>
          <label className="block text-sm"><span className="label">Declaration</span>
            <input className="input-field" {...field('invoice.declaration')} />
          </label>
          {canEdit && (
            <div className="flex justify-end">
              <button type="submit" className="btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save invoice settings'}</button>
            </div>
          )}
        </form>
      )}
      {!loading && <LabelSettingsCard canEdit={canEdit} />}
    </RequirePermission>
  );
}
