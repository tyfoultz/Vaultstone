import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { listTemplates } from '@vaultstone/content';
import { selectSectionsForWorld, useSectionsStore } from '@vaultstone/store';
import type { AccentToken, TemplateKey, WorldSection } from '@vaultstone/types';
import { Icon, Text, colors, radius, spacing } from '@vaultstone/ui';

import { useActiveSection } from './ActiveSectionContext';
import { WorldSettingsModal } from './WorldSettingsModal';
import { worldHref, worldMapIndexHref, worldPageHref, worldSectionHref } from './worldHref';
import type { Database } from '@vaultstone/types';

type World = Database['public']['Tables']['worlds']['Row'];

type Props = {
  world: World;
};

// The rail surfaces the 5 MVP-template sections (locations, npcs, players,
// factions, lore) as icon shortcuts — matches the handoff's `.rail` +
// `.nav-item` + `.nav-tip` pattern. Map + Timeline reserve icon slots so
// the order stays stable once Phases 5/6 land.
const RAIL_ORDER: TemplateKey[] = ['locations', 'npcs', 'players', 'factions', 'lore'];

const MATERIAL_ICON: Record<string, string> = {
  'map-pin': 'place',
  skull: 'dangerous',
  user: 'person',
  shield: 'shield',
  book: 'auto-stories',
  'file-text': 'article',
};

const ACCENT_TINT: Record<AccentToken, string> = {
  primary: colors.primary,
  player: colors.player,
  gm: colors.gm,
  cosmic: colors.cosmic,
  danger: colors.hpDanger,
};

export function WorldRail({ world }: Props) {
  const sections = useSectionsStore((s) => selectSectionsForWorld(s, world.id));
  const { activeSectionId, setActiveSectionId } = useActiveSection();
  const router = useRouter();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const templates = useMemo(() => listTemplates(), []);

  const templateByKey = useMemo(() => {
    const map: Record<string, (typeof templates)[number]> = {};
    for (const t of templates) map[t.key] = t;
    return map;
  }, [templates]);

  const railSections: WorldSection[] = useMemo(() => {
    const byKey = new Map<string, WorldSection>();
    for (const section of sections) {
      if (!byKey.has(section.template_key)) byKey.set(section.template_key, section);
    }
    return RAIL_ORDER.map((key) => byKey.get(key)).filter(
      (s): s is WorldSection => Boolean(s),
    );
  }, [sections]);

  return (
    <View style={styles.root}>
      <Pressable
        onPress={() => {
          setActiveSectionId(null);
          router.push('/(drawer)/home');
        }}
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
        onPress={() => {
          setActiveSectionId(null);
          router.push(worldHref(world.id));
        }}
        style={styles.item}
        accessibilityLabel="World home"
      >
        <Icon name="home" size={20} color={colors.onSurfaceVariant} />
      </Pressable>

      <View style={styles.items}>
        {railSections.map((section) => {
          const template = templateByKey[section.template_key];
          if (!template) return null;
          const materialName = MATERIAL_ICON[template.icon] ?? 'circle';
          const tint = ACCENT_TINT[template.accentToken];
          const active = activeSectionId === section.id;
          const hovered = hoveredId === section.id;
          return (
            <View key={section.id} style={styles.itemWrapper}>
              <Pressable
                onPress={() => {
                  setActiveSectionId(section.id);
                  router.push(worldSectionHref(world.id, section.id));
                }}
                onHoverIn={() => setHoveredId(section.id)}
                onHoverOut={() => setHoveredId(null)}
                style={[
                  styles.item,
                  active && { backgroundColor: colors.primaryContainer + '33' },
                ]}
                accessibilityLabel={section.name}
              >
                {active ? <View style={[styles.activeBar, { backgroundColor: tint }]} /> : null}
                <Icon
                  name={materialName as React.ComponentProps<typeof Icon>['name']}
                  size={20}
                  color={active ? tint : colors.onSurfaceVariant}
                />
              </Pressable>
              {hovered ? (
                <View style={styles.tooltip} pointerEvents="none">
                  <Text variant="label-md" style={{ color: colors.onSurface }}>
                    {section.name}
                  </Text>
                </View>
              ) : null}
            </View>
          );
        })}

        <View style={styles.divider} />

        <Pressable
          onPress={() => {
            setActiveSectionId(null);
            router.push(worldMapIndexHref(world.id));
          }}
          style={styles.item}
          accessibilityLabel="Map"
        >
          <Icon name="map" size={20} color={colors.onSurfaceVariant} />
        </Pressable>
        {world.primary_timeline_page_id ? (
          <Pressable
            onPress={() => {
              setActiveSectionId(null);
              router.push(worldPageHref(world.id, world.primary_timeline_page_id!));
            }}
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
  itemWrapper: {
    position: 'relative',
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
  activeBar: {
    position: 'absolute',
    left: -8,
    top: 8,
    bottom: 8,
    width: 2,
    borderRadius: 2,
  },
  divider: {
    height: 1,
    width: 24,
    backgroundColor: colors.outlineVariant + '55',
    marginVertical: spacing.xs,
  },
  tooltip: {
    position: 'absolute',
    left: 56,
    top: 10,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceContainerHigh,
    borderWidth: 1,
    borderColor: colors.outlineVariant + '55',
    zIndex: 10,
  },
});
