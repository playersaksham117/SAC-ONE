/**
 * Indian financial year: 1 April – 31 March
 * Returns short label e.g. 26-27 for FY starting April 2026
 */
export function getFinancialYear(dateInput = new Date()) {
  const d = dateInput instanceof Date ? dateInput : new Date(dateInput);
  if (Number.isNaN(d.getTime())) {
    throw new Error('Invalid date for financial year');
  }
  const month = d.getMonth() + 1; // 1-12
  const year = d.getFullYear();
  const startYear = month >= 4 ? year : year - 1;
  const endYear = startYear + 1;
  const yy = (n) => String(n % 100).padStart(2, '0');
  return `${yy(startYear)}-${yy(endYear)}`;
}

export function getFinancialYearRange(fyLabel) {
  const [startYy, endYy] = fyLabel.split('-').map((s) => parseInt(s, 10));
  if (!Number.isFinite(startYy) || !Number.isFinite(endYy)) {
    throw new Error(`Invalid financial year label: ${fyLabel}`);
  }
  const century = new Date().getFullYear() - (new Date().getFullYear() % 100);
  const startYear = century + startYy;
  const endYear = century + endYy;
  return {
    from: new Date(startYear, 3, 1),
    to: new Date(endYear, 2, 31, 23, 59, 59),
    label: fyLabel,
  };
}
