import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Platform, Pressable, ScrollView, Text, View, type TextInput } from 'react-native';
import { useShallow } from 'zustand/react/shallow';
import { formatMoney, formatQty } from '../../domain/money';
import { inclGst } from '../../domain/tax';
import type { CartLine, Product } from '../../domain/types';
import { usePendingQty, useSyncBadge } from '../../lib/useSyncInfo';
import { useCartTotals } from '../../lib/useCartTotals';
import { GST_BILLS_HERE, lineKey, useCart } from '../../store/cart';
import { nextTap, usePrefs, type TapTrack } from '../../store/prefs';
import { findByCode, searchProducts, useCatalog } from '../../store/catalog';
import { CartPanel } from '../cart';
import { GstInvoiceForm } from '../../ui/GstInvoiceForm';
import { useHotkeys, useProductColumns, useWide } from '../../ui/layout';
import { useLedger } from '../../store/ledger';
import { useCan, useCurrentUser } from '../../store/session';
import { syncNow } from '../../sync/engine';
import { ExchangeNotice } from '../../ui/ExchangeNotice';
import { QtyPrompt } from '../../ui/QtyPrompt';
import { Badge, Chip, Empty, Header, IconButton, Row, Screen, SearchBar, Segmented, colors, font, radius, space } from '../../ui/components';

