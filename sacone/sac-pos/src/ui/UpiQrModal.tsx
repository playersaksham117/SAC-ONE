import { useMemo } from 'react';
import { Image, Modal, Pressable, Text, View } from 'react-native';
import { formatMoney } from '../domain/money';
import { qrMatrix, upiPayUrl, type PayBank } from '../domain/upi';
import { Button, colors, font, radius, space } from './components';

/** Draws the QR with plain views: each row is runs of dark modules (no SVG library needed). */
function QrView({ text, size }: { text: string; size: number }) {
  const matrix = useMemo(() => qrMatrix(text), [text]);
  const quiet = 3;
  const cell = Math.floor(size / (matrix.length + quiet * 2));
  const side = cell * (matrix.length + quiet * 2);
  return (
    <View style={{ width: side, height: side, backgroundColor: '#fff', padding: cell * quiet }}>
      {matrix.map((row, y) => {
        const runs: { x: number; len: number }[] = [];
        row.forEach((dark, x) => {
          if (!dark) return;
          const last = runs[runs.length - 1];
          if (last && last.x + last.len === x) last.len += 1;
          else runs.push({ x, len: 1 });
        });
        return (
          <View key={y} style={{ height: cell, flexDirection: 'row' }}>
            {runs.map((r) => (
              <View key={r.x} style={{ position: 'absolute', left: r.x * cell, width: r.len * cell, height: cell, backgroundColor: '#000' }} />
            ))}
          </View>
        );
      })}
    </View>
  );
}

/** Full-screen scan-to-pay QR for the customer (amount filled in). */
export function UpiQrModal({ bank, amount, payee, note, image, onClose }: {
  bank: PayBank; amount: number; payee?: string | null; note?: string;
  /** The firm's uploaded QR image (customer types the amount); else a QR made from the UPI ID. */
  image?: string | null;
  onClose: () => void;
}) {
  const url = bank.upiId ? upiPayUrl({ upiId: bank.upiId, payee: bank.accountHolder || payee, amount, note }) : '';
  return (
    <Modal transparent animationType="fade" visible onRequestClose={onClose}>
      <Pressable onPress={onClose} style={{ flex: 1, backgroundColor: 'rgba(15,23,42,0.6)', alignItems: 'center', justifyContent: 'center', padding: space.lg }}>
        <Pressable onPress={() => undefined} style={{ backgroundColor: colors.surface, borderRadius: radius.lg, padding: space.lg, alignItems: 'center', width: '100%', maxWidth: 380 }}>
          <Text style={{ fontSize: font.lg, fontWeight: '800', color: colors.text }}>Scan to pay</Text>
          <Text style={{ fontSize: font.xxl, fontWeight: '800', color: colors.primary, marginVertical: space.xs }}>{formatMoney(amount)}</Text>
          {image
            ? <Image source={{ uri: image }} style={{ width: 280, height: 280, backgroundColor: '#fff' }} resizeMode="contain" accessibilityLabel="UPI QR" />
            : <QrView text={url} size={280} />}
          {image ? <Text style={{ marginTop: space.sm, color: colors.warning, fontWeight: '700', textAlign: 'center' }}>Customer enters {formatMoney(amount)} in their UPI app</Text> : null}
          {bank.upiId ? <Text style={{ marginTop: space.sm, color: colors.text, fontWeight: '700' }}>{bank.upiId}</Text> : null}
          <Text style={{ color: colors.textMuted, fontSize: font.sm, textAlign: 'center' }}>
            {[bank.accountHolder || payee, bank.bankName].filter(Boolean).join(' · ')}
          </Text>
          <Text style={{ color: colors.textFaint, fontSize: font.xs, marginTop: space.sm, textAlign: 'center' }}>
            Any UPI app: GPay, PhonePe, Paytm, BHIM… Check the money has arrived before completing the sale.
          </Text>
          <Button title="Done" onPress={onClose} style={{ marginTop: space.md, alignSelf: 'stretch' }} />
        </Pressable>
      </Pressable>
    </Modal>
  );
}
