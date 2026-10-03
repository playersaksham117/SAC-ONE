'use client';

export default function PageHeader({ title, description, actions }) {
  return (
    <div className="mb-4 flex flex-wrap items-start justify-between gap-3 sm:mb-6 sm:gap-4">
      <div className="min-w-0">
        <h2 className="text-xl font-bold text-slate-900 sm:text-2xl">{title}</h2>
        {description && <p className="mt-1 text-sm text-slate-500">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function StatusBadge({ active, labelActive = 'Active', labelInactive = 'Inactive' }) {
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${
        active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'
      }`}
    >
      {active ? labelActive : labelInactive}
    </span>
  );
}

export function SystemBadge() {
  return (
    <span className="inline-flex rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-700">
      System
    </span>
  );
}

export function LoadingState({ message = 'Loading...' }) {
  return (
    <div className="flex items-center justify-center py-16 text-sm text-slate-500">{message}</div>
  );
}

export function EmptyState({ title, description }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
      <h3 className="text-base font-semibold text-slate-900">{title}</h3>
      {description && <p className="mt-2 text-sm text-slate-500">{description}</p>}
    </div>
  );
}

export function Alert({ type = 'error', message }) {
  if (!message) return null;
  const styles = {
    error: 'border-red-200 bg-red-50 text-red-700',
    success: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    info: 'border-blue-200 bg-blue-50 text-blue-700',
  };
  return (
    <div className={`mb-4 rounded-lg border px-4 py-3 text-sm ${styles[type]}`}>{message}</div>
  );
}

export function Modal({ open, title, children, onClose, footer, size = 'md' }) {
  if (!open) return null;
  const widthClass = size === 'lg' ? 'max-w-3xl' : size === 'xl' ? 'max-w-5xl' : 'max-w-lg';
  return (
    // Bottom sheet on phones, centred dialog from sm up; the body scrolls, header/footer stay put.
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-4">
      <div className={`flex max-h-[92dvh] w-full ${widthClass} flex-col rounded-t-2xl bg-white shadow-xl sm:max-h-[90vh] sm:rounded-xl`}>
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-200 px-4 py-3 sm:px-6 sm:py-4">
          <h3 className="min-w-0 truncate text-base font-semibold sm:text-lg">{title}</h3>
          <button type="button" onClick={onClose} aria-label="Close" className="-mr-2 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600">✕</button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-6">{children}</div>
        {footer && <div className="flex shrink-0 flex-wrap justify-end gap-2 border-t border-slate-200 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-6 sm:py-4">{footer}</div>}
      </div>
    </div>
  );
}
