'use client';

import { useState } from 'react';
import { apiRequest } from '../../lib/api';
import { Alert, Modal } from '../ui';

/** Readable one-time password: no 0/O/1/l/I. */
function generatePassword() {
  const pick = (chars, n) => Array.from(crypto.getRandomValues(new Uint8Array(n)), (b) => chars[b % chars.length]).join('');
  return `${pick('ABCDEFGHJKLMNPQRSTUVWXYZ', 2)}${pick('abcdefghjkmnpqrstuvwxyz', 4)}${pick('23456789', 3)}@`;
}

/**
 * Group owner: create a firm's admin. The admin then manages that firm's own users and roles
 * and can sign in to that firm only.
 */
export default function FirmAdminDialog({ firm, onClose, onCreated }) {
  const [form, setForm] = useState({ fullName: '', email: '', phone: '', password: '' });
  const [show, setShow] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const admin = await apiRequest(`/api/firms/${firm.id}/admins`, { method: 'POST', body: JSON.stringify(form) });
      onCreated?.(admin);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      title={`New admin for ${firm.name}`}
      onClose={onClose}
      footer={(
        <>
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" form="firm-admin" className="btn-primary" disabled={saving}>{saving ? 'Creating…' : 'Create admin'}</button>
        </>
      )}
    >
      <form id="firm-admin" onSubmit={submit} className="space-y-4">
        <Alert message={error} />
        <p className="text-sm text-slate-600">
          The admin gets full access to <b>{firm.name}</b> only: its books, its users and its roles. They cannot see other firms.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="fa-name">Full name *</label>
            <input id="fa-name" className="input-field" value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} required />
          </div>
          <div>
            <label className="label" htmlFor="fa-phone">Phone</label>
            <input id="fa-phone" className="input-field" type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </div>
        </div>
        <div>
          <label className="label" htmlFor="fa-email">Email (login ID) *</label>
          <input id="fa-email" className="input-field" type="email" autoComplete="off" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
        </div>
        <div>
          <label className="label" htmlFor="fa-password">Password * (8 characters or more)</label>
          <div className="flex gap-2">
            <input
              id="fa-password"
              className="input-field"
              type={show ? 'text' : 'password'}
              autoComplete="new-password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              required
              minLength={8}
            />
            <button type="button" className="btn-secondary shrink-0" onClick={() => setShow((v) => !v)}>{show ? 'Hide' : 'Show'}</button>
            <button type="button" className="btn-secondary shrink-0" onClick={() => { setForm({ ...form, password: generatePassword() }); setShow(true); }}>Generate</button>
          </div>
          {form.password && show && <p className="mt-1 text-xs text-slate-500">Copy it now and give it to the admin; it is not shown again after saving.</p>}
        </div>
      </form>
    </Modal>
  );
}
