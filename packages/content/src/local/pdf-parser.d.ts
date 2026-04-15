// Type-only shim. Metro resolves `./pdf-parser` to `pdf-parser.native.ts`
// or `pdf-parser.web.ts` at bundle time; tsc uses this file. The signature
// here is the union of both platforms' inputs (web: bytes, native: URI
// string) so callers like `indexer.ts` can pass either through.
import type { PageInput, ExtractOptions, PdfSource } from './pdf-parser-types';

export type { PageInput, ExtractOptions, PdfSource };

export function extractPages(
  source: PdfSource,
  options?: ExtractOptions,
): Promise<PageInput[]>;
