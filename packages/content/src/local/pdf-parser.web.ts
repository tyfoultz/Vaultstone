// Web PDF text extraction via pdfjs-dist.
//
// `extractPages(blob)` opens the document, extracts text from every page, and
// returns page records ready to feed `indexSource`. Text never leaves the
// browser — pdfjs parses in a worker we ship ourselves at
// `/pdf.worker.min.mjs` (copied there by scripts/copy-pdf-worker.js).

import type { PageText } from '@vaultstone/types';

export type PageInput = Omit<PageText, 'sourceId'>;

export type ExtractOptions = {
  onProgress?: (done: number, total: number) => void;
};

// pdfjs-dist is ~1MB. Load it the first time a user actually parses a file
// so the initial page payload stays small.
//
// We import the `legacy` build, not the modern one. Metro/Babel (via Expo
// Web) can't parse the modern build's static private class fields
// (`static #field`) without extra plugins; the legacy build is ES5-safe
// and bundles cleanly without touching the shared babel config.
let _pdfjsPromise: Promise<typeof import('pdfjs-dist')> | null = null;

async function loadPdfjs() {
  if (!_pdfjsPromise) {
    _pdfjsPromise = (async () => {
      const pdfjs = (await import('pdfjs-dist/legacy/build/pdf.mjs')) as typeof import('pdfjs-dist');
      // Worker lives at the site root — see scripts/copy-pdf-worker.js.
      pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
      return pdfjs;
    })();
  }
  return _pdfjsPromise;
}

export async function extractPages(
  source: Blob | ArrayBuffer | Uint8Array,
  options: ExtractOptions = {},
): Promise<PageInput[]> {
  const pdfjs = await loadPdfjs();
  const data = await toUint8Array(source);

  const loadingTask = pdfjs.getDocument({ data, isEvalSupported: false });
  const pdf = await loadingTask.promise;
  const pages: PageInput[] = [];

  try {
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      const text = joinTextItems(content.items);
      pages.push({ pageNumber: i, text });
      options.onProgress?.(i, pdf.numPages);
      // Release page resources as we go.
      page.cleanup();
    }
  } finally {
    await pdf.destroy().catch(() => {});
  }

  return pages;
}

async function toUint8Array(source: Blob | ArrayBuffer | Uint8Array): Promise<Uint8Array> {
  if (source instanceof Uint8Array) return source;
  if (source instanceof ArrayBuffer) return new Uint8Array(source);
  return new Uint8Array(await source.arrayBuffer());
}

// Stitch pdfjs text items into readable text. Items come in reading order;
// we insert a newline when the y-coordinate jumps (new line/paragraph) and
// a space between items on the same line.
type TextItemLike = {
  str?: string;
  transform?: number[];
  hasEOL?: boolean;
};

function joinTextItems(items: readonly unknown[]): string {
  let out = '';
  let lastY: number | null = null;
  for (const raw of items) {
    const item = raw as TextItemLike;
    const str = (item.str ?? '').replace(/\s+/g, ' ');
    if (!str) {
      if (item.hasEOL && out && !out.endsWith('\n')) out += '\n';
      continue;
    }
    const y = Array.isArray(item.transform) ? (item.transform[5] as number) : undefined;
    if (lastY !== null && y !== undefined && Math.abs(y - lastY) > 2) {
      if (!out.endsWith('\n')) out += '\n';
    } else if (out && !out.endsWith(' ') && !out.endsWith('\n')) {
      out += ' ';
    }
    out += str;
    if (y !== undefined) lastY = y;
    if (item.hasEOL && !out.endsWith('\n')) out += '\n';
  }
  return out.trim();
}
