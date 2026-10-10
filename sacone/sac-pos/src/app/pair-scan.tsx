import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { Platform, Text, View } from 'react-native';
import { parsePairingCode } from '../domain/pairing';
import { Badge, Button, Empty, Header, Screen, font, space } from '../ui/components';

/** Scan the pairing QR shown in SACONE ERP → POS Devices, then confirm on the Connect screen. */
export default function PairScan() {
  const [permission, requestPermission] = useCameraPermissions();
  const [problem, setProblem] = useState<string | null>(null);
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

  if (!permission) return <Screen><Header title="Scan connection QR" onBack={() => router.back()} /></Screen>;
  if (!permission.granted) {
    return (
      <Screen>
        <Header title="Scan connection QR" onBack={() => router.back()} />
        <Empty
          icon="camera-outline"
          title="Camera access needed"
          message="Allow the camera to scan the QR code shown in SACONE ERP."
          action={<Button title="Allow camera" onPress={requestPermission} />}
        />
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
      <View style={{ position: 'absolute', top: 50, left: space.lg }}>
        <Button title="Close" size="sm" variant="secondary" onPress={() => router.back()} />
      </View>
    </View>
  );
}
