import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { Text, View } from 'react-native';
import { formatMoney, formatQty } from '../../domain/money';
import { receiptHtml, printReceipt, shareReceipt } from '../../lib/receipt';
import { useDevice } from '../../store/device';
import { useLedger } from '../../store/ledger';
import { useCan } from '../../store/session';
import { notify } from '../../ui/dialogs';
import { DocSyncBadge } from '../../ui/SyncBadge';
import { Banner, Button, Card, Divider, Empty, Header, KeyValue, Row, Screen, SectionTitle, colors, font, space } from '../../ui/components';

const METHOD: Record<string, string> = { cash: 'Cash', upi: 'UPI', bank: 'Card / Bank', credit: 'Credit (due)' };

export default function SaleDetail() {
  const { id, done } = useLocalSearchParams<{ id: string; done?: string }>();
  const sale = useLedger((s) => s.sales.find((x) => x.id === id));
  const returns = useLedger((s) => s.returns);
  const info = useDevice((s) => s.info);
  const canReturn = useCan('returns');

  if (!sale) {
    return (
      <Screen>
        <Header title="Bill" onBack={() => router.back()} />
        <Empty title="Bill not found" message="It may have been cleaned up after syncing (bills are kept on the phone for 30 days)." />
      </Screen>
    );
  }

  const t = sale.totals;
  const saleReturns = returns.filter((r) => r.saleId === sale.id);
  const returnable = t.lines.some((l) => l.quantity - (sale.returned[l.productId] || 0) > 0);
  const html = () => receiptHtml(sale, info?.company, info?.device.code);
  const run = async (fn: () => Promise<unknown>) => {
    try { await fn(); } catch (e) { notify('Printing', (e as Error).message); }
  };

  return (
    <Screen padded={false} scroll>
      <Header title={done ? 'Sale complete' : 'Bill'} subtitle={sale.serverNumber ?? sale.number} onBack={() => router.back()} />
      <View style={{ paddingHorizontal: space.lg }}>
        {done ? (
          <Card style={{ alignItems: 'center', backgroundColor: colors.successSoft, borderColor: colors.successSoft, marginBottom: space.md }}>
            <Ionicons name="checkmark-circle" size={48} color={colors.success} />
            <Text style={{ fontSize: font.xxl, fontWeight: '800', color: colors.text, marginTop: 6 }}>{formatMoney(t.grandTotal)}</Text>
            {sale.change ? <Text style={{ color: colors.success, fontWeight: '700', marginTop: 4 }}>Give change {formatMoney(sale.change)}</Text> : null}
            <Text style={{ color: colors.textMuted, marginTop: 4 }}>Saved on this phone · syncs to SACONE automatically</Text>
          </Card>
        ) : null}

        <Row gap={space.sm}>
          <Button title="Print" icon="print-outline" variant="secondary" style={{ flex: 1 }} onPress={() => run(() => printReceipt(html()))} />
          <Button title="Share PDF" icon="share-outline" variant="secondary" style={{ flex: 1 }} onPress={() => run(() => shareReceipt(html(), sale.number))} />
        </Row>

        <SectionTitle right={<DocSyncBadge doc={sale} />}>Bill {sale.number}</SectionTitle>
        {sale.syncError ? <Banner tone="danger" title="ERP could not post this bill" messages={[sale.syncError, 'A manager can fix and retry it in ERP → POS Devices & Sync → Sync inbox.']} /> : null}
        {sale.syncWarnings?.length ? <Banner tone="warning" messages={sale.syncWarnings} /> : null}

        <Card>
          <KeyValue label="Date" value={new Date(sale.createdAt).toLocaleString('en-IN')} muted />
          <KeyValue label="Cashier" value={sale.userName} muted />
          {sale.customer ? <KeyValue label="Customer" value={sale.customer.name} muted /> : null}
          <Divider />
          {t.lines.map((l) => (
            <View key={l.productId} style={{ paddingVertical: 6 }}>
              <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <Text style={{ flex: 1, fontWeight: '600', color: colors.text }}>{l.name}</Text>
                <Text style={{ fontWeight: '700', color: colors.text }}>{formatMoney(l.lineTotal)}</Text>
              </Row>
              <Text style={{ color: colors.textMuted, fontSize: font.xs }}>
                {formatQty(l.quantity)} × {formatMoney(l.unitPrice)} · GST {l.gstRate}%{sale.returned[l.productId] ? ` · returned ${sale.returned[l.productId]}` : ''}
              </Text>
            </View>
          ))}
          <Divider />
          <KeyValue label="Taxable" value={formatMoney(t.taxableAmount)} muted />
          <KeyValue label="GST" value={formatMoney(t.gstAmount)} muted />
          {t.itemDiscountTotal + t.invoiceDiscount > 0 ? <KeyValue label="Discount" value={`− ${formatMoney(t.itemDiscountTotal + t.invoiceDiscount)}`} muted /> : null}
          <KeyValue label="Total" value={formatMoney(t.grandTotal)} bold />
          <Divider />
          {sale.payments.map((p, i) => <KeyValue key={i} label={`${METHOD[p.method]}${p.reference ? ` · ${p.reference}` : ''}`} value={formatMoney(p.amount)} muted />)}
        </Card>

        {saleReturns.length ? (
          <>
            <SectionTitle>Returns</SectionTitle>
            {saleReturns.map((r) => (
              <Card key={r.id} style={{ marginBottom: space.sm, padding: space.md }}>
                <Row style={{ justifyContent: 'space-between' }}>
                  <Text style={{ fontWeight: '700', color: colors.text }}>{r.number}</Text>
                  <DocSyncBadge doc={r} />
                </Row>
                <Text style={{ color: colors.textMuted, fontSize: font.xs, marginTop: 4 }}>
                  {r.lines.map((l) => `${l.name} × ${l.quantity}`).join(', ')} · refund {formatMoney(r.total)} ({r.refundMethod})
                </Text>
              </Card>
            ))}
          </>
        ) : null}

        <View style={{ gap: space.sm, marginTop: space.lg }}>
          {canReturn && returnable ? (
            <Button title="Return items" icon="return-down-back-outline" variant="secondary" onPress={() => router.push({ pathname: '/return/[id]', params: { id: sale.id } })} />
          ) : null}
          {done ? <Button title="New sale" icon="add-circle-outline" size="lg" onPress={() => (router.canGoBack() ? router.back() : router.replace('/sell'))} testID="new-sale" /> : null}
        </View>
      </View>
    </Screen>
  );
}
