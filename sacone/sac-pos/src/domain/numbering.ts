/** Local document numbers. The ERP prefixes them with the device code (e.g. POS1-S260926-0007). */
export function dayKey(date = new Date()): string {
  const y = String(date.getFullYear()).slice(2);
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}${m}${d}`;
}

export function docNumber(prefix: 'S' | 'R' | 'P' | 'C', seq: number, date = new Date()): string {
  return `${prefix}${dayKey(date)}-${String(seq).padStart(4, '0')}`;
}
