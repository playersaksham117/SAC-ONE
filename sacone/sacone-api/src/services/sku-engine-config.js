/**
 * Default product-family keyword → code mappings.
 * DB overrides (product_family_codes) take precedence when matched.
 */
export const DEFAULT_FAMILY_CODES = [
  { keywords: ['LED BULB', 'LED BULBS'], code: 'LE', priority: 100 },
  { keywords: ['CEILING FAN'], code: 'CF', priority: 90 },
  { keywords: ['EXHAUST FAN'], code: 'EF', priority: 90 },
  { keywords: ['COPPER CABLE'], code: 'COP', priority: 95 },
  { keywords: ['AC COMPRESSOR'], code: 'AC', priority: 95 },
  { keywords: ['MCB'], code: 'MC', priority: 80 },
  { keywords: ['CONTACTOR'], code: 'CT', priority: 70 },
  { keywords: ['THERMOSTAT'], code: 'TH', priority: 70 },
  { keywords: ['COMPRESSOR'], code: 'COM', priority: 60 },
];

/** Known brand name → preferred SKU code (used when brand.code is empty). */
export const KNOWN_BRAND_CODES = {
  HALONIX: 'HAL',
  SCHNEIDER: 'SCH',
  POLYCAB: 'POL',
  HAVELLS: 'HAV',
  PHILIPS: 'PHI',
  LG: 'LG',
  SIEMENS: 'SIE',
  ANCHOR: 'ANC',
  CROMPTON: 'CRO',
  BAJAJ: 'BAJ',
  ORIENT: 'ORI',
  SYSKA: 'SYS',
  WIPRO: 'WIP',
};

/**
 * Descriptor extraction rules — evaluated in order.
 * Each rule may push a token and optionally mutate working text.
 */
