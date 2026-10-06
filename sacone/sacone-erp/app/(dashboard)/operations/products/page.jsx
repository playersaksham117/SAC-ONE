'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiDownload, apiRequest } from '../../../../lib/api';
import { useLiveRefresh } from '../../../../lib/live';
import { useAuth, RequirePermission } from '../../../../lib/auth-context';
import PageHeader, { Alert, LoadingState, Modal, StatusBadge } from '../../../../components/ui';
import MinPricePanel from '../../../../components/products/MinPricePanel';

const EMPTY_PRODUCT = {
  name: '',
  sku: '',
  barcode: '',
  categoryId: '',
  brandId: '',
  unitId: '',
  modelVariant: '',
  hsnCode: '',
  gstPercentage: 18,
  mrp: 0,
  sellingPrice: 0,
  purchasePrice: 0,
  reorderLevel: 0,
  minimumStock: 0,
  imageUrl: '',
  description: '',
  isActive: true,
  webStorePublished: false,
};

const EMPTY_LOOKUP = { name: '', code: '', abbreviation: '', description: '' };

function LookupManager({ title, endpoint, permissionPrefix, hasAbbreviation = false }) {
  const { checkPermission } = useAuth();
  const [items, setItems] = useState([]);
  const [error, setError] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_LOOKUP);
  const [saving, setSaving] = useState(false);

  const canCreate = checkPermission(`${permissionPrefix}.create`);
  const canEdit = checkPermission(`${permissionPrefix}.edit`);
  const canDelete = checkPermission(`${permissionPrefix}.delete`);

  const load = async () => {
    try {
      setItems(await apiRequest(endpoint));
    } catch (err) {
      setError(err.message);
    }
  };

  useEffect(() => {
    load();
  }, [endpoint]);

  useLiveRefresh(load, { tables: ['categories', 'brands', 'units'] });

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_LOOKUP);
    setModalOpen(true);
  };

  const openEdit = (item) => {
    setEditing(item);
    setForm({
      name: item.name || '',
      code: item.code || '',
      abbreviation: item.abbreviation || '',
      description: item.description || '',
    });
    setModalOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      if (editing) {
        await apiRequest(`${endpoint}/${editing.id}`, {
          method: 'PUT',
          body: JSON.stringify(form),
        });
      } else {
        await apiRequest(endpoint, {
          method: 'POST',
          body: JSON.stringify(form),
        });
      }
      setModalOpen(false);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (item) => {
    if (!window.confirm(`Delete "${item.name}"?`)) return;
    setError('');
    try {
      await apiRequest(`${endpoint}/${item.id}`, { method: 'DELETE' });
      await load();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h3 className="font-semibold text-slate-900">{title}</h3>
        {canCreate && (
          <button type="button" className="btn-primary" onClick={openCreate}>+ Add</button>
        )}
      </div>
      <Alert type="error" message={error} />
      <div className="card overflow-hidden p-0">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-4 py-3 text-left font-medium text-slate-600">Name</th>
              {hasAbbreviation ? (
                <th className="px-4 py-3 text-left font-medium text-slate-600">Abbreviation</th>
              ) : (
                <th className="px-4 py-3 text-left font-medium text-slate-600">Code</th>
              )}
              <th className="px-4 py-3 text-left font-medium text-slate-600">Status</th>
              {(canEdit || canDelete) && (
                <th className="px-4 py-3 text-right font-medium text-slate-600">Actions</th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {items.map((item) => (
              <tr key={item.id}>
                <td className="px-4 py-3 font-medium">{item.name}</td>
                <td className="px-4 py-3 text-slate-600">
                  {hasAbbreviation ? item.abbreviation : (item.code || '—')}
                </td>
                <td className="px-4 py-3"><StatusBadge active={item.isActive} /></td>
                {(canEdit || canDelete) && (
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-2">
                      {canEdit && (
                        <button type="button" className="btn-secondary" onClick={() => openEdit(item)}>Edit</button>
                      )}
                      {canDelete && (
                        <button type="button" className="btn-danger" onClick={() => handleDelete(item)}>Delete</button>
                      )}
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal
        open={modalOpen}
        title={editing ? `Edit ${title.slice(0, -1)}` : `Add ${title.slice(0, -1)}`}
        onClose={() => setModalOpen(false)}
        footer={(
          <>
            <button type="button" className="btn-secondary" onClick={() => setModalOpen(false)}>Cancel</button>
            <button type="submit" form={`lookup-${endpoint}`} className="btn-primary" disabled={saving}>
              {saving ? 'Saving...' : 'Save'}
            </button>
          </>
        )}
      >
        <form id={`lookup-${endpoint}`} onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="label">Name *</label>
            <input className="input-field" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          </div>
          {hasAbbreviation ? (
            <div>
              <label className="label">Abbreviation *</label>
              <input className="input-field" value={form.abbreviation} onChange={(e) => setForm({ ...form, abbreviation: e.target.value })} required />
            </div>
          ) : (
            <div>
              <label className="label">Code</label>
              <input
                className="input-field font-mono uppercase"
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
                placeholder={endpoint.includes('brands') ? 'Auto-generated for SKU (e.g. HAL)' : ''}
              />
            </div>
          )}
          <div>
            <label className="label">Description</label>
            <textarea className="input-field min-h-[80px]" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>
        </form>
      </Modal>
    </div>
  );
}

export default function ProductsPage() {
  const { checkPermission } = useAuth();
  const [tab, setTab] = useState('products');
  const [products, setProducts] = useState([]);
  const [total, setTotal] = useState(0);
  const [categories, setCategories] = useState([]);
  const [brands, setBrands] = useState([]);
  const [units, setUnits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [search, setSearch] = useState('');
  const [barcode, setBarcode] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_PRODUCT);
  const [skuLocked, setSkuLocked] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [generatingSku, setGeneratingSku] = useState(false);
  const [generatingBarcode, setGeneratingBarcode] = useState(false);
  const [duplicateProducts, setDuplicateProducts] = useState([]);
  const [duplicateModalOpen, setDuplicateModalOpen] = useState(false);
  const [pendingPayload, setPendingPayload] = useState(null);
  const [saving, setSaving] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [csvText, setCsvText] = useState('');
  const [selectedIds, setSelectedIds] = useState([]);
  const [viewOpen, setViewOpen] = useState(false);
  const [bulkEditOpen, setBulkEditOpen] = useState(false);
  const [bulkForm, setBulkForm] = useState({
    categoryId: '',
    brandId: '',
    unitId: '',
    gstPercentage: '',
    reorderLevel: '',
    minimumStock: '',
    isActive: '',
    webStorePublished: '',
  });

  const canCreate = checkPermission('products.products.create');
  const canEdit = checkPermission('products.products.edit');
  const canDelete = checkPermission('products.products.delete');
  const canView = checkPermission('products.products.view');

  const selectedProducts = useMemo(
    () => products.filter((p) => selectedIds.includes(p.id)),
    [products, selectedIds]
  );
  const allVisibleSelected = products.length > 0 && products.every((p) => selectedIds.includes(p.id));
  const someSelected = selectedIds.length > 0;

  const tabs = useMemo(() => ([
    { id: 'products', label: 'Products', show: checkPermission('products.products.view') },
    { id: 'categories', label: 'Categories', show: checkPermission('products.categories.view') },
    { id: 'brands', label: 'Brands', show: checkPermission('products.brands.view') },
    { id: 'units', label: 'Units', show: checkPermission('products.units.view') },
    { id: 'min-prices', label: 'Min Selling Price', show: checkPermission('products.products.view') },
  ].filter((t) => t.show)), [checkPermission]);

  const loadLookups = async () => {
    const [cats, brs, uns] = await Promise.all([
      apiRequest('/api/categories'),
      apiRequest('/api/brands'),
      apiRequest('/api/units'),
    ]);
    setCategories(cats.filter((c) => c.isActive));
    setBrands(brs.filter((b) => b.isActive));
    setUnits(uns.filter((u) => u.isActive));
  };

  const loadProducts = async (silent = false) => {
    if (silent !== true) setLoading(true);
    setError('');
    try {
      const query = new URLSearchParams();
      if (search) query.set('search', search);
      if (barcode) query.set('barcode', barcode);
      if (statusFilter !== '') query.set('isActive', statusFilter);
      query.set('limit', '200');
      const data = await apiRequest(`/api/products?${query.toString()}`);
      setProducts(data.items);
      setTotal(data.total);
      // A live refresh keeps the user's selection (minus products that are gone).
      if (silent === true) setSelectedIds((ids) => ids.filter((id) => data.items.some((p) => p.id === id)));
      else setSelectedIds([]);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLookups().catch((err) => setError(err.message));
  }, []);

  useEffect(() => {
    if (tab === 'products') loadProducts();
  }, [tab]);

  useLiveRefresh(() => {
    loadLookups().catch(() => {});
    if (tab === 'products') loadProducts(true);
  }, { tables: ['products', 'categories', 'brands', 'units', 'product_family_codes'] });

  const generateSkuPreview = useCallback(async (overrides = {}) => {
    const name = overrides.name ?? form.name;
    const brandId = overrides.brandId ?? form.brandId;
    const categoryId = overrides.categoryId ?? form.categoryId;
    const modelVariant = overrides.modelVariant ?? form.modelVariant;
    if (!name?.trim()) return;
    setGeneratingSku(true);
    setError('');
    try {
      const result = await apiRequest('/api/products/generate-sku', {
        method: 'POST',
        body: JSON.stringify({
          name: name.trim(),
          brandId: brandId || null,
          categoryId: categoryId || null,
          modelVariant: modelVariant?.trim() || null,
          excludeProductId: editing?.id || null,
        }),
      });
      setForm((prev) => ({ ...prev, sku: result.sku }));
    } catch (err) {
      setError(err.message);
    } finally {
      setGeneratingSku(false);
    }
  }, [form.name, form.brandId, form.categoryId, form.modelVariant, editing?.id]);

  const generateBarcodePreview = useCallback(async () => {
    setGeneratingBarcode(true);
    setError('');
    try {
      const result = await apiRequest('/api/products/generate-barcode', { method: 'POST' });
      setForm((prev) => ({ ...prev, barcode: result.barcode }));
    } catch (err) {
      setError(err.message);
    } finally {
      setGeneratingBarcode(false);
    }
  }, []);

  const openCreate = async () => {
    setEditing(null);
    setSkuLocked(false);
    setShowAdvanced(false);
    setDuplicateProducts([]);
    setForm({ ...EMPTY_PRODUCT });
    setModalOpen(true);
    try {
      const result = await apiRequest('/api/products/generate-barcode', { method: 'POST' });
      setForm((prev) => ({ ...prev, barcode: result.barcode }));
    } catch {
      // barcode optional until generate clicked
    }
  };

  const openEdit = async (product) => {
    setShowAdvanced(true);
    setDuplicateProducts([]);
    try {
      const full = await apiRequest(`/api/products/${product.id}`);
      setEditing(full);
      setSkuLocked(Boolean(full.skuLocked));
      setForm({
        name: full.name || '',
        sku: full.sku || '',
        barcode: full.barcode || '',
        categoryId: full.categoryId || '',
        brandId: full.brandId || '',
        unitId: full.unitId || '',
        modelVariant: full.modelVariant || '',
        hsnCode: full.hsnCode || '',
        gstPercentage: full.gstPercentage || 0,
        mrp: full.mrp || 0,
        sellingPrice: full.sellingPrice || 0,
        purchasePrice: full.purchasePrice || 0,
        reorderLevel: full.reorderLevel || 0,
        minimumStock: full.minimumStock || 0,
        imageUrl: full.imageUrl || '',
        description: full.description || '',
        isActive: full.isActive,
        webStorePublished: full.webStorePublished,
      });
      setModalOpen(true);
    } catch (err) {
      setError(err.message);
    }
  };

  useEffect(() => {
    if (editing || !modalOpen || !form.name?.trim() || !form.brandId) return;
    const timer = setTimeout(() => {
      generateSkuPreview();
    }, 400);
    return () => clearTimeout(timer);
  }, [editing, modalOpen, form.name, form.brandId, form.categoryId, form.modelVariant, generateSkuPreview]);

  const saveProduct = async (payload) => {
    if (editing) {
      await apiRequest(`/api/products/${editing.id}`, {
        method: 'PUT',
        body: JSON.stringify(payload),
      });
      setMessage('Product updated.');
    } else {
      await apiRequest('/api/products', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      setMessage('Product created.');
    }
    setModalOpen(false);
    setDuplicateModalOpen(false);
    setPendingPayload(null);
    await loadProducts();
    await loadLookups();
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const payload = {
        ...form,
        categoryId: form.categoryId || null,
        brandId: form.brandId || null,
        unitId: form.unitId || null,
      };

      if (!editing && payload.brandId && payload.name) {
        const dup = await apiRequest('/api/products/check-duplicate', {
          method: 'POST',
          body: JSON.stringify({ name: payload.name, brandId: payload.brandId }),
        });
        if (dup.possibleDuplicate && dup.duplicates?.length) {
          setDuplicateProducts(dup.duplicates);
          setPendingPayload(payload);
          setDuplicateModalOpen(true);
          return;
        }
      }

      await saveProduct(payload);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const confirmDuplicateSave = async () => {
    if (!pendingPayload) return;
    setSaving(true);
    setError('');
    try {
      await saveProduct(pendingPayload);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (product) => {
    setError('');
    try {
      const path = product.isActive
        ? `/api/products/${product.id}/deactivate`
        : `/api/products/${product.id}/activate`;
      await apiRequest(path, { method: 'POST' });
      await loadProducts();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleDelete = async (product) => {
    if (!window.confirm(`Delete product "${product.name}"?`)) return;
    setError('');
    setMessage('');
    try {
      const result = await apiRequest(`/api/products/${product.id}`, { method: 'DELETE' });
      setMessage(result.message || 'Product deleted.');
      setSelectedIds((ids) => ids.filter((id) => id !== product.id));
      await loadProducts();
    } catch (err) {
      setError(err.message);
    }
  };

  const toggleSelect = (id) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const toggleSelectAll = () => {
    if (allVisibleSelected) {
      setSelectedIds([]);
    } else {
      setSelectedIds(products.map((p) => p.id));
    }
  };

  const clearSelection = () => setSelectedIds([]);

  const openViewSelected = () => {
    if (!selectedProducts.length) return;
    setViewOpen(true);
  };

  const openEditSelected = () => {
    if (!selectedProducts.length) return;
    if (selectedProducts.length === 1) {
      openEdit(selectedProducts[0]);
      return;
    }
    setBulkForm({
      categoryId: '',
      brandId: '',
      unitId: '',
      gstPercentage: '',
      reorderLevel: '',
      minimumStock: '',
      isActive: '',
      webStorePublished: '',
    });
    setBulkEditOpen(true);
  };

  const handleBulkDelete = async () => {
    if (!selectedIds.length) return;
    if (!window.confirm(`Delete ${selectedIds.length} selected product(s)? Linked items will be deactivated instead.`)) return;
    setError('');
    setMessage('');
    setSaving(true);
    try {
      const result = await apiRequest('/api/products/bulk-delete', {
        method: 'POST',
        body: JSON.stringify({ ids: selectedIds }),
      });
      const parts = [];
      if (result.deleted) parts.push(`${result.deleted} deleted`);
      if (result.softDeleted) parts.push(`${result.softDeleted} deactivated (in use)`);
      if (result.failed) parts.push(`${result.failed} failed`);
      setMessage(parts.join(', ') || 'Bulk delete finished.');
      clearSelection();
      await loadProducts();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleBulkEdit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const patch = {};
      if (bulkForm.categoryId !== '') patch.categoryId = bulkForm.categoryId || null;
      if (bulkForm.brandId !== '') patch.brandId = bulkForm.brandId || null;
      if (bulkForm.unitId !== '') patch.unitId = bulkForm.unitId || null;
      if (bulkForm.gstPercentage !== '') patch.gstPercentage = Number(bulkForm.gstPercentage);
      if (bulkForm.reorderLevel !== '') patch.reorderLevel = Number(bulkForm.reorderLevel);
      if (bulkForm.minimumStock !== '') patch.minimumStock = Number(bulkForm.minimumStock);
      if (bulkForm.isActive !== '') patch.isActive = bulkForm.isActive === '1';
      if (bulkForm.webStorePublished !== '') patch.webStorePublished = bulkForm.webStorePublished === '1';

      if (!Object.keys(patch).length) {
        throw new Error('Choose at least one field to update');
      }

      const result = await apiRequest('/api/products/bulk-update', {
        method: 'POST',
        body: JSON.stringify({ ids: selectedIds, patch }),
      });
      setMessage(`Updated ${result.updated} product(s)${result.failed ? `, ${result.failed} failed` : ''}.`);
      setBulkEditOpen(false);
      clearSelection();
      await loadProducts();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleExport = async () => {
    setError('');
    try {
      await apiDownload('/api/products/export', 'products.csv');
    } catch (err) {
      setError(err.message);
    }
  };

  const handleImport = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const result = await apiRequest('/api/products/import', {
        method: 'POST',
        body: JSON.stringify({ csv: csvText }),
      });
      setMessage(`Import complete: ${result.created} created, ${result.updated} updated${result.errors?.length ? `, ${result.errors.length} errors` : ''}.`);
      setImportOpen(false);
      setCsvText('');
      await loadProducts();
      await loadLookups();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const searchByBarcode = async () => {
    if (!barcode.trim()) {
      await loadProducts();
      return;
    }
    setLoading(true);
    setError('');
    try {
      const product = await apiRequest(`/api/products/barcode/${encodeURIComponent(barcode.trim())}`);
      setProducts([product]);
      setTotal(1);
    } catch (err) {
      setProducts([]);
      setTotal(0);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <RequirePermission permission="products.products.view">
      <PageHeader
        title="Product Master"
        description="Central product catalog used by POS, Inventory, Warehouse, Dashboard, and Web Store."
        actions={(
          <>
            {canCreate && tab === 'products' && (
              <button type="button" className="btn-primary" onClick={openCreate}>+ Add Product</button>
            )}
            {tab === 'products' && (
              <>
                <button type="button" className="btn-secondary" onClick={handleExport}>Export CSV</button>
                {canCreate && (
                  <button type="button" className="btn-secondary" onClick={() => setImportOpen(true)}>Import CSV</button>
                )}
              </>
            )}
          </>
        )}
      />

      <div className="mb-6 flex flex-wrap gap-2">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => {
              setTab(t.id);
              setSelectedIds([]);
              setViewOpen(false);
              setBulkEditOpen(false);
            }}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
              tab === t.id ? 'bg-brand-600 text-white' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <Alert type="error" message={error} />
      <Alert type="success" message={message} />

      {tab === 'min-prices' && (
        <MinPricePanel canEdit={canEdit} onError={setError} onMessage={setMessage} />
      )}

      {tab === 'products' && (
        <>
          <div className="mb-4 grid gap-3 md:grid-cols-4">
            <input
              className="input-field md:col-span-2"
              placeholder="Search by name, SKU, or barcode..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && loadProducts()}
            />
            <div className="flex gap-2">
              <input
                className="input-field"
                placeholder="Exact barcode"
                value={barcode}
                onChange={(e) => setBarcode(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && searchByBarcode()}
              />
              <button type="button" className="btn-secondary shrink-0" onClick={searchByBarcode}>Scan</button>
            </div>
            <div className="flex gap-2">
              <select className="input-field" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                <option value="">All statuses</option>
                <option value="1">Active</option>
                <option value="0">Inactive</option>
              </select>
              <button type="button" className="btn-primary shrink-0" onClick={loadProducts}>Search</button>
            </div>
          </div>

          {loading ? (
            <LoadingState />
          ) : (
            <div className="card overflow-hidden p-0">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-2">
                <div className="text-sm text-slate-500">{total} products</div>
                {someSelected && (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-brand-50 px-2.5 py-1 text-xs font-semibold text-brand-700">
                      {selectedIds.length} selected
                    </span>
                    {canView && (
                      <button type="button" className="btn-secondary" onClick={openViewSelected}>View</button>
                    )}
                    {canEdit && (
                      <button type="button" className="btn-secondary" onClick={openEditSelected}>
                        {selectedIds.length === 1 ? 'Edit' : 'Bulk Edit'}
                      </button>
                    )}
                    {canDelete && (
                      <button type="button" className="btn-danger" onClick={handleBulkDelete} disabled={saving}>
                        Delete
                      </button>
                    )}
                    <button type="button" className="btn-secondary" onClick={clearSelection}>Clear</button>
                  </div>
                )}
              </div>
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="w-10 px-4 py-3">
                      <input
                        type="checkbox"
                        checked={allVisibleSelected}
                        onChange={toggleSelectAll}
                        aria-label="Select all products"
                      />
                    </th>
                    <th className="px-4 py-3 text-left font-medium text-slate-600">SKU</th>
                    <th className="px-4 py-3 text-left font-medium text-slate-600">Name</th>
                    <th className="px-4 py-3 text-left font-medium text-slate-600">Category</th>
                    <th className="px-4 py-3 text-left font-medium text-slate-600">Brand</th>
                    <th className="px-4 py-3 text-right font-medium text-slate-600">MRP</th>
                    <th className="px-4 py-3 text-right font-medium text-slate-600">Sell</th>
                    <th className="px-4 py-3 text-left font-medium text-slate-600">GST%</th>
                    <th className="px-4 py-3 text-left font-medium text-slate-600">Status</th>
                    <th className="px-4 py-3 text-left font-medium text-slate-600">Web</th>
                    {(canEdit || canDelete) && (
                      <th className="px-4 py-3 text-right font-medium text-slate-600">Actions</th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {products.map((product) => {
                    const isSelected = selectedIds.includes(product.id);
                    return (
                      <tr
                        key={product.id}
                        className={`hover:bg-slate-50 ${isSelected ? 'bg-brand-50/40' : ''}`}
                      >
                        <td className="px-4 py-3">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSelect(product.id)}
                            aria-label={`Select ${product.name}`}
                          />
                        </td>
                        <td className="px-4 py-3 font-mono text-xs">{product.sku}</td>
                        <td className="px-4 py-3">
                          <button
                            type="button"
                            className="text-left"
                            onClick={() => {
                              setSelectedIds([product.id]);
                              setViewOpen(true);
                            }}
                          >
                            <div className="font-medium text-slate-900 hover:text-brand-700">{product.name}</div>
                            <div className="text-xs text-slate-400">
                              {product.modelVariant ? `${product.modelVariant} · ` : ''}
                              {product.barcode || 'No barcode'}
                            </div>
                          </button>
                        </td>
                        <td className="px-4 py-3 text-slate-600">{product.categoryName || '—'}</td>
                        <td className="px-4 py-3 text-slate-600">{product.brandName || '—'}</td>
                        <td className="px-4 py-3 text-right">{product.mrp.toFixed(2)}</td>
                        <td className="px-4 py-3 text-right">{product.sellingPrice.toFixed(2)}</td>
                        <td className="px-4 py-3">{product.gstPercentage}%</td>
                        <td className="px-4 py-3"><StatusBadge active={product.isActive} /></td>
                        <td className="px-4 py-3">
                          <StatusBadge active={product.webStorePublished} labelActive="Published" labelInactive="Draft" />
                        </td>
                        {(canEdit || canDelete) && (
                          <td className="px-4 py-3 text-right">
                            <div className="flex justify-end gap-2">
                              <button
                                type="button"
                                className="btn-secondary"
                                onClick={() => {
                                  setSelectedIds([product.id]);
                                  setViewOpen(true);
                                }}
                              >
                                View
                              </button>
                              {canEdit && (
                                <button type="button" className="btn-secondary" onClick={() => openEdit(product)}>Edit</button>
                              )}
                              {canEdit && (
                                <button
                                  type="button"
                                  className={product.isActive ? 'btn-danger' : 'btn-secondary'}
                                  onClick={() => toggleActive(product)}
                                >
                                  {product.isActive ? 'Deactivate' : 'Activate'}
                                </button>
                              )}
                              {canDelete && (
                                <button type="button" className="btn-danger" onClick={() => handleDelete(product)}>Delete</button>
                              )}
                            </div>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                  {!products.length && (
                    <tr>
                      <td colSpan={11} className="px-4 py-8 text-center text-slate-500">No products found</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {tab === 'categories' && (
        <LookupManager title="Categories" endpoint="/api/categories" permissionPrefix="products.categories" />
      )}
      {tab === 'brands' && (
        <LookupManager title="Brands" endpoint="/api/brands" permissionPrefix="products.brands" />
      )}
      {tab === 'units' && (
        <LookupManager title="Units" endpoint="/api/units" permissionPrefix="products.units" hasAbbreviation />
      )}

      <Modal
        open={modalOpen}
        title={editing ? 'Edit Product' : 'Create Product'}
        onClose={() => setModalOpen(false)}
        size="lg"
        footer={(
          <>
            <button type="button" className="btn-secondary" onClick={() => setModalOpen(false)}>Cancel</button>
            <button type="submit" form="product-form" className="btn-primary" disabled={saving}>
              {saving ? 'Saving...' : 'Save Product'}
            </button>
          </>
        )}
      >
        <form id="product-form" onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="md:col-span-2">
              <label className="label">Product Name *</label>
              <input
                className="input-field"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="LED BULB 9W B22 HALONIX WHITE ASTRON SERIES"
                required
              />
              <p className="mt-1 text-xs text-slate-500">Enter the complete product description in one field.</p>
            </div>
            <div className="md:col-span-2">
              <label className="label">SKU *</label>
              <div className="flex gap-2">
                <input
                  className="input-field font-mono uppercase"
                  value={form.sku}
                  onChange={(e) => setForm({ ...form, sku: e.target.value.toUpperCase() })}
                  readOnly={skuLocked}
                  required
                />
                {!skuLocked && (
                  <button
                    type="button"
                    className="btn-secondary shrink-0"
                    onClick={() => generateSkuPreview()}
                    disabled={generatingSku || !form.name?.trim()}
                  >
                    {generatingSku ? '…' : 'Generate'}
                  </button>
                )}
              </div>
              {skuLocked && (
                <p className="mt-1 text-xs text-amber-700">SKU is locked — product is used in sales, stock, or transactions.</p>
              )}
            </div>
            <div className="md:col-span-2">
              <label className="label">Barcode</label>
              <div className="flex gap-2">
                <input
                  className="input-field font-mono"
                  value={form.barcode}
                  onChange={(e) => setForm({ ...form, barcode: e.target.value.replace(/\D/g, '').slice(0, 14) })}
                  placeholder="00000001"
                  maxLength={14}
                />
                <button
                  type="button"
                  className="btn-secondary shrink-0"
                  onClick={generateBarcodePreview}
                  disabled={generatingBarcode}
                >
                  {generatingBarcode ? '…' : 'Generate'}
                </button>
              </div>
            </div>
            <div>
              <label className="label">Category</label>
              <select className="input-field" value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value })}>
                <option value="">Select category</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Brand</label>
              <select className="input-field" value={form.brandId} onChange={(e) => setForm({ ...form, brandId: e.target.value })}>
                <option value="">Select brand</option>
                {brands.map((b) => (
                  <option key={b.id} value={b.id}>{b.name}{b.code ? ` (${b.code})` : ''}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Variant / Model</label>
              <input
                className="input-field"
                value={form.modelVariant}
                onChange={(e) => setForm({ ...form, modelVariant: e.target.value })}
                placeholder="e.g. ASTRON, C Curve, R32"
              />
              <p className="mt-1 text-xs text-slate-400">Included in smart SKU (e.g. …-AST, …-C, …-R32)</p>
            </div>
            <div>
              <label className="label">Unit</label>
              <select className="input-field" value={form.unitId} onChange={(e) => setForm({ ...form, unitId: e.target.value })}>
                <option value="">Select unit</option>
                {units.map((u) => <option key={u.id} value={u.id}>{u.name} ({u.abbreviation})</option>)}
              </select>
            </div>
            <div>
              <label className="label">HSN Code</label>
              <input className="input-field" value={form.hsnCode} onChange={(e) => setForm({ ...form, hsnCode: e.target.value })} />
            </div>
            <div>
              <label className="label">GST %</label>
              <input type="number" step="0.01" className="input-field" value={form.gstPercentage} onChange={(e) => setForm({ ...form, gstPercentage: e.target.value })} />
            </div>

            <div className="md:col-span-2 border-t border-slate-100 pt-2">
              <button
                type="button"
                className="text-sm font-medium text-slate-600 hover:text-slate-900"
                onClick={() => setShowAdvanced((v) => !v)}
              >
                {showAdvanced ? 'Hide' : 'Show'} pricing &amp; stock options
              </button>
            </div>
            {showAdvanced && (
              <>
                <div className="grid gap-4 sm:grid-cols-3 md:col-span-2">
                  <div>
                    <label className="label">MRP</label>
                    <input type="number" step="0.01" className="input-field" value={form.mrp} onChange={(e) => setForm({ ...form, mrp: e.target.value })} />
                  </div>
                  <div>
                    <label className="label">Selling Price</label>
                    <input type="number" step="0.01" className="input-field" value={form.sellingPrice} onChange={(e) => setForm({ ...form, sellingPrice: e.target.value })} />
                  </div>
                  <div>
                    <label className="label">Purchase Price</label>
                    <input type="number" step="0.01" className="input-field" value={form.purchasePrice} onChange={(e) => setForm({ ...form, purchasePrice: e.target.value })} />
                  </div>
                </div>
                <div>
                  <label className="label">Reorder Level</label>
                  <input type="number" step="0.01" className="input-field" value={form.reorderLevel} onChange={(e) => setForm({ ...form, reorderLevel: e.target.value })} />
                </div>
                <div>
                  <label className="label">Minimum Stock</label>
                  <input type="number" step="0.01" className="input-field" value={form.minimumStock} onChange={(e) => setForm({ ...form, minimumStock: e.target.value })} />
                </div>
                <div className="md:col-span-2">
                  <label className="label">Product Image URL</label>
                  <input className="input-field" value={form.imageUrl} onChange={(e) => setForm({ ...form, imageUrl: e.target.value })} placeholder="https://..." />
                </div>
                <div className="md:col-span-2">
                  <label className="label">Description</label>
                  <textarea className="input-field min-h-[80px]" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
                </div>
                <label className="inline-flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} />
                  Active
                </label>
                <label className="inline-flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={form.webStorePublished} onChange={(e) => setForm({ ...form, webStorePublished: e.target.checked })} />
                  Publish to Web Store
                </label>
              </>
            )}
          </div>
        </form>
      </Modal>

      <Modal
        open={viewOpen}
        title={selectedProducts.length === 1 ? 'Product details' : `View ${selectedProducts.length} products`}
        onClose={() => setViewOpen(false)}
        size="xl"
        footer={(
          <>
            <button type="button" className="btn-secondary" onClick={() => setViewOpen(false)}>Close</button>
            {canEdit && selectedProducts.length === 1 && (
              <button
                type="button"
                className="btn-primary"
                onClick={() => {
                  setViewOpen(false);
                  openEdit(selectedProducts[0]);
                }}
              >
                Edit
              </button>
            )}
            {canEdit && selectedProducts.length > 1 && (
              <button
                type="button"
                className="btn-primary"
                onClick={() => {
                  setViewOpen(false);
                  openEditSelected();
                }}
              >
                Bulk Edit
              </button>
            )}
          </>
        )}
      >
        <div className="max-h-[70vh] overflow-auto space-y-4">
          {selectedProducts.length === 1 && (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm">
              <div className="grid gap-2 md:grid-cols-2">
                <div><span className="text-slate-500">Product ID:</span> <span className="font-mono text-xs">{selectedProducts[0].id}</span></div>
                <div><span className="text-slate-500">HSN:</span> {selectedProducts[0].hsnCode || '—'}</div>
                <div><span className="text-slate-500">Brand:</span> {selectedProducts[0].brandName || '—'}</div>
                <div><span className="text-slate-500">Variant / Model:</span> {selectedProducts[0].modelVariant || '—'}</div>
                <div><span className="text-slate-500">GST:</span> {selectedProducts[0].gstPercentage}%</div>
              </div>
            </div>
          )}
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-3 py-2 text-left font-medium text-slate-600">SKU</th>
                <th className="px-3 py-2 text-left font-medium text-slate-600">Name</th>
                <th className="px-3 py-2 text-left font-medium text-slate-600">Barcode</th>
                <th className="px-3 py-2 text-left font-medium text-slate-600">Category</th>
                <th className="px-3 py-2 text-left font-medium text-slate-600">Brand</th>
                <th className="px-3 py-2 text-right font-medium text-slate-600">MRP</th>
                <th className="px-3 py-2 text-right font-medium text-slate-600">Sell</th>
                <th className="px-3 py-2 text-left font-medium text-slate-600">GST</th>
                <th className="px-3 py-2 text-left font-medium text-slate-600">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {selectedProducts.map((p) => (
                <tr key={p.id}>
                  <td className="px-3 py-2 font-mono text-xs">{p.sku}</td>
                  <td className="px-3 py-2 font-medium">{p.name}</td>
                  <td className="px-3 py-2 text-slate-500">{p.barcode || '—'}</td>
                  <td className="px-3 py-2">{p.categoryName || '—'}</td>
                  <td className="px-3 py-2">{p.brandName || '—'}</td>
                  <td className="px-3 py-2 text-right">{Number(p.mrp).toFixed(2)}</td>
                  <td className="px-3 py-2 text-right">{Number(p.sellingPrice).toFixed(2)}</td>
                  <td className="px-3 py-2">{p.gstPercentage}%</td>
                  <td className="px-3 py-2"><StatusBadge active={p.isActive} /></td>
                </tr>
              ))}
              {!selectedProducts.length && (
                <tr>
                  <td colSpan={9} className="px-3 py-6 text-center text-slate-500">No products selected</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Modal>

      <Modal
        open={bulkEditOpen}
        title={`Bulk edit ${selectedIds.length} products`}
        onClose={() => setBulkEditOpen(false)}
        size="lg"
        footer={(
          <>
            <button type="button" className="btn-secondary" onClick={() => setBulkEditOpen(false)}>Cancel</button>
            <button type="submit" form="bulk-edit-form" className="btn-primary" disabled={saving}>
              {saving ? 'Saving...' : 'Apply to selected'}
            </button>
          </>
        )}
      >
        <form id="bulk-edit-form" onSubmit={handleBulkEdit} className="space-y-4">
          <p className="text-sm text-slate-500">
            Only filled fields are applied. Leave a field blank to keep each product&apos;s current value.
          </p>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="label">Category</label>
              <select className="input-field" value={bulkForm.categoryId} onChange={(e) => setBulkForm({ ...bulkForm, categoryId: e.target.value })}>
                <option value="">— no change —</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Brand</label>
              <select className="input-field" value={bulkForm.brandId} onChange={(e) => setBulkForm({ ...bulkForm, brandId: e.target.value })}>
                <option value="">— no change —</option>
                {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Unit</label>
              <select className="input-field" value={bulkForm.unitId} onChange={(e) => setBulkForm({ ...bulkForm, unitId: e.target.value })}>
                <option value="">— no change —</option>
                {units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </div>
            <div>
              <label className="label">GST %</label>
              <input type="number" step="0.01" className="input-field" value={bulkForm.gstPercentage} onChange={(e) => setBulkForm({ ...bulkForm, gstPercentage: e.target.value })} placeholder="No change" />
            </div>
            <div>
              <label className="label">Reorder level</label>
              <input type="number" step="0.01" className="input-field" value={bulkForm.reorderLevel} onChange={(e) => setBulkForm({ ...bulkForm, reorderLevel: e.target.value })} placeholder="No change" />
            </div>
            <div>
              <label className="label">Minimum stock</label>
              <input type="number" step="0.01" className="input-field" value={bulkForm.minimumStock} onChange={(e) => setBulkForm({ ...bulkForm, minimumStock: e.target.value })} placeholder="No change" />
            </div>
            <div>
              <label className="label">Status</label>
              <select className="input-field" value={bulkForm.isActive} onChange={(e) => setBulkForm({ ...bulkForm, isActive: e.target.value })}>
                <option value="">— no change —</option>
                <option value="1">Active</option>
                <option value="0">Inactive</option>
              </select>
            </div>
            <div>
              <label className="label">Web store</label>
              <select className="input-field" value={bulkForm.webStorePublished} onChange={(e) => setBulkForm({ ...bulkForm, webStorePublished: e.target.value })}>
                <option value="">— no change —</option>
                <option value="1">Published</option>
                <option value="0">Draft</option>
              </select>
            </div>
          </div>
        </form>
      </Modal>

      <Modal
        open={duplicateModalOpen}
        title="Possible duplicate product found"
        onClose={() => { setDuplicateModalOpen(false); setPendingPayload(null); }}
        footer={(
          <>
            <button type="button" className="btn-secondary" onClick={() => { setDuplicateModalOpen(false); setPendingPayload(null); }}>Cancel</button>
            <button type="button" className="btn-primary" onClick={confirmDuplicateSave} disabled={saving}>
              {saving ? 'Saving...' : 'Create anyway'}
            </button>
          </>
        )}
      >
        <p className="mb-3 text-sm text-slate-600">
          A similar product already exists for this brand. Review before creating a new one.
        </p>
        <ul className="space-y-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm">
          {duplicateProducts.map((p) => (
            <li key={p.id}>
              <div className="font-medium">{p.name}</div>
              <div className="font-mono text-xs text-slate-500">{p.sku}{p.barcode ? ` · ${p.barcode}` : ''}</div>
            </li>
          ))}
        </ul>
      </Modal>

      <Modal
        open={importOpen}
        title="Import Products CSV"
        onClose={() => setImportOpen(false)}
        footer={(
          <>
            <button type="button" className="btn-secondary" onClick={() => setImportOpen(false)}>Cancel</button>
            <button type="submit" form="import-form" className="btn-primary" disabled={saving}>
              {saving ? 'Importing...' : 'Import'}
            </button>
          </>
        )}
      >
        <form id="import-form" onSubmit={handleImport} className="space-y-3">
          <p className="text-sm text-slate-500">
            Required columns: <code>sku,name</code>. Optional: barcode, category, brand, unit, model_variant, hsn_code, gst_percentage, mrp, selling_price, purchase_price, reorder_level, minimum_stock, image_url, description, is_active, web_store_published.
          </p>
          <textarea
            className="input-field min-h-[180px] font-mono text-xs"
            value={csvText}
            onChange={(e) => setCsvText(e.target.value)}
            placeholder="sku,name,barcode,category,brand,unit,model_variant,..."
            required
          />
        </form>
      </Modal>
    </RequirePermission>
  );
}
