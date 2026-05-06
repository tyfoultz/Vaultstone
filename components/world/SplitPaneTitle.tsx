import { Pressable, StyleSheet, View } from 'react-native';
import type { AccentToken } from '@vaultstone/types';
import { Icon, MetaLabel, Text, colors, spacing } from '@vaultstone/ui';

import { ACCENT_SWATCH, toMaterialIcon } from './helpers';

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

type Props = {
  icon: string;
  title: string;
  accentToken: AccentToken;
  kindLabel: string;
  saveState: SaveState;
  focused?: boolean;
  onPress?: () => void;
  onClose?: () => void;
};

export function SplitPaneTitle({
  icon,
  title,
  accentToken,
  kindLabel,
  saveState,
  focused,
  onPress,
  onClose,
}: Props) {
  const swatch = ACCENT_SWATCH[accentToken] ?? ACCENT_SWATCH.primary;
  const materialIcon = toMaterialIcon(icon);

  const dotColor =
    saveState === 'saving'
      ? colors.hpWarning
      : saveState === 'saved'
        ? colors.hpHealthy
        : saveState === 'error'
          ? colors.hpDanger
          : colors.outline;

  return (
    <Pressable
      onPress={onPress}
      style={[styles.root, focused && styles.focused]}
    >
      <View style={[styles.iconBox, { backgroundColor: swatch.bg + '44' }]}>
        <Icon
          name={materialIcon as React.ComponentProps<typeof Icon>['name']}
          size={14}
          color={swatch.fg}
        />
      </View>

      <Text
        variant="label-lg"
        weight="bold"
        numberOfLines={1}
        style={styles.title}
      >
        {title}
      </Text>

      <MetaLabel size="sm" tone="muted">
        {kindLabel}
      </MetaLabel>

      <View style={styles.dot}>
        <View style={[styles.dotCircle, { backgroundColor: dotColor }]} />
      </View>

      <View style={{ flex: 1 }} />

      {onClose ? (
        <Pressable
          onPress={(e) => {
            e.stopPropagation();
            onClose();
          }}
          style={styles.closeBtn}
          accessibilityLabel="Close split pane"
        >
          <Icon name="close" size={14} color={colors.outlineVariant} />
        </Pressable>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: {
    height: 36,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.outlineVariant + '22',
    backgroundColor: colors.surfaceCanvas,
  },
  focused: {
    borderBottomColor: colors.primary + '55',
  },
  iconBox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    color: colors.onSurface,
    maxWidth: '50%',
  },
  dot: {
    marginLeft: spacing.xs,
  },
  dotCircle: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  closeBtn: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
  },
});
