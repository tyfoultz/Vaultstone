// Native PDF rendering — react-native-pdf wraps a platform-native viewer
// (PDFKit on iOS, AndroidPdfViewer on Android). Metro resolves this file
// only on iOS/Android builds, so the import is safe to be static here.

import { StyleSheet } from 'react-native';
import Pdf from 'react-native-pdf';
import { colors } from '@vaultstone/ui';

import type { PdfRendererProps } from './pdf-viewer-renderer-types';

export function PdfRenderer({ uri, page, onError }: PdfRendererProps) {
  return (
    <Pdf
      source={{ uri }}
      style={s.pdf}
      page={page}
      onError={(err) => onError?.(err)}
    />
  );
}

const s = StyleSheet.create({
  pdf: { flex: 1, width: '100%', backgroundColor: colors.background },
});
