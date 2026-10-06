'use client';

const ACTION_LABELS = {
  view: 'View',
  create: 'Create',
  edit: 'Edit',
  delete: 'Delete',
  approve: 'Approve',
};

/**
 * Role permission editor: every module, feature and action is editable.
 * onSetMany(ids, checked) enables the select-all controls (all / module / feature).
 */
export default function PermissionMatrix({ tree, selectedIds, onToggle, onSetMany, readOnly = false }) {
  if (!tree?.length) return null;
  const selected = new Set(selectedIds);
  const idsOf = (features) => features.flatMap((f) => f.permissions.map((p) => p.id));
  const allIds = tree.flatMap((m) => idsOf(m.features));
  const state = (ids) => {
    const n = ids.filter((id) => selected.has(id)).length;
    return { all: n === ids.length && n > 0, some: n > 0 && n < ids.length, n };
  };
  const bulk = !readOnly && typeof onSetMany === 'function';

  const BulkBox = ({ ids, label }) => {
    const s = state(ids);
    return (
      <label className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600">
        <input
          type="checkbox"
          className="rounded border-slate-300 text-brand-600 focus:ring-brand-500"
          checked={s.all}
          ref={(el) => { if (el) el.indeterminate = s.some; }}
          onChange={() => onSetMany(ids, !s.all)}
        />
        {label}
      </label>
    );
  };

  return (
    <div className="rounded-lg border border-slate-200">
      {bulk && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-white px-4 py-2">
          <BulkBox ids={allIds} label={`All permissions (${state(allIds).n}/${allIds.length})`} />
          <div className="flex gap-2">
            <button type="button" className="text-xs font-medium text-brand-600 hover:underline" onClick={() => onSetMany(allIds, true)}>Select all</button>
            <button type="button" className="text-xs font-medium text-slate-500 hover:underline" onClick={() => onSetMany(allIds, false)}>Clear all</button>
          </div>
        </div>
      )}
      <div className="max-h-[60vh] overflow-y-auto">
        {tree.map((mod) => {
          const modIds = idsOf(mod.features);
          return (
            <div key={mod.id} className="border-b border-slate-100 last:border-b-0">
              <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-800">
                <span>
                  {mod.name}
                  <span className="ml-2 text-xs font-normal text-slate-500">({mod.code})</span>
                </span>
                {bulk && <BulkBox ids={modIds} label={`Whole module (${state(modIds).n}/${modIds.length})`} />}
              </div>
              {mod.features.map((feature) => {
                const featureIds = feature.permissions.map((p) => p.id);
                return (
                  <div key={feature.id} className="border-t border-slate-100 px-4 py-3">
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                      <span className="text-sm font-medium text-slate-700">{feature.name}</span>
                      {bulk && featureIds.length > 1 && <BulkBox ids={featureIds} label="All actions" />}
                    </div>
                    <div className="flex flex-wrap gap-3">
                      {feature.permissions.map((perm) => (
                        <label key={perm.id} className="inline-flex items-center gap-2 text-sm text-slate-600">
                          <input
                            type="checkbox"
                            className="rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                            checked={selected.has(perm.id)}
                            onChange={() => !readOnly && onToggle(perm.id)}
                            disabled={readOnly}
                          />
                          {ACTION_LABELS[perm.action] || perm.action}
                        </label>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
