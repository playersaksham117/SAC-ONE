import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { formatMoney, round2 } from '../../domain/money';
import { lineRefundValue } from '../../domain/tax';
import type { Approval, RefundMethod } from '../../domain/types';
import { validateReturn } from '../../domain/validation';
import { ValidationError, createReturn } from '../../services/pos';
import { useCart } from '../../store/cart';
import { useLedger } from '../../store/ledger';
import { useCan } from '../../store/session';
import { ApprovalBox } from '../../ui/ApprovalBox';
import { confirm } from '../../ui/dialogs';
import {
  Banner, Button, Card, Chip, Empty, Field, Header, Row, Screen, SectionTitle, Segmented, Stepper, colors, font, space,
} from '../../ui/components';

const REFUNDS: { value: RefundMethod; label: string }[] = [
  { value: 'cash', label: 'Cash' },
  { value: 'upi', label: 'UPI' },
  { value: 'bank', label: 'Card / Bank' },
  { value: 'credit_note', label: 'Credit note' },
];

type Mode = 'return' | 'exchange';

export default function ReturnScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const sale = useLedger((s) => s.sales.find((x) => x.id === id));
  const allowed = useCan('returns');
  const canSell = useCan('sell');
  const [mode, setMode] = useState<Mode>('return');
  const [qty, setQty] = useState<Record<string, number>>({});
  const [refund, setRefund] = useState<RefundMethod>('cash');
  const [reason, setReason] = useState('');
  const [approval, setApproval] = useState<Approval | null>(null);
  const [errors, setErrors] = useState<string[]>([]);

  const value = useMemo(() => {
    if (!sale) return 0;
    return round2(Object.entries(qty).reduce((s, [pid, q]) => {
      const line = sale.totals.lines.find((l) => l.productId === pid);
      return s + (line ? lineRefundValue(line, q) : 0);
    }, 0));
  }, [qty, sale]);

  if (!sale || !allowed) {
    return (
      <Screen>
        <Header title="Return / exchange" onBack={() => router.back()} />
        <Empty icon="lock-closed-outline" title={!allowed ? 'Not allowed' : 'Bill not found'} message={!allowed ? 'Your ERP role does not include "POS Returns – create".' : undefined} />
      </Screen>
    );
  }

  const live = validateReturn(sale, qty, reason);
  const selected = Object.values(qty).some((q) => q > 0);
  const ready = live.errors.length === 0 && Boolean(approval);

  const selectAll = () => setQty(Object.fromEntries(sale.totals.lines.map((l) => [l.productId, l.quantity - (sale.returned[l.productId] || 0)]).filter(([, q]) => (q as number) > 0)));

  const submit = async () => {
    if (!approval) return;
    try {
      if (mode === 'exchange') {
        const cartLines = useCart.getState().lines.length;
        if (cartLines && !(await confirm('Replace the current cart?', `The cart has ${cartLines} item(s). Starting an exchange clears it.`, 'Start exchange'))) return;
      }
      // Exchange: the value is "refunded" as cash and immediately spent on the new bill.
      const ret = createReturn(sale.id, qty, mode === 'exchange' ? 'cash' : refund, reason, { type: mode, approval });
      setErrors([]);
      if (mode === 'exchange') {
        useCart.getState().startExchange(
          { returnId: ret.id, returnNumber: ret.number, saleNumber: sale.number, amount: ret.total },
          sale.customer?.id ?? null,
        );
        if (router.canDismiss()) router.dismissAll();
        router.replace('/sell');
      } else {
        router.back();
      }
    } catch (e) {
      setErrors(e instanceof ValidationError ? e.result.errors.map((x) => x.message) : [(e as Error).message]);
    }
  };

  return (
    <Screen
      padded={false}
      scroll
      footer={(
        <View style={{ padding: space.lg, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border }}>
          <Button
            title={!selected ? 'Select items' : !approval ? 'Waiting for approval' : mode === 'exchange' ? `Exchange ${formatMoney(value)} → pick new items` : `Refund ${formatMoney(value)}`}
            variant={mode === 'exchange' ? 'primary' : 'danger'}
            icon={mode === 'exchange' ? 'swap-horizontal' : 'return-down-back'}
            size="lg"
            onPress={submit}
            disabled={!ready}
          />
        </View>
      )}
    >
      <Header title="Return / exchange" subtitle={`Bill ${sale.serverNumber ?? sale.number}${sale.customer ? ` · ${sale.customer.name}` : ''}`} onBack={() => router.back()} />
      <View style={{ paddingHorizontal: space.lg }}>
        <View style={{ marginTop: space.md }}>
          <Segmented<Mode>
            value={mode}
            options={[{ value: 'return', label: 'Return (refund)' }, ...(canSell ? [{ value: 'exchange' as Mode, label: 'Exchange' }] : [])]}
            onChange={setMode}
          />
          <Text style={{ color: colors.textMuted, fontSize: font.xs, marginTop: 6 }}>
            {mode === 'exchange'
              ? 'The returned value becomes credit on a new bill: pick the replacement items next and collect only the difference.'
              : 'The customer gets their money back for the selected items.'}
          </Text>
        </View>

        <SectionTitle right={<Chip label="Select all" icon="checkbox-outline" onPress={selectAll} />}>Items</SectionTitle>
        {sale.totals.lines.map((l) => {
          const remaining = l.quantity - (sale.returned[l.productId] || 0);
          return (
            <Card key={l.productId} style={{ marginBottom: space.sm, padding: space.md }}>
              <Row style={{ justifyContent: 'space-between' }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontWeight: '700', color: colors.text }}>{l.name}</Text>
                  <Text style={{ color: colors.textMuted, fontSize: font.xs }}>
                    Sold {l.quantity} · can {mode === 'exchange' ? 'exchange' : 'return'} {remaining} · {formatMoney(lineRefundValue(l, 1))} each
                  </Text>
                </View>
                {remaining > 0
                  ? <Stepper value={qty[l.productId] || 0} onChange={(v) => setQty({ ...qty, [l.productId]: Math.min(Math.max(v, 0), remaining) })} />
                  : <Text style={{ color: colors.textFaint }}>Returned</Text>}
              </Row>
            </Card>
          );
        })}

        {mode === 'return' && (
          <>
            <SectionTitle>Refund as</SectionTitle>
            <Row gap={space.sm} style={{ flexWrap: 'wrap' }}>
              {REFUNDS.filter((r) => r.value !== 'credit_note' || sale.customer).map((r) => (
                <Chip key={r.value} label={r.label} active={refund === r.value} onPress={() => setRefund(r.value)} />
              ))}
            </Row>
          </>
        )}

        <View style={{ marginTop: space.lg }}>
          <Field
            label="Reason"
            value={reason}
            onChangeText={setReason}
            placeholder={mode === 'exchange' ? 'Wrong size, different model…' : 'Damaged, wrong item, customer changed mind…'}
          />
        </View>

        {selected ? (
          <View style={{ marginTop: space.md }}>
            <ApprovalBox capability="approveReturns" onChange={setApproval} title={`Approve ${mode === 'exchange' ? 'exchange' : 'return'} of ${formatMoney(value)}`} />
          </View>
        ) : null}

        {errors.length ? <Banner tone="danger" messages={errors} /> : null}
        {live.errors.length && selected ? <Banner tone="warning" messages={live.errors.map((e) => e.message)} /> : null}
      </View>
    </Screen>
  );
}
