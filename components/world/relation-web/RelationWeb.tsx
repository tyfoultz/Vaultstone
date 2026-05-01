import { StyleSheet, View } from 'react-native';
import { Icon, Text, colors, spacing } from '@vaultstone/ui';

import type { EdgeSource, GraphNode, RelationEdge } from './constants';

type Props = {
  nodes?: GraphNode[];
  edges?: RelationEdge[];
  nodeById?: Map<string, GraphNode>;
  visibleKinds?: Set<string>;
  visibleEdgeSources?: Set<EdgeSource>;
  selectedNodeId?: string | null;
  onSelectNode?: (nodeId: string | null) => void;
  onDoubleClickNode?: (nodeId: string) => void;
  containerWidth?: number;
  containerHeight?: number;
};

export function RelationWeb(_props: Props) {
  return (
    <View style={styles.container}>
      <Icon name="hub" size={48} color={colors.outlineVariant} />
      <Text
        variant="title-md"
        family="serif-display"
        style={{ color: colors.onSurfaceVariant, marginTop: spacing.md }}
      >
        Relationship Web
      </Text>
      <Text variant="body-sm" style={{ color: colors.outline, marginTop: spacing.xs, textAlign: 'center' }}>
        Available on the web version of Vaultstone
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceCanvas,
    padding: spacing.xl,
  },
});
