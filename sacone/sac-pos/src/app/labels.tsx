import { useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import type { Product } from '../domain/types';
import { LABEL_SIZES, barcodeValue, labelSettingsFrom, labelsHtml, type LabelProduct } from '../lib/labels';
import { searchProducts, useCatalog } from '../store/catalog';
import { useDevice } from '../store/device';
import { Banner, Button, Card, Chip, Header, Row, Screen, SearchBar, SectionTitle, Stepper, colors, font, space } from '../ui/components';
import { printDocument } from '../lib/printDocument';
import { goBack } from '../lib/nav';

/** SAC-POS catalogue item → the product shape the label layout uses (same as the ERP). */
const toLabel = (p: Product): LabelProduct => ({
  name: p.name, sku: p.sku, barcode: p.barcode, mrp: p.mrp, sellingPrice: p.price, gstPercentage: p.gstRate,
  hsnCode: p.hsn, unitAbbreviation: p.unit, categoryName: p.category,
});

const PT_PER_MM = 72 / 25.4;

/**
 * Print barcode labels from the phone: pick products (search / scanner), copies and size.
 * Details printed on each label follow ERP → Settings → Barcode labels.
 */
export default function Labels() {
  const params = useLocalSearchParams<{ productId?: string }>();
  const products = useCatalog((s) => s.products);
  const info = useDevice((s) => s.info);
  const defaults = useMemo(() => {
    const l = info?.settings?.labels;
    return labelSettingsFrom([{ key: 'label.size', value: l?.size }, { key: 'label.fields', value: l?.fields }, { key: 'label.footer', value: l?.footer }]);
  }, [info]);

  const [size, setSize] = useState(defaults.size);
  const [copies, setCopies] = useState<Record<string, number>>(() => (params.productId ? { [params.productId]: 1 } : {}));
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const chosen = Object.keys(copies).map((id) => products[id]).filter(Boolean) as Product[];
  const results = q.trim() ? searchProducts(products, q, 8).filter((p) => p.itemType !== 'service') : [];
  const total = chosen.reduce((s, p) => s + (copies[p.id] || 0), 0);
  const sizeInfo = LABEL_SIZES.find((s) => s.value === size) ?? LABEL_SIZES[0];

  const add = (p: Product) => {
    setCopies((c) => ({ ...c, [p.id]: (c[p.id] || 0) + 1 }));
    setQ('');
  };
  // Hardware scanner types the code and Enter: an exact barcode / SKU match is added at once.
  const onSubmit = () => {
    const code = q.trim().toLowerCase();
    const exact = Object.values(products).find((p) => p.isActive && (String(p.barcode || '').toLowerCase() === code || p.sku.toLowerCase() === code));
    if (exact) add(exact);
    else if (results.length === 1) add(results[0]);
  };

  const print = async () => {
    if (!total) { setError('Add at least one label'); return; }
    if (total > 1000) { setError('Print at most 1000 labels at a time'); return; }
    setBusy(true);
    setError(null);
    try {
      const html = labelsHtml(chosen.map((p) => ({ product: toLabel(p), copies: copies[p.id] || 0 })), {
        size, fields: defaults.fields, footer: defaults.footer, company: { businessName: info?.settings?.labels?.businessName || info?.company?.businessName || '' },
      });
      const page = sizeInfo.cols
        ? { width: 595, height: 842 }
        : { width: Math.round(sizeInfo.w * PT_PER_MM), height: Math.round(sizeInfo.h * PT_PER_MM) };
      await printDocument({ html, ...page, margins: { left: 0, top: 0, right: 0, bottom: 0 } });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen scroll padded={false}
      footer={<View style={{ padding: space.lg }}><Button title={`Print ${total} label${total === 1 ? '' : 's'}`} icon="print-outline" size="lg" loading={busy} disabled={!total} onPress={print} testID="print-labels" /></View>}>
      <Header title="Print barcode labels" subtitle="Details as set in ERP → Settings → Barcode labels" onBack={() => goBack()} />
      <View style={{ paddingHorizontal: space.lg }}>
        {error ? <Banner tone="danger" messages={[error]} /> : null}
        <SearchBar value={q} onChangeText={setQ} placeholder="Scan barcode or search product" onSubmitEditing={onSubmit} autoFocus={!params.productId} />
        {results.map((p) => (
          <Pressable key={p.id} onPress={() => add(p)} style={{ paddingVertical: space.sm, borderBottomWidth: 1, borderBottomColor: colors.border }}>
            <Text style={{ fontWeight: '700', color: colors.text }}>{p.name}</Text>
            <Text style={{ color: colors.textMuted, fontSize: font.xs }}>{barcodeValue(toLabel(p)) || 'no barcode / SKU'}</Text>
          </Pressable>
        ))}

        <SectionTitle>Labels</SectionTitle>
        {chosen.length ? chosen.map((p) => (
          <Card key={p.id} style={{ marginBottom: space.sm, padding: space.md }}>
            <Row style={{ justifyContent: 'space-between' }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontWeight: '700', color: colors.text }} numberOfLines={1}>{p.name}</Text>
                <Text style={{ color: colors.textMuted, fontSize: font.xs }}>{barcodeValue(toLabel(p)) || 'no barcode / SKU'}</Text>
              </View>
              <Stepper value={copies[p.id] || 0} integer onChange={(v) => setCopies((c) => {
                const next = { ...c };
                if (v <= 0) delete next[p.id]; else next[p.id] = Math.min(500, v);
                return next;
              })} />
            </Row>
          </Card>
        )) : <Text style={{ color: colors.textMuted }}>Scan or search a product to add it.</Text>}

        <SectionTitle>Label size</SectionTitle>
        <Row style={{ flexWrap: 'wrap' }}>
          {LABEL_SIZES.map((s) => <Chip key={s.value} label={s.cols ? `A4 · ${s.cols * (s.rows ?? 1)}` : `${s.w}×${s.h} mm`} active={size === s.value} onPress={() => setSize(s.value)} />)}
        </Row>
        <Text style={{ color: colors.textFaint, fontSize: font.xs, marginTop: space.sm, marginBottom: space.xl }}>
          {sizeInfo.cols
            ? `A4 sheet, ${sizeInfo.cols} × ${sizeInfo.rows} labels per page. Print at 100% (no fit to page).`
            : `Label printer roll ${sizeInfo.w} × ${sizeInfo.h} mm: choose your label printer and this paper size, 100%.`}
        </Text>
      </View>
    </Screen>
  );
}
