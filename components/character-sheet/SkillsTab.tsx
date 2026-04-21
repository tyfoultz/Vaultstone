import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { colors, fonts, spacing, radius } from '@vaultstone/ui';
import type { Dnd5eStats, Dnd5eAbilityScores } from '@vaultstone/types';
import type { RollResult } from './RollToast';

const SKILL_ABILITY: Record<string, keyof Dnd5eAbilityScores> = {
  acrobatics: 'dexterity', 'animal handling': 'wisdom', arcana: 'intelligence',
  athletics: 'strength', deception: 'charisma', history: 'intelligence',
  insight: 'wisdom', intimidation: 'charisma', investigation: 'intelligence',
  medicine: 'wisdom', nature: 'intelligence', perception: 'wisdom',
  performance: 'charisma', persuasion: 'charisma', religion: 'intelligence',
  'sleight of hand': 'dexterity', stealth: 'dexterity', survival: 'wisdom',
};

const ABILITY_SHORT: Record<keyof Dnd5eAbilityScores, string> = {
  strength: 'STR', dexterity: 'DEX', constitution: 'CON',
  intelligence: 'INT', wisdom: 'WIS', charisma: 'CHA',
};

const ALL_SKILLS = Object.keys(SKILL_ABILITY);

function abilityMod(score: number) { return Math.floor((score - 10) / 2); }
function fmtMod(n: number) { return n >= 0 ? `+${n}` : `${n}`; }

interface Props {
  stats: Dnd5eStats;
  scores: Dnd5eAbilityScores;
  prof: number;
  onRoll: (result: RollResult) => void;
}

export function SkillsTab({ stats, scores, prof, onRoll }: Props) {
  function skillBonus(name: string) {
    const abi = SKILL_ABILITY[name];
    const base = abilityMod(scores[abi]);
    return base + (stats.skillProficiencies.includes(name) ? prof : 0);
  }

  function rollSkill(name: string) {
    const bonus = skillBonus(name);
    const r = Math.floor(Math.random() * 20) + 1;
    onRoll({ label: name, rolls: [r], bonus, total: r + bonus, crit: r === 20, fumble: r === 1 });
  }

  return (
    <ScrollView contentContainerStyle={s.container} showsVerticalScrollIndicator={false}>
      <SectionLabel>SKILLS · TAP TO ROLL</SectionLabel>
      <View style={s.skillsCard}>
        {ALL_SKILLS.map((name, i) => {
          const isProf = stats.skillProficiencies.includes(name);
          const bonus = skillBonus(name);
          const abi = SKILL_ABILITY[name];
          const isLast = i === ALL_SKILLS.length - 1;
          return (
            <TouchableOpacity
              key={name}
              style={[s.skillRow, !isLast && s.skillRowBorder]}
              onPress={() => rollSkill(name)}
              activeOpacity={0.7}
            >
              <View style={[s.profDot, isProf && s.profDotFilled]} />
              <View style={s.skillNameWrap}>
                <Text style={[s.skillName, isProf && s.skillNameProf]}>
                  {name.charAt(0).toUpperCase() + name.slice(1)}
                </Text>
                <Text style={s.skillAbi}>{ABILITY_SHORT[abi]}</Text>
              </View>
              <Text style={[s.skillBonus, isProf && s.skillBonusProf]}>{fmtMod(bonus)}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Legend */}
      <View style={s.legend}>
        <View style={s.legendItem}>
          <View style={[s.profDot, s.profDotFilled]} />
          <Text style={s.legendText}>Proficient</Text>
        </View>
        <View style={s.legendItem}>
          <View style={s.profDot} />
          <Text style={s.legendText}>Untrained</Text>
        </View>
      </View>

      {/* Tool proficiencies */}
      {stats.toolProficiencies.length > 0 && (
        <>
          <SectionLabel style={{ marginTop: 16 }}>TOOL PROFICIENCIES</SectionLabel>
          <View style={s.listCard}>
            {stats.toolProficiencies.map((t, i) => (
              <View key={i} style={[s.listRow, i < stats.toolProficiencies.length - 1 && s.listRowBorder]}>
                <View style={[s.profDot, s.profDotFilled]} />
                <Text style={s.listText}>{t}</Text>
              </View>
            ))}
          </View>
        </>
      )}

      {/* Languages */}
      {stats.languages.length > 0 && (
        <>
          <SectionLabel style={{ marginTop: 16 }}>LANGUAGES</SectionLabel>
          <View style={s.languageChips}>
            {stats.languages.map((l, i) => (
              <View key={i} style={s.langChip}>
                <Text style={s.langChipText}>{l}</Text>
              </View>
            ))}
          </View>
        </>
      )}

      <View style={{ height: 16 }} />
    </ScrollView>
  );
}

function SectionLabel({ children, style }: { children: string; style?: any }) {
  return (
    <View style={[s.sectionRow, style]}>
      <Text style={s.sectionLabel}>{children}</Text>
      <View style={s.sectionLine} />
    </View>
  );
}

const s = StyleSheet.create({
  container: { paddingHorizontal: spacing.md, paddingTop: 14 },

  sectionRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  sectionLabel: {
    fontSize: 9, fontFamily: fonts.label, fontWeight: '700',
    letterSpacing: 1.5, textTransform: 'uppercase', color: colors.outline,
  },
  sectionLine: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: colors.outlineVariant },

  skillsCard: {
    backgroundColor: colors.surfaceContainer,
    borderWidth: 1, borderColor: colors.outlineVariant,
    borderRadius: radius.lg, overflow: 'hidden',
  },
  skillRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 12, paddingVertical: 9,
  },
  skillRowBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.outlineVariant },
  profDot: {
    width: 10, height: 10, borderRadius: 5,
    borderWidth: 1.5, borderColor: colors.outline, flexShrink: 0,
  },
  profDotFilled: { backgroundColor: colors.primary, borderColor: colors.primary },
  skillNameWrap: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 },
  skillName: { fontSize: 13, fontFamily: fonts.body, color: colors.onSurfaceVariant },
  skillNameProf: { color: colors.onSurface, fontWeight: '600' },
  skillAbi: {
    fontSize: 9, fontFamily: fonts.label, fontWeight: '600',
    letterSpacing: 0.5, textTransform: 'uppercase', color: colors.outline,
  },
  skillBonus: {
    fontSize: 14, fontFamily: fonts.headline, fontWeight: '700',
    color: colors.onSurfaceVariant, minWidth: 32, textAlign: 'right',
  },
  skillBonusProf: { color: colors.primary },

  legend: { flexDirection: 'row', gap: 16, marginTop: 8, paddingHorizontal: 2 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendText: {
    fontSize: 10, fontFamily: fonts.label, fontWeight: '600',
    letterSpacing: 0.5, textTransform: 'uppercase', color: colors.outline,
  },

  listCard: {
    backgroundColor: colors.surfaceContainer,
    borderWidth: 1, borderColor: colors.outlineVariant,
    borderRadius: radius.lg, overflow: 'hidden',
  },
  listRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 12, paddingVertical: 10,
  },
  listRowBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.outlineVariant },
  listText: { fontSize: 13, fontFamily: fonts.body, color: colors.onSurface },

  languageChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  langChip: {
    paddingHorizontal: 12, paddingVertical: 6,
    backgroundColor: colors.surfaceContainer,
    borderWidth: 1, borderColor: colors.outlineVariant,
    borderRadius: 999,
  },
  langChipText: { fontSize: 12, fontFamily: fonts.body, color: colors.onSurface },
});
