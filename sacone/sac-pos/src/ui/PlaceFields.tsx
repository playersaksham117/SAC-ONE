import { useMemo, useState } from 'react';
import { FlatList, Modal, Pressable, Text, View, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { INDIA_STATES, citiesFor, findState, stateOfCity, type IndiaState } from '../lib/indiaPlaces';
import { Button, Chip, Field, Row, SearchBar, colors, font, radius, space } from './components';

/**
 * State: a list of all 36 Indian states and union territories (searchable).
 * value / onChange carry the state NAME; an old typed value like "UP" shows as its state.
 */
export function StateField({ label = 'State', value, onChange, style }: {
  label?: string; value?: string; onChange: (name: string, st: IndiaState) => void; style?: ViewStyle;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const known = findState(value);
  const shown = known ? known.name : value;
  const list = useMemo(() => {
    const n = q.trim().toLowerCase();
    return n ? INDIA_STATES.filter((s) => s.name.toLowerCase().includes(n) || s.code === n.padStart(2, '0')) : INDIA_STATES;
  }, [q]);

  return (
    <View style={[{ marginBottom: space.md }, style]}>
      {label ? <Text style={{ fontSize: font.sm, fontWeight: '600', color: colors.text, marginBottom: 6 }}>{label}</Text> : null}
      <Pressable
        onPress={() => { setQ(''); setOpen(true); }}
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${shown || 'choose'}`}
        style={{ height: 48, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, paddingHorizontal: space.md, flexDirection: 'row', alignItems: 'center' }}
      >
        <Text style={{ flex: 1, fontSize: font.md, color: shown ? colors.text : colors.textFaint }} numberOfLines={1}>{shown || 'Choose state'}</Text>
        <Ionicons name="chevron-down" size={18} color={colors.textMuted} />
      </Pressable>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable onPress={() => setOpen(false)} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', padding: space.lg }}>
          <Pressable onPress={() => {}} style={{ backgroundColor: colors.bg ?? colors.surface, borderRadius: radius.lg ?? radius.md, padding: space.md, maxHeight: '85%', width: '100%', maxWidth: 480, alignSelf: 'center' }}>
            <Text style={{ fontSize: font.lg, fontWeight: '700', color: colors.text, marginBottom: space.sm }}>Choose state</Text>
            <SearchBar value={q} onChangeText={setQ} placeholder="Search state or GST code" autoFocus />
            <FlatList
              style={{ marginTop: space.sm }}
              data={list}
              keyExtractor={(s) => s.code}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item }) => (
                <Pressable
                  onPress={() => { onChange(item.name, item); setOpen(false); }}
                  style={{ paddingVertical: 12, paddingHorizontal: space.sm, borderBottomWidth: 1, borderBottomColor: colors.border, flexDirection: 'row', alignItems: 'center' }}
                >
                  <Text style={{ flex: 1, fontSize: font.md, color: colors.text, fontWeight: item.name === shown ? '700' : '400' }}>{item.name}</Text>
                  <Text style={{ color: colors.textMuted, fontSize: font.xs }}>{item.code}</Text>
                </Pressable>
              )}
            />
            <Button title="Close" variant="secondary" onPress={() => setOpen(false)} style={{ marginTop: space.sm }} />
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

/**
 * City: type freely; matching cities and towns of the chosen state (or of all India) show as chips.
 * Picking one while no state is chosen calls onStateGuess(state, city) instead, to set both at once.
 */
export function CityField({ label = 'City', value, onChange, state, onStateGuess, style }: {
  label?: string; value?: string; onChange: (city: string) => void; state?: string;
  onStateGuess?: (st: IndiaState, city: string) => void; style?: ViewStyle;
}) {
  const [focused, setFocused] = useState(false);
  const typed = (value ?? '').trim();
  const suggestions = useMemo(() => {
    if (!focused) return [];
    const st = findState(state);
    if (!typed) return st ? st.cities.slice(0, 8) : [];
    if (!st && typed.length < 2) return [];
    return citiesFor(st?.code ?? null, typed, 8).filter((c) => c !== typed);
  }, [focused, state, typed]);

  const pick = (city: string) => {
    const st = !findState(state) && onStateGuess ? stateOfCity(city) : null;
    if (st && onStateGuess) onStateGuess(st, city);
    else if (city !== value) onChange(city);
  };

  return (
    <View style={style}>
      <Field
        label={label}
        value={value ?? ''}
        onChangeText={onChange}
        onFocus={() => setFocused(true)}
        onBlur={() => { setTimeout(() => setFocused(false), 200); if (typed) pick(typed); }}
        autoCorrect={false}
        placeholder={findState(state) ? `Cities in ${findState(state)!.name}` : 'Type a city'}
        style={suggestions.length ? { marginBottom: space.xs } : undefined}
      />
      {suggestions.length ? (
        <Row style={{ flexWrap: 'wrap', marginBottom: space.md }}>
          {suggestions.map((c) => <Chip key={c} label={c} icon="location-outline" onPress={() => pick(c)} />)}
        </Row>
      ) : null}
    </View>
  );
}
