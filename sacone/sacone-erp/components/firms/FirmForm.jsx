'use client';

import { useEffect, useState } from 'react';
import { apiRequest } from '../../lib/api';
import { GST_STATES } from '../../lib/bill-document';
import { Alert, LoadingState, Modal } from '../ui';

/** Financial year containing today (India), e.g. '2026-27'. */
function thisYear() {
  const ist = new Date(Date.now() + 330 * 60000);
  const start = ist.getUTCMonth() + 1 >= 4 ? ist.getUTCFullYear() : ist.getUTCFullYear() - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, '0')}`;
}
const yearsBack = (n) => Array.from({ length: n }, (_, i) => {
  const s = Number(thisYear().slice(0, 4)) - i;
  return `${s}-${String((s + 1) % 100).padStart(2, '0')}`;
});

const GSTIN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const STATES = Object.entries(GST_STATES).sort((a, b) => a[1].localeCompare(b[1]));

export const EMPTY_FIRM = {
  name: '', legalName: '', firstFinancialYear: thisYear(), firmPrefix: '', authorizedSignatory: '',
  gstNumber: '', gstStateCode: '', state: '', panNumber: '',
  addressLine1: '', addressLine2: '', city: '', postalCode: '', country: 'India',
  phone: '', email: '', website: '',
};

function Section({ title, hint, children }) {
  return (
    <section className="rounded-xl border border-slate-200 p-4">
      <h4 className="text-xs font-bold uppercase tracking-wide text-slate-500">{title}</h4>
      {hint && <p className="mt-0.5 text-xs text-slate-400">{hint}</p>}
      <div className="mt-3 grid gap-4 sm:grid-cols-2">{children}</div>
    </section>
  );
}

function Field({ label, wide, children, note }) {
  return (
    <label className={`block text-sm ${wide ? 'sm:col-span-2' : ''}`}>
      <span className="label">{label}</span>
      {children}
      {note && <span className="mt-1 block text-xs text-slate-500">{note}</span>}
    </label>
  );
}

/**
 * Add or edit a firm with its full company profile: name, GST and tax details, address,
 * contact, invoice prefix and the first financial year of its books.
 *   firmId: null to add a new firm.
 */
export default function FirmForm({ firmId, onClose, onSaved }) {
  const editing = Boolean(firmId);
  const [form, setForm] = useState(editing ? null : EMPTY_FIRM);
  const [original, setOriginal] = useState(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!editing) return;
    apiRequest(`/api/firms/${firmId}`)
      .then((firm) => {
        const loaded = { ...EMPTY_FIRM, ...Object.fromEntries(Object.entries(firm).map(([k, v]) => [k, v ?? ''])) };
        setForm(loaded);
        setOriginal(loaded);
      })
      .catch((e) => setError(e.message));
  }, [editing, firmId]);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  // A complete GSTIN tells us the state and the PAN.
  const setGstin = (e) => {
    const gst = e.target.value.replace(/\s/g, '').toUpperCase();
    setForm((f) => {
      const next = { ...f, gstNumber: gst };
      if (GSTIN.test(gst)) {
        const code = gst.slice(0, 2);
        if (GST_STATES[code]) {
          next.gstStateCode = code;
          next.state = GST_STATES[code];
        }
        if (!f.panNumber) next.panNumber = gst.slice(2, 12);
      }
      return next;
    });
  };
  const setState = (e) => {
    const code = e.target.value;
    setForm((f) => ({ ...f, gstStateCode: code, state: GST_STATES[code] || '' }));
  };

  const gstMismatch = form && GSTIN.test(form.gstNumber) && form.gstStateCode && form.gstStateCode !== form.gstNumber.slice(0, 2);

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const { id, isPrimary, isActive, financialYears, createdAt, ...body } = form;
      const saved = editing
        ? await apiRequest(`/api/firms/${firmId}`, { method: 'PUT', body: JSON.stringify(body) })
        : await apiRequest('/api/firms', { method: 'POST', body: JSON.stringify(body) });
      onSaved(saved, editing);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const changed = editing && form && original && JSON.stringify(form) !== JSON.stringify(original);

  return (
    <Modal
      open
      size="xl"
      title={editing ? `Edit firm${form?.name ? `: ${form.name}` : ''}` : 'Add firm'}
      onClose={onClose}
      footer={form && (
        <>
          <button type="button" className="btn-secondary" onClick={onClose} disabled={saving}>Cancel</button>
          <button type="submit" form="firm-form" className="btn-primary" disabled={saving || !form.name.trim() || (editing && !changed)}>
            {saving ? 'Saving…' : editing ? 'Save changes' : 'Create firm'}
          </button>
        </>
      )}
    >
      <Alert type="error" message={error} />
      {!form ? (!error && <LoadingState />) : (
        <form id="firm-form" onSubmit={save} className="space-y-4">
          {!editing && (
            <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
              The new firm gets its own empty books with a walk-in customer and a main warehouse. Nothing is copied from your other firms.
            </p>
          )}

          <Section title="Firm">
            <Field label="Firm name *" wide>
              <input className="input-field" value={form.name} onChange={set('name')} required maxLength={120} autoFocus={!editing} />
            </Field>
            <Field label="Legal name" note="As registered, if different from the trading name">
              <input className="input-field" value={form.legalName} onChange={set('legalName')} maxLength={160} />
            </Field>
            <Field label="Books start from" note="Earliest financial year offered when signing in">
              <select className="input-field" value={form.firstFinancialYear || thisYear()} onChange={set('firstFinancialYear')}>
                {yearsBack(10).map((y) => <option key={y} value={y}>FY {y}</option>)}
              </select>
            </Field>
            <Field label="Invoice prefix" note="1–8 letters/digits on invoice numbers; blank = made from the name">
              <input className="input-field uppercase" value={form.firmPrefix} onChange={(e) => setForm((f) => ({ ...f, firmPrefix: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '') }))} maxLength={8} />
            </Field>
            <Field label="Authorised signatory" note="Printed under “For <firm name>” on invoices">
              <input className="input-field" value={form.authorizedSignatory} onChange={set('authorizedSignatory')} maxLength={120} />
            </Field>
          </Section>

          <Section title="GST and tax" hint="Typing a full GSTIN fills in the state and PAN.">
            <Field label="GSTIN" note={form.gstNumber && !GSTIN.test(form.gstNumber) ? '15 characters, like 03ABCDE1234F1Z5' : null}>
              <input className="input-field font-mono uppercase" value={form.gstNumber} onChange={setGstin} maxLength={15} placeholder="Unregistered: leave blank" />
            </Field>
            <Field label="PAN">
              <input className="input-field font-mono uppercase" value={form.panNumber} onChange={(e) => setForm((f) => ({ ...f, panNumber: e.target.value.replace(/\s/g, '').toUpperCase() }))} maxLength={10} />
            </Field>
            <Field label="State (place of supply)" note={gstMismatch ? 'This state does not match the GSTIN' : (form.gstStateCode ? `GST state code ${form.gstStateCode}` : null)}>
              <select className={`input-field ${gstMismatch ? 'border-red-400' : ''}`} value={form.gstStateCode} onChange={setState}>
                <option value="">Select state</option>
                {STATES.map(([code, name]) => <option key={code} value={code}>{name} ({code})</option>)}
              </select>
            </Field>
            <Field label="Country">
              <input className="input-field" value={form.country} onChange={set('country')} maxLength={60} />
            </Field>
          </Section>

          <Section title="Address">
            <Field label="Address line 1" wide>
              <input className="input-field" value={form.addressLine1} onChange={set('addressLine1')} maxLength={200} />
            </Field>
            <Field label="Address line 2" wide>
              <input className="input-field" value={form.addressLine2} onChange={set('addressLine2')} maxLength={200} />
            </Field>
            <Field label="City">
              <input className="input-field" value={form.city} onChange={set('city')} maxLength={80} />
            </Field>
            <Field label="PIN code">
              <input className="input-field" inputMode="numeric" value={form.postalCode} onChange={(e) => setForm((f) => ({ ...f, postalCode: e.target.value.replace(/\D/g, '') }))} maxLength={6} />
            </Field>
          </Section>

          <Section title="Contact">
            <Field label="Phone">
              <input className="input-field" type="tel" value={form.phone} onChange={set('phone')} maxLength={20} />
            </Field>
            <Field label="Email">
              <input className="input-field" type="email" value={form.email} onChange={set('email')} maxLength={120} />
            </Field>
            <Field label="Website" wide>
              <input className="input-field" value={form.website} onChange={set('website')} maxLength={200} placeholder="https://" />
            </Field>
          </Section>
        </form>
      )}
    </Modal>
  );
}
