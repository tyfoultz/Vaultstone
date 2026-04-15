// Web PDF text extraction via pdfjs-dist.
//
// `extractPages(blob)` opens the document, extracts text from every page, and
// returns page records ready to feed `indexSource`. Text never leaves the
// browser — pdfjs parses in a worker we ship ourselves at
// `/pdf.worker.min.mjs` (copied there by scripts/copy-pdf-worker.js).

import type { PageInput, ExtractOptions } from './pdf-parser-types';
import { joinTextItems } from './pdf-text-join';

export type { PageInput, ExtractOptions };

// Load pdfjs via the browser's **native** dynamic `import()`, not Metro's.
//
// Why: Metro emits a classic-script bundle, so any `import.meta.*` inside a
// bundled dependency becomes a syntax error. pdfjs-dist uses `import.meta.url`
// internally, which means we can't let Metro transform it. Instead we self-host
// pdfjs at /pdf.min.mjs (copied by scripts/copy-pdf-worker.js) and load it
// with the browser's dynamic import at runtime.
//
// The `new Function('u', 'return import(u)')` trick hides the `import()` from
// Metro's static analysis so it doesn't try to resolve/bundle the path.
let _pdfjsPromise: Promise<typeof import('pdfjs-dist')> | null = null;

async function loadPdfjs() {
  if (!_pdfjsPromise) {
    _pdfjsPromise = (async () => {
      const dynamicImport = new Function(
        'url',
        'return import(url)',
      ) as (url: string) => Promise<typeof import('pdfjs-dist')>;
      const pdfjs = await dynamicImport('/pdf.min.mjs');
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

