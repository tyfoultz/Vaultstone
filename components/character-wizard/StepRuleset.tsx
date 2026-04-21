import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { useCharacterDraftStore } from '@vaultstone/store';
import { useShallow } from 'zustand/react/shallow';
import { colors, fonts, spacing, radius } from '@vaultstone/ui';

const RULESETS = [
  {
    system: 'dnd5e',
    srdVersion: 'SRD_2.0' as const,
    label: 'D&D 5e',
    year: '2024',
    subtitle: 'SRD 2.0',
    blurb: 'Updated rules. 10 species, 14 backgrounds, origin feats.',
    tag: 'Recommended',
  },
  {
    system: 'dnd5e',
    srdVersion: 'SRD_5.1' as const,
    label: 'D&D 5e',
    year: '2014',
    subtitle: 'SRD 5.1',
    blurb: 'Classic rules. 9 species, 1 background.',
    tag: 'Classic',
  },
] as const;

export function StepRuleset() {
  const { srdVersion, setRuleset } = useCharacterDraftStore(
    useShallow((s) => ({ srdVersion: s.srdVersion, setRuleset: s.setRuleset }))
  );

  return (
    <ScrollView contentContainerStyle={s.container} showsVerticalScrollIndicator={false}>
      <Text style={s.title}>Choose a ruleset</Text>
      <Text style={s.guidance}>Both editions are fully playable. The 2024 rules are smoother for new players.</Text>

      <View style={s.list}>
        {RULESETS.map((r) => {
          const selected = srdVersion === r.srdVersion;
          return (
            <TouchableOpacity
              key={r.srdVersion}
              style={[s.card, selected && s.cardSelected]}
              onPress={() => setRuleset(r.system, r.srdVersion)}
              activeOpacity={0.8}
            >
              {selected && <View style={s.selectedGlow} pointerEvents="none" />}
              <View style={s.cardInner}>
                <View style={[s.radio, selected && s.radioSelected]} />
                <View style={s.cardText}>
                  <Text style={s.cardName}>
                    {r.label}{' '}
                    <Text style={s.cardYear}>{r.year}</Text>
                  </Text>
                  <Text style={s.cardBlurb}>{r.blurb}</Text>
                  <View style={s.tagRow}>
                    <Text style={s.metaLabel}>{r.subtitle}</Text>
                    <View style={[s.tagPill, r.tag === 'Recommended' && s.tagPillRecommended]}>
                      <Text style={[s.tagText, r.tag === 'Recommended' && s.tagTextRecommended]}>
                        {r.tag}
                      </Text>
                    </View>
                  </View>
                </View>
              </View>
            </TouchableOpacity>
          );
        })}
      </View>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.lg,
  },
  title: {
    fontSize: 26,
    fontFamily: fonts.headline,
    fontWeight: '700',
    color: colors.onSurface,
    letterSpacing: -0.5,
    marginTop: 12,
    marginBottom: 8,
    lineHeight: 30,
  },
  guidance: {
    fontSize: 13,
    fontFamily: fonts.body,
    color: colors.onSurfaceVariant,
    lineHeight: 19,
    marginBottom: 16,
  },
  list: {
    gap: 10,
  },
  card: {
    backgroundColor: colors.surfaceContainer,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    borderRadius: radius.xl,
    padding: 14,
    overflow: 'hidden',
  },
  cardSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.surfaceContainerHigh,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 4,
  },
  selectedGlow: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.primaryContainer,
    opacity: 0.12,
  },
  cardInner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  radio: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: colors.outlineVariant,
    marginTop: 3,
    flexShrink: 0,
  },
  radioSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primary,
  },
  cardText: {
    flex: 1,
  },
  cardName: {
    fontSize: 19,
    fontFamily: fonts.headline,
    fontWeight: '700',
    color: colors.onSurface,
    letterSpacing: -0.5,
    marginBottom: 6,
  },
  cardYear: {
    color: colors.primary,
  },
  cardBlurb: {
    fontSize: 13,
    fontFamily: fonts.body,
    color: colors.onSurfaceVariant,
    lineHeight: 18,
    marginBottom: 8,
  },
  tagRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  metaLabel: {
    fontSize: 10,
    fontFamily: fonts.label,
    fontWeight: '600',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    color: colors.outline,
  },
  tagPill: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: colors.surfaceContainerHighest,
  },
  tagPillRecommended: {
    backgroundColor: colors.playerContainer,
  },
  tagText: {
    fontSize: 10,
    fontFamily: fonts.label,
    fontWeight: '600',
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: colors.outline,
  },
  tagTextRecommended: {
    color: colors.player,
  },
});
