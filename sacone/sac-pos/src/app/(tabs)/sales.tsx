import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { FlatList, Text, View } from 'react-native';
import { formatMoney } from '../../domain/money';
import { useCart } from '../../store/cart';
import { useLedger } from '../../store/ledger';
import { confirm } from '../../ui/dialogs';
import { DocSyncBadge } from '../../ui/SyncBadge';
import { Button, Card, Empty, Header, Row, Screen, SearchBar, Segmented, colors, font, space } from '../../ui/components';

type Tab = 'sales' | 'held' | 'returns' | 'payments';

const time = (iso: string) => new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

export default function Sales() {
  const params = useLocalSearchParams<{ tab?: Tab }>();
  const [tab, setTab] = useState<Tab>(params.tab ?? 'sales');
  const [q, setQ] = useState('');
  const sales = useLedger((s) => s.sales);
  const returns = useLedger((s) => s.returns);
  const payments = useLedger((s) => s.payments);
  const held = useLedger((s) => s.held);

  useEffect(() => { if (params.tab) setTab(params.tab); }, [params.tab]);

  const query = q.trim().toLowerCase();
  const filteredSales = useMemo(() => sales.filter((s) => !query
    || s.number.toLowerCase().includes(query) || (s.serverNumber ?? '').toLowerCase().includes(query)
    || (s.customer?.name ?? '').toLowerCase().includes(query) || (s.customer?.phone ?? '').includes(query)), [sales, query]);

  const resume = async (id: string) => {
    const bill = held.find((h) => h.id === id);
    if (!bill) return;
    if (useCart.getState().lines.length && !(await confirm('Replace cart?', 'The current cart will be replaced by the held bill.', 'Replace'))) return;
    useCart.getState().load(bill);
    useLedger.getState().removeHeld(id);
    router.push('/cart');
  };

  return (
    <Screen padded={false}>
      <Header title="Sales" subtitle="Bills from this phone (last 30 days)" />
      <View style={{ paddingHorizontal: space.lg, gap: space.sm }}>
        <Segmented<Tab>
          value={tab}
          onChange={setTab}
          options={[
            { value: 'sales', label: `Bills ${sales.length}` },
            { value: 'held', label: `Held ${held.length}` },
            { value: 'returns', label: 'Returns' },
            { value: 'payments', label: 'Collections' },
          ]}
        />
        {tab === 'sales' ? <SearchBar value={q} onChangeText={setQ} placeholder="Bill no, customer or phone" /> : null}
      </View>

      {tab === 'sales' && (
        <FlatList
          data={filteredSales}
          keyExtractor={(s) => s.id}
          contentContainerStyle={{ padding: space.lg }}
          ListEmptyComponent={<Empty icon="receipt-outline" title="No bills yet" message="Completed sales appear here." />}
          renderItem={({ item }) => (
            <Card style={{ marginBottom: space.sm, padding: space.md }} onPress={() => router.push({ pathname: '/sale/[id]', params: { id: item.id } })}>
              <Row style={{ justifyContent: 'space-between' }}>
                <Text style={{ fontWeight: '800', color: colors.text }}>{item.number}</Text>
                <Text style={{ fontWeight: '800', color: colors.text }}>{formatMoney(item.totals.grandTotal)}</Text>
              </Row>
              <Row style={{ justifyContent: 'space-between', marginTop: 6 }}>
                <Text style={{ color: colors.textMuted, fontSize: font.xs, flex: 1 }} numberOfLines={1}>
                  {time(item.createdAt)} · {item.customer?.name ?? 'Walk-in'} · {item.payments.map((p) => p.method).join('+')}
                </Text>
                <DocSyncBadge doc={item} />
              </Row>
            </Card>
          )}
        />
      )}

      {tab === 'held' && (
        <FlatList
          data={held}
          keyExtractor={(h) => h.id}
          contentContainerStyle={{ padding: space.lg }}
          ListEmptyComponent={<Empty icon="pause-circle-outline" title="No held bills" message="Use Hold in the cart to park a bill and serve the next customer." />}
          renderItem={({ item }) => (
            <Card style={{ marginBottom: space.sm, padding: space.md }}>
              <Row style={{ justifyContent: 'space-between' }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontWeight: '700', color: colors.text }}>{item.label}</Text>
                  <Text style={{ color: colors.textMuted, fontSize: font.xs }}>{time(item.createdAt)} · {item.lines.length} item(s)</Text>
                </View>
                <Row gap={space.sm}>
                  <Button title="Delete" size="sm" variant="ghost" onPress={async () => { if (await confirm('Delete held bill?', item.label, 'Delete', true)) useLedger.getState().removeHeld(item.id); }} />
                  <Button title="Resume" size="sm" onPress={() => resume(item.id)} />
                </Row>
              </Row>
            </Card>
          )}
        />
      )}

      {tab === 'returns' && (
        <FlatList
          data={returns}
          keyExtractor={(r) => r.id}
          contentContainerStyle={{ padding: space.lg }}
          ListEmptyComponent={<Empty icon="return-down-back-outline" title="No returns" message="Open a bill and tap Return items." />}
          renderItem={({ item }) => (
            <Card style={{ marginBottom: space.sm, padding: space.md }} onPress={() => router.push({ pathname: '/sale/[id]', params: { id: item.saleId } })}>
              <Row style={{ justifyContent: 'space-between' }}>
                <Text style={{ fontWeight: '800', color: colors.text }}>{item.number}</Text>
                <Text style={{ fontWeight: '800', color: colors.danger }}>− {formatMoney(item.total)}</Text>
              </Row>
              <Row style={{ justifyContent: 'space-between', marginTop: 6 }}>
                <Text style={{ color: colors.textMuted, fontSize: font.xs, flex: 1 }} numberOfLines={1}>{time(item.createdAt)} · bill {item.saleNumber} · {item.refundMethod}</Text>
                <DocSyncBadge doc={item} />
              </Row>
            </Card>
          )}
        />
      )}

      {tab === 'payments' && (
        <FlatList
          data={payments}
          keyExtractor={(p) => p.id}
          contentContainerStyle={{ padding: space.lg }}
          ListEmptyComponent={<Empty icon="wallet-outline" title="No collections" message="Collect dues from a customer's page." />}
          renderItem={({ item }) => (
            <Card style={{ marginBottom: space.sm, padding: space.md }}>
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
      )}
    </Screen>
  );
}
