'use client';

import Link from 'next/link';

/**
 * Home page building blocks: tone palette, module card and section block.
 * Tailwind needs literal class names, so every tone is spelled out here.
 */
export const TONES = {
  blue: {
    tile: 'bg-blue-50 text-blue-600 ring-blue-100',
    solid: 'bg-gradient-to-br from-blue-500 to-indigo-600 text-white',
    chip: 'bg-blue-50 text-blue-700 ring-blue-200',
    border: 'hover:border-blue-300',
    title: 'group-hover:text-blue-700',
    arrow: 'group-hover:text-blue-600',
    dot: 'bg-blue-500',
  },
  emerald: {
    tile: 'bg-emerald-50 text-emerald-600 ring-emerald-100',
    solid: 'bg-gradient-to-br from-emerald-500 to-teal-600 text-white',
    chip: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
    border: 'hover:border-emerald-300',
    title: 'group-hover:text-emerald-700',
    arrow: 'group-hover:text-emerald-600',
    dot: 'bg-emerald-500',
  },
  violet: {
    tile: 'bg-violet-50 text-violet-600 ring-violet-100',
    solid: 'bg-gradient-to-br from-violet-500 to-purple-600 text-white',
    chip: 'bg-violet-50 text-violet-700 ring-violet-200',
    border: 'hover:border-violet-300',
    title: 'group-hover:text-violet-700',
    arrow: 'group-hover:text-violet-600',
    dot: 'bg-violet-500',
  },
};

export const toneFor = (section) => TONES[section?.tone] || TONES.blue;

function Arrow({ className = '' }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

/** One module tile. `sectionLabel` is shown in search results where sections are mixed. */
export function ModuleCard({ module, tone, sectionLabel, highlight = false }) {
  return (
    <Link
      href={module.href}
      className={`group relative flex flex-col rounded-2xl border bg-white p-3.5 sm:min-h-[92px] sm:p-4 shadow-sm transition duration-200 hover:-translate-y-0.5 hover:shadow-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${tone.border} ${
        highlight ? 'border-brand-300 ring-2 ring-brand-100' : 'border-slate-200/80'
      }`}
    >
      <div className="flex items-start gap-3">
        <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-xl ring-1 transition duration-200 group-hover:scale-105 ${tone.tile}`}>
          {module.icon}
        </span>
        <div className="min-w-0 flex-1 pr-5 pt-0.5">
          <div className="flex items-center gap-2">
            <h3 className={`truncate text-[15px] font-semibold text-slate-900 transition ${tone.title}`}>{module.label}</h3>
            {module.placeholder && (
              <span className="shrink-0 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700 ring-1 ring-amber-200">
                Soon
              </span>
            )}
          </div>
          <p className="mt-1 line-clamp-2 text-[13px] leading-snug text-slate-500">{module.description}</p>
        </div>
      </div>
      {sectionLabel && (
        <div className="mt-auto pt-3">
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ring-1 ${tone.chip}`}>{sectionLabel}</span>
        </div>
      )}
      <Arrow className={`absolute right-4 top-4 -translate-x-1 text-slate-300 opacity-0 transition duration-200 group-hover:translate-x-0 group-hover:opacity-100 group-focus-visible:opacity-100 ${tone.arrow}`} />
    </Link>
  );
}

/** A section of Home: heading + responsive card grid of its modules. */
export default function HomeSectionCard({ section }) {
  if (!section.modules.length) return null;
  const tone = toneFor(section);

  return (
    <section id={`section-${section.id}`} className="scroll-mt-24">
      <div className="mb-4 flex items-center gap-3">
        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-lg shadow-sm ${tone.solid}`}>
          {section.cardIcon}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-bold tracking-tight text-slate-900">{section.label}</h2>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">{section.modules.length}</span>
          </div>
          <p className="truncate text-sm text-slate-500">{section.cardDescription}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
        {section.modules.map((mod) => (
          <ModuleCard key={mod.id} module={mod} tone={tone} />
        ))}
      </div>
    </section>
  );
}
