// Type shim for Metro's platform resolution. At bundle time Metro picks
// RichTextRenderer.native.tsx or RichTextRenderer.web.tsx; tsc uses this file.
export interface RichTextRendererProps {
  value: string;
  emptyLabel?: string;
}

export function RichTextRenderer(props: RichTextRendererProps): JSX.Element;
