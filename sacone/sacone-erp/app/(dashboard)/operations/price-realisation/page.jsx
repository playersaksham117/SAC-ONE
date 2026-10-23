import LegacyRedirect from '../../../../components/LegacyRedirect';

/** Sold Above Price now lives in Sales as a tab. */
export default function Page() {
  return <LegacyRedirect target="/operations/sales?tab=above" />;
}