export const DESCRIPTOR_RULES = [
  {
    id: 'warm_white',
    test: (t) => /\bWARM\s+WHITE\b/i.test(t),
    extract: () => 'WW',
    consume: (t) => t.replace(/\bWARM\s+WHITE\b/gi, ' '),
  },
  {
    id: 'watt_base',
    test: (t) => /\b(\d+\.?\d*)\s*W\b/i.test(t) && /\b(B\d+)\b/i.test(t),
    extract: (t) => {
      const w = t.match(/\b(\d+\.?\d*)\s*W\b/i);
      const b = t.match(/\b(B\d+)\b/i);
      return `${w[1]}${b[1]}`;
    },
    consume: (t) => t.replace(/\b(\d+\.?\d*)\s*W\b/gi, ' ').replace(/\bB\d+\b/gi, ' '),
  },
  {
    id: 'white',
    test: (t) => /\bWHITE\b/i.test(t),
    extract: () => 'WH',
    consume: (t) => t.replace(/\bWHITE\b/gi, ' '),
  },
  {
    id: 'wattage',
    test: (t) => /\b(\d+\.?\d*)\s*W\b/i.test(t),
    extract: (t) => {
      const m = t.match(/\b(\d+\.?\d*)\s*W\b/i);
      return `${m[1]}W`;
    },
    consume: (t) => t.replace(/\b(\d+\.?\d*)\s*W\b/gi, ' '),
  },
  {
    id: 'tonnage',
    test: (t) => /\b(\d+\.?\d*)\s*TON\b/i.test(t),
    extract: (t) => {
      const m = t.match(/\b(\d+\.?\d*)\s*TON\b/i);
      return `${m[1]}T`;
    },
    consume: (t) => t.replace(/\b(\d+\.?\d*)\s*TON\b/gi, ' '),
  },
  {
    id: 'refrigerant',
    test: (t) => /\b(R\d+[A-Z]?)\b/i.test(t),
    extract: (t) => t.match(/\b(R\d+[A-Z]?)\b/i)[1].toUpperCase(),
    consume: (t) => t.replace(/\bR\d+[A-Z]?\b/gi, ' '),
  },
  {
    id: 'sqmm',
    test: (t) => /\b(\d+\.?\d*)\s*SQMM\b/i.test(t),
    extract: (t) => t.match(/\b(\d+\.?\d*)\s*SQMM\b/i)[1],
    consume: (t) => t.replace(/\b(\d+\.?\d*)\s*SQMM\b/gi, ' '),
  },
  {
    id: 'core',
    test: (t) => /\b(\d+)\s*CORE\b/i.test(t),
    extract: (t) => `${t.match(/\b(\d+)\s*CORE\b/i)[1]}C`,
    consume: (t) => t.replace(/\b(\d+)\s*CORE\b/gi, ' '),
  },
  {
    id: 'length_m',
    test: (t) => /\b(\d+\.?\d*)\s*M\b/i.test(t),
    extract: (t) => t.match(/\b(\d+\.?\d*)\s*M\b/i)[1],
    consume: (t) => t.replace(/\b(\d+\.?\d*)\s*M\b/gi, ' '),
  },
  {
    id: 'current',
    test: (t) => /\b(\d+\.?\d*)\s*A\b/i.test(t),
    extract: (t) => `${t.match(/\b(\d+\.?\d*)\s*A\b/i)[1]}A`,
    consume: (t) => t.replace(/\b(\d+\.?\d*)\s*A\b/gi, ' '),
  },
  {
    id: 'pole',
    test: (t) => /\b(\d+)\s*POLE\b/i.test(t),
    extract: (t) => `${t.match(/\b(\d+)\s*POLE\b/i)[1]}P`,
    consume: (t) => t.replace(/\b(\d+)\s*POLE\b/gi, ' '),
  },
  {
    id: 'curve',
    test: (t) => /\b([A-Z])\s+CURVE\b/i.test(t),
    extract: (t) => t.match(/\b([A-Z])\s+CURVE\b/i)[1].toUpperCase(),
    consume: (t) => t.replace(/\b[A-Z]\s+CURVE\b/gi, ' '),
  },
  {
    id: 'hp',
    test: (t) => /\b(\d+\.?\d*)\s*HP\b/i.test(t),
    extract: (t) => `${t.match(/\b(\d+\.?\d*)\s*HP\b/i)[1]}HP`,
    consume: (t) => t.replace(/\b(\d+\.?\d*)\s*HP\b/gi, ' '),
  },
  {
    id: 'rpm',
    test: (t) => /\b(\d+)\s*RPM\b/i.test(t),
    extract: (t) => `${t.match(/\b(\d+)\s*RPM\b/i)[1]}RPM`,
    consume: (t) => t.replace(/\b(\d+)\s*RPM\b/gi, ' '),
  },
  {
    id: 'series_named',
    test: (t) => /\b([A-Z][A-Z0-9]{2,})\s+SERIES\b/i.test(t),
    extract: (t) => t.match(/\b([A-Z][A-Z0-9]{2,})\s+SERIES\b/i)[1].slice(0, 3).toUpperCase(),
    consume: (t) => t.replace(/\b[A-Z][A-Z0-9]{2,}\s+SERIES\b/gi, ' '),
  },
  {
    id: 'series_astron',
    test: (t) => /\bASTRON\b/i.test(t),
    extract: () => 'AST',
    consume: (t) => t.replace(/\bASTRON\b/gi, ' '),
  },
  {
    id: 'voltage',
    test: (t) => /\b(\d+\.?\d*)\s*V\b/i.test(t),
    extract: (t) => `${t.match(/\b(\d+\.?\d*)\s*V\b/i)[1]}V`,
    consume: (t) => t.replace(/\b(\d+\.?\d*)\s*V\b/gi, ' '),
  },
  {
    id: 'phase',
    test: (t) => /\b(\d)\s*PH(?:ASE)?\b/i.test(t),
    extract: (t) => `${t.match(/\b(\d)\s*PH(?:ASE)?\b/i)[1]}PH`,
    consume: (t) => t.replace(/\b(\d)\s*PH(?:ASE)?\b/gi, ' '),
  },
];
