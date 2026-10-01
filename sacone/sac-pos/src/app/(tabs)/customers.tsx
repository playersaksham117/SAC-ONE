import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, View } from 'react-native';
import { formatMoney } from '../../domain/money';
import { searchCustomers, useCatalog } from '../../store/catalog';
import { useCan } from '../../store/session';
import { CustomerRow } from '../../ui/CustomerRow';
import { Chip, Empty, Header, IconButton, Row, Screen, SearchBar, StatTile, space } from '../../ui/components';

export default function Customers() {
  const customers = useCatalog((s) => s.customers);
  const canCreate = useCan('createCustomers');
  const [q, setQ] = useState('');
  const [dueOnly, setDueOnly] = useState(false);

  const list = useMemo(() => {
    const hits = searchCustomers(customers, q, 300);
    return dueOnly ? hits.filter((c) => c.outstanding > 0).sort((a, b) => b.outstanding - a.outstanding) : hits;
  }, [customers, q, dueOnly]);

  const totalDue = useMemo(() => Object.values(customers).reduce((s, c) => s + Math.max(c.outstanding, 0), 0), [customers]);

  return (
    <Screen padded={false}>
      <Header
        title="Customers"
        subtitle={`${Object.keys(customers).length} synced from ERP`}
        right={canCreate ? <IconButton icon="person-add" label="Add customer" tone="primary" onPress={() => router.push('/customer/new')} /> : null}
      />
      <View style={{ paddingHorizontal: space.lg, gap: space.sm }}>
        <Row>
          <StatTile label="Total dues" value={formatMoney(totalDue)} tone="warning" icon="time-outline" />
        </Row>
        <SearchBar value={q} onChangeText={setQ} placeholder="Name, mobile, GSTIN" />
        <Row gap={space.sm}>
          <Chip label="All" active={!dueOnly} onPress={() => setDueOnly(false)} />
          <Chip label="With dues" icon="alert-circle-outline" active={dueOnly} onPress={() => setDueOnly(true)} />
        </Row>
      </View>
      <FlatList
        data={list}
        keyExtractor={(c) => c.id}
        contentContainerStyle={{ padding: space.lg }}
        renderItem={({ item }) => <CustomerRow c={item} onPress={() => router.push({ pathname: '/customer/[id]', params: { id: item.id } })} />}
        ListEmptyComponent={<Empty icon="people-outline" title="No customers" message="Registered customers sync from SACONE ERP. Walk-in sales need no customer." />}
      />
    </Screen>
  );
}
