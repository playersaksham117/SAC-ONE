import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { Text, View } from 'react-native';
import { formatNotes } from '../../domain/cash';
import { formatMoney, formatQty } from '../../domain/money';
import { billHtml, LAYOUTS, PDF_SIZES, PRINT_SIZES, printBill, savePdf, sharePdf, type Layout, type PaperSize, type PdfSize } from '../../lib/receipt';
import { usePref } from '../../lib/usePref';
import { useDevice } from '../../store/device';
import { useLedger } from '../../store/ledger';
import { useCan } from '../../store/session';
import { notify } from '../../ui/dialogs';
import { DocSyncBadge } from '../../ui/SyncBadge';
import { Banner, Button, Card, Chip, Divider, Empty, Header, KeyValue, Row, Screen, SectionTitle, Segmented, colors, font, space } from '../../ui/components';

const METHOD: Record<string, string> = { cash: 'Cash', upi: 'UPI', bank: 'Card / Bank', credit: 'Credit (due)' };

export default function SaleDetail() {
  const { id, done } = useLocalSearchParams<{ id: string; done?: string }>();
  const sale = useLedger((s) => s.sales.find((x) => x.id === id));
  const returns = useLedger((s) => s.returns);
  const info = useDevice((s) => s.info);
  const canReturn = useCan('returns');
  const [printSize, setPrintSize] = usePref<PaperSize>('sacpos.printSize', '80mm', PRINT_SIZES.map((p) => p.value));
  const [pdfSize, setPdfSize] = usePref<PdfSize>('sacpos.pdfSize', 'A4', PDF_SIZES.map((p) => p.value));
  const invoiceSettings = useDevice((s) => s.info?.settings.invoice);
  const [layout, setLayout] = usePref<Layout>('sacpos.invoiceLayout', invoiceSettings?.layout ?? 'classic', LAYOUTS.map((l) => l.value));

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
  const html = (size: PaperSize) => billHtml(sale, info?.company, info?.device.code, size, { layout, invoice: invoiceSettings ?? {} });
  const title = `Bill ${sale.serverNumber ?? sale.number}`;
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

        <Card>
          <Text style={{ color: colors.textMuted, fontSize: font.xs, fontWeight: '700', marginBottom: 6 }}>A5 / A4 LAYOUT</Text>
          <Segmented value={layout} options={LAYOUTS} onChange={setLayout} />
          <Divider />
          <Text style={{ color: colors.textMuted, fontSize: font.xs, fontWeight: '700', marginBottom: 6 }}>PRINT</Text>
          <Row gap={space.xs} style={{ flexWrap: 'wrap', marginBottom: space.sm }}>
            {PRINT_SIZES.map((p) => (
              <Chip key={p.value} label={p.label} active={printSize === p.value} onPress={() => setPrintSize(p.value)} />
            ))}
          </Row>
          <Button
            title={`Print ${PRINT_SIZES.find((p) => p.value === printSize)?.label} ${printSize.endsWith('mm') ? 'receipt' : 'invoice'}`}
            icon="print-outline"
            onPress={() => run(() => printBill(html(printSize), printSize))}
          />
          <Divider />
          <Text style={{ color: colors.textMuted, fontSize: font.xs, fontWeight: '700', marginBottom: 6 }}>PDF</Text>
          <Segmented value={pdfSize} options={PDF_SIZES} onChange={setPdfSize} />
          <Row gap={space.sm} style={{ marginTop: space.sm }}>
            <Button title="Save PDF" icon="document-outline" variant="secondary" style={{ flex: 1 }} onPress={() => run(() => savePdf(html(pdfSize), pdfSize))} />
            <Button title="Share" icon="share-social-outline" variant="secondary" style={{ flex: 1 }} onPress={() => run(() => sharePdf(html(pdfSize), pdfSize, title))} />
          </Row>
        </Card>

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
          {sale.tendered ? <KeyValue label="Cash received" value={formatMoney(sale.tendered)} muted /> : null}
          {sale.change ? <KeyValue label="Change given" value={formatMoney(sale.change)} muted /> : null}
          {sale.cashDrawer && formatNotes(sale.cashDrawer.received) ? (
            <View style={{ marginTop: space.xs }}>
              <Text style={{ color: colors.textMuted, fontSize: font.xs }}>Notes received: {formatNotes(sale.cashDrawer.received)}</Text>
              {formatNotes(sale.cashDrawer.change) ? <Text style={{ color: colors.textMuted, fontSize: font.xs }}>Change notes: {formatNotes(sale.cashDrawer.change)}</Text> : null}
            </View>
          ) : null}
          {sale.exchange ? (
            <Text style={{ color: colors.primary, fontSize: font.xs, marginTop: space.xs }}>
              Exchange: {formatMoney(sale.exchange.credit)} paid by return {sale.exchange.returnNumber}
            </Text>
          ) : null}
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
                  {r.lines.map((l) => `${l.name} × ${l.quantity}`).join(', ')} · {r.type === 'exchange' ? `exchanged ${formatMoney(r.total)}` : `refund ${formatMoney(r.total)} (${r.refundMethod})`}
                </Text>
                {r.approvedBy ? (
                  <Text style={{ color: colors.textMuted, fontSize: font.xs }}>Approved by {r.approvedBy.name} · {new Date(r.approvedBy.at).toLocaleString('en-IN')}</Text>
                ) : null}
              </Card>
            ))}
          </>
        ) : null}

        <View style={{ gap: space.sm, marginTop: space.lg }}>
          {canReturn && returnable ? (
            <Button title="Return / exchange items" icon="return-down-back-outline" variant="secondary" onPress={() => router.push({ pathname: '/return/[id]', params: { id: sale.id } })} />
          ) : null}
          {done ? <Button title="New sale" icon="add-circle-outline" size="lg" onPress={() => (router.canGoBack() ? router.back() : router.replace('/sell'))} testID="new-sale" /> : null}
        </View>
      </View>
    </Screen>
  );
}
