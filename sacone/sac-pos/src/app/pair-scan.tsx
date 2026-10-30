import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { Platform, Text, TextInput, View } from 'react-native';
import { pairingFromParams, parsePairingCode } from '../domain/pairing';
import { can } from '../domain/permissions';
import { connectWithPairing, switchTerminal, unsyncedOnPhone } from '../lib/pairing';
import { useDevice } from '../store/device';
import { useCurrentUser } from '../store/session';
import { syncNow } from '../sync/engine';
import { confirm } from '../ui/dialogs';
import { Badge, Banner, Button, Card, Empty, Header, Screen, colors, font, radius, space } from '../ui/components';
import { goBack } from '../lib/nav';

/**
 * Counter PCs (SAC-POS web) usually have no camera: type the server address and the device key
 * shown in SACONE ERP → POS Devices instead. Connects (or switches terminal) straight away, so the
 * key never goes into the page address or browser history.
 */
function TypedPairing() {
  const paired = useDevice((s) => Boolean(s.baseUrl && s.deviceKey));
  const info = useDevice((s) => s.info);
  const user = useCurrentUser();
  const mayRepair = can(user?.permissions, 'manageDevice');
  const [url, setUrl] = useState(useDevice.getState().baseUrl ?? '');
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const go = async () => {
    setError(null);
    let pairing;
    try {
      pairing = pairingFromParams({ k: key.trim(), u: url.trim() });
    } catch {
      setError('Enter the server address (e.g. http://192.168.1.4:4000) and the device key (sk_live_…) shown in SACONE ERP → POS Devices.');
      return;
    }
    if (paired) {
      if (!mayRepair) { setError('Only staff with "POS Devices – edit" can move this terminal. Ask a manager to sign in first.'); return; }
      const left = unsyncedOnPhone();
      const current = `${info?.device.name ?? 'this terminal'}${info?.company?.businessName ? ` (${info.company.businessName})` : ''}`;
      const ok = await confirm(
        'Switch terminal?',
        `It stops being ${current}. ${left.total ? `${left.total} record(s) are synced first. ` : ''}Bills, catalogue and staff sign-ins of ${current} are then removed from here (they stay in SACONE), and the new terminal's firm is loaded.`,
        'Switch',
        true,
      );
      if (!ok) return;
    }
    setBusy(true);
    try {
      if (paired) await switchTerminal(pairing);
      else await connectWithPairing(pairing);
      syncNow().catch(() => undefined);
      router.replace('/login');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const input = { height: 44, borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, paddingHorizontal: 10, color: colors.text, marginTop: 4 } as const;
  return (
    <Card style={{ gap: space.sm }}>
      <Text style={{ fontWeight: '800', color: colors.text }}>Type the server address and key</Text>
      <Text style={{ color: colors.textMuted, fontSize: font.xs }}>
        SACONE ERP → (choose the firm) → POS Devices &amp; Sync → the terminal → show key. Each firm needs its own terminal; this {Platform.OS === 'web' ? 'browser' : 'device'} shows that terminal&apos;s firm only.
      </Text>
      <Text style={{ fontSize: font.xs, color: colors.textMuted, fontWeight: '600' }}>Server address</Text>
      <TextInput value={url} onChangeText={setUrl} placeholder="http://192.168.1.4:4000" placeholderTextColor={colors.textFaint} autoCapitalize="none" autoCorrect={false} style={input} />
      <Text style={{ fontSize: font.xs, color: colors.textMuted, fontWeight: '600' }}>Device key</Text>
      <TextInput value={key} onChangeText={setKey} placeholder="sk_live_…" placeholderTextColor={colors.textFaint} autoCapitalize="none" autoCorrect={false} secureTextEntry style={input} />
      {error ? <Banner tone="danger" title="Not connected" messages={[error]} /> : null}
      <Button title={paired ? 'Switch to this terminal' : 'Connect'} icon="link-outline" onPress={go} loading={busy} disabled={!url.trim() || !key.trim()} />
    </Card>
  );
}

/** Scan the pairing QR shown in SACONE ERP → POS Devices, then confirm on the Connect screen. */
export default function PairScan() {
  const [permission, requestPermission] = useCameraPermissions();
  const [problem, setProblem] = useState<string | null>(null);
  const [typing, setTyping] = useState(false);
  const done = useRef(false);
  const cooldown = useRef(0);

  const onScan = ({ data }: { data: string }) => {
    if (done.current) return;
    const now = Date.now();
    if (now < cooldown.current) return;
    cooldown.current = now + 1500;
    try {
      const p = parsePairingCode(data);
      done.current = true;
      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
      router.replace({ pathname: '/connect', params: { k: p.key, u: p.urls.join(','), n: p.deviceName ?? '', f: p.firm ?? '' } });
    } catch (e) {
      setProblem((e as Error).message);
    }
  };

  // SAC-POS web (counter PCs, usually no camera): type it in. Checked before the camera
  // permission, which keeps changing on the web and would reset what is typed.
  if (Platform.OS === 'web') {
    return (
      <Screen scroll>
        <Header title="Connect to a terminal" onBack={() => goBack()} />
        <View style={{ paddingHorizontal: space.lg, gap: space.md }}>
          <TypedPairing />
        </View>
      </Screen>
    );
  }
  if (typing) {
    return (
      <Screen scroll>
        <Header title="Connect to a terminal" onBack={() => setTyping(false)} />
        <View style={{ paddingHorizontal: space.lg, gap: space.md }}>
          <TypedPairing />
        </View>
      </Screen>
    );
  }
  if (!permission) return <Screen><Header title="Scan connection QR" onBack={() => goBack()} /></Screen>;
  // Phones without camera access: allow it, or type it in.
  if (!permission.granted) {
    return (
      <Screen scroll>
        <Header title="Scan connection QR" onBack={() => goBack()} />
        <View style={{ paddingHorizontal: space.lg, gap: space.md }}>
          <Empty
            icon="camera-outline"
            title="Camera access needed"
            message="Allow the camera to scan the QR code shown in SACONE ERP, or type the address and key below."
            action={<Button title="Allow camera" onPress={requestPermission} />}
          />
          <TypedPairing />
        </View>
      </Screen>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      <CameraView
        style={{ flex: 1 }}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        onBarcodeScanned={onScan}
      />
      <View style={{ position: 'absolute', top: '25%', left: '15%', right: '15%', aspectRatio: 1, borderWidth: 3, borderColor: '#fff', borderRadius: 24, opacity: 0.85 }} />
      <View style={{ position: 'absolute', left: space.lg, right: space.lg, bottom: 40, gap: space.md, alignItems: 'center' }}>
        {problem
          ? <Badge tone="danger" label={problem} />
          : <Text style={{ color: '#fff', textAlign: 'center', fontSize: font.md }}>Point at the QR code in SACONE ERP → POS Devices</Text>}
      </View>
      <View style={{ position: 'absolute', top: 50, left: space.lg, right: space.lg, flexDirection: 'row', justifyContent: 'space-between' }}>
        <Button title="Close" size="sm" variant="secondary" onPress={() => goBack()} />
        <Button title="Type key instead" size="sm" variant="secondary" icon="create-outline" onPress={() => setTyping(true)} />
      </View>
    </View>
  );
}
