import { useEffect, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { sync, type ProductBatch } from '../api/sacone';
import { deviceConfig } from '../store/device';
import { colors, font, space } from './components';

/**
 * Batch number of a bill line. Shows the product's batches registered on SACONE purchase bills
 * (the ones still in stock first) as chips to pick; any batch can also be typed (it then shows as
 * "not registered" in Warranty Check). Offline: typing only.
 */
export function BatchInput({ productId, value, onChange, testID }: {
  productId: string; value: string | null | undefined; onChange: (v: string | null) => void; testID?: string;
}) {
  const [text, setText] = useState(value || '');
  const [options, setOptions] = useState<ProductBatch[] | null>(null);

  useEffect(() => { setText(value || ''); }, [value]);
  useEffect(() => {
    const cfg = deviceConfig();
    if (!cfg) return undefined;
    let live = true;
    sync.batches(cfg, productId).then((r) => { if (live) setOptions(r.batches || []); }).catch(() => { if (live) setOptions(null); });
    return () => { live = false; };
  }, [productId]);

  const set = (v: string) => {
    const clean = v.toUpperCase().slice(0, 40);
    setText(clean);
    onChange(clean.trim() ? clean.trim() : null);
  };
  const typed = text.trim();
  const known = !typed || !options || options.some((o) => o.batchNumber === typed);

  return (
    <View>
      <TextInput
        value={text}
        onChangeText={set}
        placeholder="Batch no. (optional)"
        placeholderTextColor={colors.textFaint}
        autoCapitalize="characters"
        autoCorrect={false}
        maxLength={40}
        style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 10, paddingHorizontal: space.sm, paddingVertical: 8, color: colors.text, fontFamily: 'monospace' }}
        testID={testID}
      />
      {options?.length ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
          {options.slice(0, 8).map((o) => {
            const on = o.batchNumber === typed;
            return (
              <Pressable key={o.batchNumber} onPress={() => set(on ? '' : o.batchNumber)}
                style={{ borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, borderWidth: 1, borderColor: on ? colors.primary : colors.border, backgroundColor: on ? colors.primary : 'transparent' }}
                testID={`${testID || 'batch'}-opt-${o.batchNumber}`}>
                <Text style={{ fontSize: font.xs, fontWeight: '700', color: on ? '#fff' : colors.text, fontFamily: 'monospace' }}>
                  {o.batchNumber}
                  <Text style={{ fontWeight: '400', color: on ? '#fff' : colors.textMuted }}>{` · ${o.balance} left`}</Text>
                </Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}
      {!known ? <Text style={{ color: colors.warning, fontSize: font.xs, marginTop: 4 }}>Not on any purchase bill: it will show as “not registered”.</Text> : null}
    </View>
  );
}
