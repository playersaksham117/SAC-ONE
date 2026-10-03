import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { DENOMINATIONS, notesTotal, suggestChange, type NoteCounts } from '../domain/cash';
import { formatMoney, round2 } from '../domain/money';
import type { Payment, PaymentMethod } from '../domain/types';
import { useCartTotals } from '../lib/useCartTotals';
import { ValidationError, checkCheckout, completeSale, withExchangeCredit } from '../services/pos';
import { useCart } from '../store/cart';
import { Banner, Button, Card, Chip, Header, IconButton, Row, Screen, SectionTitle, Stepper, colors, font, radius, space } from '../ui/components';

const METHODS: { method: PaymentMethod; label: string; icon: 'cash-outline' | 'qr-code-outline' | 'card-outline' | 'time-outline' }[] = [
  { method: 'cash', label: 'Cash', icon: 'cash-outline' },
  { method: 'upi', label: 'UPI', icon: 'qr-code-outline' },
  { method: 'bank', label: 'Card', icon: 'card-outline' },
  { method: 'credit', label: 'Credit', icon: 'time-outline' },
];

const toNum = (t: string) => Number(t.replace(/[^0-9.]/g, '')) || 0;

function AmountInput({ value, onChange, placeholder, testID }: { value: string; onChange: (v: string) => void; placeholder?: string; testID?: string }) {
  return (
    <TextInput
      testID={testID}
      value={value}
      onChangeText={onChange}
      keyboardType="decimal-pad"
      placeholder={placeholder}
      placeholderTextColor={colors.textFaint}
      style={{ flex: 1, height: 44, borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, paddingHorizontal: 10, fontSize: font.md, color: colors.text, backgroundColor: colors.surface }}
    />
  );
}

/** One counter row per note / coin, with the running amount. */
function NoteCounter({ counts, onChange }: { counts: NoteCounts; onChange: (next: NoteCounts) => void }) {
  return (
    <View>
      {DENOMINATIONS.map((value) => {
        const key = String(value);
        const n = counts[key] || 0;
        return (
          <Row key={key} style={{ justifyContent: 'space-between', paddingVertical: 4 }}>
            <Text style={{ width: 64, fontWeight: '700', color: colors.text }}>₹{value}</Text>
            <Stepper value={n} onChange={(v) => onChange({ ...counts, [key]: Math.max(0, v) })} />
            <Text style={{ width: 84, textAlign: 'right', color: n ? colors.text : colors.textFaint }}>{formatMoney(value * n)}</Text>
          </Row>
        );
      })}
    </View>
  );
}

interface Row_ { method: PaymentMethod; amount: string; reference: string }

