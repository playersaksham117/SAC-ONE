import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, font, space } from './theme';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del'];

export function PinPad({ value, onChange, length = 6, onSubmit, submitLabel = 'OK' }: {
  value: string; onChange: (v: string) => void; length?: number; onSubmit?: () => void; submitLabel?: string;
}) {
  const press = (k: string) => {
    if (k === 'del') onChange(value.slice(0, -1));
    else if (k && value.length < length) onChange(value + k);
  };
  return (
    <View>
      <View style={styles.dots} accessibilityLabel={`${value.length} digits entered`}>
        {Array.from({ length }).map((_, i) => (
          <View key={i} style={[styles.dot, i < value.length && styles.dotFilled]} />
        ))}
      </View>
      <View style={styles.grid}>
        {KEYS.map((k, i) => {
          if (!k && onSubmit) {
            return (
              <Pressable key={i} accessibilityLabel={submitLabel} onPress={onSubmit} style={({ pressed }) => [styles.key, styles.keyOk, pressed && styles.pressed]}>
                <Ionicons name="arrow-forward" size={26} color="#fff" />
              </Pressable>
            );
          }
          if (!k) return <View key={i} style={styles.key} />;
          return (
            <Pressable key={i} testID={`pin-${k}`} accessibilityLabel={k === 'del' ? 'Delete' : k} onPress={() => press(k)}
              style={({ pressed }) => [styles.key, pressed && styles.pressed]}>
              {k === 'del'
                ? <Ionicons name="backspace-outline" size={26} color={colors.text} />
                : <Text style={styles.keyText}>{k}</Text>}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 14, marginVertical: space.xl },
  dot: { width: 14, height: 14, borderRadius: 7, borderWidth: 2, borderColor: colors.border },
  dotFilled: { backgroundColor: colors.primary, borderColor: colors.primary },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 14, maxWidth: 300, alignSelf: 'center' },
  key: { width: 76, height: 64, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  keyOk: { backgroundColor: colors.primary, borderColor: colors.primary },
  keyText: { fontSize: font.xxl, fontWeight: '600', color: colors.text },
  pressed: { opacity: 0.6 },
});
