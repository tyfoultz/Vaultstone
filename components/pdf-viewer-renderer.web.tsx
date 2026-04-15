// Web PDF rendering — uses an <iframe> pointed at the blob URL we built when
// the source was loaded. The browser's native PDF viewer handles paging.
//
// `react-native-pdf` is intentionally NOT imported here — its fabric component
// pulls native-only RN modules and breaks Metro's web bundler.

import type { PdfRendererProps } from './pdf-viewer-renderer-types';

export function PdfRenderer({ uri, fileName, page }: PdfRendererProps) {
  // `#page=N` is the standard PDF.js / Chromium PDF-viewer open-parameter.
  const src = page ? `${uri}#page=${page}` : uri;
  return (
    <iframe
      src={src}
      style={{ flex: 1, border: 'none', width: '100%', height: '100%' }}
      title={fileName}
    />
  );
}
