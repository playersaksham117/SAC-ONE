import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps, ReactNode } from 'react';
import {
  ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput,
  View, type StyleProp, type TextInputProps, type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { formatMoney } from '../domain/money';
import { colors, font, radius, shadow, space } from './theme';

export type IconName = ComponentProps<typeof Ionicons>['name'];

/* ───────────── layout ───────────── */

export function Screen({ children, scroll = false, padded = true, edges = ['top'] as const, footer }: {
  children: ReactNode; scroll?: boolean; padded?: boolean; edges?: readonly ('top' | 'bottom' | 'left' | 'right')[]; footer?: ReactNode;
}) {
  const content = scroll ? (
    <ScrollView contentContainerStyle={[padded && styles.padded, { paddingBottom: 40 }]} keyboardShouldPersistTaps="handled">
      {children}
    </ScrollView>
  ) : (
    <View style={[{ flex: 1 }, padded && styles.padded]}>{children}</View>
  );
  return (
    <SafeAreaView style={styles.screen} edges={edges}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {content}
        {footer}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

export function Header({ title, subtitle, right, onBack }: { title: string; subtitle?: string; right?: ReactNode; onBack?: () => void }) {
  return (
    <View style={styles.header}>
      {onBack && (
        <Pressable onPress={onBack} hitSlop={12} accessibilityLabel="Back" style={styles.headerBack}>
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </Pressable>
      )}
      <View style={{ flex: 1 }}>
        <Text style={styles.headerTitle} numberOfLines={1}>{title}</Text>
        {subtitle ? <Text style={styles.headerSub} numberOfLines={1}>{subtitle}</Text> : null}
      </View>
      {right}
    </View>
  );
}

export function Card({ children, style, onPress }: { children: ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void }) {
  if (onPress) {
    return (
      <Pressable onPress={onPress} style={({ pressed }) => [styles.card, pressed && { opacity: 0.85 }, style]}>
        {children}
      </Pressable>
    );
  }
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Row({ children, style, gap = space.sm }: { children: ReactNode; style?: StyleProp<ViewStyle>; gap?: number }) {
  return <View style={[{ flexDirection: 'row', alignItems: 'center', gap }, style]}>{children}</View>;
}

export function SectionTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <Row style={{ justifyContent: 'space-between', marginTop: space.lg, marginBottom: space.sm }}>
      <Text style={styles.sectionTitle}>{children}</Text>
      {right}
    </Row>
  );
}

/* ───────────── controls ───────────── */

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'success';

export function Button({ title, onPress, variant = 'primary', icon, loading, disabled, style, size = 'md', testID }: {
  title: string; onPress?: () => void; variant?: ButtonVariant; icon?: IconName; loading?: boolean; disabled?: boolean;
  style?: StyleProp<ViewStyle>; size?: 'sm' | 'md' | 'lg'; testID?: string;
}) {
  const palette: Record<ButtonVariant, { bg: string; fg: string; border?: string }> = {
    primary: { bg: colors.primary, fg: '#fff' },
    success: { bg: colors.success, fg: '#fff' },
    danger: { bg: colors.danger, fg: '#fff' },
    secondary: { bg: colors.surface, fg: colors.text, border: colors.border },
    ghost: { bg: 'transparent', fg: colors.primary },
  };
  const p = palette[variant];
  const height = size === 'lg' ? 56 : size === 'sm' ? 36 : 48;
  const isDisabled = disabled || loading;
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={title}
      onPress={isDisabled ? undefined : onPress}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: p.bg, height, borderColor: p.border ?? p.bg, borderWidth: p.border ? 1 : 0 },
        size === 'sm' && { paddingHorizontal: space.md },
        pressed && !isDisabled && { opacity: 0.85 },
        isDisabled && { opacity: 0.5 },
        style,
      ]}
    >
      {loading ? <ActivityIndicator color={p.fg} /> : (
        <Row gap={6}>
          {icon && <Ionicons name={icon} size={size === 'sm' ? 16 : 20} color={p.fg} />}
          <Text style={[styles.buttonText, { color: p.fg, fontSize: size === 'lg' ? font.lg : size === 'sm' ? font.sm : font.md }]}>{title}</Text>
        </Row>
      )}
    </Pressable>
  );
}

export function IconButton({ icon, onPress, label, tone = 'default', size = 22 }: {
  icon: IconName; onPress: () => void; label: string; tone?: 'default' | 'primary' | 'danger'; size?: number;
}) {
  const color = tone === 'primary' ? colors.primary : tone === 'danger' ? colors.danger : colors.text;
  return (
    <Pressable onPress={onPress} accessibilityLabel={label} hitSlop={10} style={({ pressed }) => [styles.iconBtn, pressed && { opacity: 0.6 }]}>
      <Ionicons name={icon} size={size} color={color} />
    </Pressable>
  );
}

