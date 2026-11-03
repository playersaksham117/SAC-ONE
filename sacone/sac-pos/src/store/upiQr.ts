import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { jsonStorage } from './persist';

/**
 * The firm's uploaded UPI QR image (from SACONE ERP), cached on the phone so receipts and the
 * scan-to-pay screen work offline. Re-downloaded only when the ERP reports a new version.
 */
interface UpiQrState {
  version: string | null;
  image: string | null;
  set: (version: string | null, image: string | null) => void;
  quickVersion: string | null;
  quickImage: string | null;
  setQuick: (version: string | null, image: string | null) => void;
}

export const useUpiQr = create<UpiQrState>()(
  persist(
    (set) => ({
      version: null,
      image: null,
      quickVersion: null,
      quickImage: null,
      set: (version, image) => set({ version, image }),
      setQuick: (quickVersion, quickImage) => set({ quickVersion, quickImage }),
    }),
    { name: 'sacpos.upiQr', storage: jsonStorage },
  ),
);

/** The cached image when the ERP says to show the uploaded QR, else null (use the generated QR). */
export function uploadedQr(source?: string | null, slot?: 'quick'): string | null {
  if (source !== 'uploaded') return null;
  const image = slot === 'quick' ? useUpiQr.getState().quickImage : useUpiQr.getState().image;
  return image && /^data:image\/(png|jpeg|webp);base64,/.test(image) ? image : null;
}