/** Retail price (billed by default) with its label, and the minimum when it is lower. */
function RetailPrice({ product, shown }: { product: Product; shown: (p: Product) => number }) {
  const min = product.minPrice != null && product.minPrice > 0 && product.minPrice < product.price - 0.001
    ? shown({ ...product, price: product.minPrice }) : null;
  return (
    <View style={{ alignItems: 'flex-end' }} testID={`retail-${product.sku}`}>
      <Text style={{ fontSize: 10, fontWeight: '700', color: colors.textMuted, letterSpacing: 0.5 }}>RETAIL</Text>
      <Text style={{ fontSize: font.lg, fontWeight: '800', color: colors.text }}>{formatMoney(shown(product))}</Text>
      {min != null ? <Text style={{ fontSize: 10, color: colors.textFaint }}>Min {formatMoney(min)}</Text> : null}
    </View>
  );
}

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
  const mode = useCart((s) => s.mode);
  const setMode = useCart((s) => s.setMode);
  const series = useCart((s) => s.series);
  const setSeries = useCart((s) => s.setSeries);
  // Quick Bill: products show their rate incl. GST (the bill still books the price before GST)
  const quickRates = series === 'quick' && mode !== 'quotation';
  const shownPrice = (p: Product) => (quickRates ? inclGst(p.price, p.gstRate) : p.price);
  const pickType = (v: 'gst' | 'quick' | 'quotation') => {
    if (v === 'quotation') { setMode('quotation'); return; }
    setMode('sale');
    setSeries(v);
  };
  const canQuote = useCan('quote');
  const quoting = canQuote && mode === 'quotation';
  const add = useCart((s) => s.add);
  const setQty = useCart((s) => s.setQty);
  const [qtyFor, setQtyFor] = useState<Product | null>(null);
  const heldCount = useLedger((s) => s.held.length);
  const badge = useSyncBadge();
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<string | null>(null);
  const wide = useWide();
  const columns = useProductColumns();
  const searchRef = useRef<TextInput>(null);
  // SAC-POS web (wide): GST bills and quotations use the full invoice form; Quick Bill keeps the product tiles
  const invoiceForm = wide && !quickRates && GST_BILLS_HERE;
  // F2: search (or scan) · F9: checkout — counter PCs with a keyboard and USB scanner
  const hotkeys = useMemo(() => ({
    F2: () => searchRef.current?.focus(),
    F9: () => { if (useCart.getState().lines.length && useCart.getState().mode !== 'quotation') router.push('/checkout'); },
  }), []);
  useHotkeys(hotkeys, wide);

  const categories = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const p of Object.values(products)) if (p.isActive && p.category) counts[p.category] = (counts[p.category] || 0) + 1;
    return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([c]) => c);
  }, [products]);

  const results = useMemo(() => {
    const list = searchProducts(products, query, 200);
    return category ? list.filter((p) => p.category === category) : list;
  }, [products, query, category]);

  // a product on two lines (triple tap) shows its total; the quantity prompt edits its last line
  const qtyInCart = useMemo(() => {
    const out: Record<string, number> = {};
    for (const l of lines) out[l.productId] = (out[l.productId] || 0) + l.quantity;
    return out;
  }, [lines]);
  const lastLine = useMemo(() => Object.fromEntries(lines.map((l) => [l.productId, l])), [lines]);
  const lineCount = useMemo(() => {
    const out: Record<string, number> = {};
    for (const l of lines) out[l.productId] = (out[l.productId] || 0) + 1;
    return out;
  }, [lines]);
  const totals = useCart(useShallow((s) => ({ count: s.lines.reduce((n, l) => n + l.quantity, 0), n: s.lines.length })));
  const grand = useCartTotals().totals.grandTotal;

  const tripleTap = usePrefs((s) => s.tripleTapNewLine);
  const taps = useRef<TapTrack | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  useEffect(() => {
    if (!notice) return undefined;
    const t = setTimeout(() => setNotice(null), 1800);
    return () => clearTimeout(t);
  }, [notice]);

  const addProduct = (p: Product) => {
    add(p, 1);
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
  };

  /**
   * A tap on a product adds one. Three quick taps (when switched on in More) take back the first
   * two and put the product on a new line of the bill instead.
   */
  const tapProduct = (p: Product) => {
    if (!tripleTap) { addProduct(p); return; }
    const prev = taps.current;
    const { track, third } = nextTap(prev, p.id, Date.now(), () => useCart.getState().lines);
    taps.current = track;
    if (!third) { addProduct(p); return; }
    useCart.getState().restoreLines((prev?.before as CartLine[]) ?? useCart.getState().lines);
    const onBill = useCart.getState().lines.some((l) => l.productId === p.id);
    add(p, 1, { newLine: true });
    setNotice(onBill ? `${p.name}: added on a new line` : `${p.name} added`);
    if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
  };

  /** Enter in the search box: a USB scanner's barcode (or an exact SKU) adds the item at once. */
  const submitSearch = () => {
    const code = query.trim();
    if (!code) return;
    const hit = findByCode(products, code) ?? (results.length === 1 ? results[0] : null);
    if (hit) {
      addProduct(hit);
      setQuery('');
    }
  };

  /** A product as a tile in the grid (wide screens). */
  const renderTile = ({ item }: { item: Product }) => {
    const available = item.available - (pending[item.id] || 0);
    const inCart = qtyInCart[item.id];
    return (
      <Pressable
        onPress={() => tapProduct(item)}
        onLongPress={() => setQtyFor(item)}
        delayLongPress={350}
        testID={`product-${item.sku}`}
        style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => ({
          flex: 1, margin: space.xs, minHeight: 132, backgroundColor: colors.surface, padding: space.md, borderRadius: radius.lg,
          borderWidth: inCart ? 2 : 1, borderColor: inCart ? colors.primary : hovered ? colors.primary : colors.border,
          opacity: pressed ? 0.85 : 1, justifyContent: 'space-between',
        })}
      >
        <View>
          <Text style={{ fontSize: font.md, fontWeight: '700', color: colors.text }} numberOfLines={2}>{item.name}</Text>
          <Text style={{ fontSize: font.xs, color: colors.textMuted, marginTop: 2 }} numberOfLines={1}>{item.sku}{quickRates ? ' · incl. GST' : ` · GST ${item.gstRate}%`}</Text>
        </View>
        <View style={{ marginTop: space.sm }}>
          {item.itemType === 'service'
            ? <Badge tone="info" label="Service" />
            : <Badge tone={stockTone(available)} label={available <= 0 ? 'Out of stock' : `${formatQty(available)} ${item.unit}`} />}
          <Row style={{ justifyContent: 'space-between', marginTop: space.sm }}>
            <RetailPrice product={item} shown={shownPrice} />
            {inCart ? (
              <Pressable onPress={() => setQtyFor(item)} hitSlop={8} accessibilityLabel={`Change quantity of ${item.name}`}
                style={{ backgroundColor: colors.primary, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 3 }}>
                <Text style={{ color: '#fff', fontWeight: '800', fontSize: font.xs }}>× {formatQty(inCart)}{lineCount[item.id] > 1 ? ` · ${lineCount[item.id]} lines` : ''}</Text>
              </Pressable>
            ) : <Ionicons name="add-circle" size={24} color={colors.primary} />}
          </Row>
        </View>
      </Pressable>
    );
  };

  const renderItem = ({ item }: { item: Product }) => {
    const available = item.available - (pending[item.id] || 0);
    const inCart = qtyInCart[item.id];
    return (
      <Pressable
        onPress={() => tapProduct(item)}
        onLongPress={() => setQtyFor(item)}
        delayLongPress={350}
        accessibilityHint={tripleTap ? 'Tap to add one, tap 3 times quickly for a new line, press and hold to type a quantity' : 'Tap to add one, press and hold to type a quantity'}
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
            {item.sku}{item.brand ? ` · ${item.brand}` : ''}{quickRates ? ' · incl. GST' : ` · GST ${item.gstRate}%`}
          </Text>
          <View style={{ marginTop: 6 }}>
            {item.itemType === 'service'
              ? <Badge tone="info" label="Service" />
              : <Badge tone={stockTone(available)} label={available <= 0 ? 'Out of stock' : `${formatQty(available)} ${item.unit} in stock`} />}
          </View>
        </View>
        <View style={{ alignItems: 'flex-end', gap: 6 }}>
          <RetailPrice product={item} shown={shownPrice} />
          {inCart ? (
            <Pressable
              onPress={() => setQtyFor(item)}
              hitSlop={8}
              accessibilityLabel={`Change quantity of ${item.name}`}
              style={{ backgroundColor: colors.primary, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 3, flexDirection: 'row', alignItems: 'center', gap: 4 }}
            >
              <Text style={{ color: '#fff', fontWeight: '800', fontSize: font.xs }}>× {formatQty(inCart)}{lineCount[item.id] > 1 ? ` · ${lineCount[item.id]} lines` : ''}</Text>
              <Ionicons name="create-outline" size={12} color="#fff" />
            </Pressable>
          ) : (
            <Ionicons name="add-circle" size={26} color={colors.primary} />
          )}
        </View>
      </Pressable>
    );
  };

  const productList = (
    <FlatList
      key={wide ? `grid-${columns}` : 'list'}
      data={results}
      keyExtractor={(p) => p.id}
      renderItem={wide ? renderTile : renderItem}
      numColumns={wide ? columns : 1}
      contentContainerStyle={{ padding: wide ? space.md : space.lg, paddingBottom: !wide && totals.n ? 110 : 40 }}
      keyboardShouldPersistTaps="handled"
      ListEmptyComponent={(
        <Empty
          icon="cube-outline"
          title={Object.keys(products).length ? 'No matching products' : 'No products yet'}
          message={Object.keys(products).length ? 'Try another name, SKU or barcode.' : 'Products and stock download from SACONE ERP automatically. Tap sync to fetch now.'}
        />
      )}
    />
  );

  return (
    <Screen padded={false} full={wide}>
      <View style={{ flex: 1, flexDirection: wide ? 'row' : 'column' }}>
      <View style={{ flex: 1 }}>
      <Header
        title={invoiceForm ? (quoting ? 'Quotation' : 'GST Invoice') : 'Sell'}
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
        <View style={{ marginBottom: space.sm }}>
          <Segmented<'gst' | 'quick' | 'quotation'>
            value={quoting ? 'quotation' : series}
            onChange={pickType}
            options={[
              ...(GST_BILLS_HERE ? [{ value: 'gst' as const, label: 'GST Bill' }] : []),
              { value: 'quick', label: 'Quick Bill' },
              ...(canQuote ? [{ value: 'quotation' as const, label: 'Quotation' }] : []),
            ]}
          />
          {!quoting && series === 'quick' ? (
            <Text style={{ color: colors.textMuted, fontSize: font.xs, marginTop: 4 }}>Quick Bill: walk-in / unregistered customers, own number series (QB), GST included.</Text>
          ) : null}
        </View>
        <ExchangeNotice />
        {invoiceForm ? null : (<>
        <SearchBar
          inputRef={searchRef}
          autoFocus={wide}
          onSubmitEditing={submitSearch}
          value={query}
          onChangeText={setQuery}
          placeholder={wide ? 'Search or scan a barcode  (F2)' : 'Search name, SKU, barcode or HSN'}
          right={<IconButton icon="barcode-outline" label="Scan barcode" tone="primary" onPress={() => router.push('/scan')} />}
        />
        {categories.length ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: space.sm }} contentContainerStyle={{ gap: space.sm }}>
            <Chip label="All" active={!category} onPress={() => setCategory(null)} />
            {categories.map((c) => <Chip key={c} label={c} active={category === c} onPress={() => setCategory(category === c ? null : c)} />)}
          </ScrollView>
        ) : null}
        </>)}
      </View>

      {invoiceForm ? <GstInvoiceForm searchRef={searchRef} /> : productList}
      </View>

      {wide && !invoiceForm ? (
        <View style={{ width: 420, borderLeftWidth: 1, borderLeftColor: colors.border, backgroundColor: colors.bg }}>
          <CartPanel />
        </View>
      ) : null}
      </View>

      {!wide && totals.n ? (
        <Pressable
          testID="open-cart"
          onPress={() => router.push('/cart')}
          style={({ pressed }) => ({
            position: 'absolute', left: space.lg, right: space.lg, bottom: space.lg, height: 64, borderRadius: radius.lg,
            backgroundColor: quoting ? colors.primary : colors.dark, flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.lg, gap: space.md,
            opacity: pressed ? 0.9 : 1,
          })}
        >
          <View style={{ backgroundColor: colors.primary, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 4 }}>
            <Text style={{ color: '#fff', fontWeight: '800' }}>{formatQty(totals.count)}</Text>
          </View>
          <Text style={{ color: '#CBD5E1', flex: 1, fontWeight: '600' }}>{quoting ? 'Quotation · ' : ''}{totals.n} item{totals.n > 1 ? 's' : ''}{quoting ? '' : ' in cart'}</Text>
          <Text style={{ color: '#fff', fontWeight: '800', fontSize: font.lg }}>{formatMoney(grand)}</Text>
          <Ionicons name="chevron-forward" size={20} color="#fff" />
        </Pressable>
      ) : null}

      {notice ? (
        <View pointerEvents="none" testID="tap-notice"
          style={{ position: 'absolute', left: space.lg, right: space.lg, bottom: !wide && totals.n ? 92 : space.lg, alignItems: 'center' }}>
          <View style={{ backgroundColor: colors.dark, borderRadius: radius.pill, paddingHorizontal: space.lg, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Ionicons name="return-down-forward" size={16} color="#fff" />
            <Text style={{ color: '#fff', fontWeight: '700' }} numberOfLines={1}>{notice}</Text>
          </View>
        </View>
      ) : null}

      <QtyPrompt
        product={qtyFor}
        inclusive={quickRates}
        current={qtyFor ? lastLine[qtyFor.id]?.quantity || 0 : 0}
        available={qtyFor ? qtyFor.available - (pending[qtyFor.id] || 0) : 0}
        onSet={(q) => {
          if (!qtyFor) return;
          const last = lastLine[qtyFor.id];
          if (last) setQty(lineKey(last), q);
          else if (q > 0) add(qtyFor, q);
        }}
        onClose={() => setQtyFor(null)}
      />
    </Screen>
  );
}
