import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useMemo, useState, type Ref } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { LineRow } from '../app/cart';
import { formatMoney, formatQty } from '../domain/money';
import type { CartLine, ComputedLine, Product } from '../domain/types';
import { validateLine } from '../domain/validation';
import { INDIA_STATES } from '../lib/indiaPlaces';
import { amountInWords } from '../lib/receipt';
import { useCartTotals } from '../lib/useCartTotals';
import { holdCurrentBill, saveQuotation } from '../services/pos';
import { useCart } from '../store/cart';
import { findByCode, searchProducts, useCatalog } from '../store/catalog';
import { useDevice } from '../store/device';
import { useCan } from '../store/session';
import { usePendingQty } from '../lib/useSyncInfo';
import { confirm, notify } from './dialogs';
import { Badge, Banner, Button, Card, Chip, Divider, IconButton, KeyValue, Row, colors, font, radius, space } from './components';

/**
 * GST invoice on wide screens (SAC-POS web, ERP → POS Billing, tablets): one page like a desktop
 * billing app. Bill-to and invoice details on top, the full item table (HSN, qty, rate, discount,
 * GST, amount) in the middle, and the tax summary with the actions on the right. Quick Bill keeps
 * the product-tile screen; phones keep the cart flow.
 */

const stateName = (code?: string | null) => INDIA_STATES.find((s) => s.code === code)?.name ?? null;
const today = () => new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });
const num = (t: string) => Number(t.replace(/[^0-9.]/g, '')) || 0;

/** A number cell that commits on blur / Enter (re-mounted by its key when the value changes). */
function Cell({ value, onCommit, width, label, editable = true, testID }: {
  value: number; onCommit: (v: number) => void; width: number; label: string; editable?: boolean; testID?: string;
}) {
  const [text, setText] = useState(String(value));
  if (!editable) return <Text style={[cellText, { width, textAlign: 'right' }]}>{formatQty(value)}</Text>;
  return (
    <TextInput
      accessibilityLabel={label}
      testID={testID}
      value={text}
      onChangeText={setText}
      onBlur={() => onCommit(num(text))}
      onSubmitEditing={() => onCommit(num(text))}
      keyboardType="decimal-pad"
      selectTextOnFocus
      style={{ width, height: 34, borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, paddingHorizontal: 6, textAlign: 'right', color: colors.text, backgroundColor: colors.surface, fontSize: font.sm }}
    />
  );
}

const cellText = { fontSize: font.sm, color: colors.text } as const;
const head = { fontSize: font.xs, color: colors.textMuted, fontWeight: '700' as const, textTransform: 'uppercase' as const };

// column widths of the item table (the item name takes the rest)
const W = { n: 28, hsn: 78, qty: 72, unit: 50, rate: 96, disc: 84, gst: 54, tax: 84, amt: 100, act: 64 };

