import * as Crypto from 'expo-crypto';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { ApiError } from '../api/client';
import { sync, type DeviceConfig, type PingResult } from '../api/sacone';
import { isValidDeviceKey, isValidServerUrl } from '../domain/validation';
import { secure } from '../storage/kv';
import { jsonStorage } from './persist';

const KEY_SECRET = 'sacpos.deviceKey';

interface DeviceState {
  baseUrl: string | null;
  deviceId: string | null;
  deviceKey: string | null; // kept in secure storage, not in the persisted JSON
  info: PingResult | null;
  lastPingAt: string | null;
  secretLoaded: boolean;
  loadSecret: () => Promise<void>;
  connect: (baseUrl: string, deviceKey: string) => Promise<PingResult>;
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
        return info;
      },

      setInfo(info) {
        set({ info, lastPingAt: new Date().toISOString() });
      },

      async disconnect() {
        await secure.remove(KEY_SECRET);
        set({ baseUrl: null, deviceKey: null, info: null, lastPingAt: null });
      },
    }),
    {
      name: 'sacpos.device',
      storage: jsonStorage,
      partialize: (s) => ({ baseUrl: s.baseUrl, deviceId: s.deviceId, info: s.info, lastPingAt: s.lastPingAt }),
    },
  ),
);

export function deviceConfig(): DeviceConfig | null {
  const { baseUrl, deviceKey, deviceId } = useDevice.getState();
  return baseUrl && deviceKey && deviceId ? { baseUrl, deviceKey, deviceId } : null;
}
