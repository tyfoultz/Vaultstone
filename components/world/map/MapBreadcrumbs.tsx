import { Fragment } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Icon, Text, colors, spacing } from '@vaultstone/ui';

type Crumb = {
  mapId: string;
  label: string;
  depth: number;
};

type Props = {
  crumbs: Crumb[];
  onCrumbPress: (crumb: Crumb) => void;
};

// Rendered inline above the map canvas when the user has drilled into
// sub-maps. The last crumb is the current map — it renders as a static
// label, earlier crumbs are pressable and pop the drill stack back to
// their depth.
export function MapBreadcrumbs({ crumbs, onCrumbPress }: Props) {
  if (crumbs.length <= 1) return null;
  const lastIndex = crumbs.length - 1;

  return (
    <View style={styles.row}>
      {crumbs.map((crumb, idx) => {
        const isLast = idx === lastIndex;
        const content = (
          <Text
            variant="label-sm"
            weight={isLast ? 'semibold' : 'regular'}
            style={{
              color: isLast ? colors.onSurface : colors.onSurfaceVariant,
            }}
            numberOfLines={1}
          >
            {crumb.label}
          </Text>
        );
        return (
          <Fragment key={crumb.mapId + ':' + crumb.depth}>
            {idx > 0 ? (
              <Icon
                name="chevron-right"
                size={14}
                color={colors.outline}
              />
            ) : null}
            {isLast ? (
              <View style={styles.crumb}>{content}</View>
            ) : (
              <Pressable style={styles.crumb} onPress={() => onCrumbPress(crumb)}>
                {content}
              </Pressable>
            )}
          </Fragment>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    backgroundColor: colors.surfaceContainer,
    borderBottomWidth: 1,
    borderBottomColor: colors.outlineVariant + '22',
  },
  crumb: {
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
  },
});
