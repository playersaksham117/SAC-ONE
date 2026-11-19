import { Text, View } from 'react-native';
import { formatMoney } from '../domain/money';
import type { Customer } from '../domain/types';
import type { LocalCustomer } from '../store/catalog';
import { Badge, Card, Row, colors, font, space } from './components';

/**
 * One customer in a list: name, then the address (so two customers with the same name are told
 * apart by where they are), then mobile / GSTIN / code. `sameName` > 1 marks a look-alike.
 */
export function CustomerRow({ c, onPress, selected, sameName = 1 }: { c: Customer; onPress: () => void; selected?: boolean; sameName?: number }) {
  const local = c.isLocal ? (c as LocalCustomer) : null;
  const place = [c.address, c.city, c.state].filter(Boolean).join(', ');
  const ids = [c.phone, c.gstin ? `GSTIN ${c.gstin}` : null, sameName > 1 || !c.phone ? c.code : null].filter(Boolean).join(' · ');
  return (
    <Card style={{ marginBottom: space.sm, padding: space.md, borderColor: selected ? colors.primary : sameName > 1 ? colors.warning : colors.border }} onPress={onPress}>
      <Row>
        <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: colors.primary, fontWeight: '800' }}>{c.name.slice(0, 1).toUpperCase()}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Row gap={space.xs} style={{ flexWrap: 'wrap' }}>
            <Text style={{ fontWeight: '700', color: colors.text, flexShrink: 1 }} numberOfLines={1}>{c.name}</Text>
            {sameName > 1 ? <Badge tone="warning" label={`Same name ×${sameName}`} /> : null}
          </Row>
          {place ? (
            <Text style={{ color: colors.text, fontSize: font.sm }} numberOfLines={2}>{place}</Text>
          ) : (
            <Text style={{ color: colors.textFaint, fontSize: font.xs, fontStyle: 'italic' }}>No address</Text>
          )}
          {ids ? <Text style={{ color: colors.textMuted, fontSize: font.xs }} numberOfLines={1}>{ids}</Text> : null}
        </View>
        <View style={{ alignItems: 'flex-end', gap: 4 }}>
          {c.outstanding > 0 ? <Text style={{ fontWeight: '800', color: colors.warning }}>{formatMoney(c.outstanding)}</Text> : null}
          {local ? <Badge tone={local.sync === 'review' ? 'danger' : local.sync === 'synced' ? 'success' : 'warning'} label={local.sync === 'synced' ? 'Sent' : local.sync === 'review' ? 'Review' : 'New'} /> : null}
        </View>
      </Row>
    </Card>
  );
}
