import LegacyRedirect from '../../../../components/LegacyRedirect';

/** POS Devices & Sync now lives in POS Billing, Sync & Notes. */
export default function Page() {
  return <LegacyRedirect target="/operations/pos?view=sync" />;
}
