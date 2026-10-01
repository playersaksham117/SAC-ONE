'use client';

import { useEffect, useState } from 'react';
import { apiRequest } from '../../../../lib/api';
import { useLiveRefresh } from '../../../../lib/live';
import { RequirePermission } from '../../../../lib/auth-context';
import PageHeader, { Alert, LoadingState, Modal, StatusBadge } from '../../../../components/ui';

const ALL_SCOPES = [
  'products.read',
  'inventory.read',
  'customers.read',
  'customers.write',
  'orders.provision',
];

export default function ApiKeysPage() {
  const [keys, setKeys] = useState([]);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [name, setName] = useState('');
  const [scopes, setScopes] = useState([...ALL_SCOPES]);
  const [createdKey, setCreatedKey] = useState(null);
  const [saving, setSaving] = useState(false);

  const load = async (silent = false) => {
    if (silent !== true) setLoading(true);
    setError('');
    try {
      const [k, l] = await Promise.all([
        apiRequest('/api/webstore/admin/api-keys'),
        apiRequest('/api/webstore/admin/api-logs?limit=50'),
      ]);
      setKeys(k);
      setLogs(l);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useLiveRefresh(() => load(true));
  useEffect(() => {
    load();
  }, []);

  const createKey = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const created = await apiRequest('/api/webstore/admin/api-keys', {
        method: 'POST',
        body: JSON.stringify({ name, scopes }),
      });
      setCreatedKey(created.apiKey);
      setModalOpen(false);
      setName('');
      setMessage('API key created. Copy it now — it will not be shown again.');
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const revoke = async (id) => {
    if (!window.confirm('Revoke this API key? Web store calls will fail.')) return;
    try {
      await apiRequest(`/api/webstore/admin/api-keys/${id}/revoke`, { method: 'POST' });
      setMessage('API key revoked');
      await load();
    } catch (err) {
      setError(err.message);
    }
  };

  const toggleScope = (scope) => {
    setScopes((prev) => (prev.includes(scope) ? prev.filter((s) => s !== scope) : [...prev, scope]));
  };

  return (
    <RequirePermission permission="webstore.api_settings.view">
      <PageHeader
        title="Web Store API Keys"
        description="Secure integration keys for connecting an external web store to SACONE. See sacone-api/docs/WEBSTORE_API.md"
        actions={(
          <RequirePermission permission="webstore.api_settings.edit">
            <button type="button" className="btn-primary" onClick={() => setModalOpen(true)}>Create API key</button>
          </RequirePermission>
        )}
      />

      <Alert type="error" message={error} />
      <Alert type="success" message={message} />

      {createdKey && (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm">
          <div className="font-semibold text-amber-900">New API key (copy now)</div>
          <code className="mt-2 block break-all rounded bg-white px-3 py-2 font-mono text-xs">{createdKey}</code>
          <button type="button" className="btn-secondary mt-2 text-xs" onClick={() => navigator.clipboard?.writeText(createdKey)}>
            Copy to clipboard
          </button>
        </div>
      )}

      {loading ? <LoadingState /> : (
        <div className="space-y-6">
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-3 py-2">Name</th>
                  <th className="px-3 py-2">Prefix</th>
                  <th className="px-3 py-2">Scopes</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Last used</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {keys.map((k) => (
                  <tr key={k.id} className="border-t border-slate-100">
                    <td className="px-3 py-2 font-medium">{k.name}</td>
                    <td className="px-3 py-2 font-mono text-xs">{k.keyPrefix}…</td>
                    <td className="px-3 py-2 text-xs text-slate-500">{(k.scopes || []).join(', ')}</td>
                    <td className="px-3 py-2">
                      <StatusBadge active={k.isActive && !k.revokedAt} labelActive="Active" labelInactive="Revoked" />
                    </td>
                    <td className="px-3 py-2 text-xs text-slate-500">
                      {k.lastUsedAt ? new Date(k.lastUsedAt).toLocaleString() : '—'}
                    </td>
                    <td className="px-3 py-2">
                      {k.isActive && !k.revokedAt && (
                        <button type="button" className="text-xs text-red-600" onClick={() => revoke(k.id)}>Revoke</button>
                      )}
                    </td>
                  </tr>
                ))}
                {!keys.length && <tr><td colSpan={6} className="px-3 py-8 text-center text-slate-400">No API keys yet</td></tr>}
              </tbody>
            </table>
          </div>

          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 px-4 py-3 text-sm font-semibold">Recent API logs</div>
            <table className="min-w-full text-xs">
              <thead className="bg-slate-50 text-left uppercase text-slate-500">
                <tr>
                  <th className="px-3 py-2">Time</th>
                  <th className="px-3 py-2">Key</th>
                  <th className="px-3 py-2">Method</th>
                  <th className="px-3 py-2">Path</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">ms</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((l) => (
                  <tr key={l.id} className="border-t border-slate-100">
                    <td className="px-3 py-1.5">{new Date(l.createdAt).toLocaleString()}</td>
                    <td className="px-3 py-1.5 font-mono">{l.keyPrefix || '—'}</td>
                    <td className="px-3 py-1.5">{l.method}</td>
                    <td className="px-3 py-1.5 font-mono">{l.path}</td>
                    <td className="px-3 py-1.5">{l.statusCode}</td>
                    <td className="px-3 py-1.5">{l.durationMs ?? '—'}</td>
                  </tr>
                ))}
                {!logs.length && <tr><td colSpan={6} className="px-3 py-6 text-center text-slate-400">No requests logged yet</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Modal
        open={modalOpen}
        title="Create web store API key"
        onClose={() => setModalOpen(false)}
        footer={(
          <>
            <button type="button" className="btn-secondary" onClick={() => setModalOpen(false)}>Cancel</button>
            <button type="submit" form="key-form" className="btn-primary" disabled={saving || !scopes.length}>Create</button>
          </>
        )}
      >
        <form id="key-form" onSubmit={createKey} className="space-y-3">
          <input className="input-field" required placeholder="Key name" value={name} onChange={(e) => setName(e.target.value)} />
          <div className="space-y-1 text-sm">
            {ALL_SCOPES.map((scope) => (
              <label key={scope} className="flex items-center gap-2">
                <input type="checkbox" checked={scopes.includes(scope)} onChange={() => toggleScope(scope)} />
                <span className="font-mono text-xs">{scope}</span>
              </label>
            ))}
          </div>
        </form>
      </Modal>
    </RequirePermission>
  );
}
