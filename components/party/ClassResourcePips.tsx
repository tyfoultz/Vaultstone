import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { colors } from '@vaultstone/ui';
import type { Dnd5eClassResource } from '@vaultstone/types';

interface Props {
  resources: Dnd5eClassResource[] | undefined;
  canEdit: boolean;
  onChange: (next: Dnd5eClassResource[]) => void;
}

export function ClassResourcePips({ resources, canEdit, onChange }: Props) {
  if (!resources || resources.length === 0) return null;

  function mutate(key: string, delta: number) {
    if (!canEdit || !resources) return;
    const next = resources.map((r) =>
      r.key === key
        ? { ...r, current: Math.max(0, Math.min(r.max, r.current + delta)) }
        : r,
    );
    onChange(next);
  }

  function resetToMax(key: string) {
    if (!canEdit || !resources) return;
    const next = resources.map((r) => (r.key === key ? { ...r, current: r.max } : r));
    onChange(next);
  }

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>Class Resources</Text>
      {resources.map((r) => (
        <View key={r.key} style={styles.row}>
          <Text style={styles.name} numberOfLines={1}>{r.label}</Text>
          <View style={styles.pips}>
            {Array.from({ length: r.max }).map((_, i) => {
              const filled = i < r.current;
              return (
                <TouchableOpacity
                  key={i}
                  disabled={!canEdit}
                  onPress={() => mutate(r.key, filled ? -1 : 1)}
                  onLongPress={() => resetToMax(r.key)}
                  style={[styles.pip, filled ? styles.pipFilled : styles.pipEmpty]}
                />
              );
            })}
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 4, marginTop: 4 },
  label: {
    fontSize: 10,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 2,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  name: {
    fontSize: 11,
    color: colors.textSecondary,
    fontWeight: '600',
    minWidth: 70,
  },
  pips: { flexDirection: 'row', gap: 4, flexWrap: 'wrap' },
  pip: {
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 1,
  },
  pipFilled: { backgroundColor: colors.hpWarning, borderColor: colors.hpWarning },
  pipEmpty: { backgroundColor: 'transparent', borderColor: colors.border },
});