function ItemRow({ line, index, canOverride, canCost, computed }: {
  line: CartLine; index: number; canOverride: boolean; canCost: boolean;
  computed: ComputedLine | undefined;
}) {
  const { setQty, updateLine, remove } = useCart.getState();
  const [open, setOpen] = useState(false);
  const issues = validateLine(line, { canOverridePrice: canOverride });
  const extra = [
    line.shortDescription,
    line.serialNumbers?.length ? `S/N ${line.serialNumbers.join(', ')}` : null,
  ].filter(Boolean).join(' · ');
  return (
    <View style={{ borderBottomWidth: 1, borderBottomColor: colors.border }}>
      <Row gap={space.sm} style={{ paddingVertical: 8, alignItems: 'center' }}>
        <Text style={[cellText, { width: W.n, color: colors.textMuted }]}>{index + 1}</Text>
        <View style={{ flex: 1, minWidth: 140 }}>
          <Text style={[cellText, { fontWeight: '700' }]} numberOfLines={2}>{line.name}</Text>
          <Text style={{ fontSize: font.xs, color: colors.textMuted }} numberOfLines={1}>
            {line.sku}{Math.abs(line.unitPrice - line.listPrice) > 0.001 ? ` · list ${formatMoney(line.listPrice)}` : ''}{extra ? ` · ${extra}` : ''}
          </Text>
        </View>
        <Text style={[cellText, { width: W.hsn }]} numberOfLines={1}>{line.hsn || '—'}</Text>
        <Cell key={`q${line.quantity}`} width={W.qty} label={`Quantity of ${line.name}`} value={line.quantity} onCommit={(v) => setQty(line.productId, v)} testID={`inv-qty-${line.productId}`} />
        <Text style={[cellText, { width: W.unit, color: colors.textMuted }]} numberOfLines={1}>{line.unit}</Text>
        {canOverride
          ? <Cell key={`r${line.unitPrice}`} width={W.rate} label={`Rate of ${line.name}`} value={line.unitPrice} onCommit={(v) => updateLine(line.productId, { unitPrice: v })} testID={`inv-rate-${line.productId}`} />
          : <Text style={[cellText, { width: W.rate, textAlign: 'right' }]}>{formatMoney(line.unitPrice)}</Text>}
        {canOverride
          ? <Cell key={`d${line.discountAmount}`} width={W.disc} label={`Discount on ${line.name}`} value={line.discountAmount} onCommit={(v) => updateLine(line.productId, { discountAmount: v })} testID={`inv-disc-${line.productId}`} />
          : <Text style={[cellText, { width: W.disc, textAlign: 'right' }]}>{line.discountAmount ? formatMoney(line.discountAmount) : '—'}</Text>}
        <Text style={[cellText, { width: W.gst, textAlign: 'right' }]}>{line.gstRate}%</Text>
        <Text style={[cellText, { width: W.tax, textAlign: 'right', color: colors.textMuted }]}>{formatMoney(computed?.gstAmount ?? 0)}</Text>
        <Text style={[cellText, { width: W.amt, textAlign: 'right', fontWeight: '800' }]}>{formatMoney(computed?.lineTotal ?? 0)}</Text>
        <Row gap={0} style={{ width: W.act, justifyContent: 'flex-end' }}>
          <IconButton icon={open ? 'chevron-up' : 'ellipsis-horizontal'} label={`More for ${line.name}: description, serial numbers${canCost ? ', cost' : ''}`} size={18} onPress={() => setOpen(!open)} />
          <IconButton icon="trash-outline" tone="danger" label={`Remove ${line.name}`} size={18} onPress={() => remove(line.productId)} />
        </Row>
      </Row>
      {issues.length && !open ? <Text style={{ color: colors.danger, fontSize: font.xs, marginLeft: W.n + space.sm, marginBottom: 6 }}>{issues.map((i) => i.message).join(' · ')}</Text> : null}
      {open ? <View style={{ paddingLeft: W.n + space.sm, paddingBottom: space.sm }}><LineRow line={line} canOverride={canOverride} canCost={canCost} /></View> : null}
    </View>
  );
}