export default function Checkout() {
  const { totals, customer } = useCartTotals();
  const exchange = useCart((s) => s.exchange);
  const total = totals.grandTotal;
  const credit = exchange ? round2(Math.min(exchange.amount, total)) : 0;
  const giveBack = exchange ? round2(Math.max(exchange.amount - total, 0)) : 0;
  const due = round2(total - credit);

  const [split, setSplit] = useState(false);
  const [rows, setRows] = useState<Row_[]>([{ method: 'cash', amount: due.toFixed(2), reference: '' }]);
  const [tendered, setTendered] = useState('');
  const [drawerOn, setDrawerOn] = useState(false);
  const [received, setReceived] = useState<NoteCounts>({});
  const [changeCounts, setChangeCounts] = useState<NoteCounts | null>(null); // null = suggested
  const [busy, setBusy] = useState(false);
  const [submitError, setSubmitError] = useState<string[]>([]);

  const payments: Payment[] = useMemo(
    () => (due > 0 ? rows : [])
      .map((r) => ({ method: r.method, amount: round2(toNum(r.amount)), reference: r.reference.trim() || null }))
      .filter((p) => p.amount > 0),
    [rows, due],
  );
  const check = useMemo(() => checkCheckout(withExchangeCredit(payments, total)), [payments, totals]);
  const paid = round2(payments.reduce((s, p) => s + p.amount, 0));
  const remaining = round2(due - paid);
  const cashPart = round2(payments.filter((p) => p.method === 'cash').reduce((s, p) => s + p.amount, 0));

  const receivedTotal = notesTotal(received);
  const effectiveTendered = drawerOn ? receivedTotal : toNum(tendered);
  const change = effectiveTendered ? round2(effectiveTendered - cashPart) : 0;
  const suggested = suggestChange(Math.max(change, 0));
  const changeShown = changeCounts ?? suggested.counts;
  const changeNotes = notesTotal(changeShown);
  const changeNeeded = Math.floor(Math.max(change, 0));

  const drawerErrors: string[] = [];
  if (drawerOn && cashPart > 0) {
    if (receivedTotal < cashPart - 0.001) drawerErrors.push(`Notes received (${formatMoney(receivedTotal)}) are less than the cash due (${formatMoney(cashPart)})`);
    else if (changeNotes !== changeNeeded) drawerErrors.push(`Change notes add up to ${formatMoney(changeNotes)}; give ${formatMoney(changeNeeded)}`);
  }
  const blocked = check.errors.length > 0 || drawerErrors.length > 0;

  const choose = (method: PaymentMethod) => {
    setSplit(false);
    setRows([{ method, amount: due.toFixed(2), reference: '' }]);
    setSubmitError([]);
  };
  const update = (i: number, patch: Partial<Row_>) => setRows((rs) => rs.map((r, k) => (k === i ? { ...r, ...patch } : r)));
  const addRow = () => setRows((rs) => [...rs, { method: rs.some((r) => r.method === 'upi') ? 'bank' : 'upi', amount: Math.max(remaining, 0).toFixed(2), reference: '' }]);
  const setReceivedCounts = (next: NoteCounts) => { setReceived(next); setChangeCounts(null); };

  const submit = () => {
    setBusy(true);
    setSubmitError([]);
    try {
      const sale = completeSale(payments, {
        tendered: effectiveTendered || undefined,
        cashDrawer: drawerOn && cashPart > 0 ? { received, change: change > 0 ? changeShown : {} } : null,
      });
      if (router.canDismiss()) router.dismissAll();
      router.push({ pathname: '/sale/[id]', params: { id: sale.id, done: '1' } });
    } catch (e) {
      setSubmitError(e instanceof ValidationError ? e.result.errors.map((x) => x.message) : [(e as Error).message]);
    } finally {
      setBusy(false);
    }
  };

  const single = !split ? rows[0] : null;

  return (
    <Screen
      padded={false}
      scroll
      footer={(
        <View style={{ padding: space.lg, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border }}>
          <Button
            testID="complete-sale"
            title={blocked ? 'Fix the issues above' : `Complete sale · ${formatMoney(total)}`}
            icon="checkmark-circle"
            variant="success"
            size="lg"
            onPress={submit}
            loading={busy}
            disabled={blocked}
          />
        </View>
      )}
    >
      <Header title="Payment" subtitle={customer ? customer.name : 'Walk-in customer'} onBack={() => router.back()} />
      <View style={{ paddingHorizontal: space.lg }}>
        <Card style={{ alignItems: 'center', backgroundColor: colors.dark, borderColor: colors.dark }}>
          <Text style={{ color: '#94A3B8', fontWeight: '600' }}>{exchange ? 'To collect after exchange' : 'Amount payable'}</Text>
          <Text style={{ color: '#fff', fontSize: 40, fontWeight: '800', marginTop: 4, letterSpacing: -1 }}>{formatMoney(due)}</Text>
          <Text style={{ color: '#94A3B8', fontSize: font.xs, marginTop: 4 }}>
            {exchange
              ? `Bill ${formatMoney(total)} − exchange credit ${formatMoney(credit)} (${exchange.returnNumber})`
              : `incl. GST ${formatMoney(totals.gstAmount)}`}
          </Text>
        </Card>

        {giveBack > 0 ? (
          <Banner tone="warning" title={`Give back ${formatMoney(giveBack)} in cash`} messages={['The returned items are worth more than the new bill.']} />
        ) : null}

        {due > 0 && (
          <SectionTitle right={<Chip label={split ? 'Split on' : 'Split payment'} icon="git-branch-outline" active={split} onPress={() => { setSplit(!split); if (split) choose('cash'); }} />}>
            Pay by
          </SectionTitle>
        )}

        {due > 0 && !split && (
          <Row gap={space.sm} style={{ flexWrap: 'wrap' }}>
            {METHODS.map((m) => {
              const active = single?.method === m.method;
              return (
                <Pressable
                  key={m.method}
                  testID={`pay-${m.method}`}
                  onPress={() => choose(m.method)}
                  style={{
                    flexBasis: '47%', flexGrow: 1, height: 64, borderRadius: radius.lg, borderWidth: 2,
                    borderColor: active ? colors.primary : colors.border, backgroundColor: active ? colors.primarySoft : colors.surface,
                    alignItems: 'center', justifyContent: 'center', gap: 2,
                  }}
                >
                  <Text style={{ fontWeight: '800', color: active ? colors.primary : colors.text, fontSize: font.md }}>{m.label}</Text>
                  <Text style={{ fontSize: font.xs, color: colors.textMuted }}>{m.method === 'credit' ? 'Udhar / due' : m.method === 'bank' ? 'Debit / credit card' : m.method === 'upi' ? 'GPay, PhonePe…' : 'Notes & coins'}</Text>
                </Pressable>
              );
            })}
          </Row>
        )}

        {due > 0 && !split && single?.method === 'cash' && (
          <Card style={{ marginTop: space.md }}>
            <Row style={{ justifyContent: 'space-between', marginBottom: space.sm }}>
              <Text style={{ fontWeight: '700', color: colors.text }}>{drawerOn ? 'Cash drawer' : 'Cash received (optional)'}</Text>
              <Chip label={drawerOn ? 'Counting notes' : 'Count notes'} icon="wallet-outline" active={drawerOn} onPress={() => setDrawerOn(!drawerOn)} />
            </Row>

            {!drawerOn ? (
              <>
                <Row>
                  <AmountInput testID="tendered" value={tendered} onChange={setTendered} placeholder={due.toFixed(2)} />
                </Row>
                <Row gap={space.sm} style={{ marginTop: space.sm, flexWrap: 'wrap' }}>
                  {[due, Math.ceil(due / 100) * 100, Math.ceil(due / 500) * 500, Math.ceil(due / 500) * 500 + 500].filter((v, i, a) => v >= due && a.indexOf(v) === i).slice(0, 4).map((v) => (
                    <Chip key={v} label={formatMoney(v)} onPress={() => setTendered(String(v))} />
                  ))}
                </Row>
              </>
            ) : (
              <>
                <Text style={{ color: colors.textMuted, fontSize: font.xs, marginBottom: 4 }}>Notes & coins received from the customer</Text>
                <NoteCounter counts={received} onChange={setReceivedCounts} />
                <Row style={{ justifyContent: 'space-between', marginTop: 6 }}>
                  <Text style={{ fontWeight: '700', color: colors.text }}>Received</Text>
                  <Text style={{ fontWeight: '800', color: colors.text }}>{formatMoney(receivedTotal)}</Text>
                </Row>

                {change > 0 ? (
                  <View style={{ marginTop: space.md, paddingTop: space.md, borderTopWidth: 1, borderTopColor: colors.border }}>
                    <Row style={{ justifyContent: 'space-between' }}>
                      <Text style={{ color: colors.textMuted, fontSize: font.xs }}>Change to give back{changeCounts ? '' : ' (suggested)'}</Text>
                      {changeCounts ? <Chip label="Use suggestion" onPress={() => setChangeCounts(null)} /> : null}
                    </Row>
                    <NoteCounter counts={changeShown} onChange={setChangeCounts} />
                    {suggested.remainder > 0 ? (
                      <Text style={{ color: colors.textMuted, fontSize: font.xs, marginTop: 4 }}>+ {formatMoney(suggested.remainder)} round-off (paise)</Text>
                    ) : null}
                  </View>
                ) : null}
              </>
            )}

            {effectiveTendered ? (
              <Text style={{ marginTop: space.md, fontSize: font.lg, fontWeight: '800', color: change < 0 ? colors.danger : colors.success }}>
                {change < 0 ? `Short by ${formatMoney(-change)}` : `Return change ${formatMoney(change)}`}
              </Text>
            ) : null}
          </Card>
        )}

        {due > 0 && !split && (single?.method === 'upi' || single?.method === 'bank') && (
          <Card style={{ marginTop: space.md }}>
            <Text style={{ fontWeight: '700', color: colors.text, marginBottom: space.sm }}>{single.method === 'upi' ? 'UPI transaction ID' : 'Card approval / last 4 digits'}</Text>
            <TextInput
              value={single.reference}
              onChangeText={(v) => update(0, { reference: v })}
              placeholder="Reference (recommended)"
              placeholderTextColor={colors.textFaint}
              autoCapitalize="characters"
              style={{ height: 44, borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, paddingHorizontal: 10, color: colors.text }}
            />
          </Card>
        )}

        {due > 0 && split && (
          <Card style={{ marginTop: space.sm }}>
            {rows.map((r, i) => (
              <View key={i} style={{ marginBottom: space.md }}>
                <Row gap={6} style={{ flexWrap: 'wrap' }}>
                  {METHODS.map((m) => <Chip key={m.method} label={m.label} active={r.method === m.method} onPress={() => update(i, { method: m.method })} />)}
                  {rows.length > 1 ? <IconButton icon="close-circle" label="Remove" tone="danger" onPress={() => setRows((rs) => rs.filter((_, k) => k !== i))} /> : null}
                </Row>
                <Row style={{ marginTop: space.sm }}>
                  <AmountInput value={r.amount} onChange={(v) => update(i, { amount: v })} placeholder="Amount" />
                  {r.method === 'upi' || r.method === 'bank'
                    ? <AmountInput value={r.reference} onChange={(v) => update(i, { reference: v })} placeholder="Reference" />
                    : null}
                </Row>
              </View>
            ))}
            <Row style={{ justifyContent: 'space-between' }}>
              <Button title="Add payment" icon="add" variant="ghost" size="sm" onPress={addRow} />
              <Text style={{ fontWeight: '700', color: Math.abs(remaining) < 0.01 ? colors.success : colors.warning }}>
                {Math.abs(remaining) < 0.01 ? 'Fully paid' : remaining > 0 ? `${formatMoney(remaining)} left` : `${formatMoney(-remaining)} over`}
              </Text>
            </Row>
          </Card>
        )}

        <View style={{ marginTop: space.md }}>
          {check.errors.length ? <Banner tone="danger" title="Cannot complete yet" messages={check.errors.map((e) => e.message)} /> : null}
          {drawerErrors.length ? <Banner tone="danger" title="Cash drawer" messages={drawerErrors} /> : null}
          {check.warnings.length ? <Banner tone="warning" messages={check.warnings.map((e) => e.message)} /> : null}
          {submitError.length ? <Banner tone="danger" messages={submitError} /> : null}
        </View>
      </View>
    </Screen>
  );
}
