import { useCallback, useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { sync, type AttendanceToday } from '../api/sacone';
import { deviceConfig } from '../store/device';
import { useCurrentUser } from '../store/session';
import { Badge, Banner, Button, Card, Row, colors, font, space } from './components';

const STATUS: Record<string, { label: string; tone: 'success' | 'warning' | 'danger' | 'info' | 'neutral' }> = {
  present: { label: 'Present', tone: 'success' },
  half_day: { label: 'Half day', tone: 'warning' },
  absent: { label: 'Absent', tone: 'danger' },
  leave: { label: 'Leave', tone: 'info' },
  holiday: { label: 'Holiday', tone: 'neutral' },
  week_off: { label: 'Week off', tone: 'neutral' },
};

const time12 = (hhmm: string | null) => {
  if (!hhmm) return '—';
  const [h, m] = hhmm.split(':').map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
};
const hours = (min: number) => `${Math.floor(min / 60)}h ${String(Math.round(min) % 60).padStart(2, '0')}m`;

/**
 * Check in / out for the signed-in staff member (ERP attendance). Needs a connection to SACONE:
 * the time is taken by the server so it cannot be changed on the phone.
 */
export function AttendanceCard() {
  const user = useCurrentUser();
  const allowed = Boolean(user?.permissions.includes('attendance.self.create'));
  const [today, setToday] = useState<AttendanceToday | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const call = useCallback(async (action: 'status' | 'in' | 'out') => {
    const c = deviceConfig();
    if (!c || !user) return;
    setBusy(true);
    setError(null);
    try {
      const res = await sync.attendance(c, user.userId, action);
      setToday(res.today);
    } catch (e) {
      setError((e as Error).message || 'Could not reach SACONE. Check the connection and try again.');
      if (action === 'status') setToday(null);
    } finally {
      setBusy(false);
    }
  }, [user]);

  useEffect(() => { if (allowed) call('status'); }, [allowed, call]);
  if (!allowed) return null;

  const status = today ? STATUS[today.status] : null;
  const working = today?.checkIn && !today.checkOut;
  const worked = today?.checkIn
    ? today.checkOut ? today.minutes : Math.round((Date.now() - new Date(today.checkIn).getTime()) / 60000)
    : 0;

  return (
    <Card style={{ marginTop: space.sm }}>
      <Row style={{ justifyContent: 'space-between' }}>
        <Text style={{ fontWeight: '800', fontSize: font.md, color: colors.text }}>Attendance today</Text>
        {status ? <Badge label={`${status.label}${today?.late ? ' · late' : ''}`} tone={status.tone} /> : <Badge label="Not checked in" tone="neutral" />}
      </Row>
      <Row style={{ marginTop: space.sm }} gap={space.lg}>
        <View><Text style={{ color: colors.textMuted, fontSize: font.xs }}>In</Text><Text style={{ fontWeight: '700', color: colors.text }}>{time12(today?.inTime ?? null)}</Text></View>
        <View><Text style={{ color: colors.textMuted, fontSize: font.xs }}>Out</Text><Text style={{ fontWeight: '700', color: colors.text }}>{time12(today?.outTime ?? null)}</Text></View>
        <View><Text style={{ color: colors.textMuted, fontSize: font.xs }}>Worked</Text><Text style={{ fontWeight: '700', color: colors.text }}>{hours(worked)}</Text></View>
      </Row>
      {error ? <View style={{ marginTop: space.sm }}><Banner tone="warning" messages={[error]} /></View> : null}
      <View style={{ marginTop: space.md }}>
        {!today?.checkIn ? (
          <Button title="Check in" icon="log-in-outline" variant="success" loading={busy} onPress={() => call('in')} testID="attendance-in" />
        ) : working ? (
          <Button title="Check out" icon="log-out-outline" loading={busy} onPress={() => call('out')} testID="attendance-out" />
        ) : (
          <Text style={{ color: colors.success, fontWeight: '700', textAlign: 'center' }}>✓ Day complete</Text>
        )}
        {today === undefined || error ? (
          <Button title="Refresh" size="sm" variant="ghost" onPress={() => call('status')} style={{ marginTop: space.xs }} />
        ) : null}
      </View>
    </Card>
  );
}
