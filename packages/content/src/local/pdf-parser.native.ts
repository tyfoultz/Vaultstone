// Native PDF text extraction — Phase 5c (iOS/Android) is not yet implemented.
//
// The plan: load `pdfjs-dist/legacy/build/pdf.mjs` on Hermes with small
// polyfills (base-64, text-encoding, DOMMatrix stub), read the file as a
// Uint8Array via expo-file-system, and run `getTextContent()` per page in a
// yielding loop. See docs/features/08-pdf-rulebook.md Phase 5c for details.
//
// Until then this module throws, and callers must feature-detect:
//   if (Platform.OS === 'web') { await extractPages(blob); }

import type { PageText } from '@vaultstone/types';

export type PageInput = Omit<PageText, 'sourceId'>;
export type ExtractOptions = {
  onProgress?: (done: number, total: number) => void;
};

export async function extractPages(
  _source: string,
  _options: ExtractOptions = {},
): Promise<PageInput[]> {
  throw new Error(
    'pdf-parser: native extraction not yet implemented (Phase 5c). ' +
      'Uploaded PDFs are viewable but not indexed until this lands.',
  );
}
