import * as Crypto from 'expo-crypto';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { ApiError } from '../api/client';
import { sync, type StaffStatus } from '../api/sacone';
import { can, type Capability } from '../domain/permissions';
import { deviceConfig } from './device';
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
  /** Salted hash of the ERP-set PIN, kept for offline unlock. */
  pinHash: string | null;
  pinSalt: string | null;
  /** When the ERP set that PIN; a different value from the ERP means sign in again. */
  pinSetAt?: string | null;
  lastVerifiedAt: string;   // last time the ERP confirmed this user is active
  failedPins: number;
}

interface SessionState {
  profiles: Record<string, Profile>;
  currentUserId: string | null; // never persisted → app always starts locked
  /** Sign in with Login ID or email + the PIN set in ERP → Users (needs a connection). */
  loginWithPin: (identifier: string, pin: string) => Promise<void>;
  unlock: (userId: string, pin: string) => Promise<void>;
  applyStaffStatus: (staff: StaffStatus[]) => void;
  lock: () => void;
  forget: (userId: string) => void;
  /** Drop every saved staff sign-in (the phone became another firm's terminal). */
  forgetAll: () => void;
  /** Check another user's PIN for an approval; returns their profile if they may approve. */
  verifyApprover: (userId: string, pin: string, capability: Capability) => Promise<Profile>;
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

      async loginWithPin(identifier, pin) {
        const cfg = deviceConfig();
        if (!cfg) throw new ApiError('Connect this phone to SACONE first', 0, 'NO_DEVICE');
        if (!identifier.trim()) throw new ApiError('Enter your Login ID or email', 0, 'VALIDATION');
        if (!/^\d{4,6}$/.test(pin)) throw new ApiError('Enter your 4–6 digit PIN', 0, 'VALIDATION');
        // The server checks the PIN (set in ERP → Users), this terminal's firm and POS access.
        const res = await sync.login(cfg, identifier, pin);
        if (!can(res.permissions, 'useTerminal')) {
          throw new ApiError('Your ERP role does not allow POS access (needs "POS Terminal – view").', 403, 'FORBIDDEN');
        }
        // Keep a salted hash on the phone so the same PIN unlocks offline (until the ERP changes it).
        const salt = Crypto.randomUUID();
        const profile: Profile = {
          userId: res.user.id,
          name: res.user.fullName,
          email: res.user.email,
          roleName: res.user.roleName,
          permissions: res.permissions,
          pinHash: await hashPin(pin, salt),
          pinSalt: salt,
          pinSetAt: res.pinSetAt ?? null,
          lastVerifiedAt: new Date().toISOString(),
          failedPins: 0,
        };
        set((s) => ({ profiles: { ...s.profiles, [profile.userId]: profile }, currentUserId: profile.userId }));
      },

      async unlock(userId, pin) {
        const profile = get().profiles[userId];
        if (!profile?.pinHash || !profile.pinSalt) throw new ApiError('Sign in with your Login ID and PIN first', 0, 'NO_PIN');
        if (profile.failedPins >= MAX_PIN_ATTEMPTS) {
          throw new ApiError('Too many wrong PINs on this phone — sign in again with your Login ID and PIN', 0, 'PIN_LOCKED');
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
            if (st && st.pinSetAt !== undefined && (st.pinSetAt ?? null) !== (profile.pinSetAt ?? null)) {
              set((s) => ({ profiles: { ...s.profiles, [userId]: { ...profile, pinHash: null, pinSalt: null } } }));
              throw new ApiError('Your PIN was changed in the ERP — sign in with your Login ID and new PIN', 0, 'PIN_CHANGED');
            }
            if (st) {
              fresh = { ...profile, permissions: st.permissions, roleName: st.roleName ?? profile.roleName, name: st.fullName ?? profile.name, lastVerifiedAt: new Date().toISOString() };
            }
          } catch (e) {
            if (!(e instanceof ApiError) || !e.isNetwork) throw e;
          }
        }
        if (daysSince(fresh.lastVerifiedAt) > OFFLINE_GRACE_DAYS) {
          throw new ApiError(`Offline for more than ${OFFLINE_GRACE_DAYS} days — connect and sign in with your Login ID and PIN`, 0, 'GRACE_EXPIRED');
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
            // A PIN changed or removed in the ERP stops the old one unlocking this phone.
            const pinChanged = st.pinSetAt !== undefined && (st.pinSetAt ?? null) !== (p.pinSetAt ?? null);
            profiles[st.id] = {
              ...p, permissions: st.permissions, roleName: st.roleName ?? p.roleName, name: st.fullName ?? p.name, lastVerifiedAt: new Date().toISOString(),
              ...(pinChanged ? { pinHash: null, pinSalt: null } : {}),
            };
          }
          return { profiles, currentUserId };
        });
      },

      forgetAll() {
        set({ profiles: {}, currentUserId: null });
      },

      lock() {
        set({ currentUserId: null });
      },

      async verifyApprover(userId, pin, capability) {
        const profile = get().profiles[userId];
        if (!profile?.pinHash || !profile.pinSalt) throw new ApiError('This approver has no PIN on this phone', 0, 'NO_PIN');
        if (profile.failedPins >= MAX_PIN_ATTEMPTS) {
          throw new ApiError(`Too many wrong PINs for ${profile.name}; they must sign in again with their Login ID and PIN`, 0, 'PIN_LOCKED');
        }
        const hash = await hashPin(pin, profile.pinSalt);
        if (hash !== profile.pinHash) {
          const failedPins = profile.failedPins + 1;
          set((s) => ({ profiles: { ...s.profiles, [userId]: { ...profile, failedPins } } }));
          throw new ApiError(`Wrong PIN (${MAX_PIN_ATTEMPTS - failedPins} tries left)`, 0, 'BAD_PIN');
        }
        if (daysSince(profile.lastVerifiedAt) > OFFLINE_GRACE_DAYS) {
          throw new ApiError(`${profile.name} has not been verified online for ${OFFLINE_GRACE_DAYS} days`, 0, 'GRACE_EXPIRED');
        }
        if (!can(profile.permissions, capability)) throw new ApiError(`${profile.name} is not allowed to approve this`, 403, 'FORBIDDEN');
        set((s) => ({ profiles: { ...s.profiles, [userId]: { ...profile, failedPins: 0 } } }));
        return profile;
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
