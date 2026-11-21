import LegacyRedirect from '../../../../components/LegacyRedirect';

/** Credit & Debit Notes now live in POS Billing, Sync & Notes. */
export default function Page() {
  return <LegacyRedirect target="/operations/pos?view=notes" />;
}
