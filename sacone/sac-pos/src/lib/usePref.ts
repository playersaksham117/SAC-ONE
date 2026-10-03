import { useEffect, useState } from 'react';
import { AsyncStorage } from '../storage/kv';

/** A small per-phone preference (e.g. the last paper size), kept across app restarts. */
export function usePref<T extends string>(key: string, fallback: T, allowed: readonly T[]): [T, (value: T) => void] {
  const [value, setValue] = useState<T>(fallback);

  useEffect(() => {
    AsyncStorage.getItem(key)
      .then((saved) => { if (saved && (allowed as readonly string[]).includes(saved)) setValue(saved as T); })
      .catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const update = (next: T) => {
    setValue(next);
    AsyncStorage.setItem(key, next).catch(() => undefined);
  };
  return [value, update];
}
