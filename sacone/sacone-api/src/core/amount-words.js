const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
  'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

function twoDigits(n) {
  if (n < 20) return ONES[n];
  return `${TENS[Math.floor(n / 10)]}${n % 10 ? ` ${ONES[n % 10]}` : ''}`.trim();
}

function threeDigits(n) {
  if (n < 100) return twoDigits(n);
  return `${ONES[Math.floor(n / 100)]} Hundred${n % 100 ? ` ${twoDigits(n % 100)}` : ''}`.trim();
}

function indianGroup(n) {
  if (n < 1000) return threeDigits(n);
  if (n < 100000) {
    return `${twoDigits(Math.floor(n / 1000))} Thousand${n % 1000 ? ` ${threeDigits(n % 1000)}` : ''}`.trim();
  }
  if (n < 10000000) {
    return `${twoDigits(Math.floor(n / 100000))} Lakh${n % 100000 ? ` ${indianGroup(n % 100000)}` : ''}`.trim();
  }
  return `${twoDigits(Math.floor(n / 10000000))} Crore${n % 10000000 ? ` ${indianGroup(n % 10000000)}` : ''}`.trim();
}

export function amountInWords(amount) {
  const n = Math.round(Number(amount || 0) * 100) / 100;
  if (!Number.isFinite(n)) return '';
  const rupees = Math.floor(n);
  const paise = Math.round((n - rupees) * 100);
  let words = rupees === 0 ? 'Zero' : indianGroup(rupees);
  words = `${words} Rupees`;
  if (paise > 0) words += ` and ${twoDigits(paise)} Paise`;
  return `${words} Only`;
}
