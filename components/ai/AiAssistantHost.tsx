import { useState } from 'react';
import { Pressable, StyleSheet, Platform } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { colors, radius } from '@vaultstone/ui';
import { AiChatOverlay, type PanelPos, type PanelSize } from './AiChatOverlay';
import type { AiChatSeed } from './AiChatContext';

/**
 * Self-contained assistant: a floating pill + draggable overlay for a given
 * seed, with its own open/position state. Unlike the campaign route (which uses
 * the AiChat context so a child component can register), this takes the seed
 * directly — for screens that compute it themselves (e.g. the character sheet).
 * Renders nothing when `seed` is null.
 */
export function AiAssistantHost({ seed }: { seed: AiChatSeed | null }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<PanelPos | null>(null);
  const [size, setSize] = useState<PanelSize | null>(null);

  if (!seed) return null;

  return (
    <>
      {open ? (
        <AiChatOverlay
          seed={seed}
          position={pos}
          onPositionChange={setPos}
          size={size}
          onSizeChange={setSize}
          onClose={() => setOpen(false)}
        />
      ) : null}
      <Pressable
        style={[styles.pill, open && styles.pillActive]}
        onPress={() => setOpen((v) => !v)}
        accessibilityLabel="AI Assistant"
      >
        <MaterialCommunityIcons
          name="robot-happy-outline"
          size={18}
          color={open ? colors.onSurface : colors.primary}
        />
      </Pressable>
    </>
  );
}

const styles = StyleSheet.create({
  pill: {
    position: 'absolute',
    right: 16,
    bottom: 24,
    width: 44,
    height: 44,
    borderRadius: radius.xl,
    backgroundColor: colors.surfaceContainer,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    alignItems: 'center',
    justifyContent: 'center',
    ...(Platform.OS === 'web'
      ? ({ zIndex: 50, cursor: 'pointer' } as any)
      : { elevation: 6 }),
  },
  pillActive: { backgroundColor: colors.primary, borderColor: colors.primary },
});
