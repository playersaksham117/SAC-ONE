import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { formatMoney, formatQty } from '../domain/money';
import type { CartLine } from '../domain/types';
import { validateLine } from '../domain/validation';
import { useCartTotals } from '../lib/useCartTotals';
import { holdCurrentBill, saveQuotation } from '../services/pos';
import { useCart } from '../store/cart';
import { ExchangeNotice } from '../ui/ExchangeNotice';
import { useCan } from '../store/session';
import { confirm, notify } from '../ui/dialogs';
import { parseSerials } from '../domain/serials';
import {
  Badge, Banner, Button, Card, Chip, Divider, Empty, Header, IconButton, KeyValue, Row, Screen, SectionTitle, Stepper,
  colors, font, radius, space,
} from '../ui/components';

function NumberInput({ value, onCommit, label, testID }: { value: number; onCommit: (v: number) => void; label: string; testID?: string }) {
  const [text, setText] = useState(String(value));
  return (
    <View style={{ flex: 1 }}>
      <Text style={{ fontSize: font.xs, color: colors.textMuted, marginBottom: 4, fontWeight: '600' }}>{label}</Text>
      <TextInput
        testID={testID}
        value={text}
        onChangeText={setText}
        onBlur={() => onCommit(Number(text.replace(/[^0-9.]/g, '')) || 0)}
        onSubmitEditing={() => onCommit(Number(text.replace(/[^0-9.]/g, '')) || 0)}
        keyboardType="decimal-pad"
        style={{ height: 40, borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, paddingHorizontal: 10, color: colors.text, backgroundColor: colors.surface }}
      />
    </View>
  );
}

