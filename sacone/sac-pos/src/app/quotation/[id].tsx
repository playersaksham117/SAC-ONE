import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';
import { formatMoney, formatQty } from '../../domain/money';
import { billHtml, LAYOUTS, PDF_SIZES, PRINT_SIZES, printBill, quotationForPrint, savePdf, shareInvoice, type Layout, type PaperSize, type PdfSize } from '../../lib/receipt';
import { usePref } from '../../lib/usePref';
import { useCart } from '../../store/cart';
import { useDevice } from '../../store/device';
import { useLedger } from '../../store/ledger';
import { useCan, useSession } from '../../store/session';
import { confirm, notify } from '../../ui/dialogs';
import { DocSyncBadge } from '../../ui/SyncBadge';
import { Banner, Button, Card, Chip, Divider, Empty, Header, KeyValue, Row, Screen, SectionTitle, Segmented, colors, font, space } from '../../ui/components';

/** A quotation made on this phone: print / PDF / share, and turn it into a sale. */
export default function QuotationDetail() {
  const { id, done } = useLocalSearchParams<{ id: string; done?: string }>();
  const quote = useLedger((s) => (s.quotations ?? []).find((x) => x.id === id));
  const info = useDevice((s) => s.info);
  const canSell = useCan('sell');
  const invoiceSettings = useDevice((s) => s.info?.settings.invoice);
  const [printSize, setPrintSize] = usePref<PaperSize>('sacpos.printSize', '80mm', PRINT_SIZES.map((p) => p.value));
  const [pdfSize, setPdfSize] = usePref<PdfSize>('sacpos.pdfSize', 'A4', PDF_SIZES.map((p) => p.value));
  const [layout, setLayout] = usePref<Layout>('sacpos.invoiceLayout', invoiceSettings?.layout ?? 'classic', LAYOUTS.map((l) => l.value));
  const [sharing, setSharing] = useState(false);

  if (!quote) {
    return (
      <Screen>
        <Header title="Quotation" onBack={() => router.back()} />
        <Empty title="Quotation not found" message="It may have been cleaned up after syncing (kept on the phone for 30 days)." />
      </Screen>
    );
  }

  const doc = quotationForPrint(quote);
  const t = quote.totals;
  const number = quote.serverNumber ?? quote.number;
  const expired = new Date(`${quote.validUntil}T23:59:59`).getTime() < Date.now();
  const html = (size: PaperSize) => billHtml(doc, info?.company, info?.device.code, size, { layout, invoice: invoiceSettings ?? {} });
  const run = async (fn: () => Promise<unknown>) => {
    try { await fn(); } catch (e) { notify('Printing', (e as Error).message); }
  };
  const share = async () => {
    if (!useSession.getState().currentUserId) { notify('Share quotation', 'Unlock SAC-POS with your PIN first.'); return; }
    setSharing(true);
    try { await shareInvoice(html(pdfSize), pdfSize, doc, info?.device.code); } catch (e) { notify('Share quotation', (e as Error).message); } finally { setSharing(false); }
  };
  const convert = async () => {
    if (useCart.getState().lines.length && !(await confirm('Replace cart?', 'The current cart will be replaced by this quotation.', 'Replace'))) return;
    if (expired && !(await confirm('Quotation expired', `It was valid until ${new Date(`${quote.validUntil}T00:00:00`).toLocaleDateString('en-IN')}. Sell at these prices anyway?`, 'Continue'))) return;
    useCart.getState().loadQuotation(quote);
    router.push('/cart');
  };

  return (
    <Screen padded={false} scroll>
      <Header title={done ? 'Quotation saved' : 'Quotation'} subtitle={number} onBack={() => router.back()} />
      <View style={{ paddingHorizontal: space.lg }}>
        {done ? (
          <Card style={{ alignItems: 'center', backgroundColor: colors.primarySoft, borderColor: colors.primarySoft, marginBottom: space.md }}>
            <Ionicons name="document-text" size={44} color={colors.primary} />
            <Text style={{ fontSize: font.xxl, fontWeight: '800', color: colors.text, marginTop: 6 }}>{formatMoney(t.grandTotal)}</Text>
            <Text style={{ color: colors.textMuted, marginTop: 4, textAlign: 'center' }}>No stock or money moved. Syncs to SACONE ERP → quotations.</Text>
          </Card>
        ) : null}

        <Card>
          <Text style={{ color: colors.textMuted, fontSize: font.xs, fontWeight: '700', marginBottom: 6 }}>A5 / A4 LAYOUT</Text>
          <Segmented value={layout} options={LAYOUTS} onChange={setLayout} />
          <Divider />
          <Text style={{ color: colors.textMuted, fontSize: font.xs, fontWeight: '700', marginBottom: 6 }}>PRINT</Text>
          <Row gap={space.xs} style={{ flexWrap: 'wrap', marginBottom: space.sm }}>
            {PRINT_SIZES.map((p) => <Chip key={p.value} label={p.label} active={printSize === p.value} onPress={() => setPrintSize(p.value)} />)}
          </Row>
          <Button title={`Print ${PRINT_SIZES.find((p) => p.value === printSize)?.label} quotation`} icon="print-outline" onPress={() => run(() => printBill(html(printSize), printSize))} />
          <Divider />
          <Text style={{ color: colors.textMuted, fontSize: font.xs, fontWeight: '700', marginBottom: 6 }}>PDF</Text>
          <Segmented value={pdfSize} options={PDF_SIZES} onChange={setPdfSize} />
          <Button title="Share quotation" icon="share-social-outline" style={{ marginTop: space.sm }} loading={sharing} onPress={share} />
          <Button title="Save PDF" icon="document-outline" variant="secondary" style={{ marginTop: space.sm }} onPress={() => run(() => savePdf(html(pdfSize), pdfSize, number))} />
        </Card>

        <SectionTitle right={<DocSyncBadge doc={quote} />}>Quotation {quote.number}</SectionTitle>
        {quote.syncError ? <Banner tone="danger" title="ERP could not save this quotation" messages={[quote.syncError]} /> : null}
        {quote.status === 'converted' ? <Banner tone="success" messages={['Converted to a sale on this phone.']} /> : null}
        {quote.status === 'open' && expired ? <Banner tone="warning" messages={['This quotation has expired.']} /> : null}

        <Card>
          <KeyValue label="Date" value={new Date(quote.createdAt).toLocaleString('en-IN')} muted />
          <KeyValue label="Valid until" value={new Date(`${quote.validUntil}T00:00:00`).toLocaleDateString('en-IN')} muted />
          <KeyValue label="Prepared by" value={quote.userName} muted />
          <KeyValue label="Customer" value={quote.customer?.name ?? 'Walk-in'} muted />
          <Divider />
          {t.lines.map((l) => (
            <View key={l.productId} style={{ paddingVertical: 6 }}>
              <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <Text style={{ flex: 1, fontWeight: '600', color: colors.text }}>{l.name}</Text>
                <Text style={{ fontWeight: '700', color: colors.text }}>{formatMoney(l.lineTotal)}</Text>
              </Row>
              <Text style={{ color: colors.textMuted, fontSize: font.xs }}>{formatQty(l.quantity)} × {formatMoney(l.unitPrice)} · GST {l.gstRate}%</Text>
            </View>
          ))}
          <Divider />
          <KeyValue label="Taxable" value={formatMoney(t.taxableAmount)} muted />
          <KeyValue label="GST" value={formatMoney(t.gstAmount)} muted />
          <KeyValue label="Total" value={formatMoney(t.grandTotal)} bold />
        </Card>

        <View style={{ gap: space.sm, marginTop: space.lg }}>
          {canSell && quote.status === 'open' ? (
            <Button title="Convert to sale" icon="cart-outline" size="lg" onPress={convert} testID="convert-quotation" />
          ) : null}
          {done ? <Button title="New quotation" icon="add-circle-outline" variant="secondary" onPress={() => (router.canGoBack() ? router.back() : router.replace('/sell'))} /> : null}
        </View>
      </View>
    </Screen>
  );
}
