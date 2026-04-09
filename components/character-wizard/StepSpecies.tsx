import { useEffect, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { useCharacterDraftStore } from '@vaultstone/store';
import { useShallow } from 'zustand/react/shallow';
import { ContentResolver } from '@vaultstone/content';
import { colors } from '@vaultstone/ui';
import type { SpeciesResult } from '@vaultstone/types';

const ATTRIBUTION = 'Content from the Systems Reference Document 5.1 / 2.0 is available under the Creative Commons Attribution 4.0 International License.';

export function StepSpecies() {
  const { srdVersion, speciesKey, setSpecies } = useCharacterDraftStore(
    useShallow((s) => ({ srdVersion: s.srdVersion, speciesKey: s.speciesKey, setSpecies: s.setSpecies }))
  );

  const [species, setSpeciesList] = useState<SpeciesResult[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    ContentResolver.search({ type: 'species', system: 'dnd5e', srdVersion, tiers: ['srd'] })
      .then((results) => setSpeciesList(results as SpeciesResult[]))
      .finally(() => setLoading(false));
  }, [srdVersion]);

  if (loading) {
    return <ActivityIndicator color={colors.brand} style={{ marginTop: 40 }} />;
  }

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Choose a Species</Text>
      <Text style={styles.sub}>{species.length} species available for {srdVersion}.</Text>
      <FlatList
        data={species}
        keyExtractor={(item) => item.key}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => {
          const selected = speciesKey === item.key;
          return (
            <TouchableOpacity
              style={[styles.card, selected && styles.cardSelected]}
              onPress={() => setSpecies(item.key)}
            >
              <View style={styles.cardHeader}>
                <Text style={styles.cardName}>{item.name}</Text>
                <Text style={styles.cardMeta}>{item.size} · {item.speed} ft.</Text>
              </View>
              {item.description ? (
                <Text style={styles.cardDesc} numberOfLines={selected ? undefined : 2}>
                  {item.description}
                </Text>
              ) : null}
              {selected && item.traits.length > 0 && (
                <View style={styles.traits}>
                  {item.traits.map((t) => (
                    <Text key={t.name} style={styles.traitItem}>
                      <Text style={styles.traitName}>{t.name}: </Text>
                      {t.description}
                    </Text>
                  ))}
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
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 },
  cardName: { fontSize: 16, fontWeight: '600', color: colors.textPrimary },
  cardMeta: { fontSize: 12, color: colors.textSecondary },
  cardDesc: { fontSize: 13, color: colors.textSecondary, lineHeight: 18 },
  traits: { marginTop: 10, gap: 6 },
  traitItem: { fontSize: 12, color: colors.textSecondary, lineHeight: 17 },
  traitName: { fontWeight: '600', color: colors.textPrimary },
  attribution: {
    fontSize: 11,
    color: colors.textSecondary,
    textAlign: 'center',
    paddingHorizontal: 16,
    paddingBottom: 8,
    lineHeight: 16,
  },
});
