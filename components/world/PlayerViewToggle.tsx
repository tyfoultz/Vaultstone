import { Pressable, StyleSheet } from 'react-native';
import { useAuthStore, useCurrentWorldStore } from '@vaultstone/store';
import { Icon, Text, colors, radius, spacing } from '@vaultstone/ui';

// Pill in the page / section topbar that flips the world workspace into
// "preview as player" mode. Only rendered for world owners — players and
// linked-campaign members are already in player view, so the toggle is
// meaningless for them.
//
// When on: sidebar + content views filter to pages that satisfy
// `user_can_view_page` for a generic player (i.e. visible_to_players=true +
// section not force-hidden). The mid-screen `PlayerViewBanner` (4g) also
// renders so the GM can't forget they're in preview.
export function PlayerViewToggle() {
  const world = useCurrentWorldStore((s) => s.world);
  const myUserId = useAuthStore((s) => s.user?.id ?? null);
  const on = useCurrentWorldStore((s) => s.playerViewPreview);
  const setOn = useCurrentWorldStore((s) => s.setPlayerViewPreview);

  if (!world || !myUserId || world.owner_user_id !== myUserId) return null;

  return (
    <Pressable
      onPress={() => setOn(!on)}
      style={[styles.pill, on && styles.pillActive]}
      accessibilityLabel={
        on ? 'Exit player view preview' : 'Preview as player'
      }
    >
      <Icon
        name="visibility"
        size={14}
        color={on ? colors.player : colors.onSurfaceVariant}
      />
      <Text
        variant="label-md"
        uppercase
        weight="semibold"
        style={{
          color: on ? colors.player : colors.onSurfaceVariant,
          letterSpacing: 1,
          fontSize: 11,
        }}
      >
        {on ? 'Previewing player' : 'Player view'}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.xs + 2,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.outlineVariant + '55',
  },
  pillActive: {
    borderColor: colors.player + '66',
    backgroundColor: colors.playerGlow,
  },
});
