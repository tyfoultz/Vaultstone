// Shared prop shape for the platform-specific PDF renderers. Metro resolves
// `./pdf-viewer-renderer` to either `.web.tsx` or `.native.tsx`; tsc uses the
// .d.ts shim alongside this file.

export type PdfRendererProps = {
  uri: string;
  fileName: string;
  page?: number;
  onError?: (err: unknown) => void;
};
