/**
 * The owner app only contains CEO Dashboard and Income & Expense.
 * Drill-down links that belong to other modules open in the ERP web app (new tab).
 */

/** Owner-access permissions: a user needs at least one of these. */
export const OWNER_PERMISSIONS = ['reports.ceo_dashboard.view', 'finance.ledger.view'];

/**
 * Resolve an ERP-style path for use inside the owner app.
 * @param {string} erpUrl base URL of the ERP app (see useErpAppUrl)
 * @returns {{ href: string, external: boolean } | null} null = no page to link to
 */
export function resolveLink(path, erpUrl) {
  if (!path || typeof path !== 'string') return null;
  if (/^https?:\/\//.test(path)) return { href: path, external: true };
  if (path.startsWith('/business/finance')) return { href: '/income-expense', external: false };
  if (path.startsWith('/business/reports') || path.startsWith('/business/ceo-dashboard')) return { href: '/ceo', external: false };
  // POS billing now lives only in the SAC-POS mobile app — there is no web page for a POS sale.
  if (path.startsWith('/operations/pos')) return null;
  return { href: `${erpUrl}${path}`, external: true };
}
