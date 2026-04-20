import { Pressable, StyleSheet, View } from 'react-native';
import { useCurrentWorldStore } from '@vaultstone/store';
import { Icon, Text, colors, spacing } from '@vaultstone/ui';

// Thin strip across the top of the world workspace when Player View preview
// is on. Reuses the `.takeover-banner` chrome from the handoff (3px left
// border + tinted surface) but uses the player teal accent to differentiate
// from the amber lens-switch banner and the crimson orphan banner.
export function PlayerViewBanner() {
  const on = useCurrentWorldStore((s) => s.playerViewPreview);
  const setOn = useCurrentWorldStore((s) => s.setPlayerViewPreview);

  if (!on) return null;

  return (
    <View style={styles.root}>
      <Icon name="visibility" size={14} color={colors.player} />
      <Text variant="label-md" weight="semibold" style={{ color: colors.player }}>
        Previewing as a player
      </Text>
      <Text variant="body-sm" tone="secondary" style={{ flex: 1 }}>
        GM-only sections and pages are hidden. Edits are still allowed for
        visible pages.
      </Text>
      <Pressable onPress={() => setOn(false)} style={styles.exitBtn}>
        <Text
          variant="label-md"
          uppercase
          weight="semibold"
          style={{ color: colors.player, letterSpacing: 1, fontSize: 11 }}
        >
          Exit preview
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    backgroundColor: colors.playerGlow,
    borderLeftWidth: 3,
    borderLeftColor: colors.player,
    borderBottomWidth: 1,
    borderBottomColor: colors.outlineVariant + '33',
  },
  exitBtn: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
});