function LineRow({ line, canOverride, canCost }: { line: CartLine; canOverride: boolean; canCost: boolean }) {
  const { setQty, updateLine } = useCart.getState();
  const [open, setOpen] = useState(false);
  // services start with their details open: the work differs for every customer
  const [detailsOpen, setDetailsOpen] = useState(line.itemType === 'service');
  const [descText, setDescText] = useState(line.shortDescription ?? '');
  const [serialOpen, setSerialOpen] = useState(Boolean(line.serialNumbers?.length));
  const [serialText, setSerialText] = useState((line.serialNumbers || []).join('\n'));
  const serialCheck = parseSerials(serialText, line.quantity);
  const hasWarranty = Boolean(line.warranty || line.guarantee);
  const issues = validateLine(line, { canOverridePrice: canOverride });
  const lineGross = line.unitPrice * line.quantity - line.discountAmount;
  return (
    <Card style={{ marginBottom: space.sm, padding: space.md }}>
      <Row style={{ alignItems: 'flex-start' }}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontWeight: '700', fontSize: font.md, color: colors.text }} numberOfLines={2}>{line.name}</Text>
          <Text style={{ color: colors.textMuted, fontSize: font.xs, marginTop: 2 }}>
            {formatMoney(line.unitPrice)} × {formatQty(line.quantity)} {line.unit} · GST {line.gstRate}%
          </Text>
          {line.discountAmount > 0 ? <Badge tone="success" label={`− ${formatMoney(line.discountAmount)} discount`} /> : null}
          {Math.abs(line.unitPrice - line.listPrice) > 0.001 ? <Badge tone="warning" label={`Price changed (list ${formatMoney(line.listPrice)})`} /> : null}
          {!detailsOpen && line.shortDescription ? <Text style={{ color: colors.textMuted, fontSize: font.xs, marginTop: 2 }} numberOfLines={2}>{line.shortDescription}</Text> : null}
          {!detailsOpen && canCost && line.costAmount != null ? <Text style={{ color: colors.textFaint, fontSize: font.xs }}>Cost to us {formatMoney(line.costAmount)}</Text> : null}
        </View>
        <Text style={{ fontWeight: '800', fontSize: font.md, color: colors.text }}>{formatMoney(lineGross)}</Text>
      </Row>
      <Row style={{ marginTop: space.sm, justifyContent: 'space-between' }}>
        <Stepper value={line.quantity} onChange={(v) => setQty(line.productId, v)} />
        <Pressable onPress={() => setSerialOpen(!serialOpen)} hitSlop={8}>
          <Row gap={4}>
            <Ionicons name="barcode-outline" size={16} color={hasWarranty ? colors.primary : colors.textMuted} />
            <Text style={{ color: hasWarranty ? colors.primary : colors.textMuted, fontWeight: '700', fontSize: font.sm }}>
              Serial no.{line.serialNumbers?.length ? ` (${line.serialNumbers.length})` : ''}
            </Text>
          </Row>
        </Pressable>
        <Pressable onPress={() => setDetailsOpen(!detailsOpen)} hitSlop={8}>
          <Row gap={4}>
            <Ionicons name="create-outline" size={16} color={line.itemType === 'service' ? colors.primary : colors.textMuted} />
            <Text style={{ color: line.itemType === 'service' ? colors.primary : colors.textMuted, fontWeight: '700', fontSize: font.sm }}>Details</Text>
          </Row>
        </Pressable>
        {canOverride ? (
          <Pressable onPress={() => setOpen(!open)} hitSlop={8}>
            <Row gap={4}>
              <Ionicons name="pricetag-outline" size={16} color={colors.primary} />
              <Text style={{ color: colors.primary, fontWeight: '700', fontSize: font.sm }}>Price / discount</Text>
            </Row>
          </Pressable>
        ) : null}
      </Row>
      {open && canOverride ? (
        <Row style={{ marginTop: space.sm }} gap={space.sm}>
          <NumberInput label="Unit price (excl. GST)" value={line.unitPrice} onCommit={(v) => updateLine(line.productId, { unitPrice: v })} />
          <NumberInput label="Line discount ₹" value={line.discountAmount} onCommit={(v) => updateLine(line.productId, { discountAmount: v })} />
        </Row>
      ) : null}
      {detailsOpen ? (
        <View style={{ marginTop: space.sm, gap: space.sm }}>
          <View>
            <Text style={{ fontSize: font.xs, color: colors.textMuted, marginBottom: 4, fontWeight: '600' }}>
              {line.itemType === 'service' ? 'Work done for this customer (prints on the bill)' : 'Description on this bill'}
            </Text>
            <TextInput
              value={descText}
              onChangeText={setDescText}
              onBlur={() => updateLine(line.productId, { shortDescription: descText.trim() || null })}
              placeholder={line.itemType === 'service' ? 'e.g. AC gas refill + coil cleaning, 2 units, Sector 21' : 'Optional'}
              placeholderTextColor={colors.textFaint}
              multiline
              maxLength={500}
              style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: space.sm, color: colors.text, minHeight: 44 }}
              testID={`desc-${line.productId}`}
            />
          </View>
          {canCost ? (
            <NumberInput
              label={line.itemType === 'service' ? 'Cost to us for this job ₹ (not printed)' : 'Cost to us for this line ₹ (not printed)'}
              value={line.costAmount ?? 0}
              onCommit={(v) => updateLine(line.productId, { costAmount: v > 0 ? v : null })}
              testID={`cost-${line.productId}`}
            />
          ) : null}
        </View>
      ) : null}
      {serialOpen ? (
        <View style={{ marginTop: space.sm }}>
          <TextInput
            value={serialText}
            onChangeText={(t) => {
              setSerialText(t);
              const next = parseSerials(t, line.quantity);
              if (!next.error) updateLine(line.productId, { serialNumbers: next.serials });
            }}
            placeholder={`Serial number${line.quantity > 1 ? 's, one per line' : ''}${hasWarranty ? ' (for warranty)' : ''}`}
            placeholderTextColor={colors.textFaint}
            multiline
            autoCapitalize="characters"
            autoCorrect={false}
            style={{ borderWidth: 1, borderColor: serialCheck.error ? colors.danger : colors.border, borderRadius: 10, padding: space.sm, color: colors.text, fontFamily: 'monospace', minHeight: 44 }}
            testID={`serials-${line.productId}`}
          />
          {serialCheck.error ? <Text style={{ color: colors.danger, fontSize: font.xs, marginTop: 2 }}>{serialCheck.error}</Text> : null}
        </View>
      ) : null}
      {issues.length ? <View style={{ marginTop: space.sm }}><Banner tone="danger" messages={issues.map((i) => i.message)} /></View> : null}
    </Card>
  );
}

