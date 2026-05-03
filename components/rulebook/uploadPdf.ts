// Shared PDF-upload helpers. Extracted so both the legacy campaign-side
// rulebook screen (app/campaign/[id]/rulebook.tsx) and the new Game-Systems-
// side rulebook surface can reuse the same DocumentPicker + ToS gate +
// FileSystem persistence flow.
//
// The campaign_id parameter on saveUploadedPdf is a Phase A artifact: storage
// is still campaign-keyed (see packages/content/src/local/db.*), so even the
// system-scoped upload path needs to attach to *some* campaign for now. The
// caller in the Game Systems surface picks one from the user's campaigns on
// that system. Phase C re-keys storage on (user_id, system_id, source_key)
// and this parameter goes away.

import { Platform, Alert } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import { saveSource, type LocalSource } from '@vaultstone/content';

export type PendingFile = {
  uri: string;
  name: string;
  mimeType?: string;
};

function uuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

/** Open the OS file picker for a PDF. Returns null if the user cancelled. */
export async function pickPdf(): Promise<PendingFile | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: 'application/pdf',
    copyToCacheDirectory: false,
    ...(Platform.OS === 'web' ? { base64: false } : {}),
  } as Parameters<typeof DocumentPicker.getDocumentAsync>[0]);

  if (result.canceled || !result.assets?.[0]) return null;
  const asset = result.assets[0];

  let uri = asset.uri;
  if (Platform.OS === 'web') {
    const file = (asset as unknown as { file?: File }).file;
    if (!file) return null;
    uri = URL.createObjectURL(file);
  }

  return { uri, name: asset.name, mimeType: asset.mimeType ?? 'application/pdf' };
}

/**
 * Persist a picked PDF to disk (native) or IndexedDB (web) and write its
 * `LocalSource` row. Caller is responsible for the ToS acknowledgment
 * gate before invoking this.
 */
export async function saveUploadedPdf(args: {
  pending: PendingFile;
  campaignId: string;
  sourceKey: string;
}): Promise<LocalSource> {
  const { pending, campaignId, sourceKey } = args;

  let record: LocalSource;

  if (Platform.OS === 'web') {
    record = {
      id: uuid(),
      campaign_id: campaignId,
      source_key: sourceKey,
      file_name: pending.name,
      file_path: pending.uri,
      uploaded_at: new Date().toISOString(),
    };
  } else {
    const destDir = `${FileSystem.documentDirectory}vaultstone/sources/${campaignId}/`;
    await FileSystem.makeDirectoryAsync(destDir, { intermediates: true });
    const safeName = pending.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const destPath = `${destDir}${Date.now()}_${safeName}`;
    await FileSystem.copyAsync({ from: pending.uri, to: destPath });
    record = {
      id: uuid(),
      campaign_id: campaignId,
      source_key: sourceKey,
      file_name: pending.name,
      file_path: destPath,
      uploaded_at: new Date().toISOString(),
    };
  }

  await saveSource(record);
  return record;
}

/** Standard upload-failure alert. Centralised so messaging stays consistent. */
export function alertUploadFailed(err: unknown): void {
  Alert.alert(
    'Upload failed',
    'Could not save your PDF. Please try again.\n\n' +
      (err instanceof Error ? err.message : String(err)),
  );
}
