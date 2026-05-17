import { useCallback, useRef, useState } from 'react';
import {
  View, Pressable, Modal, ScrollView, StyleSheet, Platform,
} from 'react-native';
import { colors, spacing, radius, Text, MarkdownText, Chip } from '@vaultstone/ui';
import type { SpellResult } from '@vaultstone/types';
import { getCachedSpell } from './spellCache';

function SpellCard({ spell }: { spell: SpellResult }) {
  const levelText = spell.level === 0 ? 'Cantrip' : `Level ${spell.level}`;
  return (
    <View style={cs.card}>
      <Text variant="label-lg" weight="bold" style={cs.name}>{spell.name}</Text>
      <View style={cs.metaGrid}>
        <MetaItem label="Level" value={levelText} />
        <MetaItem label="School" value={spell.school} />
        <MetaItem label="Casting Time" value={spell.castingTime} />
        <MetaItem label="Range" value={spell.range} />
        <MetaItem label="Duration" value={spell.duration} />
        <MetaItem label="Components" value={spell.components.join(', ')} />
      </View>
      {(spell.concentration || spell.ritual) && (
        <View style={cs.badges}>
          {spell.concentration && <Chip label="Concentration" variant="meta" />}
          {spell.ritual && <Chip label="Ritual" variant="meta" />}
        </View>
      )}
      <MarkdownText style={cs.desc}>{spell.description ?? ''}</MarkdownText>
    </View>
  );
}

function MetaItem({ label, value }: { label: string; value: string }) {
  return (
    <View style={cs.metaItem}>
      <Text variant="label-sm" weight="bold" uppercase style={cs.metaLabel}>{label}</Text>
      <Text variant="body-sm" family="body" style={cs.metaValue}>{value}</Text>
    </View>
  );
}

export function SpellTooltip({
  spellName,
  children,
}: {
  spellName: string;
  children: React.ReactNode;
}) {
  const [spell, setSpell] = useState<SpellResult | null | undefined>(undefined);
  const [showPopover, setShowPopover] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadSpell = useCallback(async () => {
    if (spell !== undefined) return spell;
    const result = await getCachedSpell(spellName);
    setSpell(result);
    return result;
  }, [spellName, spell]);

  const isWeb = Platform.OS === 'web';

  const handleHoverIn = useCallback(async () => {
    if (!isWeb) return;
    if (hideTimer.current) {
      clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }
    await loadSpell();
    setShowPopover(true);
  }, [isWeb, loadSpell]);

  const handleHoverOut = useCallback(() => {
    if (!isWeb) return;
    hideTimer.current = setTimeout(() => setShowPopover(false), 200);
  }, [isWeb]);

  const handlePress = useCallback(async () => {
    if (isWeb) return;
    await loadSpell();
    setShowModal(true);
  }, [isWeb, loadSpell]);

  return (
    <View style={cs.wrapper}>
      <Pressable
        onPress={handlePress}
        onHoverIn={handleHoverIn}
        onHoverOut={handleHoverOut}
      >
        <Text variant="body-sm" family="body" style={cs.link}>{children}</Text>
      </Pressable>

      {isWeb && showPopover && (
        <View
          style={cs.popover}
          onPointerEnter={() => {
            if (hideTimer.current) {
              clearTimeout(hideTimer.current);
              hideTimer.current = null;
            }
          }}
          onPointerLeave={handleHoverOut}
        >
          <ScrollView style={cs.popoverScroll}>
            {spell === undefined ? (
              <Text variant="body-sm" style={cs.loading}>Loading...</Text>
            ) : spell === null ? (
              <Text variant="body-sm" style={cs.loading}>Spell not found in catalog.</Text>
            ) : (
              <SpellCard spell={spell} />
            )}
          </ScrollView>
        </View>
      )}

      {!isWeb && (
        <Modal
          visible={showModal}
          transparent
          animationType="fade"
          onRequestClose={() => setShowModal(false)}
        >
          <Pressable style={cs.backdrop} onPress={() => setShowModal(false)}>
            <Pressable style={cs.modalCard} onPress={(e) => e.stopPropagation()}>
              <View style={cs.modalHeader}>
                <Text variant="label-lg" weight="bold" style={cs.name}>
                  {spellName}
                </Text>
                <Pressable onPress={() => setShowModal(false)}>
                  <Text style={cs.closeBtn}>✕</Text>
                </Pressable>
              </View>
              <ScrollView style={cs.modalScroll}>
                {spell === undefined ? (
                  <Text variant="body-sm" style={cs.loading}>Loading...</Text>
                ) : spell === null ? (
                  <Text variant="body-sm" style={cs.loading}>Spell not found in catalog.</Text>
                ) : (
                  <SpellCard spell={spell} />
                )}
              </ScrollView>
            </Pressable>
          </Pressable>
        </Modal>
      )}
    </View>
  );
}

const cs = StyleSheet.create({
  wrapper: {
    position: 'relative',
  },
  link: {
    color: colors.primary,
    textDecorationLine: 'underline',
  },
  popover: {
    position: 'absolute',
    bottom: '100%',
    left: 0,
    width: 340,
    maxHeight: 400,
    backgroundColor: colors.surfaceContainer,
    borderColor: colors.outlineVariant,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.md,
    zIndex: 100,
    // web shadow
    ...(Platform.OS === 'web' ? {
      boxShadow: '0 4px 24px rgba(0,0,0,0.5)',
    } as never : {}),
  },
  popoverScroll: {
    maxHeight: 360,
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
  modalCard: {
    width: '100%',
    maxWidth: 480,
    maxHeight: '80%',
    backgroundColor: colors.surfaceContainer,
    borderColor: colors.outlineVariant,
    borderWidth: 1,
    borderRadius: radius.lg,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomColor: colors.outlineVariant,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  modalScroll: {
    padding: spacing.md,
    maxHeight: 500,
  },
  closeBtn: {
    color: colors.outline,
    fontSize: 18,
    padding: spacing.xs,
  },
  card: {
    gap: spacing.sm,
  },
  name: {
    color: colors.onSurface,
  },
  metaGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  metaItem: {
    minWidth: 80,
    gap: 2,
  },
  metaLabel: {
    color: colors.outline,
    letterSpacing: 1,
  },
  metaValue: {
    color: colors.onSurface,
  },
  badges: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  desc: {
    color: colors.onSurfaceVariant,
    lineHeight: 20,
  },
  loading: {
    color: colors.outline,
    textAlign: 'center',
    paddingVertical: spacing.md,
  },
});
