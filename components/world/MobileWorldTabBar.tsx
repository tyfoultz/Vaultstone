import { Pressable, StyleSheet, View } from 'react-native';
import { usePathname, useRouter } from 'expo-router';
import type { Database } from '@vaultstone/types';
import { Icon, Text, colors, spacing } from '@vaultstone/ui';

import {
  worldHref,
  worldMapIndexHref,
  worldPagesHref,
  worldPageHref,
  worldRelationsHref,
} from './worldHref';

type World = Database['public']['Tables']['worlds']['Row'];

type TabDef = {
  key: string;
  label: string;
  icon: React.ComponentProps<typeof Icon>['name'];
  getHref: () => ReturnType<typeof worldHref>;
  disabled?: boolean;
};

type Props = {
  worldId: string;
  world: World;
};

export function MobileWorldTabBar({ worldId, world }: Props) {
  const pathname = usePathname();
  const router = useRouter();

  const timelinePageId = world.primary_timeline_page_id;

  const tabs: TabDef[] = [
    {
      key: 'world',
      label: 'World',
      icon: 'public',
      getHref: () => worldHref(worldId),
    },
    {
      key: 'pages',
      label: 'Pages',
      icon: 'description',
      getHref: () => worldPagesHref(worldId),
    },
    {
      key: 'map',
      label: 'Map',
      icon: 'place',
      getHref: () => worldMapIndexHref(worldId),
    },
    {
      key: 'timeline',
      label: 'Timeline',
      icon: 'timeline',
      getHref: () => timelinePageId ? worldPageHref(worldId, timelinePageId) : worldHref(worldId),
      disabled: !timelinePageId,
    },
    {
      key: 'web',
      label: 'Web',
      icon: 'hub',
      getHref: () => worldRelationsHref(worldId),
    },
  ];

  function isActive(tab: TabDef): boolean {
    const worldBase = `/world/${worldId}`;
    switch (tab.key) {
      case 'world':
        return pathname === worldBase || pathname === worldBase + '/';
      case 'pages':
        return pathname.startsWith(worldBase + '/pages');
      case 'map':
        return pathname.startsWith(worldBase + '/map');
      case 'timeline':
        return !!timelinePageId && pathname.includes(`/page/${timelinePageId}`);
      case 'web':
        return pathname.startsWith(worldBase + '/relations');
      default:
        return false;
    }
  }

  return (
    <View style={styles.root}>
      {tabs.map((tab) => {
        const active = isActive(tab);
        const disabled = !!tab.disabled;
        return (
          <Pressable
            key={tab.key}
            style={styles.tab}
            onPress={() => {
              if (!disabled) router.push(tab.getHref());
            }}
            disabled={disabled}
          >
            <View style={active ? styles.activeIndicator : styles.inactiveIndicator}>
              <Icon
                name={tab.icon}
                size={22}
                color={disabled ? colors.outlineVariant : active ? colors.primary : colors.onSurfaceVariant}
              />
            </View>
            <Text
              variant="label-sm"
              style={{
                color: disabled ? colors.outlineVariant : active ? colors.primary : colors.onSurfaceVariant,
                fontSize: 10,
                marginTop: 2,
              }}
            >
              {tab.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flexDirection: 'row',
    height: 56,
    backgroundColor: colors.surfaceContainerLowest,
    borderTopWidth: 1,
    borderTopColor: colors.outlineVariant + '33',
    paddingHorizontal: spacing.sm,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: spacing.xs,
  },
  activeIndicator: {
    borderBottomWidth: 2,
    borderBottomColor: colors.primary,
    paddingBottom: 2,
  },
  inactiveIndicator: {
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
    paddingBottom: 2,
  },
});
