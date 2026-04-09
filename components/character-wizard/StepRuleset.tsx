import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useCharacterDraftStore } from '@vaultstone/store';
import { useShallow } from 'zustand/react/shallow';
import { colors } from '@vaultstone/ui';

const RULESETS = [
  {
    system: 'dnd5e',
    srdVersion: 'SRD_2.0' as const,
    label: 'D&D 5e (2024)',
    subtitle: 'SRD 2.0 — Updated rules, 10 species, 14 backgrounds',
  },
  {
    system: 'dnd5e',
    srdVersion: 'SRD_5.1' as const,
    label: 'D&D 5e (2014)',
    subtitle: 'SRD 5.1 — Classic rules, 9 species, 1 background',
  },
] as const;

export function StepRuleset() {
  const { srdVersion, setRuleset } = useCharacterDraftStore(
    useShallow((s) => ({ srdVersion: s.srdVersion, setRuleset: s.setRuleset }))
  );

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Choose a Ruleset</Text>
      <Text style={styles.sub}>Select the edition you're playing.</Text>
      {RULESETS.map((r) => {
        const selected = srdVersion === r.srdVersion;
        return (
          <TouchableOpacity
            key={r.srdVersion}
            style={[styles.card, selected && styles.cardSelected]}
            onPress={() => setRuleset(r.system, r.srdVersion)}
          >
            <View style={styles.cardRow}>
              <View style={[styles.radio, selected && styles.radioSelected]} />
              <View style={styles.cardText}>
                <Text style={styles.cardLabel}>{r.label}</Text>
                <Text style={styles.cardSub}>{r.subtitle}</Text>
              </View>
            </View>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 16 },
  heading: { fontSize: 22, fontWeight: '700', color: colors.textPrimary, marginBottom: 6 },
  sub: { fontSize: 14, color: colors.textSecondary, marginBottom: 24 },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 10,
    padding: 16,
    marginBottom: 12,
  },
  cardSelected: {
    borderColor: colors.brand,
  },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: colors.border,
  },
  radioSelected: {
    borderColor: colors.brand,
    backgroundColor: colors.brand,
  },
  cardText: { flex: 1 },
  cardLabel: { fontSize: 16, fontWeight: '600', color: colors.textPrimary, marginBottom: 2 },
  cardSub: { fontSize: 13, color: colors.textSecondary },
});
