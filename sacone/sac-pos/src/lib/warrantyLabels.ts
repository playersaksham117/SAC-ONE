import type { Sale } from '../domain/types';
import { periodEnd } from '../domain/warranty';
import { LABEL_SIZES, warrantyLabelsHtml, warrantyUnits, type WarrantyResultLike, type WarrantyUnit } from './labels';
import { printDocument } from './printDocument';
import { billNumber } from './receipt';

const PT_PER_MM = 72 / 25.4;

/** Print warranty stickers at a label size (rolls one per page, sheets on A4). */
export async function printWarrantyLabels(units: WarrantyUnit[], sizeKey: string): Promise<void> {
  if (!units.length) throw new Error('Nothing to label: no items with a warranty, guarantee or serial number (or all returned).');
  const s = LABEL_SIZES.find((x) => x.value === sizeKey) ?? LABEL_SIZES[0];
  const page = s.cols ? { width: 595, height: 842 } : { width: Math.round(s.w * PT_PER_MM), height: Math.round(s.h * PT_PER_MM) };
  await printDocument({ html: warrantyLabelsHtml(units, { size: s.value }), ...page, margins: { left: 0, top: 0, right: 0, bottom: 0 } });
}

/**
 * A bill made on this device, as a Warranty Check result: the lines with a warranty, a guarantee
 * or serial numbers, their end dates from the bill date. Works before the bill has synced.
 */
export function saleAsWarrantyResult(sale: Sale, { branch, deviceCode }: { branch?: string | null; deviceCode?: string } = {}): WarrantyResultLike {
  const end = (p: Parameters<typeof periodEnd>[1]) => {
    const till = periodEnd(sale.createdAt, p);
    return till ? { till } : null;
  };
  return {
    invoiceNumber: billNumber(sale, deviceCode),
    date: sale.createdAt,
    branch: branch ?? null,
    lines: sale.totals.lines
      .filter((l) => l.itemType !== 'service' && (l.warranty || l.guarantee || l.serialNumbers?.length))
      .map((l) => ({
        productName: l.name,
        quantity: l.quantity,
        quantityReturned: sale.returned[l.productId] || 0,
        serials: l.serialNumbers ?? [],
        warranty: end(l.warranty),
        guarantee: end(l.guarantee),
      })),
  };
}

/** Warranty stickers for a bill made here. */
export function saleWarrantyUnits(sale: Sale, opts: { shop: string; branch?: string | null; deviceCode?: string }): WarrantyUnit[] {
  return warrantyUnits(saleAsWarrantyResult(sale, opts), { shop: opts.shop, branch: opts.branch ?? '' });
}
