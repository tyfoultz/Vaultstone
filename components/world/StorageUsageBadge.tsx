import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { getMyStorageUsage } from '@vaultstone/api';
import { Icon, Text, colors, fonts, radius, spacing } from '@vaultstone/ui';

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function StorageUsageBadge() {
  const [usage, setUsage] = useState<{
    usedBytes: number;
    capBytes: number;
    pct: number;
    warn: boolean;
    blocked: boolean;
  } | null>(null);

  useEffect(() => {
    getMyStorageUsage().then(setUsage);
  }, []);

  if (!usage || usage.pct < 0.5) return null;

  const barColor = usage.blocked
    ? colors.hpDanger
    : usage.warn
    ? colors.hpWarning
    : colors.player;

  return (
    <View style={styles.root}>
      <View style={styles.row}>
        <Icon
          name={usage.blocked ? 'error' : usage.warn ? 'warning' : 'cloud'}
          size={12}
          color={barColor}
        />
        <Text style={[styles.label, { color: barColor }]}>
          {formatBytes(usage.usedBytes)} / {formatBytes(usage.capBytes)}
        </Text>
      </View>
      <View style={styles.barTrack}>
        <View
          style={[
            styles.barFill,
            { width: `${Math.min(usage.pct * 100, 100)}%`, backgroundColor: barColor },
          ]}
        />
      </View>
      {usage.blocked ? (
        <Text style={styles.warnText}>Storage full — delete images or maps to upload more</Text>
      ) : usage.warn ? (
        <Text style={styles.warnText}>Approaching storage limit</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    gap: 4,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  label: {
    fontFamily: fonts.label,
    fontSize: 11,
    letterSpacing: 0.5,
  },
  barTrack: {
    height: 3,
    backgroundColor: colors.surfaceContainerHighest,
    borderRadius: 2,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: 2,
  },
  warnText: {
    fontFamily: fonts.label,
    fontSize: 10,
    color: colors.hpWarning,
  },
});
