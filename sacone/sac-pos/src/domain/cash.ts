import { round2 } from './money';

/** Indian notes and coins in circulation, largest first (₹2000 notes are withdrawn). */
export const DENOMINATIONS = [500, 200, 100, 50, 20, 10, 5, 2, 1] as const;

/** Count per denomination, keyed by the rupee value as a string ("500" → 2 notes). */
export type NoteCounts = Record<string, number>;

export interface CashDrawer {
  received: NoteCounts;
  change: NoteCounts;
}

export function notesTotal(counts: NoteCounts | null | undefined): number {
  if (!counts) return 0;
  return round2(Object.entries(counts).reduce((s, [value, count]) => s + Number(value) * (count || 0), 0));
}

/**
 * Fewest notes/coins for `amount` (greedy works for the Indian series).
 * Paise cannot be given in notes; they come back as `remainder` (round-off).
 */
export function suggestChange(amount: number): { counts: NoteCounts; remainder: number } {
  let rupees = Math.max(0, Math.floor(round2(amount)));
  const counts: NoteCounts = {};
  for (const value of DENOMINATIONS) {
    const n = Math.floor(rupees / value);
    if (n > 0) {
      counts[String(value)] = n;
      rupees -= n * value;
    }
  }
  return { counts, remainder: round2(Math.max(0, amount) - notesTotal(counts)) };
}

/** "500 × 2, 100 × 1" — empty string when nothing was counted. */
export function formatNotes(counts: NoteCounts | null | undefined): string {
  if (!counts) return '';
  return DENOMINATIONS
    .filter((v) => (counts[String(v)] || 0) > 0)
    .map((v) => `₹${v} × ${counts[String(v)]}`)
    .join(', ');
}

/** Drop zero counts so stored/synced data stays small. */
export function compactNotes(counts: NoteCounts): NoteCounts {
  return Object.fromEntries(Object.entries(counts).filter(([, n]) => n > 0));
}
