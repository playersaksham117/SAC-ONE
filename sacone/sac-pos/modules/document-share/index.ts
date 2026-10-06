import { requireOptionalNativeModule } from 'expo';

interface SacDocumentShareModule {
  /** Android Sharesheet for a PDF in cache/shared-documents/; read access goes only to the chosen app. */
  sharePdfAsync(fileUri: string, title: string | null, message: string | null): Promise<void>;
}

/** null in Expo Go, on web and on iOS: callers fall back to expo-sharing / React Native Share. */
export const NativeDocumentShare = requireOptionalNativeModule<SacDocumentShareModule>('SacDocumentShare');
