import * as Crypto from 'expo-crypto';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { ApiError } from '../api/client';
import { auth, sync, type StaffStatus } from '../api/sacone';
import { can, type Capability } from '../domain/permissions';
import { isValidEmail, isValidPin } from '../domain/validation';
import { deviceConfig, useDevice } from './device';
import { jsonStorage } from './persist';

/** How long a PIN keeps working without the terminal reaching SACONE. */
export const OFFLINE_GRACE_DAYS = 7;
export const MAX_PIN_ATTEMPTS = 5;

export interface Profile {
  userId: string;
  name: string;
  email: string;
  roleName: string;
  permissions: string[];
  pinHash: string | null;
  pinSalt: string | null;
  lastVerifiedAt: string;   // last time the ERP confirmed this user is active
  failedPins: number;
}

interface SessionState {
  profiles: Record<string, Profile>;
  currentUserId: string | null; // never persisted → app always starts locked
  loginOnline: (email: string, password: string) => Promise<{ needsPin: boolean }>;
  setPin: (pin: string) => Promise<void>;
  unlock: (userId: string, pin: string) => Promise<void>;
  applyStaffStatus: (staff: StaffStatus[]) => void;
  lock: () => void;
  forget: (userId: string) => void;
}

async function hashPin(pin: string, salt: string) {
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, `${salt}:${pin}`);
}

const daysSince = (iso: string) => (Date.now() - new Date(iso).getTime()) / 86400000;

export const useSession = create<SessionState>()(
  persist(
    (set, get) => ({
      profiles: {},
      currentUserId: null,

      async loginOnline(email, password) {
        const baseUrl = useDevice.getState().baseUrl;
        if (!baseUrl) throw new ApiError('Connect this phone to SACONE first', 0, 'NO_DEVICE');
        if (!isValidEmail(email)) throw new ApiError('Enter your ERP email address', 0, 'VALIDATION');
        if (!password) throw new ApiError('Enter your password', 0, 'VALIDATION');
        const res = await auth.login(baseUrl, email, password);
        if (!can(res.permissions, 'useTerminal')) {
          throw new ApiError('Your ERP role does not allow POS access (needs "POS Terminal – view").', 403, 'FORBIDDEN');
        }
        const prev = get().profiles[res.user.id];
        const profile: Profile = {
          userId: res.user.id,
          name: res.user.fullName,
          email: res.user.email,
          roleName: res.user.roleName,
          permissions: res.permissions,
          pinHash: prev?.pinHash ?? null,
          pinSalt: prev?.pinSalt ?? null,
          lastVerifiedAt: new Date().toISOString(),
          failedPins: 0,
        };
        set((s) => ({ profiles: { ...s.profiles, [profile.userId]: profile }, currentUserId: profile.userId }));
        return { needsPin: !profile.pinHash };
      },

      async setPin(pin) {
        const id = get().currentUserId;
        if (!id) throw new ApiError('Sign in first', 0, 'NO_SESSION');
        if (!isValidPin(pin)) throw new ApiError('Use 4–6 digits; avoid 1234 or repeated digits', 0, 'VALIDATION');
        const salt = Crypto.randomUUID();
        const pinHash = await hashPin(pin, salt);
        set((s) => ({ profiles: { ...s.profiles, [id]: { ...s.profiles[id], pinHash, pinSalt: salt, failedPins: 0 } } }));
      },

      async unlock(userId, pin) {
        const profile = get().profiles[userId];
        if (!profile?.pinHash || !profile.pinSalt) throw new ApiError('Sign in with your password first', 0, 'NO_PIN');
        if (profile.failedPins >= MAX_PIN_ATTEMPTS) {
          throw new ApiError('Too many wrong PINs — sign in with your ERP password', 0, 'PIN_LOCKED');
        }
        const hash = await hashPin(pin, profile.pinSalt);
        if (hash !== profile.pinHash) {
          const failedPins = profile.failedPins + 1;
          set((s) => ({ profiles: { ...s.profiles, [userId]: { ...profile, failedPins } } }));
          throw new ApiError(`Wrong PIN (${MAX_PIN_ATTEMPTS - failedPins} tries left)`, 0, 'BAD_PIN');
        }

        // Refresh RBAC from the ERP when reachable; deny deactivated users immediately.
        const cfg = deviceConfig();
        let fresh = profile;
        if (cfg) {
          try {
            const { staff } = await sync.staff(cfg, [userId]);
            const st = staff[0];
            if (st && (!st.exists || !st.isActive)) {
              get().forget(userId);
              throw new ApiError('This user is disabled in the ERP', 403, 'USER_INACTIVE');
            }
            if (st) {
              fresh = { ...profile, permissions: st.permissions, roleName: st.roleName ?? profile.roleName, name: st.fullName ?? profile.name, lastVerifiedAt: new Date().toISOString() };
            }
          } catch (e) {
            if (!(e instanceof ApiError) || !e.isNetwork) throw e;
          }
        }
        if (daysSince(fresh.lastVerifiedAt) > OFFLINE_GRACE_DAYS) {
          throw new ApiError(`Offline for more than ${OFFLINE_GRACE_DAYS} days — connect and sign in with your password`, 0, 'GRACE_EXPIRED');
        }
        if (!can(fresh.permissions, 'useTerminal')) {
          throw new ApiError('Your ERP role no longer allows POS access', 403, 'FORBIDDEN');
        }
        set((s) => ({ profiles: { ...s.profiles, [userId]: { ...fresh, failedPins: 0 } }, currentUserId: userId }));
      },

      applyStaffStatus(staff) {
        set((s) => {
          const profiles = { ...s.profiles };
          let currentUserId = s.currentUserId;
          for (const st of staff) {
            const p = profiles[st.id];
            if (!p) continue;
            if (!st.exists || !st.isActive) {
              delete profiles[st.id];
              if (currentUserId === st.id) currentUserId = null;
              continue;
            }
            profiles[st.id] = { ...p, permissions: st.permissions, roleName: st.roleName ?? p.roleName, name: st.fullName ?? p.name, lastVerifiedAt: new Date().toISOString() };
          }
          return { profiles, currentUserId };
        });
      },

      lock() {
        set({ currentUserId: null });
      },

      forget(userId) {
        set((s) => {
          const profiles = { ...s.profiles };
          delete profiles[userId];
          return { profiles, currentUserId: s.currentUserId === userId ? null : s.currentUserId };
        });
      },
    }),
    {
      name: 'sacpos.session',
      storage: jsonStorage,
      partialize: (s) => ({ profiles: s.profiles }),
    },
  ),
);

export function useCurrentUser(): Profile | null {
  return useSession((s) => (s.currentUserId ? s.profiles[s.currentUserId] ?? null : null));
}

export function useCan(capability: Capability): boolean {
  return useSession((s) => {
    const p = s.currentUserId ? s.profiles[s.currentUserId] : null;
    return can(p?.permissions, capability);
  });
}

export function currentUser(): Profile | null {
  const s = useSession.getState();
  return s.currentUserId ? s.profiles[s.currentUserId] ?? null : null;
}
