import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { selectPageTree, usePagesStore } from '@vaultstone/store';
import type { WorldSection } from '@vaultstone/types';
import { Icon, MetaLabel, Text, colors, radius, spacing } from '@vaultstone/ui';

import { SidebarPageRow } from './SidebarPageRow';
import { worldSectionHref } from './worldHref';

type Props = {
  section: WorldSection;
  worldId: string;
  activePageId?: string | null;
  onAddPage?: () => void;
};

export function SidebarSection({ section, worldId, activePageId, onAddPage }: Props) {
  const [collapsed, setCollapsed] = useState(false);
  const tree = usePagesStore((s) => selectPageTree(s, worldId, section.id));
  const router = useRouter();

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <Pressable
          onPress={() => setCollapsed((c) => !c)}
          style={styles.chevronBtn}
          accessibilityLabel={collapsed ? 'Expand section' : 'Collapse section'}
        >
          <Icon
            name={collapsed ? 'chevron-right' : 'expand-more'}
            size={16}
            color={colors.outline}
          />
        </Pressable>
        <Pressable
          onPress={() => router.push(worldSectionHref(worldId, section.id))}
          style={styles.headerLabel}
          accessibilityLabel={`Open ${section.name}`}
        >
          <MetaLabel size="sm" tone="muted">
            {section.name}
          </MetaLabel>
        </Pressable>
        {onAddPage ? (
          <Pressable
            onPress={onAddPage}
            style={styles.addBtn}
            accessibilityLabel="Add page"
          >
            <Icon name="add" size={16} color={colors.outline} />
          </Pressable>
        ) : null}
      </View>

      {!collapsed ? (
        tree.length === 0 ? (
          <Text
            variant="body-sm"
            tone="secondary"
            style={{ paddingLeft: spacing.sm, paddingVertical: 4, color: colors.outline }}
          >
            No pages yet.
          </Text>
        ) : (
          <View>
            {tree.map((node) => (
              <SidebarPageRow
                key={node.page.id}
                node={node}
                worldId={worldId}
                activePageId={activePageId}
              />
            ))}
          </View>
        )
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    gap: spacing.xs,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.xs,
    height: 28,
    gap: 2,
  },
  chevronBtn: {
    width: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerLabel: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  addBtn: {
    width: 22,
    height: 22,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
