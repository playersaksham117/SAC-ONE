import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, Text, View } from 'react-native';
import { formatMoney } from '../../domain/money';
import { useCart } from '../../store/cart';
import { useLedger } from '../../store/ledger';
import { useCan } from '../../store/session';
import { DocSyncBadge } from '../../ui/SyncBadge';
import { Button, Card, Empty, Header, Row, Screen, SearchBar, colors, font, space } from '../../ui/components';

const day = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

/** Quotations in the navigation rail (SAC-POS web / wide screens): find one, or start a new one. */
export default function Quotes() {
  const canQuote = useCan('quote');
  const canQuotes = useCan('viewQuotes');
  const all = useLedger((s) => s.quotations);
  const [q, setQ] = useState('');
  const query = q.trim().toLowerCase();
  const quotations = useMemo(() => (all ?? [])
    .filter((x) => !x.origin || canQuotes)
    .filter((x) => !query || (x.serverNumber ?? x.number).toLowerCase().includes(query)
      || (x.customer?.name ?? '').toLowerCase().includes(query) || (x.customer?.phone ?? '').includes(query)), [all, canQuotes, query]);

  const newQuote = () => {
    useCart.getState().setMode('quotation');
    router.push('/sell');
  };

  return (
    <Screen padded={false}>
      <Header
        title="Quotations"
        subtitle="Made here and in the ERP · print, share or turn into a sale"
        right={canQuote ? <Button title="New quotation" icon="add" size="sm" onPress={newQuote} testID="new-quotation" /> : undefined}
      />
      <View style={{ paddingHorizontal: space.lg }}>
        <SearchBar value={q} onChangeText={setQ} placeholder="Quotation no., customer or phone" />
      </View>
      <FlatList
        data={quotations}
        keyExtractor={(x) => x.id}
        contentContainerStyle={{ padding: space.lg }}
        ListEmptyComponent={<Empty icon="document-text-outline" title="No quotations" message={canQuote ? 'Click New quotation, add items and save.' : 'Quotations appear here.'} />}
        renderItem={({ item }) => (
          <Card style={{ marginBottom: space.sm, padding: space.md }} onPress={() => router.push({ pathname: '/quotation/[id]', params: { id: item.id } })}>
            <Row style={{ justifyContent: 'space-between' }}>
              <Text style={{ fontWeight: '800', color: colors.text }}>
                {item.serverNumber ?? item.number}{item.status === 'converted' ? ' · sold' : ''}{item.origin ? ' · ERP' : ''}
              </Text>
              <Text style={{ fontWeight: '800', color: colors.text }}>{formatMoney(item.totals.grandTotal)}</Text>
            </Row>
            <Row style={{ justifyContent: 'space-between', marginTop: 6 }}>
              <Text style={{ color: colors.textMuted, fontSize: font.xs, flex: 1 }} numberOfLines={1}>
                {day(item.createdAt)} · {item.customer?.name ?? 'Walk-in'} · valid to {new Date(`${item.validUntil}T00:00:00`).toLocaleDateString('en-IN')}
              </Text>
              <DocSyncBadge doc={item} />
            </Row>
          </Card>
        )}
      />
    </Screen>
  );
}
