import { router } from 'expo-router';
import { useState } from 'react';
import { Text } from 'react-native';
import { isValidPin } from '../domain/validation';
import { useCurrentUser, useSession } from '../store/session';
import { PinPad } from '../ui/PinPad';
import { Banner, Card, Screen, colors, font, space } from '../ui/components';

export default function SetPin() {
  const user = useCurrentUser();
  const setPin = useSession((s) => s.setPin);
  const [first, setFirst] = useState<string | null>(null);
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    if (!first) {
      if (!isValidPin(value)) { setError('Use 4–6 digits. Avoid 1234, 0000 or repeated digits.'); setValue(''); return; }
      setFirst(value);
      setValue('');
      return;
    }
    if (value !== first) { setError('PINs do not match — try again'); setFirst(null); setValue(''); return; }
    try {
      await setPin(value);
      router.replace('/');
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <Screen scroll>
      <Text style={{ fontSize: font.xxl, fontWeight: '800', color: colors.text, marginTop: space.xl }}>Set your PIN</Text>
      <Text style={{ color: colors.textMuted, marginTop: 4, marginBottom: space.lg }}>
        Hi {user?.name}. Use this PIN to unlock SAC-POS quickly — it works offline for up to 7 days.
      </Text>
      {error ? <Banner tone="danger" messages={[error]} /> : null}
      <Card>
        <Text style={{ textAlign: 'center', fontWeight: '700', color: colors.text }}>{first ? 'Confirm PIN' : 'Choose a 4–6 digit PIN'}</Text>
        <PinPad value={value} onChange={setValue} onSubmit={submit} />
      </Card>
    </Screen>
  );
}
