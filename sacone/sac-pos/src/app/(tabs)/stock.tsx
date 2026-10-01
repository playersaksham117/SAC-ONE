import { useMemo, useState } from 'react';
import { FlatList, Text, View } from 'react-native';
import { formatMoney, formatQty } from '../../domain/money';
import { usePendingQty } from '../../lib/useSyncInfo';
import { searchProducts, useCatalog } from '../../store/catalog';
import { useDevice } from '../../store/device';
import { Badge, Card, Chip, Empty, Header, Row, Screen, SearchBar, StatTile, colors, font, space } from '../../ui/components';

type Filter = 'all' | 'low' | 'out';

export default function Stock() {
  const products = useCatalog((s) => s.products);
  const lastPullAt = useCatalog((s) => s.lastPullAt);
  const warehouse = useDevice((s) => s.info?.warehouse?.name);
  const pending = usePendingQty();
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>('all');

  const rows = useMemo(() => searchProducts(products, q, 500).map((p) => ({ p, avail: p.available - (pending[p.id] || 0) })), [products, q, pending]);
  const filtered = rows.filter((r) => (filter === 'out' ? r.avail <= 0 : filter === 'low' ? r.avail > 0 && r.avail <= 5 : true));
  const stats = useMemo(() => ({
    skus: rows.length,
    out: rows.filter((r) => r.avail <= 0).length,
    value: rows.reduce((s, r) => s + Math.max(r.avail, 0) * r.p.price, 0),
  }), [rows]);

  return (
    <Screen padded={false}>
      <Header title="Stock" subtitle={`${warehouse ?? 'Warehouse'} · updated ${lastPullAt ? new Date(lastPullAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : 'never'}`} />
      <View style={{ paddingHorizontal: space.lg, gap: space.sm }}>
        <Row gap={space.sm}>
          <StatTile label="Items" value={String(stats.skus)} icon="cube-outline" tone="primary" />
          <StatTile label="Out" value={String(stats.out)} icon="alert-circle-outline" tone={stats.out ? 'danger' : 'success'} />
        </Row>
        <SearchBar value={q} onChangeText={setQ} placeholder="Search products" />
        <Row gap={space.sm}>
          <Chip label="All" active={filter === 'all'} onPress={() => setFilter('all')} />
          <Chip label="Low (≤5)" active={filter === 'low'} onPress={() => setFilter('low')} />
          <Chip label="Out of stock" active={filter === 'out'} onPress={() => setFilter('out')} />
        </Row>
      </View>
      <FlatList
        data={filtered}
        keyExtractor={(r) => r.p.id}
        contentContainerStyle={{ padding: space.lg }}
        ListEmptyComponent={<Empty icon="cube-outline" title="Nothing to show" message="Stock comes from SACONE ERP for this device's warehouse." />}
        renderItem={({ item: { p, avail } }) => (
          <Card style={{ marginBottom: space.sm, padding: space.md }}>
            <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontWeight: '700', color: colors.text }}>{p.name}</Text>
                <Text style={{ color: colors.textMuted, fontSize: font.xs, marginTop: 2 }}>
                  {p.sku}{p.barcode ? ` · ${p.barcode}` : ''}{p.hsn ? ` · HSN ${p.hsn}` : ''}
                </Text>
                <Text style={{ color: colors.textMuted, fontSize: font.xs }}>{formatMoney(p.price)} + {p.gstRate}% GST · MRP {formatMoney(p.mrp)}</Text>
              </View>
              <View style={{ alignItems: 'flex-end', gap: 4 }}>
                <Text style={{ fontSize: font.xl, fontWeight: '800', color: avail <= 0 ? colors.danger : avail <= 5 ? colors.warning : colors.text }}>{formatQty(avail)}</Text>
                <Text style={{ color: colors.textMuted, fontSize: font.xs }}>{p.unit}</Text>
                {pending[p.id] ? <Badge tone="warning" label={`${formatQty(pending[p.id])} unsynced`} /> : null}
              </View>
            </Row>
          </Card>
        )}
      />
    </Screen>
  );
}
