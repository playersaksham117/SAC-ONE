import { Text, View } from 'react-native';
import { formatMoney } from '../domain/money';
import type { Customer } from '../domain/types';
import type { LocalCustomer } from '../store/catalog';
import { Badge, Card, Row, colors, font, space } from './components';

export function CustomerRow({ c, onPress, selected }: { c: Customer; onPress: () => void; selected?: boolean }) {
  const local = c.isLocal ? (c as LocalCustomer) : null;
  return (
    <Card style={{ marginBottom: space.sm, padding: space.md, borderColor: selected ? colors.primary : colors.border }} onPress={onPress}>
      <Row>
        <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: colors.primary, fontWeight: '800' }}>{c.name.slice(0, 1).toUpperCase()}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontWeight: '700', color: colors.text }} numberOfLines={1}>{c.name}</Text>
          <Text style={{ color: colors.textMuted, fontSize: font.xs }} numberOfLines={1}>
            {[c.phone, c.gstin && `GSTIN ${c.gstin}`, c.city].filter(Boolean).join(' · ') || c.code}
          </Text>
        </View>
        <View style={{ alignItems: 'flex-end', gap: 4 }}>
          {c.outstanding > 0 ? <Text style={{ fontWeight: '800', color: colors.warning }}>{formatMoney(c.outstanding)}</Text> : null}
          {local ? <Badge tone={local.sync === 'review' ? 'danger' : local.sync === 'synced' ? 'success' : 'warning'} label={local.sync === 'synced' ? 'Sent' : local.sync === 'review' ? 'Review' : 'New'} /> : null}
        </View>
      </Row>
    </Card>
  );
}
