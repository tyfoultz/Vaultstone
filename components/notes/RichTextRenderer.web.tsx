import { Text, View, StyleSheet } from 'react-native';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { colors, spacing } from '@vaultstone/ui';

export interface RichTextRendererProps {
  value: string;
  emptyLabel?: string;
}

// React Native Web ships CSS for styling, so we lean on a scoped stylesheet
// declared inline rather than building React Native style objects. Markdown's
// output is plain HTML so anything CSS understands works.
const STYLE_TAG = `
.vaultstone-md { color: ${colors.textPrimary}; font-size: 14px; line-height: 20px; }
.vaultstone-md h1 { font-size: 20px; font-weight: 700; margin: 8px 0 4px; }
.vaultstone-md h2 { font-size: 17px; font-weight: 700; margin: 8px 0 4px; }
.vaultstone-md h3 { font-size: 15px; font-weight: 700; margin: 6px 0 2px; }
.vaultstone-md strong { font-weight: 700; }
.vaultstone-md em { font-style: italic; }
.vaultstone-md ul, .vaultstone-md ol { margin: 4px 0; padding-left: 20px; }
.vaultstone-md li { margin: 2px 0; }
.vaultstone-md blockquote {
  background: ${colors.surface};
  border-left: 3px solid ${colors.brand};
  padding: 4px 8px; margin: 4px 0;
}
.vaultstone-md code {
  background: ${colors.surface};
  padding: 0 4px; border-radius: 4px;
}
.vaultstone-md hr { border: 0; border-top: 1px solid ${colors.border}; margin: ${spacing.sm}px 0; }
.vaultstone-md a { color: ${colors.brand}; }
`;

export function RichTextRenderer({ value, emptyLabel = '(empty)' }: RichTextRendererProps) {
  const trimmed = value?.trim() ?? '';
  if (trimmed.length === 0) {
    return (
      <View>
        <Text style={styles.empty}>{emptyLabel}</Text>
      </View>
    );
  }
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: STYLE_TAG }} />
      <div className="vaultstone-md">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{value}</ReactMarkdown>
      </div>
    </>
  );
}

const styles = StyleSheet.create({
  empty: { fontStyle: 'italic', color: colors.textSecondary, fontSize: 13 },
});
