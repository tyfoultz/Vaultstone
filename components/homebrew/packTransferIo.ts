// Cross-platform file IO for pack-transfer JSON files.
//
// Web: trigger a browser download via a hidden anchor.
// Native: write to the cache dir, then surface the file URI for the
//         caller to share via the OS share sheet (or surface to the
//         user manually). The native path falls back to logging the
//         URI when the share API is unavailable so the dev workflow
//         still works on bare RN.

import { Platform } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';

/**
 * Save a JSON pack-export to disk under `fileName`. On web, this opens
 * the browser's "save as" prompt via a hidden anchor; on native, this
 * writes to the cache dir and returns the file URI so the caller can
 * pass it to the OS share sheet.
 */
export async function downloadPackJson(args: {
  fileName: string;
  payload: unknown;
}): Promise<{ ok: true; uri?: string } | { ok: false; message: string }> {
  const { fileName, payload } = args;
  let serialized: string;
  try {
    serialized = JSON.stringify(payload, null, 2);
  } catch (err) {
    return {
      ok: false,
      message: `Failed to serialize pack: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  if (Platform.OS === 'web') {
    // Hidden-anchor download — works in every modern browser without
    // needing the experimental File System Access API. The blob URL
    // is revoked after a tick so it doesn't leak in long sessions.
    try {
      const blob = new Blob([serialized], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = sanitizeFileName(fileName);
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      return { ok: true };
    } catch (err) {
      return {
        ok: false,
        message: `Browser download failed: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  // Native: write to cache dir. Caller can choose to expose the URI via
  // a share sheet (we don't depend on expo-sharing here so consumers
  // pick their own UX — the dev path can simply alert the URI).
  try {
    const dir = FileSystem.cacheDirectory;
    if (!dir) return { ok: false, message: 'No cache directory available on this device.' };
    const safeName = sanitizeFileName(fileName);
    const uri = `${dir}${safeName}`;
    await FileSystem.writeAsStringAsync(uri, serialized, {
      encoding: FileSystem.EncodingType.UTF8,
    });
    return { ok: true, uri };
  } catch (err) {
    return {
      ok: false,
      message: `Failed to write file: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

/**
 * Open the OS file picker for a JSON file and read+parse it. Mirrors
 * `pickContentJson` but exists in this module so pack-transfer code
 * doesn't pull a dependency on the imported-content modal.
 */
export async function pickPackJson(): Promise<{
  fileName: string;
  payload: unknown;
} | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: 'application/json',
    copyToCacheDirectory: true,
  });
  if (result.canceled || !result.assets?.[0]) return null;
  const asset = result.assets[0];

  let text: string;
  if (Platform.OS === 'web') {
    const file = (asset as unknown as { file?: File }).file;
    if (!file) throw new Error('Picked file is not readable on this platform');
    text = await file.text();
  } else {
    text = await FileSystem.readAsStringAsync(asset.uri);
  }

  let payload: unknown;
  try {
    payload = JSON.parse(text);
  } catch (err) {
    throw new Error(
      `Selected file is not valid JSON: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  return { fileName: asset.name, payload };
}

/** Strip path separators and other illegal filename chars so the
 *  picker prompt shows a clean filename. Whitespace collapses to
 *  underscores so OSes that round-trip filenames don't mangle them. */
function sanitizeFileName(name: string): string {
  return name
    .replace(/[/\\?%*:|"<>]/g, '-')
    .replace(/\s+/g, '_')
    .slice(0, 200);
}
