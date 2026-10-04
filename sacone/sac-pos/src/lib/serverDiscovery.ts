import Constants from 'expo-constants';

const LAN_OR_TAILSCALE = /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.)/;

/**
 * IP of the PC that served this app bundle (Expo Go / development builds). In local-server
 * mode that PC also runs the SACONE API, so it is the best guess when the saved server
 * address stops answering (the PC's DHCP address changed). Null in store builds.
 */
export function devServerHost(): string | null {
  const raw = Constants.expoConfig?.hostUri || Constants.linkingUri || '';
  const host = /^(?:[a-z]+:\/\/)?([^/:?#]+)/i.exec(raw)?.[1] ?? '';
  return LAN_OR_TAILSCALE.test(host) ? host : null;
}

/** Server URLs worth trying instead of `current`: same port, on the PC that served the app. */
export function serverUrlCandidates(current: string | null): string[] {
  const host = devServerHost();
  if (!host) return [];
  let port = '4000';
  try {
    if (current) port = new URL(current).port || port;
  } catch { /* keep the default port */ }
  const candidate = `http://${host}:${port}`;
  return candidate === current ? [] : [candidate];
}
