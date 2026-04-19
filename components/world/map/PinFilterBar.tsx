import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Icon, Text, colors, radius, spacing } from '@vaultstone/ui';
import type { PinType } from '@vaultstone/api';

import { toMaterialIcon } from '../helpers';

type Props = {
  pinTypes: PinType[];
  visibleTypes: Set<string>;
  onToggle: (key: string) => void;
  onAllToggle: () => void;
  allVisible: boolean;
};

// Horizontal chip row above the map canvas. Each chip toggles one pin-type
// on/off. Selection state lives in the route so filter choices survive
// sub-map drill-down (they aren't persisted — Phase 5 keeps filter session-only).
export function PinFilterBar({ pinTypes, visibleTypes, onToggle, onAllToggle, allVisible }: Props) {
  const sorted = useMemo(
    () => [...pinTypes].sort((a, b) => a.sort_order - b.sort_order),
    [pinTypes],
  );

  return (
    <View style={styles.root} pointerEvents="box-none">
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
      >
        <Pressable
          onPress={onAllToggle}
          style={[styles.chip, allVisible && styles.chipActive]}
        >
          <Text
            variant="label-sm"
            weight="semibold"
            style={{ color: allVisible ? colors.onSurface : colors.onSurfaceVariant }}
          >
            {allVisible ? 'All' : 'Show all'}
          </Text>
        </Pressable>
        {sorted.map((type) => {
          const active = visibleTypes.has(type.key);
          return (
            <Pressable
              key={type.key}
              onPress={() => onToggle(type.key)}
              style={[
                styles.chip,
                active && styles.chipActive,
                active && { borderColor: type.default_color_hex + '66' },
              ]}
            >
              <Icon
                name={toMaterialIcon(type.default_icon_key) as React.ComponentProps<typeof Icon>['name']}
                size={14}
                color={active ? type.default_color_hex : colors.onSurfaceVariant}
              />
              <Text
                variant="label-sm"
                weight="semibold"
                style={{
                  color: active ? colors.onSurface : colors.onSurfaceVariant,
                  marginLeft: 6,
                }}
              >
                {type.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    position: 'absolute',
    top: spacing.md,
    left: spacing.md,
    zIndex: 2,
    maxWidth: '70%',
  },
  row: {
    flexDirection: 'row',
    gap: spacing.xs + 2,
    alignItems: 'center',
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.xs + 2,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.outlineVariant + '55',
    backgroundColor: colors.surfaceContainerLowest + 'cc',
  },
  chipActive: {
    backgroundColor: colors.surfaceContainerHigh,
    borderColor: colors.primary + '66',
  },
});
