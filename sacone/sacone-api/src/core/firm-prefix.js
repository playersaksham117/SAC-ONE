const SKIP_WORDS = new Set(['and', 'the', 'of', 'for', 'a', 'an', '&']);

/**
 * Generate firm initials from business name.
 * Sarthi Enterprises → SE, SACONE Technologies India → STI
 */
export function generateFirmPrefix(businessName) {
  if (!businessName || !String(businessName).trim()) return 'CO';
  const words = String(businessName)
    .trim()
    .split(/[\s\-_/]+/)
    .filter(Boolean);
  const significant = words.filter((w) => !SKIP_WORDS.has(w.toLowerCase()));
  const source = significant.length ? significant : words;
  const letters = source.map((w) => w.replace(/[^a-zA-Z0-9]/g, '').charAt(0)).filter(Boolean);
  if (!letters.length) return 'CO';
  return letters.join('').toUpperCase().slice(0, 6);
}
