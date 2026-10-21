import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { jsonStorage } from './persist';

/**
 * The firm's signature and stamp images (ERP → Settings → Signature & stamp), cached on the phone
 * so printed bills carry them offline. Re-downloaded only when the ERP reports a new version.
 */
interface SignStampState {
  version: string | null;
  sign: string | null;
  stamp: string | null;
  set: (version: string | null, sign: string | null, stamp: string | null) => void;
}

export const useSignStamp = create<SignStampState>()(
  persist(
    (set) => ({
      version: null,
      sign: null,
      stamp: null,
      set: (version, sign, stamp) => set({ version, sign, stamp }),
    }),
    { name: 'sacpos.signStamp', storage: jsonStorage },
  ),
);

const isImage = (v: string | null) => Boolean(v && /^data:image\/(png|jpeg|webp);base64,/.test(v));

/** Cached images to print, or nulls when printing is switched off in the ERP. */
export function signStampImages(print?: boolean): { sign: string | null; stamp: string | null } {
  if (print === false) return { sign: null, stamp: null };
  const { sign, stamp } = useSignStamp.getState();
  return { sign: isImage(sign) ? sign : null, stamp: isImage(stamp) ? stamp : null };
}
