/** Serial numbers typed / scanned for a cart line (same rules as the ERP's cleanSerials). */
export function parseSerials(text: string, quantity: number): { serials: string[]; error: string | null } {
  const list = text.split(/[\n,;]+/).map((s) => s.trim().replace(/\s+/g, ' ')).filter(Boolean);
  const seen = new Set<string>();
  for (const s of list) {
    if (s.length > 40) return { serials: [], error: `Serial "${s.slice(0, 16)}…" is too long` };
    if (seen.has(s.toUpperCase())) return { serials: [], error: `Serial ${s} is entered twice` };
    seen.add(s.toUpperCase());
  }
  const qty = Math.floor(quantity);
  if (qty > 0 && list.length > qty) return { serials: [], error: `${list.length} serials for ${qty} unit${qty === 1 ? '' : 's'}` };
  return { serials: list, error: null };
}
