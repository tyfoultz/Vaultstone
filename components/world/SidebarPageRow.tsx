import { Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Icon, Text, colors, radius, spacing } from '@vaultstone/ui';
import type { WorldPageTreeNode } from '@vaultstone/types';

import { worldPageHref } from './worldHref';

type Props = {
  node: WorldPageTreeNode;
  worldId: string;
  activePageId?: string | null;
};

const MATERIAL_ICON: Record<string, string> = {
  custom: 'article',
  location: 'place',
  npc: 'person',
  faction: 'shield',
  religion: 'auto-awesome',
  organization: 'groups',
  item: 'diamond',
  lore: 'auto-stories',
  timeline: 'timeline',
  pc_stub: 'person-outline',
  player_character: 'person',
};

export function SidebarPageRow({ node, worldId, activePageId }: Props) {
  const router = useRouter();
  const icon = MATERIAL_ICON[node.page.page_kind] ?? 'article';
  const active = activePageId === node.page.id;
  const indent = node.depth * 12;

  return (
    <View>
      <Pressable
        onPress={() => router.push(worldPageHref(worldId, node.page.id))}
        style={({ pressed }) => [
          styles.row,
          { paddingLeft: spacing.sm + indent },
          (pressed || active) && { backgroundColor: colors.surfaceContainerHigh },
        ]}
      >
        <Icon
          name={icon as React.ComponentProps<typeof Icon>['name']}
          size={14}
          color={active ? colors.primary : colors.onSurfaceVariant}
        />
        <Text
          variant="body-sm"
          numberOfLines={1}
          style={{
            flex: 1,
            color: active ? colors.onSurface : colors.onSurfaceVariant,
          }}
        >
          {node.page.title}
        </Text>
      </Pressable>
      {node.children.map((child) => (
        <SidebarPageRow
          key={child.page.id}
          node={child}
          worldId={worldId}
          activePageId={activePageId}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs + 2,
    paddingRight: spacing.sm,
    paddingVertical: 6,
    borderRadius: radius.lg,
  },
});
