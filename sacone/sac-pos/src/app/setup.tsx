import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { serverUrlCandidates } from '../lib/serverDiscovery';
import { Text, View } from 'react-native';
import { useDevice } from '../store/device';
import { syncNow } from '../sync/engine';
import { Banner, Button, Card, Field, Screen, colors, font, space } from '../ui/components';

export default function Setup() {
  const connect = useDevice((s) => s.connect);
  const saved = useDevice((s) => s.baseUrl);
  // Suggest the PC that served this app (local-server mode runs the API there too).
  const [url, setUrl] = useState(saved ?? (serverUrlCandidates(null)[0] || 'http://'));
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await connect(url, key);
      syncNow().catch(() => undefined); // download catalogue while staff signs in
      router.replace('/login');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen scroll>
      <View style={{ alignItems: 'center', marginTop: space.xxl, marginBottom: space.xl }}>
        <View style={{ width: 72, height: 72, borderRadius: 22, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="storefront" size={36} color="#fff" />
        </View>
        <Text style={{ fontSize: font.hero, fontWeight: '800', color: colors.text, marginTop: space.md, letterSpacing: -1 }}>SAC-POS</Text>
        <Text style={{ color: colors.textMuted, marginTop: 4 }}>Connect this phone to SACONE ERP</Text>
      </View>

      <Card>
        <Banner
          tone="info"
          messages={['In SACONE ERP open Operations → POS Devices & Sync → Register device, then scan the QR code it shows.']}
        />
        <Button title="Scan QR from ERP" icon="qr-code" size="lg" onPress={() => router.push('/pair-scan')} testID="setup-scan" />
        <Text style={{ color: colors.textMuted, fontSize: font.xs, textAlign: 'center', marginVertical: space.sm }}>
          or type the server URL and the device key
        </Text>
        <Field
          label="Server URL"
          value={url}
          onChangeText={setUrl}
          placeholder="http://192.168.1.10:4000"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          testID="setup-url"
        />
        <Field
          label="Device sync key"
          value={key}
          onChangeText={setKey}
          placeholder="sk_live_…"
          autoCapitalize="none"
          autoCorrect={false}
          secureTextEntry
          testID="setup-key"
        />
        {error ? <Banner tone="danger" messages={[error]} /> : null}
        <Button title="Connect" icon="link" onPress={submit} loading={busy} size="lg" testID="setup-connect" />
      </Card>

      <Text style={{ color: colors.textFaint, fontSize: font.xs, textAlign: 'center', marginTop: space.lg }}>
        The key is stored in the phone's secure storage and bound to this device.
      </Text>
    </Screen>
  );
}
