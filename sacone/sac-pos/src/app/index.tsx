import { Redirect } from 'expo-router';
import { can } from '../domain/permissions';
import { useDevice } from '../store/device';
import { useCurrentUser } from '../store/session';

/** Entry gate: pair device → unlock user → first screen the user's ERP role allows. */
export default function Index() {
  const paired = useDevice((s) => Boolean(s.baseUrl && s.deviceKey));
  const user = useCurrentUser();
  if (!paired) return <Redirect href="/setup" />;
  if (!user) return <Redirect href="/login" />;
  const p = user.permissions;
  if (can(p, 'sell')) return <Redirect href="/sell" />;
  if (can(p, 'viewSales')) return <Redirect href="/sales" />;
  if (can(p, 'viewCustomers')) return <Redirect href="/customers" />;
  if (can(p, 'viewStock')) return <Redirect href="/stock" />;
  return <Redirect href="/more" />;
}
