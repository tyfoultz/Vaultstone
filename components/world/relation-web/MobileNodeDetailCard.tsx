import { Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Icon, Text, colors, spacing } from '@vaultstone/ui';

import { KIND_COLOR, KIND_LABEL, type GraphNode, type RelationEdge } from './constants';
import { worldPageHref } from '../worldHref';

type Props = {
  node: GraphNode;
  worldId: string;
  connectionCount: number;
  onDismiss: () => void;
};

export function MobileNodeDetailCard({ node, worldId, connectionCount, onDismiss }: Props) {
  const router = useRouter();
  const color = KIND_COLOR[node.pageKind] ?? colors.onSurfaceVariant;
  const kindLabel = KIND_LABEL[node.pageKind] ?? 'Page';

  return (
    <View style={styles.root}>
      <Pressable style={styles.card} onPress={() => {}}>
        <View style={styles.row}>
          <View style={[styles.iconTile, { backgroundColor: color + '22', borderColor: color + '44' }]}>
            <Icon name={node.iconName as React.ComponentProps<typeof Icon>['name']} size={20} color={color} />
          </View>
          <View style={styles.info}>
            <Text variant="title-sm" weight="bold" style={{ color: colors.onSurface }} numberOfLines={1}>
              {node.title}
            </Text>
            <Text variant="label-sm" style={{ color: colors.onSurfaceVariant }}>
              {kindLabel.toUpperCase()} · {connectionCount} connection{connectionCount !== 1 ? 's' : ''}
            </Text>
          </View>
          <Pressable
            style={styles.navBtn}
            onPress={() => {
              onDismiss();
              router.push(worldPageHref(worldId, node.id));
            }}
          >
            <Icon name="arrow-forward" size={20} color={colors.primary} />
          </Pressable>
        </View>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    position: 'absolute',
    bottom: spacing.md,
    left: spacing.md,
    right: spacing.md,
  },
  card: {
    backgroundColor: colors.surfaceContainerHigh,
    borderRadius: 16,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.outlineVariant + '33',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  iconTile: {
    width: 40,
    height: 40,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  info: {
    flex: 1,
    gap: 2,
  },
  navBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primaryContainer + '44',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
