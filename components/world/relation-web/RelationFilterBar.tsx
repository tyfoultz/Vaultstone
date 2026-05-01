import { Pressable, StyleSheet, View } from 'react-native';
import type { PageKind } from '@vaultstone/types';
import { Text, colors, radius, spacing } from '@vaultstone/ui';

import { EDGE_SOURCE_LABEL, EDGE_STYLE, KIND_COLOR, KIND_LABEL, type EdgeSource } from './constants';

type Props = {
  visibleKinds: Set<string>;
  visibleEdgeSources: Set<EdgeSource>;
  availableKinds: PageKind[];
  onToggleKind: (kind: string) => void;
  onToggleEdgeSource: (source: EdgeSource) => void;
};

function KindChip({ kind, active, onPress }: { kind: string; active: boolean; onPress: () => void }) {
  const dotColor = KIND_COLOR[kind] ?? colors.onSurfaceVariant;
  return (
    <Pressable
      onPress={onPress}
      style={[styles.chip, active ? styles.chipActive : styles.chipInactive]}
    >
      <View style={[styles.dot, { backgroundColor: dotColor }]} />
      <Text variant="label-sm" style={{ color: active ? colors.onSurface : colors.outline }}>
        {KIND_LABEL[kind] ?? kind}
      </Text>
    </Pressable>
  );
}

function EdgeChip({ source, active, onPress }: { source: EdgeSource; active: boolean; onPress: () => void }) {
  const style = EDGE_STYLE[source];
  return (
    <Pressable
      onPress={onPress}
      style={[styles.chip, active ? styles.chipActive : styles.chipInactive]}
    >
      <View style={styles.linePreview}>
        <View
          style={[
            styles.lineSegment,
            {
              backgroundColor: source === 'mention' ? 'transparent' : style.color,
              borderBottomColor: source === 'mention' ? style.color : 'transparent',
              borderBottomWidth: source === 'mention' ? 1 : 0,
              borderStyle: source === 'mention' ? 'dashed' : 'solid',
              height: source === 'mention' ? 0 : style.width,
            },
          ]}
        />
      </View>
      <Text variant="label-sm" style={{ color: active ? colors.onSurface : colors.outline }}>
        {EDGE_SOURCE_LABEL[source]}
      </Text>
    </Pressable>
  );
}

export function RelationFilterBar({
  visibleKinds,
  visibleEdgeSources,
  availableKinds,
  onToggleKind,
  onToggleEdgeSource,
}: Props) {
  const edgeSources: EdgeSource[] = ['manual', 'structural', 'mention'];

  return (
    <View style={styles.bar}>
      <View style={styles.row}>
        <Text variant="label-sm" uppercase style={styles.rowLabel}>Show</Text>
        {availableKinds.map((k) => (
          <KindChip
            key={k}
            kind={k}
            active={visibleKinds.has(k)}
            onPress={() => onToggleKind(k)}
          />
        ))}
      </View>
      <View style={styles.row}>
        <Text variant="label-sm" uppercase style={styles.rowLabel}>Edges</Text>
        {edgeSources.map((s) => (
          <EdgeChip
            key={s}
            source={s}
            active={visibleEdgeSources.has(s)}
            onPress={() => onToggleEdgeSource(s)}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: 6,
    borderBottomWidth: 1,
    borderBottomColor: colors.outlineVariant + '33',
    backgroundColor: colors.surfaceCanvas,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  rowLabel: {
    color: colors.outline,
    letterSpacing: 1,
    marginRight: 4,
    minWidth: 42,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  chipActive: {
    borderColor: colors.outlineVariant,
    backgroundColor: colors.surfaceContainerHigh + '88',
  },
  chipInactive: {
    borderColor: colors.outlineVariant + '44',
    backgroundColor: 'transparent',
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  linePreview: {
    width: 16,
    height: 10,
    justifyContent: 'center',
  },
  lineSegment: {
    width: 16,
  },
});
