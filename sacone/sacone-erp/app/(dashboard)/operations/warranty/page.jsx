import LegacyRedirect from '../../../../components/LegacyRedirect';

/** Warranty Check now lives in Sales & Warranty. */
export default function Page() {
  return <LegacyRedirect target="/operations/sales?view=warranty" />;
}
