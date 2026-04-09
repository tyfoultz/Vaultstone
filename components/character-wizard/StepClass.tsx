import { useEffect, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { useCharacterDraftStore } from '@vaultstone/store';
import { useShallow } from 'zustand/react/shallow';
import { ContentResolver } from '@vaultstone/content';
import { colors } from '@vaultstone/ui';
import type { ClassResult } from '@vaultstone/types';

const ATTRIBUTION = 'Content from the Systems Reference Document 5.1 / 2.0 is available under the Creative Commons Attribution 4.0 International License.';

export function StepClass() {
  const { srdVersion, classKey, chosenSkills, setClass: selectClass, setChosenSkills } =
    useCharacterDraftStore(
      useShallow((s) => ({
        srdVersion: s.srdVersion,
        classKey: s.classKey,
        chosenSkills: s.chosenSkills,
        setClass: s.setClass,
        setChosenSkills: s.setChosenSkills,
      }))
    );

  const [classes, setClasses] = useState<ClassResult[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    ContentResolver.search({ type: 'class', system: 'dnd5e', srdVersion, tiers: ['srd'] })
      .then((results) => setClasses(results as ClassResult[]))
      .finally(() => setLoading(false));
  }, [srdVersion]);

  const selectedClass = classes.find((c) => c.key === classKey) ?? null;

  function toggleSkill(skill: string) {
    if (chosenSkills.includes(skill)) {
      setChosenSkills(chosenSkills.filter((s) => s !== skill));
    } else if (selectedClass && chosenSkills.length < selectedClass.skillChoices.count) {
      setChosenSkills([...chosenSkills, skill]);
    }
  }

  if (loading) {
    return <ActivityIndicator color={colors.brand} style={{ marginTop: 40 }} />;
  }

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Choose a Class</Text>
      <Text style={styles.sub}>{classes.length} classes available.</Text>
      <FlatList
        data={classes}
        keyExtractor={(item) => item.key}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => {
          const selected = classKey === item.key;
          return (
            <View>
              <TouchableOpacity
                style={[styles.card, selected && styles.cardSelected]}
                onPress={() => selectClass(item.key)}
              >
                <View style={styles.cardHeader}>
                  <Text style={styles.cardName}>{item.name}</Text>
                  <Text style={styles.cardMeta}>d{item.hitDie} HD · {item.primaryAbility.join('/')}</Text>
                </View>
                {item.description ? (
                  <Text style={styles.cardDesc} numberOfLines={selected ? undefined : 2}>
                    {item.description}
                  </Text>
                ) : null}
                {selected && (
                  <View style={styles.profRow}>
                    <Text style={styles.profLabel}>Saves: </Text>
                    <Text style={styles.profValue}>{item.savingThrows.join(', ')}</Text>
                  </View>
                )}
                {selected && item.level1Features.length > 0 && (
                  <View style={styles.features}>
                    <Text style={styles.featuresLabel}>Level 1 Features</Text>
                    {item.level1Features.map((f) => (
                      <Text key={f.name} style={styles.featureItem}>
                        <Text style={styles.featureName}>{f.name}: </Text>
                        {f.description}
                      </Text>
                    ))}
                  </View>
                )}
              </TouchableOpacity>

              {selected && (
                <View style={styles.skillSection}>
                  <Text style={styles.skillLabel}>
                    Choose {item.skillChoices.count} skills ({chosenSkills.length}/{item.skillChoices.count} selected)
                  </Text>
                  <View style={styles.skillGrid}>
                    {item.skillChoices.from.map((skill) => {
                      const picked = chosenSkills.includes(skill);
                      const disabled = !picked && chosenSkills.length >= item.skillChoices.count;
                      return (
                        <TouchableOpacity
                          key={skill}
                          style={[styles.skillChip, picked && styles.skillChipSelected, disabled && styles.skillChipDisabled]}
                          onPress={() => toggleSkill(skill)}
                          disabled={disabled}
                        >
                          <Text style={[styles.skillChipText, picked && styles.skillChipTextSelected]}>
                            {skill}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              )}
            </View>
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
  profRow: { flexDirection: 'row', marginTop: 8 },
  profLabel: { fontSize: 13, color: colors.textSecondary, fontWeight: '600' },
  profValue: { fontSize: 13, color: colors.textSecondary },
  features: { marginTop: 10, gap: 6 },
  featuresLabel: { fontSize: 13, fontWeight: '700', color: colors.textPrimary, marginBottom: 4 },
  featureItem: { fontSize: 12, color: colors.textSecondary, lineHeight: 17 },
  featureName: { fontWeight: '600', color: colors.textPrimary },
  skillSection: {
    backgroundColor: colors.surface,
    borderColor: colors.brand,
    borderWidth: 1,
    borderTopWidth: 0,
    borderBottomLeftRadius: 10,
    borderBottomRightRadius: 10,
    padding: 14,
    marginTop: -4,
  },
  skillLabel: { fontSize: 13, color: colors.textSecondary, marginBottom: 10 },
  skillGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  skillChip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 6,
    paddingVertical: 5,
    paddingHorizontal: 10,
  },
  skillChipSelected: { backgroundColor: colors.brand, borderColor: colors.brand },
  skillChipDisabled: { opacity: 0.4 },
  skillChipText: { fontSize: 12, color: colors.textSecondary },
  skillChipTextSelected: { color: '#fff', fontWeight: '600' },
  attribution: {
    fontSize: 11,
    color: colors.textSecondary,
    textAlign: 'center',
    paddingHorizontal: 16,
    paddingBottom: 8,
    lineHeight: 16,
  },
});
