import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { formatMoney } from '../../domain/money';
import { CAPABILITY_LABELS, can, type Capability } from '../../domain/permissions';
import { useSyncBadge } from '../../lib/useSyncInfo';
import { daySummary } from '../../services/pos';
import { useCart } from '../../store/cart';
import { useCatalog } from '../../store/catalog';
import { useDevice } from '../../store/device';
import { useLedger } from '../../store/ledger';
import { useCurrentUser, useSession } from '../../store/session';
import { syncNow, useSyncStatus } from '../../sync/engine';
import { confirm } from '../../ui/dialogs';
import { DocSyncBadge } from '../../ui/SyncBadge';
import {
  Badge, Banner, Button, Card, Divider, Field, Header, KeyValue, Row, Screen, SectionTitle, StatTile, colors, font, space,
} from '../../ui/components';

export default function More() {
  const user = useCurrentUser();
  const info = useDevice((s) => s.info);
  const baseUrl = useDevice((s) => s.baseUrl);
  const sync = useSyncStatus();
  const badge = useSyncBadge();
  const sales = useLedger((s) => s.sales);
  const returns = useLedger((s) => s.returns);
  const payments = useLedger((s) => s.payments);
  const summary = useMemo(() => daySummary(), [sales, returns, payments]);
  const review = [...sales, ...returns, ...payments].filter((d) => d.sync === 'review');

  const lock = () => {
    useSession.getState().lock();
    router.replace('/login');
  };

  const disconnect = async () => {
    const pending = badge.counts.pending + badge.counts.review;
    const ok = await confirm(
      'Disconnect this phone?',
      pending
        ? `${pending} record(s) are not synced yet and will stay on the phone until you reconnect with the same key.`
        : 'You will need a device key from the ERP to connect again.',
      'Disconnect',
      true,
    );
    if (!ok) return;
    await useDevice.getState().disconnect();
    useSession.getState().lock();
    if (!pending) {
      useCatalog.getState().reset();
      useCart.getState().clear();
    }
    router.replace('/setup');
  };

  const [editingServer, setEditingServer] = useState(false);
  const [serverDraft, setServerDraft] = useState('');
  const [serverError, setServerError] = useState<string | null>(null);
  const [savingServer, setSavingServer] = useState(false);

  const saveServer = async () => {
    setSavingServer(true);
    setServerError(null);
    try {
      await useDevice.getState().changeServer(serverDraft);
      setEditingServer(false);
      syncNow().catch(() => undefined);
    } catch (e) {
      setServerError((e as Error).message);
    } finally {
      setSavingServer(false);
    }
  };

  const caps = Object.keys(CAPABILITY_LABELS) as Capability[];

  return (
    <Screen padded={false} scroll>
      <Header title="More" subtitle={`${info?.company?.businessName ?? ''}`} />
      <View style={{ paddingHorizontal: space.lg }}>
        <Card>
          <Row>
            <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ color: colors.primary, fontWeight: '800', fontSize: font.xl }}>{user?.name.slice(0, 1).toUpperCase()}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontWeight: '800', fontSize: font.lg, color: colors.text }}>{user?.name}</Text>
              <Text style={{ color: colors.textMuted }}>{user?.roleName} · {user?.email}</Text>
            </View>
            <Button title="Lock" size="sm" variant="secondary" icon="lock-closed-outline" onPress={lock} testID="lock" />
          </Row>
        </Card>

        <SectionTitle>Today on this phone</SectionTitle>
        <Row gap={space.sm}>
          <StatTile label="Bills" value={String(summary.billCount)} icon="receipt-outline" tone="primary" />
          <StatTile label="Sales" value={formatMoney(summary.gross)} icon="trending-up-outline" tone="success" />
        </Row>
        <Card style={{ marginTop: space.sm }}>
          <KeyValue label="Cash" value={formatMoney(summary.byMethod.cash)} muted />
          <KeyValue label="UPI" value={formatMoney(summary.byMethod.upi)} muted />
          <KeyValue label="Card / Bank" value={formatMoney(summary.byMethod.bank)} muted />
          <KeyValue label="Credit given" value={formatMoney(summary.byMethod.credit)} muted />
          <KeyValue label={`Returns (${summary.returnCount})`} value={`− ${formatMoney(summary.returnTotal)}`} muted />
          <KeyValue label="Dues collected" value={formatMoney(summary.collections)} muted />
          <KeyValue label="GST collected" value={formatMoney(summary.gst)} muted />
          <Divider />
          <KeyValue label="Expected cash in drawer" value={formatMoney(summary.cashInDrawer)} bold />
        </Card>

        <SectionTitle right={<Badge tone={badge.tone} label={badge.label} />}>Sync with SACONE</SectionTitle>
        <Card>
          {sync.lastError ? <Banner tone={sync.status === 'offline' ? 'warning' : 'danger'} messages={[sync.lastError]} /> : null}
          <KeyValue label="Last sync" value={sync.lastSyncAt ? new Date(sync.lastSyncAt).toLocaleTimeString('en-IN') : '—'} muted />
          {sync.lastSummary ? <Text style={{ color: colors.textMuted, fontSize: font.xs, marginBottom: space.sm }}>{sync.lastSummary}</Text> : null}
          <KeyValue label="Waiting to send" value={String(badge.counts.pending)} muted />
          <Button title={sync.status === 'syncing' ? 'Syncing…' : 'Sync now'} icon="sync" loading={sync.status === 'syncing'} onPress={() => syncNow()} style={{ marginTop: space.sm }} testID="sync-now" />
        </Card>

        {review.length ? (
          <>
            <SectionTitle>Needs review in ERP</SectionTitle>
            {review.map((d) => (
              <Card key={d.id} style={{ marginBottom: space.sm, padding: space.md }}>
                <Row style={{ justifyContent: 'space-between' }}>
                  <Text style={{ fontWeight: '700', color: colors.text }}>{d.number}</Text>
                  <DocSyncBadge doc={d} />
                </Row>
                <Text style={{ color: colors.danger, fontSize: font.xs, marginTop: 4 }}>{d.syncError}</Text>
                <Button
                  title="Send again"
                  size="sm"
                  variant="ghost"
                  onPress={() => {
                    const kind = sales.includes(d as never) ? 'sales' : returns.includes(d as never) ? 'returns' : 'payments';
                    useLedger.getState().retry(kind, d.id);
                    syncNow();
                  }}
                />
              </Card>
            ))}
          </>
        ) : null}

        <SectionTitle>Your permissions (from ERP role)</SectionTitle>
        <Card>
          {caps.map((cap) => (
            <Row key={cap} style={{ justifyContent: 'space-between', paddingVertical: 3 }}>
              <Text style={{ color: colors.text }}>{CAPABILITY_LABELS[cap]}</Text>
              <Badge tone={can(user?.permissions, cap) ? 'success' : 'neutral'} label={can(user?.permissions, cap) ? 'Allowed' : 'No'} />
            </Row>
          ))}
          <Text style={{ color: colors.textFaint, fontSize: font.xs, marginTop: space.sm }}>
            Change roles in SACONE ERP → Administration → Roles and Permissions. Updates reach this phone on the next sync.
          </Text>
        </Card>

        <SectionTitle>Device</SectionTitle>
        <Card>
          <KeyValue label="Device" value={`${info?.device.name ?? '—'} (${info?.device.code ?? '—'})`} muted />
          <KeyValue label="Warehouse" value={info?.warehouse?.name ?? '—'} muted />
          <KeyValue label="Server" value={baseUrl ?? '—'} muted />
          {editingServer ? (
            <View style={{ marginTop: space.sm }}>
              <Field
                label="New server address"
                value={serverDraft}
                onChangeText={setServerDraft}
                placeholder="http://192.168.1.10:4000"
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                error={serverError}
                hint="Shown in SACONE ERP → POS Devices & Sync. Your device key and bills stay on this phone."
              />
              <Row gap={space.sm}>
                <Button title="Cancel" variant="secondary" style={{ flex: 1 }} onPress={() => setEditingServer(false)} />
                <Button title="Save & test" icon="checkmark-outline" style={{ flex: 1 }} loading={savingServer} onPress={saveServer} />
              </Row>
            </View>
          ) : (
            <Button
              title="Change server address"
              variant="secondary"
              icon="swap-horizontal-outline"
              style={{ marginTop: space.sm }}
              onPress={() => { setServerDraft(baseUrl ?? 'http://'); setServerError(null); setEditingServer(true); }}
            />
          )}
          <KeyValue label="Negative stock" value={info?.settings.allowNegativeStock ? 'Allowed' : 'Blocked'} muted />
          {can(user?.permissions, 'manageDevice') ? (
            <Button title="Disconnect device" variant="danger" icon="unlink-outline" onPress={disconnect} style={{ marginTop: space.sm }} />
          ) : (
            <Text style={{ color: colors.textFaint, fontSize: font.xs, marginTop: space.sm }}>Only users with "POS Devices – edit" can re-pair this phone.</Text>
          )}
        </Card>
        <Text style={{ textAlign: 'center', color: colors.textFaint, fontSize: font.xs, marginTop: space.xl }}>SAC-POS 1.0 · SACONE</Text>
      </View>
    </Screen>
  );
}
