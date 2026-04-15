// Native PDF text extraction (iOS + Android) via pdfjs-dist's legacy build.
//
// Hermes has no Web Workers and no `import.meta`, so we run pdfjs in
// fake-worker mode (`disableWorker: true`) on the JS thread and yield to
// the runtime between pages so the UI doesn't lock up. Bytes are read off
// the local filesystem via expo-file-system (base64) — `fetch('file://...')`
// is unreliable on Android with content:// URIs.
//
// PDF text never leaves the device (legal constraint, see docs/legal.md).

import './pdf-parser.polyfills.native';

import * as FileSystem from 'expo-file-system';
import { decode as base64Decode } from 'base-64';
// pdfjs ships an ESM-only `.mjs`; the legacy build avoids modern syntax that
// Hermes can't handle. Metro is configured (metro.config.js) to prefer the
// `react-native`/`require` conditions, but the legacy build is plain enough
// to be transformed even when resolved as ESM.
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore — no published types for the legacy subpath
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';

import type { PageInput, ExtractOptions } from './pdf-parser-types';
import { joinTextItems } from './pdf-text-join';

export type { PageInput, ExtractOptions };

// Disable workers globally — Hermes has no Worker. pdfjs auto-falls back
// to its fake worker (main-thread execution) when no workerSrc is set and
// no Worker global is present (which we deliberately don't shim).
if (pdfjs.GlobalWorkerOptions) {
  pdfjs.GlobalWorkerOptions.workerSrc = '';
}

export async function extractPages(
  uri: string,
  options: ExtractOptions = {},
): Promise<PageInput[]> {
  const data = await readFileAsBytes(uri);

  const loadingTask = pdfjs.getDocument({
    data,
    isEvalSupported: false,
    useSystemFonts: false,
    disableFontFace: true,
  });
  const pdf = await loadingTask.promise;
  const pages: PageInput[] = [];

  try {
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      const text = joinTextItems(content.items);
      pages.push({ pageNumber: i, text });
      options.onProgress?.(i, pdf.numPages);
      page.cleanup();
      // Yield to the JS runtime between pages so the UI thread can paint
      // and the indexer's status writes can flush.
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  } finally {
    await pdf.destroy().catch(() => {});
  }

  return pages;
}

async function readFileAsBytes(uri: string): Promise<Uint8Array> {
  const base64 = await FileSystem.readAsStringAsync(uri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  const binary = base64Decode(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}
