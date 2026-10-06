import { useEffect, useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { can, type Capability } from '../domain/permissions';
import type { Approval } from '../domain/types';
import { useCurrentUser, useSession } from '../store/session';
import { Banner, Button, Card, Chip, Row, colors, font, space } from './components';
import { PinPad } from './PinPad';

/**
 * Manager approval on the phone. A user who has the capability approves their own action;
 * otherwise a manager who has signed in on this phone before picks their name and enters
 * their PIN (works offline). Calls onChange with the approval, or null when cleared.
 */
export function ApprovalBox({ capability, onChange, title = 'Manager approval' }: {
  capability: Capability; onChange: (approval: Approval | null) => void; title?: string;
}) {
  const user = useCurrentUser();
  const profiles = useSession((s) => s.profiles);
  const selfApproves = can(user?.permissions, capability);
  const approvers = useMemo(
    () => Object.values(profiles).filter((p) => p.userId !== user?.userId && p.pinHash && can(p.permissions, capability)),
    [profiles, user?.userId, capability],
  );
  const [approverId, setApproverId] = useState<string | null>(null);
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [approval, setApproval] = useState<Approval | null>(null);

  useEffect(() => {
    if (selfApproves && user) {
      const a = { userId: user.userId, name: user.name, at: new Date().toISOString() };
      setApproval(a);
      onChange(a);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selfApproves, user?.userId]);

  const verify = async (value = pin) => {
    if (!approverId) return;
    setError(null);
    try {
      const p = await useSession.getState().verifyApprover(approverId, value, capability);
      const a = { userId: p.userId, name: p.name, at: new Date().toISOString() };
      setApproval(a);
      onChange(a);
    } catch (e) {
      setPin('');
      setError((e as Error).message);
    }
  };

  const reset = () => {
    setApproval(null);
    setPin('');
    onChange(null);
  };

  if (approval) {
    return (
      <Card style={{ backgroundColor: colors.successSoft, borderColor: colors.successSoft }}>
        <Text style={{ fontWeight: '700', color: colors.success }}>✓ Approved by {approval.name}</Text>
        <Text style={{ color: colors.textMuted, fontSize: font.xs, marginTop: 2 }}>
          {selfApproves ? 'Your ERP role can approve returns and exchanges.' : 'Approval is saved with the record and synced to the ERP.'}
        </Text>
        {!selfApproves ? <Button title="Change approver" variant="ghost" size="sm" onPress={reset} style={{ alignSelf: 'flex-start', marginTop: space.xs }} /> : null}
      </Card>
    );
  }

  return (
    <Card>
      <Text style={{ fontWeight: '700', color: colors.text }}>{title}</Text>
      {approvers.length === 0 ? (
        <Banner
          tone="warning"
          messages={[
            'No manager on this phone can approve yet.',
            'A user whose ERP role has "POS Returns – approve" must sign in on this phone once and set a PIN.',
          ]}
        />
      ) : (
        <>
          <Text style={{ color: colors.textMuted, fontSize: font.xs, marginTop: 2, marginBottom: space.sm }}>Manager: choose your name and enter your PIN.</Text>
          <Row gap={space.xs} style={{ flexWrap: 'wrap', marginBottom: space.sm }}>
            {approvers.map((p) => (
              <Chip key={p.userId} label={p.name} icon="shield-checkmark-outline" active={approverId === p.userId} onPress={() => { setApproverId(p.userId); setPin(''); setError(null); }} />
            ))}
          </Row>
          {approverId ? (
            <View>
              <PinPad value={pin} onChange={(v) => { setPin(v); if (v.length === 6) verify(v); }} onSubmit={() => verify()} submitLabel="Approve" />
            </View>
          ) : null}
          {error ? <Banner tone="danger" messages={[error]} /> : null}
        </>
      )}
    </Card>
  );
}
