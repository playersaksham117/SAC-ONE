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

/**
 * Staff sign-in: Login ID (or email) + the PIN their admin set in SACONE ERP → Users.
 * Someone who signed in on this phone before can unlock with the PIN alone, even offline.
 */
export default function Login() {
  const profiles = useSession((s) => s.profiles);
  const { loginWithPin, unlock } = useSession.getState();
  const info = useDevice((s) => s.info);
  const list = useMemo(() => Object.values(profiles).filter((p) => p.pinHash), [profiles]);

  const [mode, setMode] = useState<'pick' | 'unlock' | 'signin'>(list.length ? 'pick' : 'signin');
  const [selected, setSelected] = useState<Profile | null>(null);
  const [identifier, setIdentifier] = useState('');
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const signIn = (who: string) => {
    setIdentifier(who);
    setPin('');
    setMode('signin');
  };

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
      if (code === 'PIN_LOCKED' || code === 'GRACE_EXPIRED' || code === 'NO_PIN' || code === 'PIN_CHANGED') signIn(selected.email);
    } finally {
      setBusy(false);
    }
  };

  const doSignIn = async (value = pin) => {
    if (value.length < 4 || busy) return;
    setBusy(true);
    setError(null);
    try {
      await loginWithPin(identifier, value);
      setPin('');
      syncNow().catch(() => undefined);
      router.replace('/');
    } catch (e) {
      setError((e as Error).message);
      setPin('');
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
            <Card key={p.userId} style={{ marginBottom: space.sm }} onPress={() => { setSelected(p); setPin(''); setError(null); setMode('unlock'); }}>
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
          <Button title="Someone else: sign in with Login ID" variant="secondary" icon="log-in-outline" onPress={() => { setError(null); signIn(''); }} style={{ marginTop: space.md }} />
        </>
      )}

      {mode === 'unlock' && selected && (
        <Card>
          <Row style={{ justifyContent: 'center' }}>
            <Avatar name={selected.name} size={52} />
          </Row>
          <Text style={{ textAlign: 'center', fontSize: font.lg, fontWeight: '700', marginTop: space.sm, color: colors.text }}>{selected.name}</Text>
          <Text style={{ textAlign: 'center', color: colors.textMuted }}>Enter your PIN</Text>
          <PinPad value={pin} onChange={(v) => { setPin(v); if (v.length === 6) doUnlock(v); }} onSubmit={() => doUnlock()} />
          <Row style={{ justifyContent: 'flex-start', marginTop: space.lg }}>
            <Button title="Back" variant="ghost" onPress={() => setMode('pick')} size="sm" loading={busy} />
          </Row>
        </Card>
      )}

      {mode === 'signin' && (
        <Card>
          <Text style={{ fontSize: font.lg, fontWeight: '700', color: colors.text, marginBottom: space.md }}>Sign in</Text>
          <Field label="Login ID or email" value={identifier} onChangeText={setIdentifier} autoCapitalize="none" autoCorrect={false} placeholder="e.g. 1001 or you@business.com" testID="login-id" />
          <Text style={{ color: colors.textMuted, textAlign: 'center' }}>PIN</Text>
          <PinPad value={pin} onChange={setPin} onSubmit={() => doSignIn()} />
          <Button title="Sign in" icon="log-in-outline" onPress={() => doSignIn()} loading={busy} disabled={!identifier.trim() || pin.length < 4} size="lg" style={{ marginTop: space.md }} testID="login-submit" />
          <Text style={{ color: colors.textFaint, fontSize: font.xs, marginTop: space.md }}>
            Your Login ID and PIN are set by your admin in SACONE ERP (Users → Edit → SAC-POS sign-in). The PIN cannot be set or changed on this phone. Signing in needs a connection; afterwards your PIN also unlocks the phone offline.
          </Text>
          {list.length ? <Button title="Back to staff list" variant="ghost" onPress={() => setMode('pick')} style={{ marginTop: space.sm }} /> : null}
        </Card>
      )}

      <Button title="Device settings" variant="ghost" icon="settings-outline" onPress={() => router.push('/setup')} style={{ marginTop: space.xl }} size="sm" />
    </Screen>
  );
}
