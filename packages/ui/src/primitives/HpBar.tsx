import { View, StyleSheet } from 'react-native';
import { colors } from '../tokens';

function hpColor(current: number, max: number): string {
  if (current <= 0) return colors.outline;
  const pct = current / max;
  if (pct > 0.5) return colors.hpHealthy;
  if (pct > 0.25) return colors.hpWarning;
  return colors.hpDanger;
}

export function HpBar({ current, max }: { current: number; max: number }) {
  const pct = max > 0 ? Math.max(0, Math.min(1, current / max)) * 100 : 0;
  const fill = hpColor(current, max);
  return (
    <View style={s.track}>
      <View style={[s.fill, { width: `${pct}%`, backgroundColor: fill }]} />
    </View>
  );
}

export { hpColor };

const s = StyleSheet.create({
  track: {
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.surfaceContainerHigh,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: 3,
  },
});
