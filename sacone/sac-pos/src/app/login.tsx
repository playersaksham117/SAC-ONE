import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { useDevice } from '../store/device';
import { useSession, type Profile } from '../store/session';
import { syncNow } from '../sync/engine';
import { PinPad } from '../ui/PinPad';
import { Banner, Button, Card, Field, Row, Screen, colors, font, space } from '../ui/components';

function Avatar({ name, size = 44 }: { name: string; size?: number }) {
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: colors.primary, fontWeight: '800', fontSize: size / 2.4 }}>{name.slice(0, 1).toUpperCase()}</Text>
    </View>
  );
}

export default function Login() {
  const profiles = useSession((s) => s.profiles);
  const { loginOnline, unlock } = useSession.getState();
  const info = useDevice((s) => s.info);
  const list = useMemo(() => Object.values(profiles).filter((p) => p.pinHash), [profiles]);

  const [mode, setMode] = useState<'pick' | 'pin' | 'password'>(list.length ? 'pick' : 'password');
  const [selected, setSelected] = useState<Profile | null>(null);
  const [pin, setPin] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const doUnlock = async (value = pin) => {
    if (!selected || value.length < 4) return;
    setBusy(true);
    setError(null);
    try {
      await unlock(selected.userId, value);
      syncNow().catch(() => undefined);
      router.replace('/');
    } catch (e) {
      setError((e as Error).message);
      setPin('');
      const code = (e as { code?: string }).code;
      if (code === 'PIN_LOCKED' || code === 'GRACE_EXPIRED' || code === 'NO_PIN') {
        setEmail(selected.email);
        setMode('password');
      }
    } finally {
      setBusy(false);
    }
  };

  const doPassword = async () => {
    setBusy(true);
    setError(null);
    try {
      const { needsPin } = await loginOnline(email, password);
      setPassword('');
      syncNow().catch(() => undefined);
      router.replace(needsPin ? '/set-pin' : '/');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen scroll>
      <View style={{ marginTop: space.xl, marginBottom: space.lg }}>
        <Text style={{ fontSize: font.xxl, fontWeight: '800', color: colors.text }}>Welcome</Text>
        <Text style={{ color: colors.textMuted, marginTop: 4 }}>
          {info?.company?.businessName ?? 'SACONE'} · {info?.device.name ?? 'POS'} · {info?.warehouse?.name ?? ''}
        </Text>
      </View>

      {error ? <Banner tone="danger" messages={[error]} /> : null}

      {mode === 'pick' && (
        <>
          {list.map((p) => (
            <Card key={p.userId} style={{ marginBottom: space.sm }} onPress={() => { setSelected(p); setPin(''); setError(null); setMode('pin'); }}>
              <Row>
                <Avatar name={p.name} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: font.lg, fontWeight: '700', color: colors.text }}>{p.name}</Text>
                  <Text style={{ color: colors.textMuted, fontSize: font.sm }}>{p.roleName}</Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={colors.textFaint} />
              </Row>
            </Card>
          ))}
          <Button title="Sign in with ERP account" variant="secondary" icon="person-add-outline" onPress={() => { setError(null); setMode('password'); }} style={{ marginTop: space.md }} />
        </>
      )}

      {mode === 'pin' && selected && (
        <Card>
          <Row style={{ justifyContent: 'center' }}>
            <Avatar name={selected.name} size={52} />
          </Row>
          <Text style={{ textAlign: 'center', fontSize: font.lg, fontWeight: '700', marginTop: space.sm, color: colors.text }}>{selected.name}</Text>
          <Text style={{ textAlign: 'center', color: colors.textMuted }}>Enter your PIN</Text>
          <PinPad value={pin} onChange={(v) => { setPin(v); if (v.length === 6) doUnlock(v); }} onSubmit={() => doUnlock()} />
          <Row style={{ justifyContent: 'space-between', marginTop: space.lg }}>
            <Button title="Back" variant="ghost" onPress={() => setMode('pick')} size="sm" />
            <Button title="Use password" variant="ghost" onPress={() => { setEmail(selected.email); setMode('password'); }} size="sm" loading={busy} />
          </Row>
        </Card>
      )}

      {mode === 'password' && (
        <Card>
          <Text style={{ fontSize: font.lg, fontWeight: '700', color: colors.text, marginBottom: space.md }}>Sign in with your SACONE ERP account</Text>
          <Field label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoCorrect={false} placeholder="you@business.com" testID="login-email" />
          <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry placeholder="••••••••" onSubmitEditing={doPassword} testID="login-password" />
          <Button title="Sign in" icon="log-in-outline" onPress={doPassword} loading={busy} size="lg" testID="login-submit" />
          <Text style={{ color: colors.textFaint, fontSize: font.xs, marginTop: space.md }}>
            Your ERP role decides what you can do here. After the first sign-in you can unlock with a PIN, even offline.
          </Text>
          {list.length ? <Button title="Back to staff list" variant="ghost" onPress={() => setMode('pick')} style={{ marginTop: space.sm }} /> : null}
        </Card>
      )}

      <Button title="Device settings" variant="ghost" icon="settings-outline" onPress={() => router.push('/setup')} style={{ marginTop: space.xl }} size="sm" />
    </Screen>
  );
}
