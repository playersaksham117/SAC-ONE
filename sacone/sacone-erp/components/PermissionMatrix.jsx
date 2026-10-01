'use client';

const ACTION_LABELS = {
  view: 'View',
  create: 'Create',
  edit: 'Edit',
  delete: 'Delete',
  approve: 'Approve',
};

export default function PermissionMatrix({ tree, selectedIds, onToggle, readOnly = false }) {
  if (!tree?.length) return null;

  return (
    <div className="max-h-[420px] overflow-y-auto rounded-lg border border-slate-200">
      {tree.map((mod) => (
        <div key={mod.id} className="border-b border-slate-100 last:border-b-0">
          <div className="bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-800">
            {mod.name}
            <span className="ml-2 text-xs font-normal text-slate-500">({mod.code})</span>
          </div>
          {mod.features.map((feature) => (
            <div key={feature.id} className="border-t border-slate-100 px-4 py-3">
              <div className="mb-2 text-sm font-medium text-slate-700">{feature.name}</div>
              <div className="flex flex-wrap gap-3">
                {feature.permissions.map((perm) => (
                  <label key={perm.id} className="inline-flex items-center gap-2 text-sm text-slate-600">
                    <input
                      type="checkbox"
                      className="rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                      checked={selectedIds.includes(perm.id)}
                      onChange={() => !readOnly && onToggle(perm.id)}
                      disabled={readOnly}
                    />
                    {ACTION_LABELS[perm.action] || perm.action}
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
