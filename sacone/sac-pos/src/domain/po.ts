/** The customer's purchase order on a bill: number plus optional date (YYYY-MM-DD). */
export interface CustomerPo {
  number: string;
  date: string | null;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** 'YYYY-MM-DD' for a typed date (DD/MM/YYYY, DD-MM-YYYY, DD.MM.YYYY or YYYY-MM-DD), else null. */
export function parsePoDate(text: string): string | null {
  const t = text.trim();
  let y: number; let m: number; let d: number;
  let match = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(t);
  if (match) {
    [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  } else {
    match = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/.exec(t);
    if (!match) return null;
    [d, m, y] = [Number(match[1]), Number(match[2]), Number(match[3])];
    if (y < 100) y += 2000;
  }
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  return `${y}-${pad(m)}-${pad(d)}`;
}

/** 05/10/2026 from 2026-10-05. */
export function formatPoDate(iso: string | null | undefined): string {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

/** Today as DD/MM/YYYY (for the "Today" shortcut). */
export function todayPoText(now = new Date()): string {
  return `${pad(now.getDate())}/${pad(now.getMonth() + 1)}/${now.getFullYear()}`;
}

/**
 * Checks what was typed at checkout. Empty number → no PO. A date needs a number; the number is
 * at most 60 characters.
 */
export function readCustomerPo(numberText: string, dateText: string): { po: CustomerPo | null; error: string | null } {
  const number = numberText.replace(/\s+/g, ' ').trim();
  const dateTyped = dateText.trim();
  if (!number) return { po: null, error: dateTyped ? 'Enter the customer PO number for the PO date' : null };
  if (number.length > 60) return { po: null, error: 'Customer PO number is too long (60 characters at most)' };
  if (!dateTyped) return { po: { number, date: null }, error: null };
  const date = parsePoDate(dateTyped);
  if (!date) return { po: null, error: 'PO date should look like 05/10/2026' };
  return { po: { number, date }, error: null };
}

/** "PO/778 dt 05/10/2026" for receipts. */
export function poLabel(po: CustomerPo | null | undefined): string {
  if (!po?.number) return '';
  return po.date ? `${po.number} dt ${formatPoDate(po.date)}` : po.number;
}
