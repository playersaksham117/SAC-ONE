import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { formatMoney } from '../../domain/money';
import type { CustomerPayment } from '../../domain/types';
import { validateCollection } from '../../domain/validation';
import { ValidationError, collectPayment } from '../../services/pos';
import { useCart } from '../../store/cart';
import { useCatalog, type LocalCustomer } from '../../store/catalog';
import { useLedger } from '../../store/ledger';
import { useCan } from '../../store/session';
import { DocSyncBadge } from '../../ui/SyncBadge';
import {
  Banner, Button, Card, Chip, Empty, Header, KeyValue, Row, Screen, SectionTitle, StatTile, colors, font, radius, space,
} from '../../ui/components';

const METHODS: { m: CustomerPayment['method']; label: string }[] = [
  { m: 'cash', label: 'Cash' }, { m: 'upi', label: 'UPI' }, { m: 'bank', label: 'Card / Bank' },
];

export default function CustomerDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const c = useCatalog((s) => s.customers[id]);
  const sales = useLedger((s) => s.sales);
  const payments = useLedger((s) => s.payments);
  const canCollect = useCan('collectPayment');
  const canSell = useCan('sell');
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<CustomerPayment['method']>('cash');
  const [reference, setReference] = useState('');
  const [msg, setMsg] = useState<{ tone: 'danger' | 'success'; text: string } | null>(null);

  const bills = useMemo(() => sales.filter((s) => s.customer?.id === id).slice(0, 20), [sales, id]);
  const collections = useMemo(() => payments.filter((p) => p.customerId === id).slice(0, 20), [payments, id]);

  if (!c) {
    return (
      <Screen>
        <Header title="Customer" onBack={() => router.back()} />
        <Empty title="Customer not found" />
      </Screen>
    );
  }
  const local = c.isLocal ? (c as LocalCustomer) : null;
  const amt = Number(amount.replace(/[^0-9.]/g, '')) || 0;
  const live = validateCollection(amt, c);

  const collect = () => {
    try {
      const p = collectPayment(c.id, amt, method, { reference });
      setMsg({ tone: 'success', text: `Collected ${formatMoney(p.amount)} · voucher ${p.number}` });
      setAmount('');
      setReference('');
    } catch (e) {
      setMsg({ tone: 'danger', text: e instanceof ValidationError ? e.message : (e as Error).message });
    }
  };

  return (
    <Screen padded={false} scroll>
      <Header title={c.name} subtitle={[c.phone, c.code].filter(Boolean).join(' · ')} onBack={() => router.back()} />
      <View style={{ paddingHorizontal: space.lg }}>
        {local?.sync === 'review' ? <Banner tone="danger" messages={[local.syncError ?? 'ERP rejected this customer']} /> : null}
        <Row gap={space.sm}>
          <StatTile label="Outstanding" value={formatMoney(c.outstanding)} tone={c.outstanding > 0 ? 'warning' : 'success'} icon="time-outline" />
          <StatTile label="Credit limit" value={c.creditLimit ? formatMoney(c.creditLimit) : 'No limit'} icon="shield-checkmark-outline" tone="info" />
        </Row>

        <Card style={{ marginTop: space.md }}>
          {c.gstin ? <KeyValue label="GSTIN" value={c.gstin} muted /> : null}
          {c.email ? <KeyValue label="Email" value={c.email} muted /> : null}
          {c.address || c.city ? <KeyValue label="Address" value={[c.address, c.city, c.state].filter(Boolean).join(', ')} muted /> : null}
          {canSell ? (
            <Button title="New bill for this customer" icon="cart-outline" variant="secondary" style={{ marginTop: space.sm }}
              onPress={() => { useCart.getState().setCustomer(c.id); router.push('/sell'); }} />
          ) : null}
        </Card>

        {canCollect ? (
          <>
            <SectionTitle>Collect payment</SectionTitle>
            <Card>
              <TextInput
                value={amount}
                onChangeText={setAmount}
                keyboardType="decimal-pad"
                placeholder={c.outstanding > 0 ? c.outstanding.toFixed(2) : 'Amount'}
                placeholderTextColor={colors.textFaint}
                style={{ height: 52, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 12, fontSize: font.xl, fontWeight: '700', color: colors.text }}
              />
              <Row gap={space.sm} style={{ marginTop: space.sm, flexWrap: 'wrap' }}>
                {METHODS.map((x) => <Chip key={x.m} label={x.label} active={method === x.m} onPress={() => setMethod(x.m)} />)}
                {c.outstanding > 0 ? <Chip label="Full due" onPress={() => setAmount(c.outstanding.toFixed(2))} /> : null}
              </Row>
              {method !== 'cash' ? (
                <TextInput value={reference} onChangeText={setReference} placeholder="Reference / UTR" placeholderTextColor={colors.textFaint}
                  style={{ marginTop: space.sm, height: 44, borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, paddingHorizontal: 10, color: colors.text }} />
              ) : null}
              {amount && live.errors.length ? <View style={{ marginTop: space.sm }}><Banner tone="danger" messages={live.errors.map((e) => e.message)} /></View> : null}
              {amount && live.warnings.length ? <View style={{ marginTop: space.sm }}><Banner tone="warning" messages={live.warnings.map((e) => e.message)} /></View> : null}
              {msg ? <View style={{ marginTop: space.sm }}><Banner tone={msg.tone} messages={[msg.text]} /></View> : null}
              <Button title="Record collection" icon="wallet-outline" variant="success" style={{ marginTop: space.sm }} onPress={collect} disabled={live.errors.length > 0} />
              <Text style={{ color: colors.textFaint, fontSize: font.xs, marginTop: space.sm }}>
                Arrives in ERP as a draft receipt — the accountant posts it to the cash/bank account.
              </Text>
            </Card>
          </>
        ) : null}

        {bills.length ? <SectionTitle>Recent bills (this phone)</SectionTitle> : null}
        {bills.map((s) => (
          <Card key={s.id} style={{ marginBottom: space.sm, padding: space.md }} onPress={() => router.push({ pathname: '/sale/[id]', params: { id: s.id } })}>
            <Row style={{ justifyContent: 'space-between' }}>
              <Text style={{ fontWeight: '700', color: colors.text }}>{s.number}</Text>
              <Text style={{ fontWeight: '700', color: colors.text }}>{formatMoney(s.totals.grandTotal)}</Text>
            </Row>
            <Row style={{ justifyContent: 'space-between', marginTop: 4 }}>
              <Text style={{ color: colors.textMuted, fontSize: font.xs }}>{s.amountDue > 0 ? `Due ${formatMoney(s.amountDue)}` : 'Paid'}</Text>
              <DocSyncBadge doc={s} />
            </Row>
          </Card>
        ))}
        {collections.length ? <SectionTitle>Collections (this phone)</SectionTitle> : null}
        {collections.map((p) => (
          <Card key={p.id} style={{ marginBottom: space.sm, padding: space.md }}>
            <Row style={{ justifyContent: 'space-between' }}>
              <Text style={{ fontWeight: '700', color: colors.text }}>{p.number} · {p.method}</Text>
              <Text style={{ fontWeight: '700', color: colors.success }}>{formatMoney(p.amount)}</Text>
            </Row>
            <View style={{ marginTop: 4 }}><DocSyncBadge doc={p} /></View>
          </Card>
        ))}
      </View>
    </Screen>
  );
}
