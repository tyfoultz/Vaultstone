// Type-only shim. Metro resolves `./pdf-viewer-renderer` to the .web.tsx or
// .native.tsx variant at bundle time; tsc uses this file for typechecking.
import type { PdfRendererProps } from './pdf-viewer-renderer-types';

export type { PdfRendererProps };

export function PdfRenderer(props: PdfRendererProps): JSX.Element;
