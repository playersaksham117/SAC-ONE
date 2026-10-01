import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, View } from 'react-native';
import { useCart } from '../store/cart';
import { searchCustomers, useCatalog } from '../store/catalog';
import { useCan } from '../store/session';
import { CustomerRow } from '../ui/CustomerRow';
import { Button, Empty, Header, Screen, SearchBar, space } from '../ui/components';

export default function CustomerPicker() {
  const customers = useCatalog((s) => s.customers);
  const selected = useCart((s) => s.customerId);
  const canCreate = useCan('createCustomers');
  const canView = useCan('viewCustomers');
  const [q, setQ] = useState('');
  const list = useMemo(() => (canView ? searchCustomers(customers, q, 100) : []), [customers, q, canView]);

  const pick = (id: string | null) => {
    useCart.getState().setCustomer(id);
    router.back();
  };

  return (
    <Screen padded={false}>
      <Header title="Select customer" onBack={() => router.back()} />
      <View style={{ paddingHorizontal: space.lg, gap: space.sm }}>
        <SearchBar value={q} onChangeText={setQ} placeholder="Name, mobile or GSTIN" autoFocus />
        <Button title="Walk-in customer (no details)" variant="secondary" icon="walk-outline" onPress={() => pick(null)} />
        {canCreate ? <Button title="Add new customer" variant="ghost" icon="person-add-outline" onPress={() => router.push({ pathname: '/customer/new', params: { pick: '1' } })} /> : null}
      </View>
      <FlatList
        data={list}
        keyExtractor={(c) => c.id}
        contentContainerStyle={{ padding: space.lg }}
        keyboardShouldPersistTaps="handled"
        renderItem={({ item }) => <CustomerRow c={item} selected={item.id === selected} onPress={() => pick(item.id)} />}
        ListEmptyComponent={<Empty icon="search-outline" title={canView ? 'No match' : 'Customer list not allowed'} message={canView ? 'Try a mobile number or add a new customer.' : 'Your ERP role needs "Customers – view".'} />}
      />
    </Screen>
  );
}
