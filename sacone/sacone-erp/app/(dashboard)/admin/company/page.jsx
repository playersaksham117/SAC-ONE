'use client';

import { useEffect, useState } from 'react';
import { apiRequest } from '../../../../lib/api';
import { useAuth, RequirePermission } from '../../../../lib/auth-context';
import PageHeader, { Alert, LoadingState } from '../../../../components/ui';

const EMPTY_FORM = {
  businessName: '',
  legalName: '',
  addressLine1: '',
  addressLine2: '',
  city: '',
  state: '',
  country: 'India',
  postalCode: '',
  gstNumber: '',
  gstStateCode: '',
  panNumber: '',
  phone: '',
  email: '',
  website: '',
};

export default function CompanyPage() {
  const { refreshSession, checkPermission } = useAuth();
  const [form, setForm] = useState(EMPTY_FORM);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const canEdit = checkPermission('core.company.edit');

  useEffect(() => {
    apiRequest('/api/company')
      .then((data) => {
        if (data) setForm({ ...EMPTY_FORM, ...data });
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const handleChange = (e) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    setMessage('');
    try {
      await apiRequest('/api/company', {
        method: 'PUT',
        body: JSON.stringify(form),
      });
      setMessage('Company profile saved successfully.');
      await refreshSession();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <LoadingState />;

  return (
    <RequirePermission permission="core.company.view">
      <PageHeader
        title="Company Setup"
        description="Configure your business profile, GST, and contact information."
      />

      <Alert type="error" message={error} />
      <Alert type="success" message={message} />

      <form onSubmit={handleSubmit} className="card max-w-3xl">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="md:col-span-2">
            <label className="label" htmlFor="businessName">Business Name *</label>
            <input id="businessName" name="businessName" className="input-field" value={form.businessName} onChange={handleChange} required disabled={!canEdit} />
          </div>
          <div className="md:col-span-2">
            <label className="label" htmlFor="legalName">Legal Name</label>
            <input id="legalName" name="legalName" className="input-field" value={form.legalName || ''} onChange={handleChange} disabled={!canEdit} />
          </div>
          <div className="md:col-span-2">
            <label className="label" htmlFor="addressLine1">Address Line 1</label>
            <input id="addressLine1" name="addressLine1" className="input-field" value={form.addressLine1 || ''} onChange={handleChange} disabled={!canEdit} />
          </div>
          <div className="md:col-span-2">
            <label className="label" htmlFor="addressLine2">Address Line 2</label>
            <input id="addressLine2" name="addressLine2" className="input-field" value={form.addressLine2 || ''} onChange={handleChange} disabled={!canEdit} />
          </div>
          <div>
            <label className="label" htmlFor="city">City</label>
            <input id="city" name="city" className="input-field" value={form.city || ''} onChange={handleChange} disabled={!canEdit} />
          </div>
          <div>
            <label className="label" htmlFor="state">State</label>
            <input id="state" name="state" className="input-field" value={form.state || ''} onChange={handleChange} disabled={!canEdit} />
          </div>
          <div>
            <label className="label" htmlFor="country">Country</label>
            <input id="country" name="country" className="input-field" value={form.country || 'India'} onChange={handleChange} disabled={!canEdit} />
          </div>
          <div>
            <label className="label" htmlFor="postalCode">Postal Code</label>
            <input id="postalCode" name="postalCode" className="input-field" value={form.postalCode || ''} onChange={handleChange} disabled={!canEdit} />
          </div>
          <div>
            <label className="label" htmlFor="gstNumber">GST Number</label>
            <input id="gstNumber" name="gstNumber" className="input-field" value={form.gstNumber || ''} onChange={handleChange} disabled={!canEdit} />
          </div>
          <div>
            <label className="label" htmlFor="gstStateCode">GST State Code</label>
            <input id="gstStateCode" name="gstStateCode" className="input-field" value={form.gstStateCode || ''} onChange={handleChange} disabled={!canEdit} />
          </div>
          <div>
            <label className="label" htmlFor="panNumber">PAN Number</label>
            <input id="panNumber" name="panNumber" className="input-field" value={form.panNumber || ''} onChange={handleChange} disabled={!canEdit} />
          </div>
          <div>
            <label className="label" htmlFor="phone">Phone</label>
            <input id="phone" name="phone" className="input-field" value={form.phone || ''} onChange={handleChange} disabled={!canEdit} />
          </div>
          <div>
            <label className="label" htmlFor="email">Email</label>
            <input id="email" name="email" type="email" className="input-field" value={form.email || ''} onChange={handleChange} disabled={!canEdit} />
          </div>
          <div className="md:col-span-2">
            <label className="label" htmlFor="website">Website</label>
            <input id="website" name="website" className="input-field" value={form.website || ''} onChange={handleChange} disabled={!canEdit} />
          </div>
        </div>

        {canEdit && (
          <div className="mt-6">
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? 'Saving...' : 'Save Company Profile'}
            </button>
          </div>
        )}
      </form>
    </RequirePermission>
  );
}
