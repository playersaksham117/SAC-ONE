'use client';

import { useEffect, useState } from 'react';
import { apiRequest } from '../lib/api';
import { Alert, Modal } from './ui';

/** My own SAC-POS Login ID and PIN (staff PINs are set by an admin in Users). */
function PosPinForm({ onDone }) {
  const [info, setInfo] = useState(null);
  const [form, setForm] = useState({ currentPassword: '', loginId: '', pin: '', confirm: '' });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    apiRequest('/api/auth/me/pos-pin').then((i) => { setInfo(i); setForm((f) => ({ ...f, loginId: i.loginId || '' })); }).catch((e) => setError(e.message));
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (form.pin && form.pin !== form.confirm) { setError('The two PINs do not match.'); return; }
    setSaving(true);
    try {
      await apiRequest('/api/auth/me/pos-pin', {
        method: 'PUT',
        body: JSON.stringify({ currentPassword: form.currentPassword, loginId: form.loginId.trim().toUpperCase(), pin: form.pin || undefined }),
      });
      onDone();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form id="pos-pin" onSubmit={submit} className="space-y-4">
      <Alert message={error} />
      <p className="text-sm text-slate-600">
        Sign in to SAC-POS phones with your Login ID (or email) and this PIN.
        {info && (info.pinSet ? ` Your PIN was set on ${new Date(info.pinSetAt).toLocaleDateString('en-IN')}.` : ' You have no PIN yet.')}
      </p>
      <div>
        <label className="label" htmlFor="pp-login">Login ID (optional)</label>
        <input id="pp-login" className="input-field font-mono uppercase" maxLength={20} placeholder="e.g. 1001" value={form.loginId} onChange={(e) => setForm({ ...form, loginId: e.target.value })} />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="pp-pin">{info?.pinSet ? 'New PIN' : 'PIN'} (4–6 digits)</label>
          <input id="pp-pin" className="input-field font-mono tracking-widest" type="password" inputMode="numeric" maxLength={6} autoComplete="off" value={form.pin}
            onChange={(e) => setForm({ ...form, pin: e.target.value.replace(/\D/g, '') })} required={!info?.pinSet} />
        </div>
        <div>
          <label className="label" htmlFor="pp-confirm">PIN again</label>
          <input id="pp-confirm" className="input-field font-mono tracking-widest" type="password" inputMode="numeric" maxLength={6} autoComplete="off" value={form.confirm}
            onChange={(e) => setForm({ ...form, confirm: e.target.value.replace(/\D/g, '') })} required={Boolean(form.pin)} />
        </div>
      </div>
      <div>
        <label className="label" htmlFor="pp-current">Your ERP password (to confirm)</label>
        <input id="pp-current" className="input-field" type="password" autoComplete="current-password" required value={form.currentPassword} onChange={(e) => setForm({ ...form, currentPassword: e.target.value })} />
      </div>
      <button type="submit" className="btn-primary w-full" disabled={saving}>{saving ? 'Saving…' : 'Save SAC-POS PIN'}</button>
    </form>
  );
}

/** Any signed-in user changes their own password (current password required) or SAC-POS PIN. */
export default function ChangePasswordDialog({ onClose }) {
  const [tab, setTab] = useState('password');
  const [form, setForm] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [show, setShow] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState('');
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
      setDone('Password changed. Use the new password next time you sign in to the ERP.');
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
      title="Password & SAC-POS PIN"
      onClose={onClose}
      footer={done || tab === 'pin'
        ? <button type="button" className="btn-secondary" onClick={onClose}>Close</button>
        : (
          <>
            <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" form="change-password" className="btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Change password'}</button>
          </>
        )}
    >
      {done ? <Alert type="success" message={done} /> : (
        <>
          <div className="mb-4 flex rounded-lg bg-slate-100 p-0.5 text-sm font-medium">
            {[['password', 'ERP password'], ['pin', 'SAC-POS PIN']].map(([id, label]) => (
              <button key={id} type="button" onClick={() => setTab(id)} className={`flex-1 rounded-md px-3 py-1.5 ${tab === id ? 'bg-white shadow-sm' : 'text-slate-500'}`}>{label}</button>
            ))}
          </div>
          {tab === 'password' ? (
            <form id="change-password" onSubmit={submit} className="space-y-4">
              <Alert message={error} />
              {field('currentPassword', 'Current password', 'current-password')}
              {field('newPassword', 'New password (8 characters or more)', 'new-password')}
              {field('confirm', 'New password again', 'new-password')}
              <label className="flex items-center gap-2 text-sm text-slate-600">
                <input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} /> Show passwords
              </label>
            </form>
          ) : <PosPinForm onDone={() => setDone('SAC-POS PIN saved. Sign in on the phone with your Login ID or email and this PIN.')} />}
        </>
      )}
    </Modal>
  );
}
