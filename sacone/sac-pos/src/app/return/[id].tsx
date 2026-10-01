import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { formatMoney, round2 } from '../../domain/money';
import { lineRefundValue } from '../../domain/tax';
import type { RefundMethod } from '../../domain/types';
import { validateReturn } from '../../domain/validation';
import { ValidationError, createReturn } from '../../services/pos';
import { useLedger } from '../../store/ledger';
import { useCan } from '../../store/session';
import { Banner, Button, Card, Chip, Empty, Field, Header, Row, Screen, SectionTitle, Stepper, colors, font, space } from '../../ui/components';

const REFUNDS: { value: RefundMethod; label: string }[] = [
  { value: 'cash', label: 'Cash' },
  { value: 'upi', label: 'UPI' },
  { value: 'bank', label: 'Card / Bank' },
  { value: 'credit_note', label: 'Credit note' },
];

export default function ReturnScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const sale = useLedger((s) => s.sales.find((x) => x.id === id));
  const allowed = useCan('returns');
  const [qty, setQty] = useState<Record<string, number>>({});
  const [refund, setRefund] = useState<RefundMethod>('cash');
  const [reason, setReason] = useState('');
  const [errors, setErrors] = useState<string[]>([]);

  const refundTotal = useMemo(() => {
    if (!sale) return 0;
    return round2(Object.entries(qty).reduce((s, [pid, q]) => {
      const line = sale.totals.lines.find((l) => l.productId === pid);
      return s + (line ? lineRefundValue(line, q) : 0);
    }, 0));
  }, [qty, sale]);

  if (!sale || !allowed) {
    return (
      <Screen>
        <Header title="Return" onBack={() => router.back()} />
        <Empty icon="lock-closed-outline" title={!allowed ? 'Not allowed' : 'Bill not found'} message={!allowed ? 'Your ERP role does not include "POS Returns – create".' : undefined} />
      </Screen>
    );
  }

  const live = validateReturn(sale, qty, reason);

  const submit = () => {
    try {
      const ret = createReturn(sale.id, qty, refund, reason);
      router.back();
      setErrors([]);
      return ret;
    } catch (e) {
      setErrors(e instanceof ValidationError ? e.result.errors.map((x) => x.message) : [(e as Error).message]);
      return null;
    }
  };

  return (
    <Screen
      padded={false}
      scroll
      footer={(
        <View style={{ padding: space.lg, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border }}>
          <Button title={`Refund ${formatMoney(refundTotal)}`} variant="danger" icon="return-down-back" size="lg" onPress={submit} disabled={live.errors.length > 0} />
        </View>
      )}
    >
      <Header title="Return items" subtitle={`Bill ${sale.number}`} onBack={() => router.back()} />
      <View style={{ paddingHorizontal: space.lg }}>
        <SectionTitle>Items to return</SectionTitle>
        {sale.totals.lines.map((l) => {
          const remaining = l.quantity - (sale.returned[l.productId] || 0);
          return (
            <Card key={l.productId} style={{ marginBottom: space.sm, padding: space.md }}>
              <Row style={{ justifyContent: 'space-between' }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontWeight: '700', color: colors.text }}>{l.name}</Text>
                  <Text style={{ color: colors.textMuted, fontSize: font.xs }}>
                    Sold {l.quantity} · can return {remaining} · {formatMoney(lineRefundValue(l, 1))} each
                  </Text>
                </View>
                {remaining > 0
                  ? <Stepper value={qty[l.productId] || 0} onChange={(v) => setQty({ ...qty, [l.productId]: Math.min(Math.max(v, 0), remaining) })} />
                  : <Text style={{ color: colors.textFaint }}>Returned</Text>}
              </Row>
            </Card>
          );
        })}

        <SectionTitle>Refund as</SectionTitle>
        <Row gap={space.sm} style={{ flexWrap: 'wrap' }}>
          {REFUNDS.filter((r) => r.value !== 'credit_note' || sale.customer).map((r) => (
            <Chip key={r.value} label={r.label} active={refund === r.value} onPress={() => setRefund(r.value)} />
          ))}
        </Row>

        <View style={{ marginTop: space.lg }}>
          <Field label="Reason" value={reason} onChangeText={setReason} placeholder="Damaged, wrong item, customer changed mind…" />
        </View>
        {errors.length ? <Banner tone="danger" messages={errors} /> : null}
        {live.errors.length && Object.keys(qty).length ? <Banner tone="warning" messages={live.errors.map((e) => e.message)} /> : null}
      </View>
    </Screen>
  );
}
