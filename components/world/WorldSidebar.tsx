import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import {
  Icon,
  Input,
  MetaLabel,
  Text,
  colors,
  radius,
  spacing,
} from '@vaultstone/ui';
import type { Database } from '@vaultstone/types';
import { LensDropdown } from './LensDropdown';
import { WorldSettingsModal } from './WorldSettingsModal';

type World = Database['public']['Tables']['worlds']['Row'];

type Props = {
  world: World;
};

// Phase 1 sidebar — world identity + lens placeholder + inert section
// scaffolding. Phase 2 replaces the "coming next" empty state with the
// real sections tree (The Atlas / Lore / etc.).
export function WorldSidebar({ world }: Props) {
  const [settingsOpen, setSettingsOpen] = useState(false);

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <LinearGradient
          colors={[colors.primaryContainer, colors.secondaryContainer]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.cover}
        >
          <Icon name="public" size={28} color={colors.onPrimary} />
        </LinearGradient>

        <View style={styles.titleRow}>
          <View style={{ flex: 1 }}>
            <MetaLabel size="sm" tone="accent">
              Chronicle
            </MetaLabel>
            <Text
              variant="title-md"
              family="headline"
              weight="bold"
              numberOfLines={2}
              style={{ marginTop: 2, letterSpacing: -0.25 }}
            >
              {world.name}
            </Text>
          </View>
          <Pressable
            onPress={() => setSettingsOpen(true)}
            style={({ pressed }) => [
              styles.gearBtn,
              pressed && { backgroundColor: colors.surfaceContainerHigh },
            ]}
            accessibilityLabel="World settings"
          >
            <Icon name="settings" size={18} color={colors.onSurfaceVariant} />
          </Pressable>
        </View>
      </View>

      <View style={{ gap: spacing.sm }}>
        <LensDropdown />
        <View pointerEvents="none" style={{ opacity: 0.5 }}>
          <Input placeholder="Search the lexicon… (Phase 7c)" editable={false} />
        </View>
      </View>

      <View style={styles.sectionBlock}>
        <MetaLabel size="sm">The Atlas</MetaLabel>
        <View style={styles.comingNext}>
          <Icon name="travel-explore" size={18} color={colors.outline} />
          <Text
            variant="body-sm"
            tone="secondary"
            style={{
              color: colors.onSurfaceVariant,
              flex: 1,
              marginLeft: spacing.xs + 2,
            }}
          >
            Sections arrive in the next phase.
          </Text>
        </View>
      </View>

      <View style={styles.sectionBlock}>
        <MetaLabel size="sm">Lore</MetaLabel>
        <View style={styles.comingNext}>
          <Icon name="auto-stories" size={18} color={colors.outline} />
          <Text
            variant="body-sm"
            tone="secondary"
            style={{
              color: colors.onSurfaceVariant,
              flex: 1,
              marginLeft: spacing.xs + 2,
            }}
          >
            Pages, characters, and factions join soon.
          </Text>
        </View>
      </View>

      {settingsOpen ? (
        <WorldSettingsModal
          world={world}
          onClose={() => setSettingsOpen(false)}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    width: 280,
    backgroundColor: colors.surfaceContainerLow,
    borderRightWidth: 1,
    borderRightColor: colors.outlineVariant + '33',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.lg,
    paddingBottom: spacing.lg,
    gap: spacing.lg,
  },
  header: {
    gap: spacing.md,
  },
  cover: {
    width: '100%',
    height: 80,
    borderRadius: radius.xl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.xs,
  },
  gearBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.full,
  },
  sectionBlock: {
    gap: spacing.sm,
  },
  comingNext: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.sm,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceContainer,
    borderWidth: 1,
    borderColor: colors.outlineVariant + '22',
  },
});
