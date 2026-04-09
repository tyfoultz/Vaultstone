import { useEffect, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { useCharacterDraftStore } from '@vaultstone/store';
import { useShallow } from 'zustand/react/shallow';
import { ContentResolver } from '@vaultstone/content';
import { colors } from '@vaultstone/ui';
import type { BackgroundResult } from '@vaultstone/types';

const ATTRIBUTION = 'Content from the Systems Reference Document 5.1 / 2.0 is available under the Creative Commons Attribution 4.0 International License.';

export function StepBackground() {
  const { srdVersion, backgroundKey, setBackground } = useCharacterDraftStore(
    useShallow((s) => ({ srdVersion: s.srdVersion, backgroundKey: s.backgroundKey, setBackground: s.setBackground }))
  );

  const [backgrounds, setBackgrounds] = useState<BackgroundResult[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    ContentResolver.search({ type: 'background', system: 'dnd5e', srdVersion, tiers: ['srd'] })
      .then((results) => setBackgrounds(results as BackgroundResult[]))
      .finally(() => setLoading(false));
  }, [srdVersion]);

  if (loading) {
    return <ActivityIndicator color={colors.brand} style={{ marginTop: 40 }} />;
  }

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Choose a Background</Text>
      <Text style={styles.sub}>{backgrounds.length} backgrounds available.</Text>
      <FlatList
        data={backgrounds}
        keyExtractor={(item) => item.key}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => {
          const selected = backgroundKey === item.key;
          return (
            <TouchableOpacity
              style={[styles.card, selected && styles.cardSelected]}
              onPress={() => setBackground(item.key)}
            >
              <Text style={styles.cardName}>{item.name}</Text>
              {item.description ? (
                <Text style={styles.cardDesc} numberOfLines={selected ? undefined : 2}>
                  {item.description}
                </Text>
              ) : null}
              {selected && (
                <View style={styles.details}>
                  <DetailRow label="Skills" value={item.skillProficiencies.join(', ')} />
                  {item.toolProficiency ? (
                    <DetailRow label="Tool" value={item.toolProficiency} />
                  ) : null}
                  {item.languages > 0 ? (
                    <DetailRow label="Languages" value={`+${item.languages}`} />
                  ) : null}
                  <DetailRow
                    label="Ability Scores"
                    value={`+2/+1 from: ${item.abilityScoreOptions.map(capitalize).join(', ')}`}
                  />
                  <DetailRow label="Origin Feat" value={item.originFeat} />
                </View>
              )}
            </TouchableOpacity>
          );
        }}
        ListFooterComponent={<Text style={styles.attribution}>{ATTRIBUTION}</Text>}
      />
    </View>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}: </Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  heading: { fontSize: 22, fontWeight: '700', color: colors.textPrimary, marginBottom: 6, paddingHorizontal: 16 },
  sub: { fontSize: 14, color: colors.textSecondary, marginBottom: 16, paddingHorizontal: 16 },
  list: { paddingHorizontal: 16, gap: 10, paddingBottom: 24 },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 10,
    padding: 14,
  },
  cardSelected: { borderColor: colors.brand },
  cardName: { fontSize: 16, fontWeight: '600', color: colors.textPrimary, marginBottom: 6 },
  cardDesc: { fontSize: 13, color: colors.textSecondary, lineHeight: 18 },
  details: { marginTop: 10, gap: 5 },
  detailRow: { flexDirection: 'row' },
  detailLabel: { fontSize: 13, fontWeight: '600', color: colors.textSecondary },
  detailValue: { fontSize: 13, color: colors.textSecondary, flex: 1 },
  attribution: {
    fontSize: 11,
    color: colors.textSecondary,
    textAlign: 'center',
    paddingHorizontal: 16,
    paddingBottom: 8,
    lineHeight: 16,
  },
});
