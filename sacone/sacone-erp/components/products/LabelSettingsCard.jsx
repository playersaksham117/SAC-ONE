'use client';

import { useEffect, useState } from 'react';
import { apiRequest } from '../../lib/api';
import { LABEL_FIELDS, LABEL_SIZES, labelSettingsFrom } from '../../lib/labels';
import { Alert } from '../ui';

/** Settings → Barcode labels: default size and which details print on product labels. */
export default function LabelSettingsCard({ canEdit }) {
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    apiRequest('/api/settings').then((list) => setForm(labelSettingsFrom(Array.isArray(list) ? list : []))).catch((e) => setError(e.message));
  }, []);

  const toggle = (key) => setForm((f) => ({ ...f, fields: f.fields.includes(key) ? f.fields.filter((x) => x !== key) : [...f.fields, key] }));

  const save = async (e) => {
    e.preventDefault();
    if (!form.fields.length) { setError('Choose at least one detail to print.'); return; }
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const ordered = LABEL_FIELDS.map(([k]) => k).filter((k) => form.fields.includes(k));
      for (const [key, value] of [['label.size', form.size], ['label.fields', ordered.join(',')], ['label.footer', form.footer.trim()]]) {
        await apiRequest(`/api/settings/${key}`, { method: 'PUT', body: JSON.stringify({ value }) });
      }
      setMessage('Label settings saved.');
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  if (!form) return error ? <Alert message={error} /> : null;
  return (
    <form onSubmit={save} className="mt-6 max-w-3xl space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <div>
        <h3 className="font-semibold text-slate-900">Barcode labels</h3>
        <p className="mt-1 text-sm text-slate-500">Defaults for Products &amp; Services → select products → Print labels. They can still be changed for a single print.</p>
      </div>
      <Alert message={error} />
      <Alert type="success" message={message} />
      <label className="block text-sm"><span className="label">Default label size</span>
        <select className="input-field max-w-md" disabled={!canEdit || saving} value={form.size} onChange={(e) => setForm({ ...form, size: e.target.value })}>
          {LABEL_SIZES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
      </label>
      <div>
        <span className="label">Print on each label</span>
        <div className="grid gap-x-4 gap-y-1 sm:grid-cols-3">
          {LABEL_FIELDS.map(([key, label]) => (
            <label key={key} className="flex items-center gap-2 text-sm">
              <input type="checkbox" disabled={!canEdit || saving} checked={form.fields.includes(key)} onChange={() => toggle(key)} />
              {label}
            </label>
          ))}
        </div>
      </div>
      <label className="block text-sm"><span className="label">Footer text (when &ldquo;Footer text&rdquo; is ticked)</span>
        <input className="input-field" maxLength={60} disabled={!canEdit || saving} placeholder="e.g. Use before 6 months · www.yourshop.in" value={form.footer} onChange={(e) => setForm({ ...form, footer: e.target.value })} />
      </label>
      {canEdit && (
        <div className="flex justify-end">
          <button type="submit" className="btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save label settings'}</button>
        </div>
      )}
    </form>
  );
}
