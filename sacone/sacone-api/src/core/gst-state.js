/**
 * A party's GST state code: the one saved on it, else the first two digits of its GSTIN.
 * Decides CGST + SGST (same state) vs IGST (another state): a customer in Chandigarh (04) billed
 * from Punjab (03) is IGST even if only the GSTIN was filled in.
 */
export function stateCodeOf(party) {
  const saved = String(party?.gstStateCode ?? '').trim();
  if (/^\d{2}$/.test(saved)) return saved;
  const gstin = String(party?.gstNumber ?? party?.gstin ?? '').trim();
  return /^\d{2}[A-Z0-9]{13}$/i.test(gstin) ? gstin.slice(0, 2) : (saved || null);
}
