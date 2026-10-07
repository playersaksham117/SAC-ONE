import { AsyncLocalStorage } from 'async_hooks';
import { financialYearRange } from '../core/financial-year.js';

/**
 * The firm (and financial year) a request works in. Set once per request by the auth
 * middleware; getDatabase() reads it to pick that firm's database file. Code that runs
 * outside a request (setup, scripts, tests) has no context and uses the main file.
 */
const storage = new AsyncLocalStorage();

/** Run `fn` with { firmId, financialYear } as the current context. */
export function runWithFirm(context, fn) {
  return storage.run(context, fn);
}

export function currentContext() {
  return storage.getStore() || null;
}

export function currentFirmId() {
  return storage.getStore()?.firmId || null;
}

/** { code, from, to, label } of the financial year chosen for this request, or null. */
export function currentFinancialYear() {
  return financialYearRange(storage.getStore()?.financialYear);
}

/**
 * List filters with the chosen financial year filled in when the caller gave no dates.
 * Explicit dates win, so reports can still look across years.
 */
export function withFinancialYear(filters = {}, { fromKey = 'dateFrom', toKey = 'dateTo' } = {}) {
  const fy = currentFinancialYear();
  if (!fy || filters.allYears === 'true' || filters.allYears === true) return filters;
  if (filters[fromKey] || filters[toKey]) return filters;
  return { ...filters, [fromKey]: fy.from, [toKey]: fy.to };
}
