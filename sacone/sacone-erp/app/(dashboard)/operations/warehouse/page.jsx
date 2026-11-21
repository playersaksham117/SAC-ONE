import LegacyRedirect from '../../../../components/LegacyRedirect';

/** Warehouse now lives in Inventory & Warehouse. */
export default function Page() {
  return <LegacyRedirect target="/operations/inventory?view=warehouse" />;
}
