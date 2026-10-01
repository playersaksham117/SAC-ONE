/**
 * Remembers the last modules a user opened (per browser) so Home can offer them as shortcuts.
 * Stored in localStorage; every access is guarded because storage can be unavailable.
 */

const KEY = 'sacone.recentModules';
const MAX = 6;

export function getRecentModuleIds() {
  try {
    const raw = window.localStorage.getItem(KEY);
    const ids = raw ? JSON.parse(raw) : [];
    return Array.isArray(ids) ? ids.filter((id) => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

export function recordModuleVisit(moduleId) {
  if (!moduleId) return;
  try {
    const ids = [moduleId, ...getRecentModuleIds().filter((id) => id !== moduleId)].slice(0, MAX);
    window.localStorage.setItem(KEY, JSON.stringify(ids));
  } catch {
    // storage unavailable — shortcuts fall back to defaults
  }
}
