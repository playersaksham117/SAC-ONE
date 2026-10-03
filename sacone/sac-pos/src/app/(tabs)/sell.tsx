import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { useShallow } from 'zustand/react/shallow';
import { formatMoney, formatQty } from '../../domain/money';
import type { Product } from '../../domain/types';
import { usePendingQty, useSyncBadge } from '../../lib/useSyncInfo';
import { useCartTotals } from '../../lib/useCartTotals';
import { useCart } from '../../store/cart';
import { searchProducts, useCatalog } from '../../store/catalog';
import { useLedger } from '../../store/ledger';
import { useCurrentUser } from '../../store/session';
import { syncNow } from '../../sync/engine';
import { ExchangeNotice } from '../../ui/ExchangeNotice';
import { Badge, Chip, Empty, Header, IconButton, Row, Screen, SearchBar, colors, font, radius, space } from '../../ui/components';

function stockTone(available: number) {
  if (available <= 0) return 'danger' as const;
  if (available <= 5) return 'warning' as const;
  return 'success' as const;
}

export default function Sell() {
  const user = useCurrentUser();
  const products = useCatalog((s) => s.products);
  const pending = usePendingQty();
  const lines = useCart((s) => s.lines);
  const add = useCart((s) => s.add);
  const heldCount = useLedger((s) => s.held.length);
  const badge = useSyncBadge();
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<string | null>(null);

  const categories = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const p of Object.values(products)) if (p.isActive && p.category) counts[p.category] = (counts[p.category] || 0) + 1;
    return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([c]) => c);
  }, [products]);

  const results = useMemo(() => {
    const list = searchProducts(products, query, 200);
    return category ? list.filter((p) => p.category === category) : list;
  }, [products, query, category]);

  const qtyInCart = useMemo(() => Object.fromEntries(lines.map((l) => [l.productId, l.quantity])), [lines]);
  const totals = useCart(useShallow((s) => ({ count: s.lines.reduce((n, l) => n + l.quantity, 0), n: s.lines.length })));
  const grand = useCartTotals().totals.grandTotal;

  const addProduct = (p: Product) => {
    add(p, 1);
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
  };

  const renderItem = ({ item }: { item: Product }) => {
    const available = item.available - (pending[item.id] || 0);
    const inCart = qtyInCart[item.id];
    return (
      <Pressable
        onPress={() => addProduct(item)}
        testID={`product-${item.sku}`}
        style={({ pressed }) => ({
          flexDirection: 'row', alignItems: 'center', gap: space.md, backgroundColor: colors.surface, padding: space.md,
          borderRadius: radius.lg, borderWidth: 1, borderColor: inCart ? colors.primary : colors.border, marginBottom: space.sm,
          opacity: pressed ? 0.8 : 1,
        })}
      >
        <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: colors.primary, fontWeight: '800', fontSize: font.lg }}>{item.name.slice(0, 1).toUpperCase()}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: font.md, fontWeight: '700', color: colors.text }} numberOfLines={1}>{item.name}</Text>
          <Text style={{ fontSize: font.xs, color: colors.textMuted, marginTop: 2 }} numberOfLines={1}>
            {item.sku}{item.brand ? ` · ${item.brand}` : ''} · GST {item.gstRate}%
          </Text>
          <View style={{ marginTop: 6 }}>
            <Badge tone={stockTone(available)} label={available <= 0 ? 'Out of stock' : `${formatQty(available)} ${item.unit} in stock`} />
          </View>
        </View>
        <View style={{ alignItems: 'flex-end', gap: 6 }}>
          <Text style={{ fontSize: font.lg, fontWeight: '800', color: colors.text }}>{formatMoney(item.price)}</Text>
          {inCart ? (
            <View style={{ backgroundColor: colors.primary, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 3 }}>
              <Text style={{ color: '#fff', fontWeight: '800', fontSize: font.xs }}>× {formatQty(inCart)}</Text>
            </View>
          ) : (
            <Ionicons name="add-circle" size={26} color={colors.primary} />
          )}
        </View>
      </Pressable>
    );
  };

  return (
    <Screen padded={false}>
      <Header
        title="Sell"
        subtitle={`${user?.name ?? ''} · ${badge.label}`}
        right={(
          <Row gap={2}>
            <IconButton icon="refresh" label="Sync now" onPress={() => syncNow()} />
            <View>
              <IconButton icon="pause-circle-outline" label="Held bills" onPress={() => router.push('/sales?tab=held')} />
              {heldCount ? (
                <View style={{ position: 'absolute', top: 0, right: 0, backgroundColor: colors.warning, borderRadius: 8, minWidth: 16, height: 16, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ color: '#fff', fontSize: 10, fontWeight: '800' }}>{heldCount}</Text>
                </View>
              ) : null}
            </View>
          </Row>
        )}
      />
      <View style={{ paddingHorizontal: space.lg }}>
        <ExchangeNotice />
        <SearchBar
          value={query}
          onChangeText={setQuery}
          placeholder="Search name, SKU or barcode"
          right={<IconButton icon="barcode-outline" label="Scan barcode" tone="primary" onPress={() => router.push('/scan')} />}
        />
        {categories.length ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: space.sm }} contentContainerStyle={{ gap: space.sm }}>
            <Chip label="All" active={!category} onPress={() => setCategory(null)} />
            {categories.map((c) => <Chip key={c} label={c} active={category === c} onPress={() => setCategory(category === c ? null : c)} />)}
          </ScrollView>
        ) : null}
      </View>

      <FlatList
        data={results}
        keyExtractor={(p) => p.id}
        renderItem={renderItem}
        contentContainerStyle={{ padding: space.lg, paddingBottom: totals.n ? 110 : 40 }}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={(
          <Empty
            icon="cube-outline"
            title={Object.keys(products).length ? 'No matching products' : 'No products yet'}
            message={Object.keys(products).length ? 'Try another name, SKU or barcode.' : 'Products and stock download from SACONE ERP automatically. Tap sync to fetch now.'}
          />
        )}
      />

      {totals.n ? (
        <Pressable
          testID="open-cart"
          onPress={() => router.push('/cart')}
          style={({ pressed }) => ({
            position: 'absolute', left: space.lg, right: space.lg, bottom: space.lg, height: 64, borderRadius: radius.lg,
            backgroundColor: colors.dark, flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.lg, gap: space.md,
            opacity: pressed ? 0.9 : 1,
          })}
        >
          <View style={{ backgroundColor: colors.primary, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 4 }}>
            <Text style={{ color: '#fff', fontWeight: '800' }}>{formatQty(totals.count)}</Text>
          </View>
          <Text style={{ color: '#CBD5E1', flex: 1, fontWeight: '600' }}>{totals.n} item{totals.n > 1 ? 's' : ''} in cart</Text>
          <Text style={{ color: '#fff', fontWeight: '800', fontSize: font.lg }}>{formatMoney(grand)}</Text>
          <Ionicons name="chevron-forward" size={20} color="#fff" />
        </Pressable>
      ) : null}
    </Screen>
  );
}
