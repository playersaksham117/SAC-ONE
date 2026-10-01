import { useMemo } from 'react';
import { calculateCart } from '../domain/tax';
import { gstinStateCode } from '../domain/validation';
import { useCart } from '../store/cart';
import { useCatalog } from '../store/catalog';
import { useDevice } from '../store/device';

/** Reactive cart totals (recomputed when lines, discount, customer or company change). */
export function useCartTotals() {
  const lines = useCart((s) => s.lines);
  const invoiceDiscount = useCart((s) => s.invoiceDiscount);
  const customerId = useCart((s) => s.customerId);
  const customer = useCatalog((s) => (customerId ? s.customers[customerId] ?? null : null));
  const company = useDevice((s) => s.info?.company);
  const totals = useMemo(
    () => calculateCart(lines, invoiceDiscount, {
      companyStateCode: company?.gstStateCode ?? gstinStateCode(company?.gstNumber),
      customerStateCode: customer?.gstStateCode ?? gstinStateCode(customer?.gstin),
    }),
    [lines, invoiceDiscount, customer, company],
  );
  return { totals, customer, lines, invoiceDiscount };
}
