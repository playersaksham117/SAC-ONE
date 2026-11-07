import { router } from 'expo-router';
import { useState } from 'react';
import { Platform, Pressable, Text, TextInput } from 'react-native';
import { cleanPairingCode, pairingFromParams } from '../domain/pairing';
import { can } from '../domain/permissions';
import { connectWithPairing, reconnectWithCode, switchTerminal, unsyncedOnPhone } from '../lib/pairing';
import { serverUrlCandidates } from '../lib/serverDiscovery';
import { useDevice } from '../store/device';
import { useCurrentUser } from '../store/session';
import { syncNow, useSyncStatus } from '../sync/engine';
import { confirm } from './dialogs';
import { Banner, Button, Card, colors, font, radius, space } from './components';

/**
 * Connect this device to a terminal by typing: the server address and the 8-character pairing
 * code from SACONE ERP → POS Devices → Connect a device (or, under "Use device key", the long
 * key). Covers a first connection, reconnecting after the terminal's key changed (keeps the
 * bills here), and moving to another terminal (manager, everything synced first).
 */
export function ConnectForm({ title = 'Connect with a pairing code' }: { title?: string }) {
  const paired = useDevice((s) => Boolean(s.baseUrl && s.deviceKey));
  const info = useDevice((s) => s.info);
  const keyRejected = useSyncStatus((s) => Boolean(s.keyRejected));
  const user = useCurrentUser();
  const mayRepair = can(user?.permissions, 'manageDevice');
  const [url, setUrl] = useState(useDevice.getState().baseUrl ?? (serverUrlCandidates(null)[0] || 'http://'));
  const [mode, setMode] = useState<'code' | 'key'>('code');
  const [code, setCode] = useState('');
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const go = async () => {
    setError(null);
    const cleanCode = cleanPairingCode(code);
    let pairing;
    try {
      pairing = mode === 'code'
        ? pairingFromParams({ c: cleanCode ?? '', u: url.trim() })
        : pairingFromParams({ k: key.trim(), u: url.trim() });
    } catch {
      setError(mode === 'code'
        ? 'Enter the server address (e.g. http://192.168.1.4:4000) and the 8-character pairing code shown in SACONE ERP → POS Devices → Connect a device.'
        : 'Enter the server address (e.g. http://192.168.1.4:4000) and the device key (sk_live_…).');
      return;
    }
    // Already connected: a pairing code is made in the ERP by staff allowed to connect devices, so it
    // needs no sign-in here. A code for this same terminal reconnects keeping the bills; one for
    // another terminal switches (only once everything here has synced). A typed key needs a manager.
    const reconnecting = paired && mode === 'code';
    if (paired && !reconnecting && !mayRepair) {
      setError('Moving this device with a device key needs a manager signed in. Use a pairing code instead (ERP → POS Devices & Sync → the terminal → Connect a device).');
      return;
    }
    if (paired && !keyRejected) {
      const left = unsyncedOnPhone();
      const current = `${info?.device.name ?? 'this terminal'}${info?.company?.businessName ? ` (${info.company.businessName})` : ''}`;
      const ok = await confirm(
        'Connect with this code?',
        `If the code is for ${current}, the phone reconnects and keeps everything. If it is for another terminal, the phone stops being ${current}: ${left.total ? `${left.total} record(s) are synced first, then ` : ''}bills, catalogue and staff sign-ins of ${current} are removed from here (they stay in SACONE) and the new terminal's firm is loaded.`,
        'Connect',
        true,
      );
      if (!ok) return;
    }
    setBusy(true);
    try {
      if (reconnecting) {
        const how = await reconnectWithCode(url.trim(), cleanCode ?? '');
        router.replace(how === 'same' ? '/' : '/login');
        return;
      }
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

  const input = { height: 48, borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, paddingHorizontal: 12, color: colors.text, marginTop: 4, fontSize: font.md } as const;
  return (
    <Card style={{ gap: space.sm }}>
      <Text style={{ fontWeight: '800', color: colors.text, fontSize: font.md }}>{title}</Text>
      <Text style={{ color: colors.textMuted, fontSize: font.xs }}>
        In SACONE ERP: choose the firm → POS Devices &amp; Sync → the terminal → Connect a device. Each firm has its own terminal; this {Platform.OS === 'web' ? 'browser' : 'device'} shows that terminal&apos;s firm only.
      </Text>
      <Text style={{ fontSize: font.xs, color: colors.textMuted, fontWeight: '600' }}>Server address</Text>
      <TextInput value={url} onChangeText={setUrl} placeholder="http://192.168.1.4:4000" placeholderTextColor={colors.textFaint} autoCapitalize="none" autoCorrect={false} keyboardType="url" style={input} testID="connect-url" />
      {mode === 'code' ? (
        <>
          <Text style={{ fontSize: font.xs, color: colors.textMuted, fontWeight: '600' }}>Pairing code</Text>
          <TextInput
            value={code}
            onChangeText={(t) => setCode(t.toUpperCase())}
            placeholder="K7QM-3XPD"
            placeholderTextColor={colors.textFaint}
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={9}
            onSubmitEditing={go}
            style={[input, { letterSpacing: 4, fontWeight: '800', fontSize: font.xl, textAlign: 'center' }]}
            testID="connect-code"
          />
        </>
      ) : (
        <>
          <Text style={{ fontSize: font.xs, color: colors.textMuted, fontWeight: '600' }}>Device key</Text>
          <TextInput value={key} onChangeText={setKey} placeholder="sk_live_…" placeholderTextColor={colors.textFaint} autoCapitalize="none" autoCorrect={false} secureTextEntry style={input} testID="connect-key" />
        </>
      )}
      {error ? <Banner tone="danger" title="Not connected" messages={[error]} /> : null}
      <Button
        title={paired && mode === 'key' ? 'Switch to this terminal' : 'Connect'}
        icon="link-outline"
        size="lg"
        onPress={go}
        loading={busy}
        disabled={!url.trim() || (mode === 'code' ? !cleanPairingCode(code) : !key.trim())}
        testID="connect-go"
      />
      <Pressable onPress={() => { setMode(mode === 'code' ? 'key' : 'code'); setError(null); }} hitSlop={8}>
        <Text style={{ color: colors.primary, fontSize: font.xs, fontWeight: '700', textAlign: 'center', marginTop: 4 }}>
          {mode === 'code' ? 'Use the device key instead (advanced)' : 'Use a pairing code instead'}
        </Text>
      </Pressable>
    </Card>
  );
}

/** Shown when the server refused this device's key: what happened and how to fix it. */
export function ReconnectBanner() {
  const keyRejected = useSyncStatus((s) => Boolean(s.keyRejected));
  const name = useDevice((s) => s.info?.device.name);
  if (!keyRejected) return null;
  return (
    <Banner
      tone="danger"
      title="This device is not connected"
      messages={[
        `${name ? `Terminal ${name}` : 'Its terminal'} was connected to another device, had its key changed, or was switched off in SACONE ERP. Bills made here are kept and sync once it is reconnected.`,
        'Ask a manager: ERP → POS Devices & Sync → this terminal → Connect a device, then enter the code here.',
      ]}
      action={<Button title="Enter pairing code" icon="key-outline" size="sm" onPress={() => router.push('/pair-scan')} testID="reconnect" />}
    />
  );
}
