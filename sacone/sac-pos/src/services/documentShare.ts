import * as Clipboard from 'expo-clipboard';
import { Directory, File, Paths } from 'expo-file-system';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Platform, Share } from 'react-native';
import { NativeDocumentShare } from '../../modules/document-share';
import { isExpiredShareFile } from '../domain/share';

/**
 * DocumentShareService: turns an already-rendered document into a temporary PDF in
 * app-private cache and hands it to the OS share sheet. The user picks the app
 * (WhatsApp, Gmail, Quick Share, AirDrop, Files …) and the recipient, and sends it themselves.
 *
 * Android: our SacDocumentShare module (modules/document-share) sends ACTION_SEND through the
 * Sharesheet with a FileProvider content:// URI limited to cache/shared-documents/; only the app the
 * user picks gets temporary read access, and the caption goes in EXTRA_TEXT. Builds without the
 * module (Expo Go) fall back to expo-sharing, which can't carry a caption (it goes to the clipboard).
 * iOS: UIActivityViewController (React Native Share when a caption is attached, expo-sharing otherwise).
 * Knows nothing about sales, GST, auth or sync.
 */

export interface PdfPage {
  width: number;
  height: number;
  margins?: Print.PageMargins;
}

export interface ShareOptions {
  /** Short caption. Must not contain customer data, links or tokens. */
  message?: string;
  title?: string;
}

export interface ShareResult {
  /** Fallback path only: the caption couldn't ride with the file, so it was put on the clipboard. */
  messageCopied: boolean;
}

const shareDir = () => new Directory(Paths.cache, 'shared-documents');

/** Delete shared PDFs older than the TTL (or every one when `all`). Never throws. */
export function sweepSharedDocuments(all = false): number {
  if (Platform.OS === 'web') return 0;
  let removed = 0;
  try {
    const dir = shareDir();
    if (!dir.exists) return 0;
    for (const entry of dir.list()) {
      if (entry instanceof File && !all && !isExpiredShareFile(entry.modificationTime)) continue;
      entry.delete();
      removed += 1;
    }
  } catch {
    // Cache cleanup is best-effort; the OS also clears app cache under storage pressure.
  }
  return removed;
}

/** Render HTML to a PDF named `fileName` inside app-private cache. Returns its file:// URI. */
export async function createPdf(html: string, page: PdfPage, fileName: string): Promise<string> {
  sweepSharedDocuments();
  // Take the PDF bytes from expo-print and write them into our own folder. Moving the printed
  // file instead fails in Expo Go: it lands outside the app's scoped folders ("Missing READ
  // permission"). Writing needs access to our cache folder only, in Expo Go and in the APK.
  const { uri, base64 } = await Print.printToFileAsync({ html, ...page, base64: true });
  if (!base64) throw new Error('Could not create the PDF. Try again.');
  const dir = shareDir();
  dir.create({ idempotent: true, intermediates: true });
  const pdf = new File(dir, fileName);
  if (pdf.exists) pdf.delete();
  pdf.create();
  pdf.write(base64, { encoding: 'base64' });
  try {
    new File(uri).delete();
  } catch {
    // Outside our folders in Expo Go; the OS clears its print cache.
  }
  return pdf.uri;
}

/** Open the native share sheet for a local PDF. */
export async function sharePdf(fileUri: string, { message, title }: ShareOptions = {}): Promise<ShareResult> {
  if (!fileUri.startsWith(shareDir().uri)) throw new Error('Only documents prepared for sharing can be shared');

  if (Platform.OS === 'android' && NativeDocumentShare) {
    await NativeDocumentShare.sharePdfAsync(fileUri, title ?? null, message ?? null);
    return { messageCopied: false };
  }
  if (Platform.OS === 'ios' && message) {
    await Share.share({ url: fileUri, message, title }, { subject: title });
    return { messageCopied: false };
  }
  if (!(await Sharing.isAvailableAsync())) throw new Error('Sharing is not available on this device');

  let messageCopied = false;
  if (Platform.OS === 'android' && message) {
    messageCopied = await Clipboard.setStringAsync(message).catch(() => false);
  }
  await Sharing.shareAsync(fileUri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf', dialogTitle: title });
  return { messageCopied };
}

/** Render + share in one step. On web (no local files) this falls back to the browser print / Save as PDF dialog. */
export async function shareDocument(
  html: string, page: PdfPage, fileName: string, options: ShareOptions = {},
): Promise<ShareResult> {
  if (Platform.OS === 'web') {
    await Print.printAsync({ html });
    return { messageCopied: false };
  }
  return sharePdf(await createPdf(html, page, fileName), options);
}

export const DocumentShareService = { createPdf, sharePdf, shareDocument, sweepSharedDocuments };
