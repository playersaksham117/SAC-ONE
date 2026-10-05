import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, Text, TextInput } from 'react-native';
import { formatMoney, formatQty } from '../domain/money';
import type { Product } from '../domain/types';
import { Button, Chip, Row, colors, font, radius, space } from './components';

const QUICK = [1, 2, 5, 10];

/**
 * Type a quantity for a product (Sell screen: long-press a product or tap its × qty badge).
 * Decimals are allowed (kg, metres). Setting 0 / Remove takes it out of the cart.
 */
export function QtyPrompt({ product, current, available, onSet, onClose }: {
  product: Product | null;
  current: number;
  available: number;
  onSet: (qty: number) => void;
  onClose: () => void;
}) {
  const [text, setText] = useState('');
  useEffect(() => { if (product) setText(current ? String(current) : ''); }, [product, current]);
  if (!product) return null;

  const qty = Math.round((Number(text.replace(',', '.')) || 0) * 1000) / 1000;
  const valid = text.trim() !== '' && Number.isFinite(qty) && qty >= 0;
  const save = () => { if (valid) { onSet(qty); onClose(); } };

  return (
    <Modal transparent animationType="fade" visible onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <Pressable onPress={onClose} style={{ flex: 1, backgroundColor: 'rgba(15,23,42,0.45)', justifyContent: 'center', padding: space.lg }}>
          <Pressable onPress={() => undefined} style={{ backgroundColor: colors.surface, borderRadius: radius.lg, padding: space.lg, maxWidth: 420, width: '100%', alignSelf: 'center' }}>
            <Text style={{ fontSize: font.lg, fontWeight: '800', color: colors.text }} numberOfLines={2}>{product.name}</Text>
            <Text style={{ color: colors.textMuted, fontSize: font.xs, marginTop: 2 }}>
              {formatMoney(product.price)} · {formatQty(available)} {product.unit} in stock{current ? ` · ${formatQty(current)} in cart` : ''}
            </Text>

            <TextInput
              autoFocus
              value={text}
              onChangeText={(t) => setText(t.replace(/[^0-9.,]/g, ''))}
              onSubmitEditing={save}
              keyboardType="decimal-pad"
              returnKeyType="done"
              selectTextOnFocus
              placeholder="Quantity"
              placeholderTextColor={colors.textFaint}
              accessibilityLabel={`Quantity of ${product.name}`}
              style={{
                marginTop: space.md, height: 56, borderWidth: 2, borderColor: colors.primary, borderRadius: radius.md,
                paddingHorizontal: space.md, fontSize: 28, fontWeight: '800', textAlign: 'center', color: colors.text,
              }}
            />
            {valid && qty > 0 ? (
              <Text style={{ textAlign: 'center', color: qty > available ? colors.warning : colors.textMuted, marginTop: 6 }}>
                {formatQty(qty)} × {formatMoney(product.price)} = {formatMoney(qty * product.price)} + GST
                {qty > available ? ` · more than in stock (${formatQty(available)})` : ''}
              </Text>
            ) : null}

            <Row gap={space.xs} style={{ flexWrap: 'wrap', justifyContent: 'center', marginTop: space.md }}>
              {QUICK.map((n) => <Chip key={n} label={String(n)} active={qty === n} onPress={() => setText(String(n))} />)}
            </Row>

            <Row gap={space.sm} style={{ marginTop: space.lg }}>
              {current ? <Button title="Remove" variant="danger" icon="trash-outline" style={{ flex: 1 }} onPress={() => { onSet(0); onClose(); }} /> : null}
              <Button title="Cancel" variant="secondary" style={{ flex: 1 }} onPress={onClose} />
              <Button title="Set" icon="checkmark" style={{ flex: 1 }} onPress={save} disabled={!valid} />
            </Row>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}
