import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, Text, View } from 'react-native';
import { formatMoney } from '../../domain/money';
import { useCatalog } from '../../store/catalog';
import { useLedger } from '../../store/ledger';
import { useCan } from '../../store/session';
import { DocSyncBadge } from '../../ui/SyncBadge';
import { Card, Empty, Header, Row, Screen, SearchBar, SectionTitle, colors, font, space } from '../../ui/components';

const time = (iso: string) => new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

/** Customer collections in the navigation rail (SAC-POS web / wide screens): who owes, and what was collected. */
export default function Collections() {
  const canCollect = useCan('collectPayment');
  const customers = useCatalog((s) => s.customers);
  const payments = useLedger((s) => s.payments);
  const [q, setQ] = useState('');
  const query = q.trim().toLowerCase();

  const due = useMemo(() => Object.values(customers)
    .filter((c) => c.isActive && c.outstanding > 0.009)
    .filter((c) => !query || c.name.toLowerCase().includes(query) || (c.phone ?? '').includes(query) || (c.code ?? '').toLowerCase().includes(query))
    .sort((a, b) => b.outstanding - a.outstanding)
    .slice(0, 50), [customers, query]);
  const totalDue = useMemo(() => Object.values(customers).reduce((s, c) => s + (c.isActive && c.outstanding > 0 ? c.outstanding : 0), 0), [customers]);

  return (
    <Screen padded={false}>
      <Header title="Collections" subtitle={`Customer dues ${formatMoney(totalDue)} · open a customer to collect`} />
      <View style={{ paddingHorizontal: space.lg }}>
        <SearchBar value={q} onChangeText={setQ} placeholder="Customer name, phone or code" />
      </View>
      <FlatList
        data={payments}
        keyExtractor={(p) => p.id}
        contentContainerStyle={{ paddingHorizontal: space.lg, paddingBottom: space.lg }}
        ListHeaderComponent={<View>
        <SectionTitle>Customers with dues</SectionTitle>
        {due.length ? due.map((c) => (
          <Card key={c.id} style={{ marginBottom: space.sm, padding: space.md }} onPress={() => router.push({ pathname: '/customer/[id]', params: { id: c.id } })}>
            <Row style={{ justifyContent: 'space-between' }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontWeight: '800', color: colors.text }} numberOfLines={1}>{c.name}</Text>
                <Text style={{ color: colors.textMuted, fontSize: font.xs }}>{[c.phone, c.creditLimit ? `limit ${formatMoney(c.creditLimit)}` : null].filter(Boolean).join(' · ') || '—'}</Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={{ fontWeight: '800', color: colors.warning }}>{formatMoney(c.outstanding)}</Text>
                <Text style={{ color: colors.primary, fontSize: font.xs, fontWeight: '700' }}>{canCollect ? 'Collect →' : 'View →'}</Text>
              </View>
            </Row>
          </Card>
        )) : <Text style={{ color: colors.textMuted }}>{query ? 'No customer with dues matches.' : 'No customer owes anything.'}</Text>}
        <SectionTitle>Collections made</SectionTitle>
        </View>}
        ListEmptyComponent={<Empty icon="wallet-outline" title="No collections yet" message="Open a customer above to collect their dues." />}
        renderItem={({ item }) => (
          <Card style={{ marginBottom: space.sm, padding: space.md }} onPress={() => router.push({ pathname: '/customer/[id]', params: { id: item.customerId } })}>
            <Row style={{ justifyContent: 'space-between' }}>
              <Text style={{ fontWeight: '800', color: colors.text }}>{item.customerName}</Text>
              <Text style={{ fontWeight: '800', color: colors.success }}>{formatMoney(item.amount)}</Text>
            </Row>
            <Row style={{ justifyContent: 'space-between', marginTop: 6 }}>
              <Text style={{ color: colors.textMuted, fontSize: font.xs, flex: 1 }}>{time(item.createdAt)} · {item.number} · {item.method}</Text>
              <DocSyncBadge doc={item} />
            </Row>
          </Card>
        )}
      />
    </Screen>
  );
}
