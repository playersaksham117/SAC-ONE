'use client';

import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { apiRequest } from '../../lib/api';

const money = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** The typed words in bold inside a product name. */
function Highlight({ text, query }) {
  const words = query.trim().split(/\s+/).filter((w) => w.length > 1).map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  if (!words.length) return text;
  const parts = String(text).split(new RegExp(`(${words.join('|')})`, 'ig'));
  return parts.map((p, i) => (i % 2 ? <mark key={i} className="rounded bg-amber-100 px-0.5 text-slate-900">{p}</mark> : p));
}

/**
 * Search-as-you-type product picker for bill / quotation lines: name, SKU, barcode or HSN, searched
 * on the server (every product, not a first page). ↑ ↓ to move, Enter to add (an exact barcode / SKU
 * wins), Esc to close. `inBill` (productId → quantity) marks items already on the document.
 */
export default function ProductPicker({ onPick, inBill = {}, placeholder = 'Add item: type name, SKU, barcode or HSN', autoFocus = false, testId = 'product-picker', action = 'add' }) {
  const [q, setQ] = useState('');
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [active, setActive] = useState(0);
  const input = useRef(null);
  const list = useRef(null);
  const box = useRef(null);
  const listId = useId();
  // The list floats over everything (dialogs scroll and would cut it off) and opens upward
  // when there is no room below the box.
  const [pos, setPos] = useState(null);
  const place = () => {
    const r = box.current?.getBoundingClientRect();
    if (!r) return;
    const below = window.innerHeight - r.bottom;
    const up = below < 300 && r.top > below;
    setPos({ left: r.left, width: r.width, ...(up ? { bottom: window.innerHeight - r.top + 4 } : { top: r.bottom + 4 }), maxHeight: Math.max(160, Math.min(360, (up ? r.top : below) - 48)) });
  };
  const showing = open && q.trim();
  useLayoutEffect(() => {
    if (!showing) return undefined;
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => { window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true); };
  }, [showing]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const term = q.trim();
    if (!term) { setItems([]); setBusy(false); return undefined; }
    setBusy(true);
    let live = true;
    const t = setTimeout(async () => {
      try {
        const d = await apiRequest(`/api/products?${new URLSearchParams({ search: term, limit: '12', isActive: '1' })}`);
        if (!live) return;
        setItems(d.items || []);
        setActive(0);
        setOpen(true);
      } catch {
        if (live) setItems([]);
      } finally {
        if (live) setBusy(false);
      }
    }, 180);
    return () => { live = false; clearTimeout(t); };
  }, [q]);

  useEffect(() => {
    list.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const pick = (p) => {
    if (!p) return;
    onPick(p);
    setQ('');
    setItems([]);
    setOpen(false);
    input.current?.focus();
  };

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setActive((a) => Math.min(a + 1, items.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === 'Enter') {
      e.preventDefault();
      const term = q.trim().toLowerCase();
      const exact = items.find((p) => [p.barcode, p.sku].some((v) => String(v || '').toLowerCase() === term));
      pick(exact || items[active]);
    } else if (e.key === 'Escape') { setOpen(false); }
  };

  return (
    <div className="relative" data-testid={testId}>
      <div ref={box} className={`flex items-center gap-2 rounded-xl border-2 bg-white px-3 transition ${open && q ? 'border-brand-500 shadow-sm' : 'border-slate-200 focus-within:border-brand-500'}`}>
        <span aria-hidden="true" className="text-lg text-slate-400">＋</span>
        <input
          ref={input}
          autoFocus={autoFocus}
          className="min-w-0 flex-1 bg-transparent py-2.5 text-sm outline-none placeholder:text-slate-400"
          placeholder={placeholder}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => items.length && setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={onKeyDown}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          data-testid={`${testId}-input`}
        />
        {busy ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-brand-600" aria-label="Searching" /> : null}
        {q && !busy ? (
          <button type="button" className="rounded-md px-1.5 text-slate-400 hover:text-slate-700" onMouseDown={(e) => { e.preventDefault(); setQ(''); setItems([]); input.current?.focus(); }} aria-label="Clear search">✕</button>
        ) : null}
      </div>

      {showing && pos ? (
        <div className="fixed z-[70] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl ring-1 ring-black/5"
          style={{ left: pos.left, width: pos.width, top: pos.top, bottom: pos.bottom }}>
          {items.length ? (
            <ul ref={list} id={listId} role="listbox" className="overflow-y-auto py-1" style={{ maxHeight: pos.maxHeight }}>
              {items.map((p, i) => {
                const price = p.retailPrice ?? p.sellingPrice;
                const min = p.sellingPrice != null && p.sellingPrice < price - 0.001 ? p.sellingPrice : null;
                const qty = inBill[p.id];
                return (
                  <li key={p.id} data-index={i} role="option" aria-selected={i === active}>
                    <button
                      type="button"
                      onMouseDown={(e) => { e.preventDefault(); pick(p); }}
                      onMouseEnter={() => setActive(i)}
                      className={`flex w-full items-center gap-3 px-3 py-2 text-left ${i === active ? 'bg-brand-50' : 'hover:bg-slate-50'}`}
                      data-testid={`${testId}-option-${i}`}
                    >
                      <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-xs font-bold ${i === active ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-500'}`}>
                        {String(p.name || '?').trim().charAt(0)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-slate-900"><Highlight text={p.name} query={q} /></span>
                        <span className="flex flex-wrap items-center gap-x-2 text-xs text-slate-500">
                          <span className="font-mono">{p.sku}</span>
                          {p.hsnCode ? <span>HSN {p.hsnCode}</span> : null}
                          {p.unitAbbreviation ? <span>{p.unitAbbreviation}</span> : null}
                          <span>GST {Number(p.gstPercentage || 0)}%</span>
                          {qty ? <span className="rounded-full bg-emerald-50 px-1.5 font-medium text-emerald-700 ring-1 ring-emerald-200">on bill × {qty}</span> : null}
                        </span>
                      </span>
                      <span className="shrink-0 text-right">
                        <span className="block text-sm font-bold tabular-nums text-slate-900">{money(price)}</span>
                        {min != null ? <span className="block text-[11px] text-slate-400">Min {money(min)}</span> : null}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : busy ? (
            <div className="px-4 py-3 text-sm text-slate-500">Searching…</div>
          ) : (
            <div className="px-4 py-3 text-sm text-slate-500">No product matches “{q.trim()}”.</div>
          )}
          <div className="border-t border-slate-100 bg-slate-50 px-3 py-1.5 text-[11px] text-slate-400">↑ ↓ to move · Enter to {action} · Esc to close · words in any order</div>
        </div>
      ) : null}
    </div>
  );
}

/**
 * One product chosen by searching (forms: stock movement, transfer, challan line, filters).
 * value = product id; onChange(id, product). Shows the chosen product with ✕ to change it.
 */
export function ProductSelect({ value, onChange, placeholder = 'Search product: name, SKU, barcode or HSN', emptyLabel = null, testId = 'product-select' }) {
  const [chosen, setChosen] = useState(null);
  useEffect(() => {
    if (!value) { setChosen(null); return undefined; }
    if (chosen?.id === value) return undefined;
    let live = true;
    apiRequest(`/api/products/${value}`).then((p) => { if (live) setChosen(p); }).catch(() => {});
    return () => { live = false; };
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps

  if (value && chosen) {
    return (
      <div className="flex items-center gap-2 rounded-xl border-2 border-brand-200 bg-brand-50/50 px-3 py-2" data-testid={testId}>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-slate-900">{chosen.name}</span>
          <span className="text-xs text-slate-500"><span className="font-mono">{chosen.sku}</span>{chosen.unitAbbreviation ? ` · ${chosen.unitAbbreviation}` : ''}</span>
        </span>
        <button type="button" className="rounded-md px-2 py-1 text-xs font-semibold text-brand-700 hover:bg-white" onClick={() => onChange('', null)} data-testid={`${testId}-change`}>
          {emptyLabel ? `✕ ${emptyLabel}` : 'Change'}
        </button>
      </div>
    );
  }
  return <ProductPicker action="choose" placeholder={emptyLabel ? `${emptyLabel} · ${placeholder}` : placeholder} onPick={(p) => { setChosen(p); onChange(p.id, p); }} testId={testId} />;
}
