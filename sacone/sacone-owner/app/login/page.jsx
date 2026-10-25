'use client';

import { useState } from 'react';
import { useAuth } from '../../lib/auth-context';
import { Alert } from '../../components/ui';

export default function LoginPage() {
  const { login } = useAuth();
  const [key, setKey] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(key.trim());
    } catch (err) {
      setError(err.message || 'Could not open SACONE Owner');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-950 via-slate-900 to-emerald-950 p-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center text-white">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-400 to-teal-600 text-2xl shadow-lg">👑</div>
          <h1 className="text-3xl font-bold tracking-tight">SACONE Owner</h1>
          <p className="mt-2 text-sm text-slate-300">Live CEO Dashboard · Income &amp; Expense</p>
        </div>

        <form onSubmit={handleSubmit} className="card">
          <h2 className="mb-1 text-xl font-semibold">Owner key</h2>
          <p className="mb-6 text-sm text-slate-500">Enter your private owner key. Make or change it on the server PC with <code className="text-xs">npm run owner-key</code>.</p>

          <Alert type="error" message={error} />

          <label className="label" htmlFor="owner-key">Owner key</label>
          <div className="relative">
            <input
              id="owner-key"
              type={show ? 'text' : 'password'}
              className="input-field pr-16 font-mono"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder="SO-XXXX-XXXX-…"
              autoComplete="off"
              spellCheck={false}
              required
            />
            <button type="button" onClick={() => setShow((v) => !v)} className="absolute inset-y-0 right-0 px-3 text-xs font-medium text-slate-500 hover:text-slate-800" aria-label={show ? 'Hide key' : 'Show key'}>
              {show ? 'Hide' : 'Show'}
            </button>
          </div>

          <button type="submit" className="btn-primary mt-6 w-full" disabled={loading || !key.trim()}>
            {loading ? 'Opening…' : 'Open dashboard'}
          </button>
        </form>
      </div>
    </div>
  );
}
