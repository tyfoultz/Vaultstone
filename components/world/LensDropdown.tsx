import { View, StyleSheet } from 'react-native';
import { Icon, MetaLabel, Text, colors, radius, spacing } from '@vaultstone/ui';

// Phase 1 placeholder. Phase 4 will populate this dropdown with the campaigns
// linked to the active world and drive the `visible_to_players` lens flag.
export function LensDropdown() {
  return (
    <View style={styles.container} pointerEvents="none">
      <View style={{ flex: 1 }}>
        <MetaLabel size="sm">Viewing as</MetaLabel>
        <Text
          variant="body-sm"
          weight="semibold"
          style={{ color: colors.onSurface, marginTop: 2 }}
        >
          World view
        </Text>
      </View>
      <Icon name="expand-more" size={18} color={colors.outline} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.sm + 4,
    paddingVertical: spacing.sm,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.outlineVariant + '33',
    backgroundColor: colors.surfaceContainer,
    opacity: 0.6,
  },
});
