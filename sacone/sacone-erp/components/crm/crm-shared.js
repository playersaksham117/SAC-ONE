/** Shared labels and helpers for the CRM screens. */

export const STAGES = [
  { id: 'new', label: 'New', tone: 'bg-sky-100 text-sky-800', dot: 'bg-sky-500' },
  { id: 'contacted', label: 'Contacted', tone: 'bg-indigo-100 text-indigo-800', dot: 'bg-indigo-500' },
  { id: 'quoted', label: 'Quoted', tone: 'bg-amber-100 text-amber-800', dot: 'bg-amber-500' },
  { id: 'won', label: 'Won', tone: 'bg-emerald-100 text-emerald-800', dot: 'bg-emerald-500' },
  { id: 'lost', label: 'Lost', tone: 'bg-slate-200 text-slate-700', dot: 'bg-slate-400' },
];
export const stageOf = (id) => STAGES.find((s) => s.id === id) || STAGES[0];

export const KINDS = [
  { id: 'call', label: 'Call', icon: '📞' },
  { id: 'visit', label: 'Visit', icon: '🚶' },
  { id: 'whatsapp', label: 'WhatsApp', icon: '💬' },
  { id: 'email', label: 'Email', icon: '✉️' },
  { id: 'meeting', label: 'Meeting', icon: '🤝' },
];
export const ACTIVITY_KINDS = [...KINDS, { id: 'note', label: 'Note', icon: '📝' }];
export const kindOf = (id) => [...ACTIVITY_KINDS, { id: 'stage', label: 'Stage', icon: '🔁' }].find((k) => k.id === id) || ACTIVITY_KINDS[5];

export const SOURCES = ['Walk-in', 'Phone call', 'WhatsApp', 'Referral', 'Website', 'Social media', 'Exhibition', 'Other'];

export const money = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;

/** 'YYYY-MM-DD' in IST, optionally a few days ahead. */
export const istDay = (plusDays = 0) => new Date(Date.now() + 330 * 60000 + plusDays * 86400000).toISOString().slice(0, 10);

export function dayLabel(date) {
  if (!date) return '';
  if (date === istDay()) return 'Today';
  if (date === istDay(1)) return 'Tomorrow';
  if (date === istDay(-1)) return 'Yesterday';
  return new Date(`${date}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

export const whenLabel = (iso) => (iso ? new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '');

/** Quick date choices for follow-ups. */
export const QUICK_DATES = [['Today', 0], ['Tomorrow', 1], ['In 3 days', 3], ['Next week', 7]];

export const telHref = (phone) => `tel:${String(phone || '').replace(/[^\d+]/g, '')}`;
export const waHref = (phone) => {
  const d = String(phone || '').replace(/\D/g, '');
  return `https://wa.me/${d.length === 10 ? `91${d}` : d}`;
};
