import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { jsonStorage } from './persist';

/** Counter preferences kept on this device (not per firm or user). */
interface PrefsState {
  /** Tapping a product 3 times quickly puts it on a new line of the bill instead of adding 3. */
  tripleTapNewLine: boolean;
  setTripleTapNewLine: (on: boolean) => void;
}

export const usePrefs = create<PrefsState>()(
  persist(
    (set) => ({
      tripleTapNewLine: true,
      setTripleTapNewLine: (on) => set({ tripleTapNewLine: on }),
    }),
    { name: 'sacpos.prefs', storage: jsonStorage },
  ),
);

/** Taps on the same product closer together than this count as one multi-tap. */
export const MULTI_TAP_MS = 450;

export interface TapTrack { productId: string; count: number; at: number; before: unknown }

/**
 * Counts quick taps on one product. Returns the updated track and whether this tap is the third
 * in a row (the moment to undo the first two and add a new line instead).
 */
export function nextTap<T>(prev: TapTrack | null, productId: string, now: number, snapshot: () => T): { track: TapTrack; third: boolean } {
  const quick = prev && prev.productId === productId && now - prev.at <= MULTI_TAP_MS;
  if (!quick) return { track: { productId, count: 1, at: now, before: snapshot() }, third: false };
  const count = prev.count + 1;
  if (count >= 3) return { track: { productId, count: 0, at: 0, before: null }, third: true };
  return { track: { ...prev, count, at: now }, third: false };
}
