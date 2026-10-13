'use client';

import { useState } from 'react';
import { apiRequest } from '../lib/api';
import { Alert, Modal } from './ui';

/** Any signed-in user changes their own password (current password required). */
export default function ChangePasswordDialog({ onClose }) {
  const [form, setForm] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [show, setShow] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [saving, setSaving] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (form.newPassword.length < 8) { setError('New password must be at least 8 characters.'); return; }
    if (form.newPassword !== form.confirm) { setError('The two new passwords do not match.'); return; }
    setSaving(true);
    try {
      await apiRequest('/api/auth/me/password', {
        method: 'PUT',
        body: JSON.stringify({ currentPassword: form.currentPassword, newPassword: form.newPassword }),
      });
      setDone(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const field = (key, label, autoComplete) => (
    <div>
      <label className="label" htmlFor={key}>{label}</label>
      <input
        id={key}
        className="input-field"
        type={show ? 'text' : 'password'}
        autoComplete={autoComplete}
        value={form[key]}
        onChange={(e) => setForm({ ...form, [key]: e.target.value })}
        required
      />
    </div>
  );

  return (
    <Modal
      open
      title="Change password"
      onClose={onClose}
      footer={done
        ? <button type="button" className="btn-primary" onClick={onClose}>Close</button>
        : (
          <>
            <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" form="change-password" className="btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Change password'}</button>
          </>
        )}
    >
      {done ? (
        <Alert type="success" message="Password changed. Use the new password next time you sign in to the ERP or SAC-POS." />
      ) : (
        <form id="change-password" onSubmit={submit} className="space-y-4">
          <Alert message={error} />
          {field('currentPassword', 'Current password', 'current-password')}
          {field('newPassword', 'New password (8 characters or more)', 'new-password')}
          {field('confirm', 'New password again', 'new-password')}
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} /> Show passwords
          </label>
        </form>
      )}
    </Modal>
  );
}
