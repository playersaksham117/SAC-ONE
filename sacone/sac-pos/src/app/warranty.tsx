import { useState } from 'react';
import { Text, View } from 'react-native';
import { sync, type WarrantyCheck, type WarrantyPeriod } from '../api/sacone';
import { deviceConfig } from '../store/device';
import { Badge, Banner, Button, Card, Header, Row, Screen, SearchBar, colors, font, space } from '../ui/components';
import { goBack } from '../lib/nav';

const ddmmyyyy = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

function Period({ label, p }: { label: string; p: WarrantyPeriod | null }) {
  if (!p) return <Text style={{ color: colors.textFaint, fontSize: font.xs }}>No {label.toLowerCase()}</Text>;
  return (
    <View style={{ marginTop: 4 }}>
      <Badge tone={p.active ? 'success' : 'danger'} label={`${label} ${p.period} · ${p.active ? 'Active' : 'Expired'}`} />
      <Text style={{ color: colors.textMuted, fontSize: font.xs, marginTop: 2 }}>
        {p.active ? `till ${ddmmyyyy(p.till)} · ${p.daysLeft} day${p.daysLeft === 1 ? '' : 's'} left` : `ended ${ddmmyyyy(p.till)}`}
      </Text>
    </View>
  );
}

/** Warranty Check on the phone: invoice number or serial number, answered by SACONE ERP (needs a connection). */
export default function Warranty() {
  const [q, setQ] = useState('');
  const [data, setData] = useState<WarrantyCheck | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const check = async () => {
    const cfg = deviceConfig();
    if (!cfg || q.trim().length < 2) return;
    setBusy(true);
    setError(null);
    try { setData(await sync.warranty(cfg, q.trim())); } catch (e) { setError((e as Error).message); setData(null); } finally { setBusy(false); }
  };

  return (
    <Screen scroll padded={false}>
      <Header title="Warranty check" subtitle="Invoice number or serial number" onBack={() => goBack()} />
      <View style={{ paddingHorizontal: space.lg }}>
        <SearchBar value={q} onChangeText={setQ} placeholder="Scan or type invoice / serial no." onSubmitEditing={check} autoFocus />
        <Button title="Check" icon="shield-checkmark-outline" onPress={check} loading={busy} disabled={q.trim().length < 2} style={{ marginTop: space.sm }} />
        {error ? <View style={{ marginTop: space.md }}><Banner tone="danger" messages={[error]} /></View> : null}
        {data && !data.results.length ? <Text style={{ color: colors.textMuted, marginTop: space.lg }}>Nothing found for “{data.query}”.</Text> : null}
        {data?.results.map((r) => (
          <Card key={r.saleId} style={{ marginTop: space.md }}>
            <Row style={{ justifyContent: 'space-between' }}>
              <Text style={{ fontWeight: '800', color: colors.text }}>{r.invoiceNumber}</Text>
              <Text style={{ color: colors.textMuted, fontSize: font.xs }}>{new Date(r.date).toLocaleDateString('en-IN')}</Text>
            </Row>
            <Text style={{ color: colors.textMuted, fontSize: font.xs }}>
              {r.customerName ? `${r.customerName}${r.customerPhone ? ` · ${r.customerPhone}` : ''}` : 'Walk-in customer'}{r.status === 'cancelled' ? ' · Cancelled' : ''}
            </Text>
            {r.lines.map((l) => (
              <View key={l.itemId} style={{ marginTop: space.md, paddingTop: space.sm, borderTopWidth: 1, borderTopColor: colors.border }}>
                <Text style={{ fontWeight: '700', color: colors.text }}>{l.productName}</Text>
                <Text style={{ color: colors.textMuted, fontSize: font.xs }}>Qty {l.quantity}{l.quantityReturned ? ` · ${l.quantityReturned} returned` : ''}{l.serials.length ? ` · S/N ${l.serials.join(', ')}` : ''}</Text>
                <Period label="Warranty" p={l.warranty} />
                <Period label="Guarantee" p={l.guarantee} />
              </View>
            ))}
          </Card>
        ))}
        <View style={{ height: space.xl }} />
      </View>
    </Screen>
  );
}
