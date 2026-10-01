import LegacyRedirect from '../../../../components/LegacyRedirect';

/** Cloud migration is server-side only (npm run cloud:export); see sacone-api/docs/CLOUD_LINK.md. */
export default function Page() {
  return <LegacyRedirect target="/dashboard" />;
}
