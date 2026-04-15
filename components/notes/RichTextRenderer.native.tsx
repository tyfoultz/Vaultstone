import { Text, StyleSheet, View } from 'react-native';
import Markdown from 'react-native-markdown-display';
import { colors, spacing } from '@vaultstone/ui';

export interface RichTextRendererProps {
  value: string;
  emptyLabel?: string;
}

// Token-aligned Markdown styles so the renderer inherits the app's dark palette
// instead of the library default (black text on white).
const markdownStyles = StyleSheet.create({
  body: { color: colors.textPrimary, fontSize: 14, lineHeight: 20 },
  heading1: { color: colors.textPrimary, fontSize: 20, fontWeight: '700', marginTop: spacing.sm, marginBottom: 4 },
  heading2: { color: colors.textPrimary, fontSize: 17, fontWeight: '700', marginTop: spacing.sm, marginBottom: 4 },
  heading3: { color: colors.textPrimary, fontSize: 15, fontWeight: '700', marginTop: 6, marginBottom: 2 },
  strong: { fontWeight: '700', color: colors.textPrimary },
  em: { fontStyle: 'italic', color: colors.textPrimary },
  bullet_list: { marginVertical: 4 },
  ordered_list: { marginVertical: 4 },
  list_item: { color: colors.textPrimary, marginVertical: 2 },
  blockquote: {
    backgroundColor: colors.surface,
    borderLeftColor: colors.brand,
    borderLeftWidth: 3,
    paddingLeft: spacing.sm,
    paddingVertical: 4,
    marginVertical: 4,
  },
  code_inline: {
    backgroundColor: colors.surface,
    color: colors.textPrimary,
    paddingHorizontal: 4,
    borderRadius: 4,
  },
  hr: { backgroundColor: colors.border, height: 1, marginVertical: spacing.sm },
  link: { color: colors.brand },
});

export function RichTextRenderer({ value, emptyLabel = '(empty)' }: RichTextRendererProps) {
  const trimmed = value?.trim() ?? '';
  if (trimmed.length === 0) {
    return (
      <View>
        <Text style={styles.empty}>{emptyLabel}</Text>
      </View>
    );
  }
  return <Markdown style={markdownStyles}>{value}</Markdown>;
}

const styles = StyleSheet.create({
  empty: { fontStyle: 'italic', color: colors.textSecondary, fontSize: 13 },
});
