'use client';

import { useState } from 'react';
import { useAuth } from '../../lib/auth-context';
import { Alert } from '../../components/ui';

export default function LoginPage() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const trackCaps = (e) => setCapsLock(Boolean(e.getModifierState && e.getModifierState('CapsLock')));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email.trim(), password);
    } catch (err) {
      setError(err.message || 'Login failed');
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
          <p className="mt-2 text-sm text-slate-300">CEO Dashboard · Income &amp; Expense</p>
        </div>

        <form onSubmit={handleSubmit} className="card">
          <h2 className="mb-1 text-xl font-semibold">Sign in</h2>
          <p className="mb-6 text-sm text-slate-500">Use your SACONE ERP login. Access needs the CEO Dashboard or Finance permission.</p>

          <Alert type="error" message={error} />

          <div className="space-y-4">
            <div>
              <label className="label" htmlFor="email">Email</label>
              <input id="email" type="email" className="input-field" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="username" />
            </div>
            <div>
              <label className="label" htmlFor="password">Password</label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  className="input-field pr-16"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={trackCaps}
                  onKeyUp={trackCaps}
                  required
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute inset-y-0 right-0 px-3 text-xs font-medium text-slate-500 hover:text-slate-800"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? 'Hide' : 'Show'}
                </button>
              </div>
              {capsLock && (
                <p className="mt-1.5 text-xs font-medium text-amber-700">Caps Lock is on — passwords are case-sensitive.</p>
              )}
            </div>
          </div>

          <button type="submit" className="btn-primary mt-6 w-full" disabled={loading}>
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  );
}
