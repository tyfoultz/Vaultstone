import { createContext, useCallback, useContext, useRef, useState } from 'react';
import {
  View, Pressable, Modal, ScrollView, StyleSheet, Platform,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { colors, spacing, radius, Text, MarkdownText, Chip } from '@vaultstone/ui';
import type { SpellResult } from '@vaultstone/types';
import { getCachedSpell } from './spellCache';

let createPortal: typeof import('react-dom').createPortal | undefined;
if (Platform.OS === 'web') {
  createPortal = require('react-dom').createPortal;
}

// --- Pinned spells context (provided by combat screen) ---

type PinContextValue = {
  pinSpell: (name: string) => void;
} | null;

const PinContext = createContext<PinContextValue>(null);

export function SpellPinProvider({
  onPin,
  children,
}: {
  onPin: (name: string) => void;
  children: React.ReactNode;
}) {
  return (
    <PinContext.Provider value={{ pinSpell: onPin }}>
      {children}
    </PinContext.Provider>
  );
}

// --- Spell card (shared between tooltip and pinned overlay) ---

export function SpellCard({ spell, compact }: { spell: SpellResult; compact?: boolean }) {
  const levelText = spell.level === 0 ? 'Cantrip' : `Level ${spell.level}`;
  return (
    <View style={cs.card}>
      <View style={cs.cardHeader}>
        <Text variant="label-lg" weight="bold" style={cs.name}>{spell.name}</Text>
        <Chip
          label={levelText.toUpperCase()}
          variant="meta"
        />
      </View>
      <Text variant="body-sm" family="body" style={cs.schoolText}>{spell.school}</Text>
      <View style={cs.metaGrid}>
        <MetaItem label="CAST" value={spell.castingTime} />
        <MetaItem label="RANGE" value={spell.range} />
        <MetaItem label="DURATION" value={spell.duration} />
        <MetaItem label="COMPONENTS" value={spell.components.join(', ')} />
      </View>
      {(spell.concentration || spell.ritual) && (
        <View style={cs.badges}>
          {spell.concentration && <Chip label="Concentration" variant="meta" />}
          {spell.ritual && <Chip label="Ritual" variant="meta" />}
        </View>
      )}
      {!compact && (
        <MarkdownText style={cs.desc}>{spell.description ?? ''}</MarkdownText>
      )}
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
  const [popoverPos, setPopoverPos] = useState<{ top: number; left: number } | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const triggerRef = useRef<View>(null);
  const pinCtx = useContext(PinContext);

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
    // Measure trigger position for fixed-positioned portal
    if (triggerRef.current) {
      const el = triggerRef.current as unknown as HTMLElement;
      const rect = el.getBoundingClientRect();
      const POPOVER_MAX_HEIGHT = 440;
      if (rect.bottom + 4 + POPOVER_MAX_HEIGHT > window.innerHeight) {
        // Flip above the trigger
        setPopoverPos({ top: rect.top - POPOVER_MAX_HEIGHT, left: rect.left });
      } else {
        setPopoverPos({ top: rect.bottom + 4, left: rect.left });
      }
    }
    setShowPopover(true);
  }, [isWeb, loadSpell]);

  const handleHoverOut = useCallback(() => {
    if (!isWeb) return;
    hideTimer.current = setTimeout(() => setShowPopover(false), 200);
  }, [isWeb]);

  const handlePress = useCallback(async () => {
    await loadSpell();
    if (pinCtx) {
      pinCtx.pinSpell(spellName);
      setShowPopover(false);
    } else if (!isWeb) {
      setShowModal(true);
    }
  }, [isWeb, loadSpell, pinCtx, spellName]);

  const handlePin = useCallback(() => {
    if (pinCtx) {
      pinCtx.pinSpell(spellName);
      setShowPopover(false);
    }
  }, [pinCtx, spellName]);

  const popoverContent = isWeb && showPopover && popoverPos && createPortal ? createPortal(
    <div
      style={{
        position: 'fixed',
        top: popoverPos.top,
        left: popoverPos.left,
        width: 340,
        maxHeight: 440,
        backgroundColor: colors.surfaceContainer,
        borderColor: colors.outlineVariant,
        borderWidth: 1,
        borderStyle: 'solid',
        borderRadius: radius.xl,
        padding: spacing.md,
        zIndex: 10000,
        boxShadow: '0 4px 24px rgba(0,0,0,0.5)',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column' as const,
      }}
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
      {pinCtx && (
        <Pressable style={cs.pinHint} onPress={handlePin}>
          <MaterialCommunityIcons name="pin" size={12} color={colors.outline} />
          <Text variant="label-sm" style={cs.pinHintText}>
            Click to <Text weight="bold" style={cs.pinHintText}>pin</Text> — stays open
          </Text>
        </Pressable>
      )}
    </div>,
    document.body,
  ) : null;

  return (
    <View style={cs.wrapper}>
      <Pressable
        ref={triggerRef}
        onPress={handlePress}
        onHoverIn={handleHoverIn}
        onHoverOut={handleHoverOut}
      >
        <Text variant="body-sm" family="body" style={cs.link}>{children}</Text>
      </Pressable>

      {popoverContent}

      {!isWeb && !pinCtx && (
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
    maxHeight: 440,
    backgroundColor: colors.surfaceContainer,
    borderColor: colors.outlineVariant,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.md,
    zIndex: 100,
    ...(Platform.OS === 'web' ? {
      boxShadow: '0 4px 24px rgba(0,0,0,0.5)',
    } as never : {}),
  },
  popoverScroll: {
    maxHeight: 360,
  },
  pinHint: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingTop: spacing.sm,
    marginTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.outlineVariant + '66',
  },
  pinHintText: {
    color: colors.outline,
    fontSize: 11,
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
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  name: {
    color: colors.onSurface,
  },
  schoolText: {
    color: colors.outline,
    fontSize: 12,
    fontStyle: 'italic',
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
