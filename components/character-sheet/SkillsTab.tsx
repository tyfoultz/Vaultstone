import { useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, Modal, Pressable } from 'react-native';
import { colors, fonts, spacing, radius } from '@vaultstone/ui';
import type { Dnd5eStats, Dnd5eAbilityScores, SkillResult } from '@vaultstone/types';
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
  skillCatalog?: SkillResult[];
  isOwner?: boolean;
  onUpdateProficiencies?: (proficiencies: string[], expertise: string[]) => void;
  onUpdateToolProficiencies?: (proficiencies: string[], expertise: string[]) => void;
}

export function SkillsTab({ stats, scores, prof, onRoll, skillCatalog, isOwner, onUpdateProficiencies, onUpdateToolProficiencies }: Props) {
  const [detailFor, setDetailFor] = useState<{ name: string; description: string; ability: string } | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [toolEditMode, setToolEditMode] = useState(false);

  const expertise = stats.skillExpertise ?? [];
  const toolExpertise = stats.toolExpertise ?? [];

  function skillBonus(name: string) {
    const abi = SKILL_ABILITY[name];
    const base = abilityMod(scores[abi]);
    const isProf = stats.skillProficiencies.includes(name);
    const isExpert = expertise.includes(name);
    return base + (isExpert ? prof * 2 : isProf ? prof : 0);
  }

  function rollSkill(name: string) {
    const bonus = skillBonus(name);
    const r = Math.floor(Math.random() * 20) + 1;
    onRoll({ label: name, rolls: [r], bonus, total: r + bonus, crit: r === 20, fumble: r === 1 });
  }

  function openDetail(name: string) {
    if (!skillCatalog) return;
    // Skill catalog keys are slug-form ("animal-handling"), local names
    // are space-form ("animal handling"). Match either.
    const slug = name.replace(/\s+/g, '-');
    const hit = skillCatalog.find((c) => c.key === slug || c.name.toLowerCase() === name.toLowerCase());
    if (!hit) return;
    setDetailFor({ name: hit.name, description: hit.description ?? '', ability: hit.ability });
  }

  function toggleProficiency(name: string) {
    if (!onUpdateProficiencies) return;
    const profs = [...stats.skillProficiencies];
    const exp = [...expertise];
    const isProf = profs.includes(name);
    const isExpert = exp.includes(name);
    if (isExpert) {
      // expertise → remove expertise (keep proficiency)
      onUpdateProficiencies(profs, exp.filter((s) => s !== name));
    } else if (isProf) {
      // proficient → expertise
      onUpdateProficiencies(profs, [...exp, name]);
    } else {
      // untrained → proficient
      onUpdateProficiencies([...profs, name], exp);
    }
  }

  function removeProficiency(name: string) {
    if (!onUpdateProficiencies) return;
    onUpdateProficiencies(
      stats.skillProficiencies.filter((s) => s !== name),
      expertise.filter((s) => s !== name),
    );
  }

  function toggleToolExpertise(name: string) {
    if (!onUpdateToolProficiencies) return;
    const profs = [...stats.toolProficiencies];
    const exp = [...toolExpertise];
    const isExpert = exp.includes(name);
    if (isExpert) {
      onUpdateToolProficiencies(profs, exp.filter((t) => t !== name));
    } else {
      onUpdateToolProficiencies(profs, [...exp, name]);
    }
  }

  return (
    <ScrollView contentContainerStyle={s.container} showsVerticalScrollIndicator={false}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <SectionLabel>{editMode ? 'EDIT PROFICIENCIES · TAP TO CYCLE' : `SKILLS · TAP TO ROLL${skillCatalog ? ' · LONG-PRESS FOR DETAILS' : ''}`}</SectionLabel>
        {isOwner && onUpdateProficiencies ? (
          <TouchableOpacity onPress={() => setEditMode(!editMode)} style={s.editBtn}>
            <Text style={s.editBtnText}>{editMode ? 'Done' : 'Edit'}</Text>
          </TouchableOpacity>
        ) : null}
      </View>
      <View style={s.skillsCard}>
        {ALL_SKILLS.map((name, i) => {
          const isProf = stats.skillProficiencies.includes(name);
          const isExpert = expertise.includes(name);
          const bonus = skillBonus(name);
          const abi = SKILL_ABILITY[name];
          const isLast = i === ALL_SKILLS.length - 1;
          return (
            <TouchableOpacity
              key={name}
              style={[s.skillRow, !isLast && s.skillRowBorder]}
              onPress={editMode ? () => toggleProficiency(name) : () => rollSkill(name)}
              onLongPress={editMode ? () => removeProficiency(name) : skillCatalog ? () => openDetail(name) : undefined}
              delayLongPress={250}
              activeOpacity={0.7}
            >
              <View style={[s.profDot, isProf && s.profDotFilled, isExpert && s.profDotExpert]} />
              <View style={s.skillNameWrap}>
                <Text style={[s.skillName, isProf && s.skillNameProf]}>
                  {name.charAt(0).toUpperCase() + name.slice(1)}
                </Text>
                <Text style={s.skillAbi}>
                  {ABILITY_SHORT[abi]}{isExpert ? ' · EXP' : ''}
                </Text>
              </View>
              <Text style={[s.skillBonus, isProf && s.skillBonusProf]}>{fmtMod(bonus)}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <Modal visible={!!detailFor} transparent animationType="fade" onRequestClose={() => setDetailFor(null)}>
        <Pressable style={s.modalBackdrop} onPress={() => setDetailFor(null)}>
          <Pressable style={s.modalCard} onPress={(e) => e.stopPropagation()}>
            <View style={s.modalHeader}>
              <View style={{ flex: 1 }}>
                <Text style={s.modalTitle}>{detailFor?.name}</Text>
                {detailFor && (
                  <Text style={s.modalSub}>{ABILITY_SHORT[detailFor.ability as keyof Dnd5eAbilityScores] ?? detailFor.ability.toUpperCase()}</Text>
                )}
              </View>
              <TouchableOpacity onPress={() => setDetailFor(null)} hitSlop={8}>
                <Text style={s.modalClose}>Close</Text>
              </TouchableOpacity>
            </View>
            {detailFor?.description ? (
              <Text style={s.modalDesc}>{detailFor.description}</Text>
            ) : null}
          </Pressable>
        </Pressable>
      </Modal>

      <View style={s.legend}>
        <View style={s.legendItem}>
          <View style={[s.profDot, s.profDotExpert]} />
          <Text style={s.legendText}>Expertise</Text>
        </View>
        <View style={s.legendItem}>
          <View style={[s.profDot, s.profDotFilled]} />
          <Text style={s.legendText}>Proficient</Text>
        </View>
        <View style={s.legendItem}>
          <View style={s.profDot} />
          <Text style={s.legendText}>Untrained</Text>
        </View>
        {editMode ? (
          <Text style={[s.legendText, { marginLeft: 8 }]}>Long-press to remove</Text>
        ) : null}
      </View>

      {/* ── Tool Proficiencies ── */}
      {stats.toolProficiencies.length > 0 ? (
        <>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 16 }}>
            <SectionLabel>{toolEditMode ? 'TOOLS · TAP TO TOGGLE EXPERTISE' : 'TOOLS · TAP TO ROLL'}</SectionLabel>
            {isOwner && onUpdateToolProficiencies ? (
              <TouchableOpacity onPress={() => setToolEditMode(!toolEditMode)} style={s.editBtn}>
                <Text style={s.editBtnText}>{toolEditMode ? 'Done' : 'Edit'}</Text>
              </TouchableOpacity>
            ) : null}
          </View>
          <View style={s.skillsCard}>
            {stats.toolProficiencies.map((name, i) => {
              const isExpert = toolExpertise.includes(name);
              const bonus = prof * (isExpert ? 2 : 1);
              const isLast = i === stats.toolProficiencies.length - 1;
              return (
                <TouchableOpacity
                  key={name}
                  style={[s.skillRow, !isLast && s.skillRowBorder]}
                  onPress={toolEditMode ? () => toggleToolExpertise(name) : () => {
                    const r = Math.floor(Math.random() * 20) + 1;
                    onRoll({ label: name, rolls: [r], bonus, total: r + bonus, crit: r === 20, fumble: r === 1 });
                  }}
                  activeOpacity={0.7}
                >
                  <View style={[s.profDot, s.profDotFilled, isExpert && s.profDotExpert]} />
                  <View style={s.skillNameWrap}>
                    <Text style={[s.skillName, s.skillNameProf]}>
                      {name.charAt(0).toUpperCase() + name.slice(1)}
                    </Text>
                    {isExpert ? <Text style={s.skillAbi}>EXP</Text> : null}
                  </View>
                  <Text style={[s.skillBonus, s.skillBonusProf]}>{fmtMod(bonus)}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </>
      ) : null}

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
  profDotExpert: { backgroundColor: '#e6a255', borderColor: '#e6a255' },
  editBtn: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 100, borderWidth: 1, borderColor: colors.outlineVariant, marginBottom: 10 },
  editBtnText: { fontSize: 11, fontFamily: fonts.label, fontWeight: '700', color: colors.outline },
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

  modalBackdrop: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center', justifyContent: 'center', padding: spacing.lg,
  },
  modalCard: {
    width: '100%', maxWidth: 480,
    backgroundColor: colors.surfaceContainer,
    borderRadius: radius.lg, padding: spacing.lg,
    borderWidth: 1, borderColor: colors.outlineVariant,
  },
  modalHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: spacing.sm },
  modalTitle: { fontSize: 16, fontFamily: fonts.headline, fontWeight: '700', color: colors.onSurface },
  modalSub: { fontSize: 10, fontFamily: fonts.label, fontWeight: '700', letterSpacing: 1, color: colors.outline, marginTop: 2 },
  modalClose: { fontSize: 13, color: colors.primary, fontFamily: fonts.label, fontWeight: '600' },
  modalDesc: { fontSize: 13, color: colors.onSurfaceVariant, lineHeight: 19 },
});
