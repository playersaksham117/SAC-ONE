'use client';

import { useEffect, useState } from 'react';
import { apiRequest } from '../../../../lib/api';
import { RequirePermission } from '../../../../lib/auth-context';
import PageHeader, { Alert, LoadingState } from '../../../../components/ui';

export default function SettingsPage() {
  const [settings, setSettings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      setSettings(await apiRequest('/api/settings'));
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
    </RequirePermission>
  );
}
