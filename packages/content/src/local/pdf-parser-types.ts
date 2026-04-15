// Shared types for pdf-parser.{web,native}.ts.
//
// Source shape differs per platform — web takes raw bytes (Blob/ArrayBuffer/
// Uint8Array), native takes a file URI string and reads the bytes itself
// via expo-file-system. Output (`PageInput[]`) is identical so the indexer
// stays platform-agnostic.

import type { PageText } from '@vaultstone/types';

export type PageInput = Omit<PageText, 'sourceId'>;

export type ExtractOptions = {
  onProgress?: (done: number, total: number) => void;
};

export type PdfSource = Blob | ArrayBuffer | Uint8Array | string;
