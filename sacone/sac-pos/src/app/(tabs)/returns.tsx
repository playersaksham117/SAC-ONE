import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, Text, View } from 'react-native';
import { formatMoney } from '../../domain/money';
import type { Sale } from '../../domain/types';
import { useLedger } from '../../store/ledger';
import { useCan } from '../../store/session';
import { DocSyncBadge } from '../../ui/SyncBadge';
import { Card, Empty, Header, Row, Screen, SearchBar, SectionTitle, colors, font, space } from '../../ui/components';

const time = (iso: string) => new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
const returnable = (s: Sale) => !s.cancelledInErp && s.totals.lines.some((l) => l.quantity - (s.returned[l.productId] || 0) > 0);

/** Returns in the navigation rail (SAC-POS web / wide screens): find the bill, then return or exchange. */
export default function Returns() {
  const canReturn = useCan('returns');
  const canAllSales = useCan('viewAllSales');
  const sales = useLedger((s) => s.sales);
  const returns = useLedger((s) => s.returns);
  const [q, setQ] = useState('');
  const query = q.trim().toLowerCase();

  const bills = useMemo(() => {
    if (!query) return [];
    return sales
      .filter((s) => canAllSales || !s.origin)
      .filter((s) => (s.serverNumber ?? '').toLowerCase().includes(query) || s.number.toLowerCase().includes(query)
        || (s.customer?.name ?? '').toLowerCase().includes(query) || (s.customer?.phone ?? '').includes(query))
      .slice(0, 20);
  }, [sales, query, canAllSales]);

  return (
    <Screen padded={false}>
      <Header title="Returns" subtitle="Find the bill, choose the items, refund or exchange" />
      <View style={{ paddingHorizontal: space.lg }}>
        {canReturn ? (
          <>
            <SectionTitle>Find the bill</SectionTitle>
            <SearchBar value={q} onChangeText={setQ} placeholder="Bill no., customer or phone (scan the bill barcode)" autoFocus />
            {query ? (
              bills.length ? bills.map((s) => {
                const ok = returnable(s);
                return (
                  <Card
                    key={s.id}
                    style={{ marginTop: space.sm, padding: space.md, opacity: ok ? 1 : 0.55 }}
                    onPress={ok ? () => router.push({ pathname: '/return/[id]', params: { id: s.id } }) : undefined}
                  >
                    <Row style={{ justifyContent: 'space-between' }}>
                      <Text style={{ fontWeight: '800', color: colors.text }}>{s.serverNumber ?? s.number}</Text>
                      <Text style={{ fontWeight: '800', color: colors.text }}>{formatMoney(s.totals.grandTotal)}</Text>
                    </Row>
                    <Text style={{ color: colors.textMuted, fontSize: font.xs, marginTop: 4 }}>
                      {time(s.createdAt)} · {s.customer?.name ?? 'Walk-in'} · {ok ? 'tap to return / exchange' : s.cancelledInErp ? 'cancelled in the ERP' : 'everything already returned'}
                    </Text>
                  </Card>
                );
              }) : <Text style={{ color: colors.textMuted, marginTop: space.sm }}>No bill matches. Bills from the last 30 days are on this device.</Text>
            ) : null}
          </>
        ) : (
          <Text style={{ color: colors.textMuted, marginTop: space.sm }}>Your role cannot process returns. Ask a manager.</Text>
        )}
        <SectionTitle>Returns made</SectionTitle>
      </View>
      <FlatList
        data={returns}
        keyExtractor={(r) => r.id}
        contentContainerStyle={{ paddingHorizontal: space.lg, paddingBottom: space.lg }}
        ListEmptyComponent={<Empty icon="return-down-back-outline" title="No returns yet" message="Find a bill above to return or exchange items." />}
        renderItem={({ item }) => (
          <Card style={{ marginBottom: space.sm, padding: space.md }} onPress={() => router.push({ pathname: '/sale/[id]', params: { id: item.saleId } })}>
            <Row style={{ justifyContent: 'space-between' }}>
              <Text style={{ fontWeight: '800', color: colors.text }}>{item.number}{item.type === 'exchange' ? ' · exchange' : ''}</Text>
              <Text style={{ fontWeight: '800', color: colors.danger }}>− {formatMoney(item.total)}</Text>
            </Row>
            <Row style={{ justifyContent: 'space-between', marginTop: 6 }}>
              <Text style={{ color: colors.textMuted, fontSize: font.xs, flex: 1 }} numberOfLines={1}>{time(item.createdAt)} · bill {item.saleNumber} · {item.refundMethod}</Text>
              <DocSyncBadge doc={item} />
            </Row>
          </Card>
        )}
      />
    </Screen>
  );
}