export function Field({ label, error, hint, style, ...input }: TextInputProps & { label?: string; error?: string | null; hint?: string }) {
  return (
    <View style={[{ marginBottom: space.md }, style as ViewStyle]}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <TextInput
        placeholderTextColor={colors.textFaint}
        {...input}
        style={[styles.input, error ? { borderColor: colors.danger } : null, input.multiline ? { height: 88, textAlignVertical: 'top', paddingTop: 12 } : null]}
      />
      {error ? <Text style={styles.error}>{error}</Text> : hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

export function SearchBar({ value, onChangeText, placeholder, right, autoFocus }: {
  value: string; onChangeText: (v: string) => void; placeholder: string; right?: ReactNode; autoFocus?: boolean;
}) {
  return (
    <View style={styles.search}>
      <Ionicons name="search" size={18} color={colors.textMuted} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textFaint}
        style={styles.searchInput}
        autoCorrect={false}
        autoCapitalize="none"
        autoFocus={autoFocus}
        returnKeyType="search"
      />
      {value ? <IconButton icon="close-circle" label="Clear" onPress={() => onChangeText('')} size={18} /> : null}
      {right}
    </View>
  );
}

export function Chip({ label, active, onPress, icon }: { label: string; active?: boolean; onPress?: () => void; icon?: IconName }) {
  return (
    <Pressable onPress={onPress} style={[styles.chip, active && { backgroundColor: colors.primary, borderColor: colors.primary }]}>
      <Row gap={4}>
        {icon && <Ionicons name={icon} size={14} color={active ? '#fff' : colors.textMuted} />}
        <Text style={[styles.chipText, active && { color: '#fff' }]}>{label}</Text>
      </Row>
    </Pressable>
  );
}

export function Segmented<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <View style={styles.segmented}>
      {options.map((o) => (
        <Pressable key={o.value} onPress={() => onChange(o.value)} style={[styles.segment, value === o.value && styles.segmentActive]}>
          <Text style={[styles.segmentText, value === o.value && { color: colors.text }]}>{o.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

export function Stepper({ value, onChange, min = 0 }: { value: number; onChange: (v: number) => void; min?: number }) {
  return (
    <Row gap={0} style={styles.stepper}>
      <Pressable accessibilityLabel="Decrease" onPress={() => onChange(Math.max(min, value - 1))} style={styles.stepBtn}>
        <Ionicons name={value <= 1 ? 'trash-outline' : 'remove'} size={18} color={value <= 1 ? colors.danger : colors.text} />
      </Pressable>
      <Text style={styles.stepValue}>{value}</Text>
      <Pressable accessibilityLabel="Increase" onPress={() => onChange(value + 1)} style={styles.stepBtn}>
        <Ionicons name="add" size={18} color={colors.text} />
      </Pressable>
    </Row>
  );
}

/* ───────────── display ───────────── */

type Tone = 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'primary';
const toneColors: Record<Tone, { bg: string; fg: string }> = {
  neutral: { bg: colors.surfaceAlt, fg: colors.textMuted },
  success: { bg: colors.successSoft, fg: colors.success },
  warning: { bg: colors.warningSoft, fg: colors.warning },
  danger: { bg: colors.dangerSoft, fg: colors.danger },
  info: { bg: colors.infoSoft, fg: colors.info },
  primary: { bg: colors.primarySoft, fg: colors.primary },
};

export function Badge({ label, tone = 'neutral', icon }: { label: string; tone?: Tone; icon?: IconName }) {
  const t = toneColors[tone];
  return (
    <View style={[styles.badge, { backgroundColor: t.bg }]}>
      <Row gap={3}>
        {icon && <Ionicons name={icon} size={11} color={t.fg} />}
        <Text style={[styles.badgeText, { color: t.fg }]}>{label}</Text>
      </Row>
    </View>
  );
}

export function Banner({ tone = 'info', title, messages, action }: { tone?: Tone; title?: string; messages: string[]; action?: ReactNode }) {
  if (!messages.length && !title) return null;
  const t = toneColors[tone];
  const icon: IconName = tone === 'danger' ? 'alert-circle' : tone === 'warning' ? 'warning' : tone === 'success' ? 'checkmark-circle' : 'information-circle';
  return (
    <View style={[styles.banner, { backgroundColor: t.bg }]}>
      <Row style={{ alignItems: 'flex-start' }}>
        <Ionicons name={icon} size={18} color={t.fg} />
        <View style={{ flex: 1 }}>
          {title ? <Text style={[styles.bannerTitle, { color: t.fg }]}>{title}</Text> : null}
          {messages.map((m, i) => <Text key={i} style={[styles.bannerText, { color: t.fg }]}>{m}</Text>)}
        </View>
      </Row>
      {action ? <View style={{ marginTop: space.sm }}>{action}</View> : null}
    </View>
  );
}

export function Money({ value, size = font.md, bold, color = colors.text }: { value: number; size?: number; bold?: boolean; color?: string }) {
  return <Text style={{ fontSize: size, fontWeight: bold ? '700' : '500', color, fontVariant: ['tabular-nums'] }}>{formatMoney(value)}</Text>;
}

export function KeyValue({ label, value, bold, muted }: { label: string; value: ReactNode; bold?: boolean; muted?: boolean }) {
  return (
    <Row style={{ justifyContent: 'space-between', paddingVertical: 4 }}>
      <Text style={{ color: muted ? colors.textMuted : colors.text, fontSize: bold ? font.lg : font.md, fontWeight: bold ? '700' : '400' }}>{label}</Text>
      {typeof value === 'string' || typeof value === 'number'
        ? <Text style={{ color: muted ? colors.textMuted : colors.text, fontSize: bold ? font.lg : font.md, fontWeight: bold ? '700' : '500' }}>{value}</Text>
        : value}
    </Row>
  );
}

export function Empty({ icon = 'file-tray-outline', title, message, action }: { icon?: IconName; title: string; message?: string; action?: ReactNode }) {
  return (
    <View style={styles.empty}>
      <View style={styles.emptyIcon}><Ionicons name={icon} size={30} color={colors.primary} /></View>
      <Text style={styles.emptyTitle}>{title}</Text>
      {message ? <Text style={styles.emptyText}>{message}</Text> : null}
      {action ? <View style={{ marginTop: space.lg }}>{action}</View> : null}
    </View>
  );
}

export function Divider() {
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginVertical: space.sm }} />;
}

export function StatTile({ label, value, tone = 'neutral', icon }: { label: string; value: string; tone?: Tone; icon?: IconName }) {
  const t = toneColors[tone];
  return (
    <View style={[styles.card, { flex: 1, padding: space.md }]}>
      <Row gap={6}>
        {icon && <View style={[styles.statIcon, { backgroundColor: t.bg }]}><Ionicons name={icon} size={16} color={t.fg} /></View>}
        <Text style={{ color: colors.textMuted, fontSize: font.xs, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</Text>
      </Row>
      <Text style={{ fontSize: font.xl, fontWeight: '700', color: colors.text, marginTop: 6, fontVariant: ['tabular-nums'] }}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  padded: { paddingHorizontal: space.lg },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.lg, paddingTop: space.md, paddingBottom: space.md, gap: space.sm },
  headerBack: { marginLeft: -6, padding: 2 },
  headerTitle: { fontSize: font.xxl, fontWeight: '800', color: colors.text, letterSpacing: -0.5 },
  headerSub: { fontSize: font.sm, color: colors.textMuted, marginTop: 2 },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: space.lg, borderWidth: 1, borderColor: colors.border, ...shadow },
  sectionTitle: { fontSize: font.sm, fontWeight: '700', color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.6 },
  button: { borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space.lg },
  buttonText: { fontWeight: '700' },
  iconBtn: { padding: 6, borderRadius: radius.pill },
  label: { fontSize: font.sm, fontWeight: '600', color: colors.text, marginBottom: 6 },
  input: { height: 48, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, paddingHorizontal: space.md, fontSize: font.md, color: colors.text },
  error: { color: colors.danger, fontSize: font.xs, marginTop: 4 },
  hint: { color: colors.textMuted, fontSize: font.xs, marginTop: 4 },
  search: { flexDirection: 'row', alignItems: 'center', gap: space.sm, height: 48, borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, paddingLeft: space.md, paddingRight: 4 },
  searchInput: { flex: 1, fontSize: font.md, color: colors.text, height: '100%' },
  chip: { paddingHorizontal: space.md, height: 32, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, justifyContent: 'center' },
  chipText: { fontSize: font.sm, color: colors.textMuted, fontWeight: '600' },
  segmented: { flexDirection: 'row', backgroundColor: colors.surfaceAlt, borderRadius: radius.md, padding: 3 },
  segment: { flex: 1, height: 36, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  segmentActive: { backgroundColor: colors.surface, ...shadow },
  segmentText: { fontSize: font.sm, fontWeight: '700', color: colors.textMuted },
  stepper: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surface },
  stepBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  stepValue: { minWidth: 32, textAlign: 'center', fontSize: font.md, fontWeight: '700', color: colors.text },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill, alignSelf: 'flex-start' },
  badgeText: { fontSize: font.xs, fontWeight: '700' },
  banner: { borderRadius: radius.md, padding: space.md, marginBottom: space.md },
  bannerTitle: { fontWeight: '700', fontSize: font.sm, marginBottom: 2 },
  bannerText: { fontSize: font.sm, lineHeight: 19 },
  empty: { alignItems: 'center', justifyContent: 'center', paddingVertical: 48, paddingHorizontal: space.xl },
  emptyIcon: { width: 64, height: 64, borderRadius: 32, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center', marginBottom: space.md },
  emptyTitle: { fontSize: font.lg, fontWeight: '700', color: colors.text, textAlign: 'center' },
  emptyText: { fontSize: font.sm, color: colors.textMuted, textAlign: 'center', marginTop: 6, lineHeight: 20 },
  statIcon: { width: 26, height: 26, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
});

export { colors, font, space, radius };
