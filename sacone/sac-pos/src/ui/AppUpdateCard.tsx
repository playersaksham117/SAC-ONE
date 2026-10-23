import { useState } from 'react';
import { Text } from 'react-native';
import { availableUpdate, canSelfInstall, checkForUpdate, downloadAndInstall, formatSize, installedVersion, useAppUpdate } from '../lib/appUpdate';
import { deviceConfig } from '../store/device';
import { notify } from './dialogs';
import { Banner, Button, Card, KeyValue, SectionTitle, Badge, colors, font, space } from './components';

/** More → App update: this version, the newest on the shop server, and Install. */
export function AppUpdateCard() {
  const latest = useAppUpdate((s) => s.latest);
  const phase = useAppUpdate((s) => s.phase);
  const progress = useAppUpdate((s) => s.progress);
  const error = useAppUpdate((s) => s.error);
  const checkedAt = useAppUpdate((s) => s.checkedAt);
  const [checking, setChecking] = useState(false);
  const mine = installedVersion();
  const update = availableUpdate(latest);

  const check = async () => {
    const cfg = deviceConfig();
    if (!cfg) return;
    setChecking(true);
    try {
      const found = await checkForUpdate(cfg, true);
      if (!found) notify('App update', 'SAC-POS is up to date.');
    } finally {
      setChecking(false);
    }
  };
  const install = async () => {
    const cfg = deviceConfig();
    if (!cfg) return;
    try { await downloadAndInstall(cfg); } catch (e) { notify('App update', (e as Error).message); }
  };

  return (
    <>
      <SectionTitle right={update ? <Badge tone="warning" label="Update available" /> : <Badge tone="success" label="Up to date" />}>App update</SectionTitle>
      <Card>
        <KeyValue label="This phone" value={`SAC-POS ${mine.name} (build ${mine.code || '—'})`} muted />
        <KeyValue label="On the server" value={latest ? `${latest.versionName} (build ${latest.versionCode})` : '—'} muted />
        {update ? (
          <>
            {update.notes ? <Text style={{ color: colors.textMuted, fontSize: font.xs, marginTop: space.xs }} numberOfLines={6}>{update.notes}</Text> : null}
            {phase === 'downloading' ? <Banner tone="info" messages={[`Downloading… ${Math.round(progress * 100)}% of ${formatSize(update.size)}`]} /> : null}
            {phase === 'error' && error ? <Banner tone="danger" messages={[error]} /> : null}
            {canSelfInstall() ? (
              <Button
                title={phase === 'ready' ? 'Install update' : `Download & install (${formatSize(update.size)})`}
                icon="cloud-download-outline"
                style={{ marginTop: space.sm }}
                loading={phase === 'downloading' || phase === 'installing'}
                onPress={install}
              />
            ) : (
              <Banner tone="warning" messages={['This copy of SAC-POS cannot install updates itself. Install the new APK once from the link in ERP → POS Devices; after that, updates install from here.']} />
            )}
            <Text style={{ color: colors.textFaint, fontSize: font.xs, marginTop: space.sm }}>
              Downloads from your SACONE server over the shop network. Android asks you to confirm; bills, customers and the pairing stay on the phone.
            </Text>
          </>
        ) : null}
        <Button title="Check for update" variant="secondary" icon="refresh-outline" style={{ marginTop: space.sm }} loading={checking} onPress={check} />
        {checkedAt ? <Text style={{ color: colors.textFaint, fontSize: font.xs, marginTop: space.xs }}>Last checked {new Date(checkedAt).toLocaleTimeString('en-IN')}</Text> : null}
      </Card>
    </>
  );
}
