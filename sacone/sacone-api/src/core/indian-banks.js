/**
 * Indian banks with their IFSC bank codes (the first 4 letters of every IFSC of that bank).
 * Used offline to fill the bank name from an IFSC and for the bank-name list.
 */
export const INDIAN_BANKS = [
  // Public sector
  { code: 'SBIN', name: 'State Bank of India' },
  { code: 'PUNB', name: 'Punjab National Bank' },
  { code: 'BARB', name: 'Bank of Baroda' },
  { code: 'CNRB', name: 'Canara Bank' },
  { code: 'UBIN', name: 'Union Bank of India' },
  { code: 'BKID', name: 'Bank of India' },
  { code: 'IDIB', name: 'Indian Bank' },
  { code: 'CBIN', name: 'Central Bank of India' },
  { code: 'IOBA', name: 'Indian Overseas Bank' },
  { code: 'UCBA', name: 'UCO Bank' },
  { code: 'MAHB', name: 'Bank of Maharashtra' },
  { code: 'PSIB', name: 'Punjab & Sind Bank' },
  // Private sector
  { code: 'HDFC', name: 'HDFC Bank' },
  { code: 'ICIC', name: 'ICICI Bank' },
  { code: 'UTIB', name: 'Axis Bank' },
  { code: 'KKBK', name: 'Kotak Mahindra Bank' },
  { code: 'INDB', name: 'IndusInd Bank' },
  { code: 'YESB', name: 'Yes Bank' },
  { code: 'IDFB', name: 'IDFC FIRST Bank' },
  { code: 'IBKL', name: 'IDBI Bank' },
  { code: 'FDRL', name: 'Federal Bank' },
  { code: 'RATN', name: 'RBL Bank' },
  { code: 'BDBL', name: 'Bandhan Bank' },
  { code: 'DCBL', name: 'DCB Bank' },
  { code: 'KARB', name: 'Karnataka Bank' },
  { code: 'KVBL', name: 'Karur Vysya Bank' },
  { code: 'SIBL', name: 'South Indian Bank' },
  { code: 'CIUB', name: 'City Union Bank' },
  { code: 'TMBL', name: 'Tamilnad Mercantile Bank' },
  { code: 'JAKA', name: 'Jammu & Kashmir Bank' },
  { code: 'CSBK', name: 'CSB Bank' },
  { code: 'DLXB', name: 'Dhanlaxmi Bank' },
  { code: 'NTBL', name: 'Nainital Bank' },
  // Small finance banks
  { code: 'AUBL', name: 'AU Small Finance Bank' },
  { code: 'ESFB', name: 'Equitas Small Finance Bank' },
  { code: 'UJVN', name: 'Ujjivan Small Finance Bank' },
  { code: 'JSFB', name: 'Jana Small Finance Bank' },
  { code: 'SURY', name: 'Suryoday Small Finance Bank' },
  { code: 'UTKS', name: 'Utkarsh Small Finance Bank' },
  { code: 'ESMF', name: 'ESAF Small Finance Bank' },
  // Payments banks
  { code: 'AIRP', name: 'Airtel Payments Bank' },
  { code: 'IPOS', name: 'India Post Payments Bank' },
  { code: 'FINO', name: 'Fino Payments Bank' },
  // Foreign banks
  { code: 'SCBL', name: 'Standard Chartered Bank' },
  { code: 'CITI', name: 'Citibank' },
  { code: 'HSBC', name: 'HSBC' },
  { code: 'DBSS', name: 'DBS Bank India' },
  { code: 'DEUT', name: 'Deutsche Bank' },
  // Co-operative banks
  { code: 'SRCB', name: 'Saraswat Co-operative Bank' },
  { code: 'COSB', name: 'Cosmos Co-operative Bank' },
  { code: 'SVCB', name: 'SVC Co-operative Bank' },
  { code: 'KCCB', name: 'Kalupur Commercial Co-operative Bank' },
  { code: 'ABHY', name: 'Abhyudaya Co-operative Bank' },
];

const BY_CODE = new Map(INDIAN_BANKS.map((b) => [b.code, b.name]));

export const IFSC_PATTERN = /^[A-Z]{4}0[A-Z0-9]{6}$/;

/** Bank name for an IFSC (by its first 4 letters), or null when the bank code is not listed. */
export function bankForIfsc(ifsc) {
  return BY_CODE.get(String(ifsc || '').slice(0, 4).toUpperCase()) || null;
}