export function GstInvoiceForm({ searchRef }: { searchRef?: Ref<TextInput> }) {
  const { totals, customer, lines, invoiceDiscount } = useCartTotals();
  const products = useCatalog((s) => s.products);
  const pending = usePendingQty();
  const company = useDevice((s) => s.info?.company);
  const canOverride = useCan('overridePrice');
  const canCost = useCan('enterCost');
  const canQuote = useCan('quote');
  const quoting = useCart((s) => s.mode === 'quotation') && canQuote;
  const fromQuotation = useCart((s) => s.fromQuotation);
  const notes = useCart((s) => s.notes);
  const { add, setCustomer, setInvoiceDiscount, setNotes } = useCart.getState();
  const [query, setQuery] = useState('');
  const [validDays, setValidDays] = useState(15);

  const results = useMemo(() => (query.trim() ? searchProducts(products, query, 8) : []), [products, query]);
  const computed = useMemo(() => Object.fromEntries(totals.lines.map((l) => [l.productId, l])), [totals.lines]);
  const qty = lines.reduce((n, l) => n + l.quantity, 0);

  const addProduct = (p: Product) => { add(p, 1); setQuery(''); };
  const submitSearch = () => {
    const code = query.trim();
    if (!code) return;
    const hit = findByCode(products, code) ?? (results.length === 1 ? results[0] : null);
    if (hit) addProduct(hit);
  };

  const supplyState = stateName(customer?.gstStateCode) || customer?.state || stateName(company?.gstStateCode) || company?.state || '—';
  const b2b = Boolean(customer?.gstin);

  const checkout = () => { if (lines.length) router.push('/checkout'); };
  const save = () => {
    try {
      const q = saveQuotation({ validDays });
      router.push({ pathname: '/quotation/[id]', params: { id: q.id, done: '1' } });
    } catch (e) {
      notify('Cannot save quotation', (e as Error).message);
    }
  };
  const hold = () => {
    if (useCart.getState().exchange) { notify('Cannot hold', 'Finish the exchange first: the returned value is waiting to be used on this bill.'); return; }
    try { holdCurrentBill(); } catch (e) { notify('Cannot hold', (e as Error).message); }
  };
  const clear = async () => {
    const ex = useCart.getState().exchange;
    const message = ex ? `This also cancels the exchange: give the customer ${formatMoney(ex.amount)} in cash for return ${ex.returnNumber}.` : 'All items will be removed.';
    if (await confirm(quoting ? 'Clear quotation?' : 'Clear invoice?', message, 'Clear', true)) useCart.getState().clear();
  };

  return (
    <View style={{ flex: 1, flexDirection: 'row' }}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: space.lg, paddingTop: space.sm, gap: space.md }} keyboardShouldPersistTaps="handled">
        {quoting ? <Banner tone="info" messages={['Quotation: no stock or money moves. Customers can be walk-in.']} /> : null}
        {!quoting && fromQuotation ? <Banner tone="info" messages={[`From quotation ${fromQuotation.number}: completing this sale marks it converted.`]} /> : null}

        {/* Bill to · Invoice details */}
        <Row gap={space.md} style={{ alignItems: 'stretch' }}>
          <Card style={{ flex: 3, padding: space.md }}>
            <Row style={{ justifyContent: 'space-between' }}>
              <Text style={head}>Bill to</Text>
              <Row gap={space.xs}>
                <Button title={customer ? 'Change' : 'Select customer'} size="sm" variant="secondary" icon="person-outline" onPress={() => router.push('/customer-picker')} testID="inv-customer" />
                {customer ? <IconButton icon="close" label="Remove customer" onPress={() => setCustomer(null)} /> : null}
              </Row>
            </Row>
            {customer ? (
              <View style={{ marginTop: space.xs }}>
                <Text style={{ fontSize: font.lg, fontWeight: '800', color: colors.text }}>{customer.name}</Text>
                <Text style={{ color: colors.textMuted, fontSize: font.sm }}>
                  {[customer.phone, customer.gstin ? `GSTIN ${customer.gstin}` : 'Unregistered (B2C)'].filter(Boolean).join(' · ')}
                </Text>
                {customer.address || customer.city ? <Text style={{ color: colors.textMuted, fontSize: font.sm }} numberOfLines={2}>{[customer.address, customer.city, customer.state].filter(Boolean).join(', ')}</Text> : null}
                <Row gap={space.xs} style={{ marginTop: 6, flexWrap: 'wrap' }}>
                  {!customer.creditApproved && !quoting ? <Badge tone="neutral" label="Cash only · credit needs admin approval" /> : null}
                  {customer.creditApproved ? <Badge tone="info" label={`Credit ${customer.creditLimit ? `limit ${formatMoney(customer.creditLimit)}` : 'no limit'} · ${customer.creditDays ?? 30} days`} /> : null}
                  {customer.outstanding > 0 ? <Badge tone="warning" label={`Outstanding ${formatMoney(customer.outstanding)}`} /> : null}
                </Row>
              </View>
            ) : (
              <Pressable onPress={() => router.push('/customer-picker')} style={{ marginTop: space.xs }}>
                <Text style={{ fontSize: font.lg, fontWeight: '800', color: colors.text }}>Walk-in customer</Text>
                <Text style={{ color: colors.textMuted, fontSize: font.sm }}>Select a customer for a B2B (GSTIN) bill, credit or their address on the invoice.</Text>
              </Pressable>
            )}
          </Card>
          <Card style={{ flex: 2, padding: space.md }}>
            <Text style={head}>{quoting ? 'Quotation details' : 'Invoice details'}</Text>
            <View style={{ marginTop: space.xs }}>
              <KeyValue label={quoting ? 'Quotation no.' : 'Invoice no.'} value="Given on save" muted />
              <KeyValue label="Date" value={today()} muted />
              <KeyValue label="Type" value={quoting ? 'Quotation' : b2b ? 'Tax invoice · B2B' : 'Tax invoice · B2C'} muted />
              <KeyValue label="Place of supply" value={supplyState} muted />
              <KeyValue label="GST" value={totals.taxSplit === 'igst' ? 'IGST (other state)' : 'CGST + SGST (same state)'} muted />
            </View>
          </Card>
        </Row>

        {/* Items */}
        <Card style={{ padding: space.md }}>
          <Row style={{ justifyContent: 'space-between', marginBottom: space.sm }}>
            <Text style={head}>Items · {lines.length} line{lines.length === 1 ? '' : 's'} · qty {formatQty(qty)}</Text>
            <IconButton icon="barcode-outline" label="Scan barcode" tone="primary" onPress={() => router.push('/scan')} />
          </Row>
          <View style={{ zIndex: 2 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, borderWidth: 1, borderColor: colors.primary, borderRadius: radius.md, paddingHorizontal: space.md, height: 44, backgroundColor: colors.surface }}>
              <Ionicons name="add-circle-outline" size={20} color={colors.primary} />
              <TextInput
                ref={searchRef}
                autoFocus
                value={query}
                onChangeText={setQuery}
                onSubmitEditing={submitSearch}
                placeholder="Add item: name, SKU, barcode or HSN  (F2) · Enter adds a scanned barcode"
                placeholderTextColor={colors.textFaint}
                style={{ flex: 1, color: colors.text, fontSize: font.md, height: 42 }}
                testID="inv-search"
              />
            </View>
            {results.length ? (
              <View style={{ borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, marginTop: 4, backgroundColor: colors.surface, overflow: 'hidden' }}>
                {results.map((p) => {
                  const available = p.available - (pending[p.id] || 0);
                  return (
                    <Pressable key={p.id} onPress={() => addProduct(p)} style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => ({ flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.md, paddingVertical: 8, backgroundColor: pressed || hovered ? colors.bg : colors.surface })}>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontWeight: '700', color: colors.text }} numberOfLines={1}>{p.name}</Text>
                        <Text style={{ fontSize: font.xs, color: colors.textMuted }} numberOfLines={1}>{[p.sku, p.hsn && `HSN ${p.hsn}`, `GST ${p.gstRate}%`].filter(Boolean).join(' · ')}</Text>
                      </View>
                      <Text style={{ fontSize: font.xs, color: available > 0 ? colors.success : colors.danger, fontWeight: '700' }}>{p.itemType === 'service' ? 'Service' : `${formatQty(available)} ${p.unit}`}</Text>
                      <Text style={{ fontWeight: '800', color: colors.text, width: 100, textAlign: 'right' }}>{formatMoney(p.price)}</Text>
                    </Pressable>
                  );
                })}
              </View>
            ) : null}
          </View>

          {/* table */}
          <Row gap={space.sm} style={{ marginTop: space.md, paddingBottom: 6, borderBottomWidth: 2, borderBottomColor: colors.border }}>
            <Text style={[head, { width: W.n }]}>#</Text>
            <Text style={[head, { flex: 1, minWidth: 140 }]}>Item</Text>
            <Text style={[head, { width: W.hsn }]}>HSN/SAC</Text>
            <Text style={[head, { width: W.qty, textAlign: 'right' }]}>Qty</Text>
            <Text style={[head, { width: W.unit }]}>Unit</Text>
            <Text style={[head, { width: W.rate, textAlign: 'right' }]}>Rate ₹</Text>
            <Text style={[head, { width: W.disc, textAlign: 'right' }]}>Disc ₹</Text>
            <Text style={[head, { width: W.gst, textAlign: 'right' }]}>GST</Text>
            <Text style={[head, { width: W.tax, textAlign: 'right' }]}>Tax ₹</Text>
            <Text style={[head, { width: W.amt, textAlign: 'right' }]}>Amount ₹</Text>
            <View style={{ width: W.act }} />
          </Row>
          {lines.length ? lines.map((l, i) => (
            <ItemRow key={l.productId} line={l} index={i} canOverride={canOverride} canCost={canCost} computed={computed[l.productId]} />
          )) : (
            <View style={{ paddingVertical: space.xl, alignItems: 'center' }}>
              <Ionicons name="receipt-outline" size={32} color={colors.textFaint} />
              <Text style={{ color: colors.textMuted, marginTop: space.xs }}>No items yet. Type above or scan a barcode to add products.</Text>
            </View>
          )}
          <Text style={{ color: colors.textFaint, fontSize: font.xs, marginTop: space.sm }}>Rates and discounts are before GST. ⋯ on a row: description, serial numbers{canCost ? ', cost' : ''}.</Text>
        </Card>

        {/* Notes */}
        <Card style={{ padding: space.md }}>
          <Text style={head}>Notes / terms (printed on the {quoting ? 'quotation' : 'invoice'})</Text>
          <TextInput
            value={notes}
            onChangeText={setNotes}
            placeholder="e.g. Delivery by Friday · Goods once sold will not be taken back"
            placeholderTextColor={colors.textFaint}
            multiline
            maxLength={500}
            style={{ marginTop: space.xs, borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, padding: space.sm, minHeight: 56, color: colors.text }}
            testID="inv-notes"
          />
        </Card>
      </ScrollView>

      {/* Summary and actions */}
      <View style={{ width: 340, borderLeftWidth: 1, borderLeftColor: colors.border, backgroundColor: colors.surface }}>
        <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.sm }} keyboardShouldPersistTaps="handled">
          <Text style={head}>Summary</Text>
          <KeyValue label="Subtotal" value={formatMoney(totals.subtotal)} muted />
          {totals.itemDiscountTotal > 0 ? <KeyValue label="Item discounts" value={`− ${formatMoney(totals.itemDiscountTotal)}`} muted /> : null}
          {canOverride ? (
            <Row style={{ justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ color: colors.textMuted, fontSize: font.sm }}>Bill discount ₹</Text>
              <Cell key={`b${invoiceDiscount}`} width={110} label="Bill discount before GST" value={invoiceDiscount} onCommit={setInvoiceDiscount} testID="inv-bill-discount" />
            </Row>
          ) : totals.invoiceDiscount > 0 ? <KeyValue label="Bill discount" value={`− ${formatMoney(totals.invoiceDiscount)}`} muted /> : null}
          <KeyValue label="Taxable value" value={formatMoney(totals.taxableAmount)} />
          {totals.taxSplit === 'igst'
            ? <KeyValue label="IGST" value={formatMoney(totals.igstAmount)} muted />
            : (
              <>
                <KeyValue label="CGST" value={formatMoney(totals.cgstAmount)} muted />
                <KeyValue label="SGST" value={formatMoney(totals.sgstAmount)} muted />
              </>
            )}
          {totals.roundOff && Math.abs(totals.roundOff) >= 0.01 ? <KeyValue label="Round off" value={formatMoney(totals.roundOff)} muted /> : null}
          <Divider />
          <View style={{ backgroundColor: colors.bg, borderRadius: radius.md, padding: space.md }}>
            <Text style={{ color: colors.textMuted, fontSize: font.xs, fontWeight: '700' }}>{quoting ? 'QUOTATION TOTAL' : 'INVOICE TOTAL'}</Text>
            <Text style={{ fontSize: 30, fontWeight: '900', color: colors.text }} testID="inv-total">{formatMoney(totals.grandTotal)}</Text>
            {totals.grandTotal > 0 ? <Text style={{ color: colors.textMuted, fontSize: font.xs, marginTop: 2 }}>Rupees {amountInWords(totals.grandTotal).toLowerCase()}</Text> : null}
          </View>

          {quoting ? (
            <>
              <Row gap={space.xs} style={{ marginTop: space.sm, alignItems: 'center', flexWrap: 'wrap' }}>
                <Text style={{ color: colors.textMuted, fontSize: font.sm, marginRight: 4 }}>Valid for</Text>
                {[7, 15, 30].map((d) => <Chip key={d} label={`${d} days`} active={validDays === d} onPress={() => setValidDays(d)} />)}
              </Row>
              <Button title="Save quotation" icon="document-text-outline" size="lg" onPress={save} disabled={!lines.length} testID="inv-save-quotation" />
            </>
          ) : (
            <>
              <Button title="Save & receive payment  (F9)" icon="card-outline" size="lg" onPress={checkout} disabled={!lines.length} style={{ marginTop: space.sm }} testID="inv-checkout" />
              <Text style={{ color: colors.textFaint, fontSize: font.xs, textAlign: 'center' }}>Next: cash / UPI / card / credit, bill date, PO, transport, print.</Text>
            </>
          )}
          <Row gap={space.sm}>
            {!quoting ? <Button title="Hold" variant="secondary" icon="pause" onPress={hold} disabled={!lines.length} style={{ flex: 1 }} testID="inv-hold" /> : null}
            <Button title="Clear" variant="secondary" icon="trash-outline" onPress={clear} disabled={!lines.length} style={{ flex: 1 }} testID="inv-clear" />
          </Row>
        </ScrollView>
      </View>
    </View>
  );
}
