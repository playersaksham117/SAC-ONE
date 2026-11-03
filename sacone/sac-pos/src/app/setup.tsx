import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Text, View } from 'react-native';
import { ConnectForm } from '../ui/ConnectForm';
import { Banner, Button, Card, Screen, colors, font, space } from '../ui/components';

export default function Setup() {
  return (
    <Screen scroll>
      <View style={{ alignItems: 'center', marginTop: space.xxl, marginBottom: space.xl }}>
        <View style={{ width: 72, height: 72, borderRadius: 22, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="storefront" size={36} color="#fff" />
        </View>
        <Text style={{ fontSize: font.hero, fontWeight: '800', color: colors.text, marginTop: space.md, letterSpacing: -1 }}>SAC-POS</Text>
        <Text style={{ color: colors.textMuted, marginTop: 4 }}>Connect this device to SACONE ERP</Text>
      </View>
      <Card style={{ marginBottom: space.md }}>
        <Banner
          tone="info"
          messages={['In SACONE ERP open POS Devices & Sync → the terminal → Connect a device. Scan its QR, or type the short pairing code below.']}
        />
        <Button title="Scan QR from ERP" icon="qr-code" size="lg" onPress={() => router.push('/pair-scan')} testID="setup-scan" />
      </Card>
      <ConnectForm title="Or type the pairing code" />
      <Text style={{ color: colors.textFaint, fontSize: font.xs, textAlign: 'center', marginTop: space.lg }}>
        The connection is stored in this device's secure storage and works on this device only.
      </Text>
    </Screen>
  );
}
