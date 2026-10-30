import * as Crypto from 'expo-crypto';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { ApiError } from '../api/client';
import { sync, type DeviceConfig, type PingResult } from '../api/sacone';
import { isValidDeviceKey, isValidServerUrl } from '../domain/validation';
import { secure } from '../storage/kv';
import { jsonStorage } from './persist';

const KEY_SECRET = 'sacpos.deviceKey';
/** Keys of the other firms' terminals this device may switch to: { [terminal id]: key } (secure storage). */
const SAVED_KEYS = 'sacpos.savedKeys';

/** A firm's terminal this device has been connected to (no secret: the key is in secure storage). */
export interface SavedTerminal {
  id: string;
  firm: string;
  deviceName: string;
  warehouse: string | null;
  baseUrl: string;
}

async function readKeys(): Promise<Record<string, string>> {
  try { return JSON.parse((await secure.get(SAVED_KEYS)) || '{}') as Record<string, string>; } catch { return {}; }
}

interface DeviceState {
  baseUrl: string | null;
  deviceId: string | null;
  deviceKey: string | null; // kept in secure storage, not in the persisted JSON
  info: PingResult | null;
  lastPingAt: string | null;
  secretLoaded: boolean;
  /** Every firm's terminal connected here, so the sign-in screen can offer a firm choice. */
  saved: SavedTerminal[];
  /** Remember the current terminal (and its key) for the firm choice. */
  remember: () => Promise<void>;
  savedKey: (id: string) => Promise<string | null>;
  forget: (id: string) => Promise<void>;
  loadSecret: () => Promise<void>;
  connect: (baseUrl: string, deviceKey: string) => Promise<PingResult>;
  /** Point this phone at a new server address (e.g. after the PC's IP changed); keeps the key. */
  changeServer: (baseUrl: string) => Promise<PingResult>;
  setInfo: (info: PingResult) => void;
  disconnect: () => Promise<void>;
}

export const useDevice = create<DeviceState>()(
  persist(
    (set, get) => ({
      baseUrl: null,
      deviceId: null,
      deviceKey: null,
      info: null,
      lastPingAt: null,
      secretLoaded: false,
      saved: [],

      async remember() {
        const { info, baseUrl, deviceKey } = get();
        if (!info?.device?.id || !baseUrl || !deviceKey) return;
        const entry: SavedTerminal = {
          id: info.device.id,
          firm: info.company?.businessName || info.device.name,
          deviceName: info.device.name,
          warehouse: info.warehouse?.name ?? null,
          baseUrl,
        };
        const keys = await readKeys();
        if (keys[entry.id] !== deviceKey) await secure.set(SAVED_KEYS, JSON.stringify({ ...keys, [entry.id]: deviceKey }));
        const others = get().saved.filter((t) => t.id !== entry.id);
        set({ saved: [...others, entry].sort((a, b) => a.firm.localeCompare(b.firm)) });
      },

      async savedKey(id) {
        return (await readKeys())[id] ?? null;
      },

      async forget(id) {
        const { [id]: _drop, ...rest } = await readKeys();
        await secure.set(SAVED_KEYS, JSON.stringify(rest));
        set({ saved: get().saved.filter((t) => t.id !== id) });
      },

      async loadSecret() {
        const key = await secure.get(KEY_SECRET);
        set({ deviceKey: key, secretLoaded: true });
      },

      async connect(rawUrl, rawKey) {
        const baseUrl = rawUrl.trim().replace(/\/+$/, '');
        const deviceKey = rawKey.trim();
        if (!isValidServerUrl(baseUrl)) throw new ApiError('Enter the server address, e.g. http://192.168.1.10:4000', 0, 'VALIDATION');
        if (!isValidDeviceKey(deviceKey)) throw new ApiError('Device key should start with sk_live_ (copy it from ERP → POS Devices & Sync)', 0, 'VALIDATION');
        const deviceId = get().deviceId ?? Crypto.randomUUID();
        const info = await sync.ping({ baseUrl, deviceKey, deviceId });
        await secure.set(KEY_SECRET, deviceKey);
        set({ baseUrl, deviceKey, deviceId, info, lastPingAt: new Date().toISOString() });
        await get().remember().catch(() => undefined);
        return info;
      },

      async changeServer(rawUrl) {
        const baseUrl = rawUrl.trim().replace(/\/+$/, '');
        if (!isValidServerUrl(baseUrl)) throw new ApiError('Enter the server address, e.g. http://192.168.1.10:4000', 0, 'VALIDATION');
        const { deviceKey, deviceId } = get();
        if (!deviceKey || !deviceId) throw new ApiError('This phone is not connected yet', 0, 'VALIDATION');
        const info = await sync.ping({ baseUrl, deviceKey, deviceId });
        set({ baseUrl, info, lastPingAt: new Date().toISOString() });
        return info;
      },

      setInfo(info) {
        set({ info, lastPingAt: new Date().toISOString() });
        // terminals connected before the firm choice existed are added on their next ping
        if (!get().saved.some((t) => t.id === info.device?.id)) get().remember().catch(() => undefined);
      },

      async disconnect() {
        const id = get().info?.device?.id;
        await secure.remove(KEY_SECRET);
        if (id) await get().forget(id).catch(() => undefined);
        set({ baseUrl: null, deviceKey: null, info: null, lastPingAt: null });
      },
    }),
    {
      name: 'sacpos.device',
      storage: jsonStorage,
      partialize: (s) => ({ baseUrl: s.baseUrl, deviceId: s.deviceId, info: s.info, lastPingAt: s.lastPingAt, saved: s.saved }),
    },
  ),
);

export function deviceConfig(): DeviceConfig | null {
  const { baseUrl, deviceKey, deviceId } = useDevice.getState();
  return baseUrl && deviceKey && deviceId ? { baseUrl, deviceKey, deviceId } : null;
}
