import { useCallback, useEffect, useState } from 'react';
import {
  View, ScrollView, Pressable, StyleSheet, Platform,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { colors, spacing, radius, Text } from '@vaultstone/ui';
import type { SpellResult } from '@vaultstone/types';
import { getCachedSpell } from '../creatures/spellCache';
import { SpellCard } from '../creatures/SpellTooltip';

type PinnedEntry = {
  name: string;
  spell: SpellResult | null;
  minimized: boolean;
};

export function usePinnedSpells() {
  const [pinned, setPinned] = useState<PinnedEntry[]>([]);

  const pinSpell = useCallback(async (name: string) => {
    setPinned((prev) => {
      if (prev.some((p) => p.name.toLowerCase() === name.toLowerCase())) {
        return prev.map((p) =>
          p.name.toLowerCase() === name.toLowerCase()
            ? { ...p, minimized: false }
            : p,
        );
      }
      return [...prev, { name, spell: null, minimized: false }];
    });
    const spell = await getCachedSpell(name);
    setPinned((prev) =>
      prev.map((p) =>
        p.name.toLowerCase() === name.toLowerCase() && p.spell === null
          ? { ...p, spell }
          : p,
      ),
    );
  }, []);

  const unpinSpell = useCallback((name: string) => {
    setPinned((prev) => prev.filter((p) => p.name.toLowerCase() !== name.toLowerCase()));
  }, []);

  const toggleMinimize = useCallback((name: string) => {
    setPinned((prev) =>
      prev.map((p) =>
        p.name.toLowerCase() === name.toLowerCase()
          ? { ...p, minimized: !p.minimized }
          : p,
      ),
    );
  }, []);

  return { pinned, pinSpell, unpinSpell, toggleMinimize };
}

export function PinnedSpellsOverlay({
  pinned,
  onUnpin,
  onToggleMinimize,
}: {
  pinned: PinnedEntry[];
  onUnpin: (name: string) => void;
  onToggleMinimize: (name: string) => void;
}) {
  if (pinned.length === 0) return null;

  const expanded = pinned.find((p) => !p.minimized);

  return (
    <>
      {expanded && (
        <View style={st.floatingCard}>
          <View style={st.cardTitleBar}>
            <Text variant="label-md" weight="bold" style={st.cardTitle} numberOfLines={1}>
              {expanded.name}
            </Text>
            <View style={st.cardActions}>
              <Pressable onPress={() => onToggleMinimize(expanded.name)} style={st.cardAction}>
                <MaterialCommunityIcons name="minus" size={16} color={colors.outline} />
              </Pressable>
              <Pressable onPress={() => onUnpin(expanded.name)} style={st.cardAction}>
                <MaterialCommunityIcons name="close" size={16} color={colors.outline} />
              </Pressable>
            </View>
          </View>
          <ScrollView style={st.cardBody} contentContainerStyle={st.cardBodyContent}>
            {expanded.spell ? (
              <SpellCard spell={expanded.spell} />
            ) : (
              <Text variant="body-sm" style={st.loadingText}>Loading...</Text>
            )}
          </ScrollView>
        </View>
      )}

      <View style={st.pinnedBar}>
        <Text variant="label-sm" weight="bold" uppercase style={st.pinnedLabel}>
          PINNED · {pinned.length}
        </Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={st.chipRow}>
          {pinned.map((p) => (
            <Pressable
              key={p.name}
              style={[st.chip, !p.minimized && st.chipActive]}
              onPress={() => onToggleMinimize(p.name)}
            >
              <Text variant="label-sm" weight="bold" style={[st.chipText, !p.minimized && st.chipTextActive]}>
                {p.name}
              </Text>
              <Pressable
                onPress={(e) => { e.stopPropagation(); onUnpin(p.name); }}
                hitSlop={8}
              >
                <MaterialCommunityIcons
                  name="close"
                  size={12}
                  color={p.minimized ? colors.outline : colors.primary}
                />
              </Pressable>
            </Pressable>
          ))}
        </ScrollView>
      </View>
    </>
  );
}

const st = StyleSheet.create({
  floatingCard: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 360,
    maxHeight: 420,
    backgroundColor: colors.surfaceContainer,
    borderColor: colors.outlineVariant,
    borderWidth: 1,
    borderRadius: radius.lg,
    zIndex: 200,
    ...(Platform.OS === 'web' ? {
      boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
    } as never : {}),
  },
  cardTitleBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.outlineVariant,
    backgroundColor: colors.surfaceContainerHigh,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
  },
  cardTitle: { color: colors.onSurface, flex: 1, marginRight: spacing.sm },
  cardActions: { flexDirection: 'row', gap: 4 },
  cardAction: { padding: 4 },
  cardBody: { maxHeight: 350 },
  cardBodyContent: { padding: spacing.md },
  loadingText: { color: colors.outline, textAlign: 'center', paddingVertical: spacing.md },
  pinnedBar: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    left: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    backgroundColor: colors.surfaceContainerHigh,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.outlineVariant,
    zIndex: 201,
  },
  pinnedLabel: { color: colors.outline, letterSpacing: 1 },
  chipRow: { gap: spacing.xs },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    backgroundColor: colors.surfaceContainer,
  },
  chipActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primary + '22',
  },
  chipText: { color: colors.outline, fontSize: 12 },
  chipTextActive: { color: colors.primary },
});
