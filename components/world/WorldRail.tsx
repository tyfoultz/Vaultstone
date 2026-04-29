import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Icon, colors, radius, spacing } from '@vaultstone/ui';

import { WorldSettingsModal } from './WorldSettingsModal';
import { worldHref, worldMapIndexHref, worldPageHref } from './worldHref';
import type { Database } from '@vaultstone/types';

type World = Database['public']['Tables']['worlds']['Row'];

type Props = {
  world: World;
};

export function WorldRail({ world }: Props) {
  const router = useRouter();
  const [settingsOpen, setSettingsOpen] = useState(false);

  return (
    <View style={styles.root}>
      <Pressable
        onPress={() => router.push('/(drawer)/home')}
        accessibilityLabel="Vaultstone home"
      >
        <LinearGradient
          colors={[colors.primaryContainer, colors.secondaryContainer]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.logo}
        >
          <Icon name="diamond" size={16} color={colors.onPrimary} />
        </LinearGradient>
      </Pressable>

      <Pressable
        onPress={() => router.push(worldHref(world.id))}
        style={styles.item}
        accessibilityLabel="World home"
      >
        <Icon name="home" size={20} color={colors.onSurfaceVariant} />
      </Pressable>

      <View style={styles.items}>
        <View style={styles.divider} />

        <Pressable
          onPress={() => router.push(worldMapIndexHref(world.id))}
          style={styles.item}
          accessibilityLabel="Map"
        >
          <Icon name="map" size={20} color={colors.onSurfaceVariant} />
        </Pressable>
        {world.primary_timeline_page_id ? (
          <Pressable
            onPress={() =>
              router.push(worldPageHref(world.id, world.primary_timeline_page_id!))
            }
            style={styles.item}
            accessibilityLabel="Timeline"
          >
            <Icon name="timeline" size={20} color={colors.onSurfaceVariant} />
          </Pressable>
        ) : (
          <View style={[styles.item, styles.itemDisabled]} accessibilityLabel="No timelines yet">
            <Icon name="timeline" size={20} color={colors.outline} />
          </View>
        )}
      </View>

      <View style={{ flex: 1 }} />

      <Pressable
        onPress={() => setSettingsOpen(true)}
        style={styles.item}
        accessibilityLabel="World settings"
      >
        <Icon name="settings" size={20} color={colors.onSurfaceVariant} />
      </Pressable>

      {settingsOpen ? (
        <WorldSettingsModal world={world} onClose={() => setSettingsOpen(false)} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    width: 56,
    backgroundColor: colors.surfaceContainerLowest,
    borderRightWidth: 1,
    borderRightColor: colors.outlineVariant + '22',
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
    alignItems: 'center',
    gap: spacing.sm,
  },
  logo: {
    width: 32,
    height: 32,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  items: {
    alignItems: 'center',
    gap: spacing.xs,
  },
  item: {
    width: 40,
    height: 40,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemDisabled: {
    opacity: 0.35,
  },
  divider: {
    height: 1,
    width: 24,
    backgroundColor: colors.outlineVariant + '55',
    marginVertical: spacing.xs,
  },
});
