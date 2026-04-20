import { Pressable, StyleSheet, View } from 'react-native';
import { Icon, Text, colors, radius, spacing } from '@vaultstone/ui';

type Props = {
  scale: number;
  minScale: number;
  maxScale: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
};

// Vertical zoom bar with +/- buttons and a filled track showing the
// current scale as a 0–100% value. Sits above the map toolbar on the
// right edge of the canvas frame.
export function ZoomControl({ scale, minScale, maxScale, onZoomIn, onZoomOut }: Props) {
  const raw = ((scale - minScale) / (maxScale - minScale)) * 100;
  const pct = Math.max(0, Math.min(100, Math.round(raw)));
  const atMax = scale >= maxScale - 0.001;
  const atMin = scale <= minScale + 0.001;

  return (
    <View style={styles.container}>
      <Pressable
        onPress={onZoomIn}
        disabled={atMax}
        style={[styles.button, atMax && styles.buttonDisabled]}
        accessibilityLabel="Zoom in"
      >
        <Icon name="add" size={18} color={atMax ? colors.onSurfaceVariant : colors.onSurface} />
      </Pressable>

      <View style={styles.track}>
        <View style={[styles.fill, { height: `${pct}%` }]} />
      </View>

      <Text variant="label-sm" weight="semibold" style={styles.pct}>
        {pct}%
      </Text>

      <Pressable
        onPress={onZoomOut}
        disabled={atMin}
        style={[styles.button, atMin && styles.buttonDisabled]}
        accessibilityLabel="Zoom out"
      >
        <Icon name="remove" size={18} color={atMin ? colors.onSurfaceVariant : colors.onSurface} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: 44,
    alignItems: 'center',
    backgroundColor: colors.surfaceContainerHigh,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.outlineVariant + '33',
    paddingVertical: spacing.xs,
    gap: spacing.xs,
  },
  button: {
    width: 32,
    height: 32,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonDisabled: {
    opacity: 0.4,
  },
  track: {
    width: 6,
    height: 96,
    borderRadius: radius.full,
    backgroundColor: colors.surfaceContainerLowest,
    overflow: 'hidden',
    justifyContent: 'flex-end',
  },
  fill: {
    width: '100%',
    backgroundColor: colors.primary,
    borderRadius: radius.full,
  },
  pct: {
    color: colors.onSurface,
    minWidth: 36,
    textAlign: 'center',
  },
});
