import { router } from 'expo-router';
import { FlatList, Text, View } from 'react-native';
import { useCart } from '../../store/cart';
import { useLedger } from '../../store/ledger';
import { confirm } from '../../ui/dialogs';
import { Button, Card, Empty, Header, Row, Screen, colors, font, space } from '../../ui/components';

const time = (iso: string) => new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

/** Held (parked) bills in the navigation rail (SAC-POS web / wide screens): resume into the cart or delete. */
export default function Held() {
  const held = useLedger((s) => s.held);

  const resume = async (id: string) => {
    const bill = held.find((h) => h.id === id);
    if (!bill) return;
    if (useCart.getState().lines.length && !(await confirm('Replace cart?', 'The current cart will be replaced by the held bill.', 'Replace'))) return;
    useCart.getState().load(bill);
    useLedger.getState().removeHeld(id);
    router.push('/sell'); // the cart sits beside the products on wide screens
  };

  return (
    <Screen padded={false}>
      <Header title="Held bills" subtitle={`${held.length} parked · Hold in the cart parks a bill while you serve the next customer`} />
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
                <Button title="Resume" size="sm" onPress={() => resume(item.id)} testID={`resume-${item.id}`} />
              </Row>
            </Row>
          </Card>
        )}
      />
    </Screen>
  );
}
