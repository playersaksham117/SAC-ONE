import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { Platform, Text, View } from 'react-native';
import { useCart } from '../store/cart';
import { findByCode, useCatalog } from '../store/catalog';
import { Badge, Button, Empty, Header, Screen, font, space } from '../ui/components';

export default function Scan() {
  const [permission, requestPermission] = useCameraPermissions();
  const [last, setLast] = useState<{ ok: boolean; text: string } | null>(null);
  const cooldown = useRef(0);

  const onScan = ({ data }: { data: string }) => {
    const now = Date.now();
    if (now < cooldown.current) return;
    cooldown.current = now + 1500;
    const product = findByCode(useCatalog.getState().products, data);
    if (!product) {
      setLast({ ok: false, text: `No product with code ${data}` });
      return;
    }
    useCart.getState().add(product, 1);
    if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
    setLast({ ok: true, text: `Added ${product.name}` });
  };

  if (!permission) return <Screen><Header title="Scan" onBack={() => router.back()} /></Screen>;
  if (!permission.granted) {
    return (
      <Screen>
        <Header title="Scan barcode" onBack={() => router.back()} />
        <Empty
          icon="camera-outline"
          title="Camera access needed"
          message="Allow the camera to scan product barcodes."
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
        barcodeScannerSettings={{ barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e', 'code128', 'code39', 'qr'] }}
        onBarcodeScanned={onScan}
      />
      <View style={{ position: 'absolute', top: '35%', left: '12%', right: '12%', height: 160, borderWidth: 3, borderColor: '#fff', borderRadius: 20, opacity: 0.8 }} />
      <View style={{ position: 'absolute', left: space.lg, right: space.lg, bottom: 40, gap: space.md }}>
        {last ? (
          <View style={{ alignItems: 'center' }}>
            <Badge tone={last.ok ? 'success' : 'danger'} label={last.text} />
          </View>
        ) : <Text style={{ color: '#fff', textAlign: 'center', fontSize: font.md }}>Point at a barcode — items are added to the cart</Text>}
        <Button title={`Done · ${useCart.getState().lines.length} item(s) in cart`} onPress={() => router.back()} />
      </View>
      <View style={{ position: 'absolute', top: 50, left: space.lg }}>
        <Button title="Close" size="sm" variant="secondary" onPress={() => router.back()} />
      </View>
    </View>
  );
}
