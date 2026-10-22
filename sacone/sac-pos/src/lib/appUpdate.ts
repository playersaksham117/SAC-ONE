import * as Application from 'expo-application';
import Constants from 'expo-constants';
import { Directory, File, Paths } from 'expo-file-system';
import { Platform } from 'react-native';
import { create } from 'zustand';
import { ApiError, joinUrl } from '../api/client';
import { deviceHeaders, sync, type AppRelease, type DeviceConfig } from '../api/sacone';
import { NativeDocumentShare } from '../../modules/document-share';

/**
 * In-app updates. GitHub Actions builds each new SAC-POS APK and publishes it as a release; the
 * shop's SACONE server copies it and offers it to paired phones (GET /api/v1/sync/app/latest).
 * The phone downloads it from that server over the shop network into cache/app-updates/ and opens
 * Android's installer; the user confirms, and Android accepts it only if it is signed with the same
 * key and is newer.
 */

type Phase = 'idle' | 'downloading' | 'ready' | 'installing' | 'error';

interface AppUpdateState {
  latest: AppRelease | null;
  checkedAt: string | null;
  phase: Phase;
  progress: number; // 0..1
  error: string | null;
  file: string | null;
}

export const useAppUpdate = create<AppUpdateState>(() => ({
  latest: null, checkedAt: null, phase: 'idle', progress: 0, error: null, file: null,
}));

const CHECK_EVERY_MS = 15 * 60 * 1000;

/** This APK's version as Android knows it (EAS numbers every build; Expo Go reports its own). */
export function installedVersion(): { name: string; code: number } {
  const name = Application.nativeApplicationVersion ?? Constants.expoConfig?.version ?? '0.0.0';
  const code = Number(Application.nativeBuildVersion ?? Constants.expoConfig?.android?.versionCode ?? 0);
  return { name, code: Number.isFinite(code) ? code : 0 };
}

/** In-app install needs the native installer bridge (standalone APK on Android, not Expo Go). */
export function canSelfInstall(): boolean {
  return Platform.OS === 'android' && typeof NativeDocumentShare?.installApkAsync === 'function';
}

/** A newer app than this one, if the server holds one. */
export function availableUpdate(latest: AppRelease | null): AppRelease | null {
  return latest && latest.versionCode > installedVersion().code ? latest : null;
}

/** Ask the server (at most every 15 minutes unless forced). Never throws: updates are optional. */
export async function checkForUpdate(cfg: DeviceConfig, force = false): Promise<AppRelease | null> {
  const s = useAppUpdate.getState();
  if (!force && s.checkedAt && Date.now() - new Date(s.checkedAt).getTime() < CHECK_EVERY_MS) return availableUpdate(s.latest);
  try {
    const { latest } = await sync.appLatest(cfg);
    useAppUpdate.setState({ latest, checkedAt: new Date().toISOString() });
    return availableUpdate(latest);
  } catch (e) {
    if (!(e instanceof ApiError && e.status === 404)) useAppUpdate.setState({ checkedAt: new Date().toISOString() });
    return null;
  }
}

const updateDir = () => new Directory(Paths.cache, 'app-updates');

/** Download the APK from the shop server, then open Android's installer. */
export async function downloadAndInstall(cfg: DeviceConfig): Promise<void> {
  const release = availableUpdate(useAppUpdate.getState().latest);
  if (!release) throw new Error('No newer version on the server');
  if (!canSelfInstall()) throw new Error('This copy of SAC-POS cannot install updates itself. Install the new APK once from the link in ERP → POS Devices.');
  const native = NativeDocumentShare!;
  if (native.canInstallPackages && !native.canInstallPackages()) {
    native.openInstallSettings?.();
    throw new Error('Allow "Install unknown apps" for SAC-POS, come back and tap Install again.');
  }

  const dir = updateDir();
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
  const target = new File(dir, `sac-pos-${release.versionCode}.apk`);
  const ready = useAppUpdate.getState();
  if (!(ready.phase === 'ready' && ready.file === target.uri && target.exists && target.size === release.size)) {
    // old downloads go first: the folder holds one APK at most
    for (const item of dir.list()) { try { item.delete(); } catch { /* ignore */ } }
    useAppUpdate.setState({ phase: 'downloading', progress: 0, error: null, file: null });
    try {
      await File.downloadFileAsync(joinUrl(cfg.baseUrl, '/api/v1/sync/app/download', { versionCode: release.versionCode }), target, {
        headers: deviceHeaders(cfg),
        idempotent: true,
        onProgress: ({ bytesWritten, totalBytes }) => {
          const total = totalBytes > 0 ? totalBytes : release.size;
          useAppUpdate.setState({ progress: total ? Math.min(1, bytesWritten / total) : 0 });
        },
      });
    } catch (e) {
      useAppUpdate.setState({ phase: 'error', error: (e as Error).message });
      throw e;
    }
    if (target.size !== release.size) {
      try { target.delete(); } catch { /* ignore */ }
      const msg = 'The download was incomplete. Try again on the shop Wi-Fi.';
      useAppUpdate.setState({ phase: 'error', error: msg });
      throw new Error(msg);
    }
    useAppUpdate.setState({ phase: 'ready', progress: 1, file: target.uri });
  }
  useAppUpdate.setState({ phase: 'installing' });
  try {
    await native.installApkAsync!(target.uri);
  } finally {
    useAppUpdate.setState({ phase: 'ready' });
  }
}

export const formatSize = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;
