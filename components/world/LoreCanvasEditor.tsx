import { StyleSheet, View } from 'react-native';
import { Icon, Text, colors, spacing } from '@vaultstone/ui';

type CanvasBlock = {
  id: string;
  x: number;
  y: number;
  width: number;
  height?: number;
  html: string;
};

type MentionablePage = {
  id: string;
  title: string;
  page_kind: string;
  section_id: string;
};

type Props = {
  initialBlocks: CanvasBlock[] | null;
  onChange: (blocks: CanvasBlock[], plainText: string, bodyRefs: string[]) => void;
  editable?: boolean;
  minHeight?: number;
  mentionablePages?: MentionablePage[];
  getSectionLabel?: (sectionId: string) => string;
  onMentionClick?: (pageId: string) => void;
};

// Native stub — Phase 7 fills in the full view + drag canvas.
export function LoreCanvasEditor({ initialBlocks }: Props) {
  const count = initialBlocks?.length ?? 0;

  return (
    <View style={styles.root}>
      <Icon name="dashboard" size={32} color={colors.outlineVariant} />
      <Text variant="body-md" style={{ color: colors.onSurfaceVariant, textAlign: 'center', marginTop: spacing.sm }}>
        Canvas editor{count > 0 ? ` (${count} block${count !== 1 ? 's' : ''})` : ''}
      </Text>
      <Text variant="body-sm" style={{ color: colors.outlineVariant, textAlign: 'center', marginTop: spacing.xs }}>
        Open on web for full editing
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    minHeight: 200,
  },
});
