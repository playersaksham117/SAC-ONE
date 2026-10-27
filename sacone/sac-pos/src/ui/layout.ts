import { useEffect } from 'react';
import { Platform, useWindowDimensions } from 'react-native';

/**
 * Counter PCs, laptops and tablets (SAC-POS web, or a wide tablet): a side navigation rail and
 * the Sell screen with products and the cart side by side. Phones keep the one-column layout.
 */
export const WIDE_MIN_WIDTH = 960;

export function useWide(): boolean {
  const { width } = useWindowDimensions();
  return width >= WIDE_MIN_WIDTH;
}

/** Product tiles per row on the wide Sell screen (cart panel takes ~420px). */
export function useProductColumns(): number {
  const { width } = useWindowDimensions();
  if (width < WIDE_MIN_WIDTH) return 1;
  const room = width - 420 - 124; // cart panel + navigation rail
  return Math.max(2, Math.min(5, Math.floor(room / 230)));
}

/** Keyboard shortcuts on the web (F2, F9 …); ignored on phones. */
export function useHotkeys(map: Record<string, () => void>, enabled = true): void {
  useEffect(() => {
    if (Platform.OS !== 'web' || !enabled || typeof window === 'undefined') return undefined;
    const onKey = (e: KeyboardEvent) => {
      const fn = map[e.key];
      if (!fn) return;
      e.preventDefault();
      fn();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [map, enabled]);
}
