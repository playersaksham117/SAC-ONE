'use client';

/** Shared modern UI primitives for Finance, HR, and similar business modules. */

export function StatCard({ label, value, hint, tone = 'default', icon, compact = false }) {
  const tones = {
    default: 'border-slate-200/80 bg-white',
    success: 'border-emerald-200/80 bg-gradient-to-br from-emerald-50 to-white',
    warning: 'border-amber-200/80 bg-gradient-to-br from-amber-50 to-white',
    danger: 'border-rose-200/80 bg-gradient-to-br from-rose-50 to-white',
    info: 'border-sky-200/80 bg-gradient-to-br from-sky-50 to-white',
    dark: 'border-slate-700 bg-gradient-to-br from-slate-900 to-slate-800 text-white',
  };
  const valueTone = tone === 'dark' ? 'text-white' : 'text-slate-900';
  const labelTone = tone === 'dark' ? 'text-slate-400' : 'text-slate-500';
  const hintTone = tone === 'dark' ? 'text-slate-500' : 'text-slate-400';

  return (
    <div className={`rounded-2xl border p-4 shadow-sm transition hover:shadow-md ${tones[tone] || tones.default} ${compact ? 'p-3' : ''}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className={`text-[11px] font-semibold uppercase tracking-wider ${labelTone}`}>{label}</div>
          <div className={`mt-1 truncate font-bold tabular-nums ${compact ? 'text-lg' : 'text-2xl'} ${valueTone}`}>{value}</div>
          {hint && <div className={`mt-1 text-xs ${hintTone}`}>{hint}</div>}
        </div>
        {icon && (
          <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-lg ${tone === 'dark' ? 'bg-white/10' : 'bg-slate-100'}`}>
            {icon}
          </div>
        )}
      </div>
    </div>
  );
}

export function SectionCard({ title, subtitle, action, children, className = '', noPadding = false }) {
  return (
    <section className={`overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm ${className}`}>
      {(title || action) && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-3 sm:px-5">
          <div>
            {title && <h3 className="text-sm font-semibold text-slate-900">{title}</h3>}
            {subtitle && <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>}
          </div>
          {action}
        </div>
      )}
      <div className={noPadding ? '' : 'p-4 sm:p-5'}>{children}</div>
    </section>
  );
}

export function ModuleTabs({ tabs, active, onChange }) {
  return (
    <div className="scrollbar-none -mx-1 flex gap-1 overflow-x-auto px-1 pb-1">
      {tabs.map(({ id, label, badge }) => (
        <button
          key={id}
          type="button"
          onClick={() => onChange(id)}
          className={`relative shrink-0 rounded-xl px-4 py-2.5 text-sm font-medium transition ${
            active === id
              ? 'bg-slate-900 text-white shadow-sm'
              : 'bg-white text-slate-600 ring-1 ring-slate-200/80 hover:bg-slate-50 hover:text-slate-900'
          }`}
        >
          {label}
          {badge > 0 && (
            <span className={`ml-1.5 inline-flex min-w-[1.25rem] items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
              active === id ? 'bg-amber-400 text-slate-900' : 'bg-amber-100 text-amber-800'
            }`}
            >
              {badge}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

export function GridCard({ children, onClick, selected, className = '' }) {
  return (
    <div
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={onClick ? (e) => { if (e.key === 'Enter') onClick(); } : undefined}
      className={`rounded-2xl border bg-white p-4 shadow-sm transition ${
        selected ? 'border-slate-900 ring-2 ring-slate-900/10' : 'border-slate-200/80 hover:border-slate-300 hover:shadow-md'
      } ${onClick ? 'cursor-pointer' : ''} ${className}`}
    >
      {children}
    </div>
  );
}

export function StatusPill({ status, map = {} }) {
  const colors = map[status] || 'bg-slate-100 text-slate-700';
  return (
    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-semibold capitalize ${colors}`}>
      {String(status || '').replace(/_/g, ' ')}
    </span>
  );
}

export function SkeletonBlock({ className = 'h-24' }) {
  return <div className={`animate-pulse rounded-2xl bg-slate-200/70 ${className}`} />;
}

export function SkeletonGrid({ count = 4, cols = 'sm:grid-cols-2 lg:grid-cols-4' }) {
  return (
    <div className={`grid gap-3 ${cols}`}>
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonBlock key={i} className="h-28" />
      ))}
    </div>
  );
}

export function EmptyPanel({ title, description, action }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50/50 px-6 py-14 text-center">
      <div className="text-3xl opacity-40">📋</div>
      <h4 className="mt-3 text-sm font-semibold text-slate-800">{title}</h4>
      {description && <p className="mt-1 max-w-sm text-xs text-slate-500">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Toolbar({ children, className = '' }) {
  return (
    <div className={`flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200/80 bg-white p-3 shadow-sm ${className}`}>
      {children}
    </div>
  );
}
