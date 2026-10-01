export const round2 = (n: number): number => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 });

export const formatMoney = (n: number): string => inr.format(round2(n || 0));

export const formatQty = (n: number): string =>
  Number.isInteger(n) ? String(n) : String(Math.round(n * 1000) / 1000);

export const sum = (values: number[]): number => round2(values.reduce((s, v) => s + (Number(v) || 0), 0));