export default function Cart() {
  const { totals, customer, lines, invoiceDiscount } = useCartTotals();
  const canOverride = useCan('overridePrice');
  const canCost = useCan('enterCost');
  const setInvoiceDiscount = useCart((s) => s.setInvoiceDiscount);
  const setCustomer = useCart((s) => s.setCustomer);
  const canQuote = useCan('quote');
  const quoting = useCart((s) => s.mode === 'quotation') && canQuote;
  const fromQuotation = useCart((s) => s.fromQuotation);
  const [validDays, setValidDays] = useState(15);

  const save = () => {
    try {
      const q = saveQuotation({ validDays });
      router.replace({ pathname: '/quotation/[id]', params: { id: q.id, done: '1' } });
    } catch (e) {
      notify('Cannot save quotation', (e as Error).message);
    }
  };

  const clear = async () => {
    const ex = useCart.getState().exchange;
    const message = ex
      ? `This also cancels the exchange: give the customer ${formatMoney(ex.amount)} in cash for return ${ex.returnNumber}.`
      : 'All items will be removed.';
    if (await confirm('Clear cart?', message, 'Clear', true)) {
      useCart.getState().clear();
      router.back();
    }
  };

  const hold = () => {
    if (useCart.getState().exchange) {
      notify('Cannot hold', 'Finish the exchange first: the returned value is waiting to be used on this bill.');
      return;
    }
    try {
      holdCurrentBill();
      router.back();
    } catch (e) {
      notify('Cannot hold', (e as Error).message);
    }
  };

  if (!lines.length) {
    return (
      <Screen>
        <Header title="Cart" onBack={() => router.back()} />
        <Empty icon="cart-outline" title="Cart is empty" message="Tap products on the Sell screen to add them." action={<Button title="Back to products" onPress={() => router.back()} />} />
      </Screen>
    );
  }

  return (
    <Screen
      padded={false}
      scroll
      footer={(
        <View style={{ padding: space.lg, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border }}>
          {quoting ? (
            <>
              <Row gap={space.xs} style={{ marginBottom: space.sm, alignItems: 'center' }}>
                <Text style={{ color: colors.textMuted, fontSize: font.sm, marginRight: 4 }}>Valid for</Text>
                {[7, 15, 30].map((d) => <Chip key={d} label={`${d} days`} active={validDays === d} onPress={() => setValidDays(d)} />)}
              </Row>
              <Button title={`Save quotation ${formatMoney(totals.grandTotal)}`} icon="document-text-outline" onPress={save} testID="save-quotation" />
            </>
          ) : (
            <Row>
              <Button title="Hold" variant="secondary" icon="pause" onPress={hold} style={{ flex: 1 }} />
              <Button title={`Checkout ${formatMoney(totals.grandTotal)}`} icon="card-outline" onPress={() => router.push('/checkout')} style={{ flex: 2 }} testID="go-checkout" />
            </Row>
          )}
        </View>
      )}
    >
      <Header title={quoting ? 'Quotation' : 'Cart'} subtitle={`${lines.length} item(s)`} onBack={() => router.back()} right={<IconButton icon="trash-outline" label="Clear cart" tone="danger" onPress={clear} />} />
      <View style={{ paddingHorizontal: space.lg }}>
        <ExchangeNotice />
        {quoting ? <Banner tone="info" messages={['Quotation: no stock or money moves. Customers can be walk-in.']} /> : null}
        {!quoting && fromQuotation ? <Banner tone="info" messages={[`From quotation ${fromQuotation.number}: completing this sale marks it converted.`]} /> : null}
        <SectionTitle>Customer</SectionTitle>
        <Card onPress={() => router.push('/customer-picker')} style={{ padding: space.md }}>
          <Row>
            <Ionicons name={customer ? 'person' : 'person-outline'} size={22} color={colors.primary} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontWeight: '700', color: colors.text }}>{customer ? customer.name : 'Walk-in customer'}</Text>
              <Text style={{ color: colors.textMuted, fontSize: font.xs }}>
                {customer ? [customer.phone, customer.gstin && `GSTIN ${customer.gstin}`].filter(Boolean).join(' · ') || 'No phone' : 'Tap to select for credit or GST bill'}
              </Text>
            </View>
            {customer ? <IconButton icon="close" label="Remove customer" onPress={() => setCustomer(null)} /> : <Ionicons name="chevron-forward" size={18} color={colors.textFaint} />}
          </Row>
          {customer && !customer.creditApproved && !quoting ? (
            <View style={{ marginTop: 6 }}><Badge tone="neutral" label="Cash only · credit needs admin approval" /></View>
          ) : null}
          {customer && customer.outstanding > 0 ? (
            <View style={{ marginTop: 6 }}><Badge tone="warning" label={`Outstanding ${formatMoney(customer.outstanding)}${customer.creditLimit ? ` / limit ${formatMoney(customer.creditLimit)}` : ''}`} /></View>
          ) : null}
        </Card>

        <SectionTitle>Items</SectionTitle>
        {lines.map((l) => <LineRow key={l.productId} line={l} canOverride={canOverride} canCost={canCost} />)}

        <SectionTitle>Bill</SectionTitle>
        <Card>
          {canOverride ? (
            <View style={{ marginBottom: space.sm }}>
              <NumberInput label="Bill discount ₹ (before GST)" value={invoiceDiscount} onCommit={setInvoiceDiscount} testID="bill-discount" />
            </View>
          ) : null}
          <KeyValue label="Subtotal" value={formatMoney(totals.subtotal)} muted />
          {totals.itemDiscountTotal + totals.invoiceDiscount > 0 ? (
            <KeyValue label="Discount" value={`− ${formatMoney(totals.itemDiscountTotal + totals.invoiceDiscount)}`} muted />
          ) : null}
          <KeyValue label="Taxable" value={formatMoney(totals.taxableAmount)} muted />
          {totals.taxSplit === 'igst'
            ? <KeyValue label="IGST" value={formatMoney(totals.igstAmount)} muted />
            : (
              <>
                <KeyValue label="CGST" value={formatMoney(totals.cgstAmount)} muted />
                <KeyValue label="SGST" value={formatMoney(totals.sgstAmount)} muted />
              </>
            )}
          <Divider />
          <KeyValue label="Total" value={formatMoney(totals.grandTotal)} bold />
        </Card>
      </View>
    </Screen>
  );
}
