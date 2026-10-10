import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { pairingFromParams, type Pairing } from '../domain/pairing';
import { can } from '../domain/permissions';
import { useCurrentUser } from '../store/session';
import { connectWithPairing, switchTerminal, unsyncedOnPhone } from '../lib/pairing';
import { confirm } from '../ui/dialogs';
import { useDevice } from '../store/device';
import { syncNow } from '../sync/engine';
import { Banner, Button, Card, Header, KeyValue, Screen, colors, font, space } from '../ui/components';

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/**
 * Confirm a pairing code before connecting. Opened by the in-app QR scanner, or straight from
 * the phone's camera app through the sacpos://connect link in the QR.
 */
export default function Connect() {
  const params = useLocalSearchParams<{ k?: string; u?: string; n?: string; f?: string }>();
  const paired = useDevice((s) => Boolean(s.baseUrl && s.deviceKey));
  const currentInfo = useDevice((s) => s.info);
  const user = useCurrentUser();
  // Same rule as More → Disconnect device: re-pairing needs "POS Devices – edit".
  const mayRepair = can(user?.permissions, 'manageDevice');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { pairing, invalid } = useMemo((): { pairing: Pairing | null; invalid: string | null } => {
    try {
      return {
        pairing: pairingFromParams({ k: first(params.k), u: first(params.u), n: first(params.n), f: first(params.f) }),
        invalid: null,
      };
    } catch (e) {
      return { pairing: null, invalid: (e as Error).message };
    }
  }, [params.k, params.u, params.n, params.f]);

  const connect = async () => {
    if (!pairing) return;
    setBusy(true);
    setError(null);
    try {
      await connectWithPairing(pairing);
      syncNow().catch(() => undefined); // download catalogue while staff signs in
      router.replace('/login');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const switchTo = async () => {
    if (!pairing) return;
    const current = `${currentInfo?.device.name ?? 'this terminal'}${currentInfo?.company?.businessName ? ` (${currentInfo.company.businessName})` : ''}`;
    const next = `${pairing.deviceName ?? 'the new terminal'}${pairing.firm ? ` (${pairing.firm})` : ''}`;
    const ok = await confirm(
      'Switch this phone?',
      `It stops being ${current} and becomes ${next}. Everything is synced first; bills, catalogue and staff sign-ins of ${current} are then removed from this phone (they stay in SACONE).`,
      'Switch',
      true,
    );
    if (!ok) return;
    setBusy(true);
    setError(null);
    try {
      await switchTerminal(pairing);
      syncNow().catch(() => undefined);
      router.replace('/login');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const back = () => (router.canGoBack() ? router.back() : router.replace('/'));
  const left = paired ? unsyncedOnPhone() : null;

  return (
    <Screen scroll>
      <Header title="Connect to SACONE" onBack={back} />
      <View style={{ alignItems: 'center', marginVertical: space.lg }}>
        <View style={{ width: 64, height: 64, borderRadius: 20, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="qr-code" size={32} color="#fff" />
        </View>
      </View>

      {invalid ? (
        <Card>
          <Banner tone="danger" messages={[invalid]} />
          <Button title="Scan again" icon="scan" onPress={() => router.replace('/pair-scan')} />
        </Card>
      ) : paired && pairing ? (
        // Already a terminal: switching is explicit, and only once everything has synced.
        <Card>
          <Banner
            tone="warning"
            title="This phone is already a terminal"
            messages={[
              `Now: ${currentInfo?.device.name ?? 'connected'}${currentInfo?.company?.businessName ? ` · ${currentInfo.company.businessName}` : ''}`,
              `QR: ${pairing.deviceName ?? 'new terminal'}${pairing.firm ? ` · ${pairing.firm}` : ''}`,
              ...(left?.total ? [`${left.total} record(s) on this phone are not synced yet; they will be synced first, and the switch waits until nothing is left.`] : []),
            ]}
          />
          {error ? <Banner tone="danger" messages={[error]} /> : null}
          {mayRepair ? (
            <Button
              title={`Switch to ${pairing.deviceName ?? 'this terminal'}`}
              icon="swap-horizontal"
              size="lg"
              onPress={switchTo}
              loading={busy}
              testID="pair-switch"
            />
          ) : (
            <Banner
              tone="info"
              messages={[user
                ? 'Only staff with "POS Devices – edit" can move this phone to another terminal. Ask a manager to sign in on this phone and scan again.'
                : 'Sign in on this phone as a manager (with "POS Devices – edit"), then use More → Connect to another terminal.']}
            />
          )}
          <Button title="Keep current terminal" variant="secondary" onPress={() => router.replace('/')} style={{ marginTop: space.sm }} />
        </Card>
      ) : pairing ? (
        <Card>
          <Text style={{ fontSize: font.lg, fontWeight: '800', color: colors.text, marginBottom: space.sm }}>
            {pairing.deviceName ? `Connect as “${pairing.deviceName}”?` : 'Connect this phone?'}
          </Text>
          {pairing.firm ? <KeyValue label="Firm" value={pairing.firm} /> : null}
          <KeyValue label={pairing.urls.length > 1 ? 'Server (tries in order)' : 'Server'} value={pairing.urls.join('\n')} muted />
          <Text style={{ color: colors.textMuted, fontSize: font.xs, marginVertical: space.sm }}>
            The key is stored in this phone’s secure storage and works only on this phone once connected.
          </Text>
          {error ? <Banner tone="danger" messages={[error]} /> : null}
          <Button title="Connect" icon="link" size="lg" onPress={connect} loading={busy} testID="pair-connect" />
        </Card>
      ) : null}
    </Screen>
  );
}
