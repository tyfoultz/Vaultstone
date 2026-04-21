import { useEffect, useState } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, ActivityIndicator, StyleSheet,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useCharacterDraftStore } from '@vaultstone/store';
import { useShallow } from 'zustand/react/shallow';
import { ContentResolver } from '@vaultstone/content';
import { colors, fonts, spacing, radius } from '@vaultstone/ui';
import { WizardSigil } from './WizardSigil';
import type { ClassResult } from '@vaultstone/types';

const CLASS_GLYPH: Record<string, string> = {
  barbarian: 'axe', bard: 'lute', cleric: 'sun', druid: 'leaf',
  fighter: 'sword', monk: 'fist', paladin: 'shield', ranger: 'bow',
  rogue: 'dagger', sorcerer: 'spark', warlock: 'eye', wizard: 'book',
};

const CLASS_TAG: Record<string, string> = {
  barbarian: 'Martial', bard: 'Caster', cleric: 'Caster', druid: 'Caster',
  fighter: 'Martial', monk: 'Martial', paladin: 'Hybrid', ranger: 'Hybrid',
  rogue: 'Martial', sorcerer: 'Caster', warlock: 'Caster', wizard: 'Caster',
};

const FILTER_TAGS = ['All', 'Martial', 'Hybrid', 'Caster'];

interface Props {
  onPreviewChange?: (inPreview: boolean) => void;
  onAdvance?: () => void;
}

export function StepClass({ onPreviewChange, onAdvance }: Props) {
  const { srdVersion, classKey, chosenSkills, setClass: selectClass, setChosenSkills } =
    useCharacterDraftStore(
      useShallow((s) => ({
        srdVersion: s.srdVersion, classKey: s.classKey,
        chosenSkills: s.chosenSkills, setClass: s.setClass, setChosenSkills: s.setChosenSkills,
      }))
    );

  const [classes, setClasses] = useState<ClassResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [previewKey, setPreviewKey] = useState<string | null>(null);
  const [filter, setFilter] = useState('All');

  useEffect(() => {
    ContentResolver.search({ type: 'class', system: 'dnd5e', srdVersion, tiers: ['srd'] })
      .then((r) => setClasses(r as ClassResult[]))
      .finally(() => setLoading(false));
  }, [srdVersion]);

  useEffect(() => { onPreviewChange?.(!!previewKey); }, [previewKey]);

  if (loading) {
    return <View style={s.loadingWrap}><ActivityIndicator color={colors.primary} /></View>;
  }

  const preview = previewKey ? classes.find((c) => c.key === previewKey) : null;

  if (preview) {
    const isChosen = classKey === preview.key;
    const glyph = CLASS_GLYPH[preview.key] ?? 'sword';
    const skillsNeeded = preview.skillChoices.count;
    const skillsPicked = chosenSkills.length;
    const allSkillsPicked = skillsPicked >= skillsNeeded;

    function toggleSkill(skill: string) {
      if (chosenSkills.includes(skill)) {
        setChosenSkills(chosenSkills.filter((s) => s !== skill));
      } else if (skillsPicked < skillsNeeded) {
        setChosenSkills([...chosenSkills, skill]);
      }
    }

    return (
      <ScrollView contentContainerStyle={s.container} showsVerticalScrollIndicator={false}>
        <TouchableOpacity style={s.backLink} onPress={() => setPreviewKey(null)}>
          <MaterialCommunityIcons name="chevron-left" size={16} color={colors.onSurfaceVariant} />
          <Text style={s.backLinkText}>All Options</Text>
        </TouchableOpacity>

        <View style={[s.detailHeader, { borderColor: `${colors.primary}40` }]}>
          <View style={s.detailIcon}>
            <WizardSigil name={glyph} size={36} color={colors.primary} />
          </View>
          <View style={s.detailTitleWrap}>
            <Text style={s.detailTitle}>{preview.name}</Text>
            {preview.description ? (
              <Text style={s.detailSubtitle} numberOfLines={2}>{preview.description}</Text>
            ) : null}
          </View>
        </View>

        <View style={s.detailRows}>
          <DetailRow label="Primary Ability" value={preview.primaryAbility.join(' / ')} />
          <DetailRow label="Hit Die" value={`d${preview.hitDie}`} />
          <DetailRow label="Saving Throws" value={preview.savingThrows.join(', ')} />
        </View>

        {preview.level1Features.length > 0 && (
          <>
            <Text style={s.sectionLabel}>LEVEL 1 FEATURES</Text>
            <View style={s.traitList}>
              {preview.level1Features.map((f) => (
                <Text key={f.name} style={s.traitItem}>
                  <Text style={s.traitName}>{f.name}. </Text>
                  <Text style={s.traitDesc}>{f.description}</Text>
                </Text>
              ))}
            </View>
          </>
        )}

        {/* Skill picker */}
        <View style={s.skillPickerWrap}>
          <View style={s.skillPickerHeader}>
            <View>
              <Text style={s.skillPickerTitle}>CHOOSE SKILL PROFICIENCIES</Text>
              <Text style={s.skillPickerSub}>Pick {skillsNeeded} from the list.</Text>
            </View>
            <View style={s.skillCounter}>
              <Text style={[s.skillCountNum, allSkillsPicked && s.skillCountNumDone]}>{skillsPicked}</Text>
              <Text style={s.skillCountDenom}> / {skillsNeeded}</Text>
            </View>
          </View>
          <View style={s.skillChips}>
            {preview.skillChoices.from.map((skill) => {
              const picked = chosenSkills.includes(skill);
              const full = skillsPicked >= skillsNeeded && !picked;
              return (
                <TouchableOpacity
                  key={skill}
                  onPress={() => toggleSkill(skill)}
                  disabled={full}
                  style={[s.skillChip, picked && s.skillChipPicked, full && s.skillChipDisabled]}
                >
                  <Text style={[s.skillChipText, picked && s.skillChipTextPicked]}>{skill}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        <View style={{ height: 12 }} />
        <CommitBar
          isChosen={isChosen}
          commitLabel={`Choose ${preview.name}`}
          disabled={!allSkillsPicked}
          disabledLabel={!allSkillsPicked ? `Pick ${skillsNeeded - skillsPicked} more skill${skillsNeeded - skillsPicked !== 1 ? 's' : ''}` : undefined}
          onCommit={() => { selectClass(preview.key); onAdvance?.(); }}
          onDeselect={() => { selectClass(null as any); setChosenSkills([]); setPreviewKey(null); }}
          onContinue={isChosen && allSkillsPicked ? onAdvance : undefined}
          onCancel={() => setPreviewKey(null)}
        />
      </ScrollView>
    );
  }

  const shown = classes.filter((c) => filter === 'All' || CLASS_TAG[c.key] === filter);

  return (
    <ScrollView contentContainerStyle={s.container} showsVerticalScrollIndicator={false}>
      <Text style={s.title}>Choose your class</Text>
      <Text style={s.guidance}>Your class is your trade — the role you play in the party.</Text>

      {/* Filter tabs */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.filterRow} contentContainerStyle={s.filterContent}>
        {FILTER_TAGS.map((tag) => (
          <TouchableOpacity
            key={tag}
            style={[s.filterBtn, filter === tag && s.filterBtnActive]}
            onPress={() => setFilter(tag)}
          >
            <Text style={[s.filterBtnText, filter === tag && s.filterBtnTextActive]}>{tag}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <View style={s.list}>
        {shown.map((c) => {
          const selected = classKey === c.key;
          const glyph = CLASS_GLYPH[c.key] ?? 'sword';
          return (
            <TouchableOpacity
              key={c.key}
              style={[s.card, selected && s.cardSelected]}
              onPress={() => setPreviewKey(c.key)}
              activeOpacity={0.8}
            >
              {selected && <View style={s.selectedGlow} pointerEvents="none" />}
              <View style={s.cardInner}>
                <View style={[s.iconBox, selected && s.iconBoxSelected]}>
                  <WizardSigil name={glyph} size={28} color={selected ? colors.primary : colors.onSurfaceVariant} />
                </View>
                <View style={s.cardText}>
                  <View style={s.nameRow}>
                    <Text style={s.cardName}>{c.name}</Text>
                    {selected && <SelectedPip />}
                  </View>
                  <Text style={s.cardBlurb} numberOfLines={2}>{c.description ?? `d${c.hitDie} · ${c.primaryAbility.join('/')}`}</Text>
                </View>
                <MaterialCommunityIcons name="chevron-right" size={18} color={colors.outline} />
              </View>
            </TouchableOpacity>
          );
        })}
      </View>
    </ScrollView>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.detailRow}>
      <Text style={s.detailRowLabel}>{label}</Text>
      <Text style={s.detailRowValue}>{value}</Text>
    </View>
  );
}

function CommitBar({ isChosen, commitLabel, disabled, disabledLabel, onCommit, onDeselect, onContinue, onCancel }: {
  isChosen: boolean; commitLabel: string; disabled?: boolean; disabledLabel?: string;
  onCommit: () => void; onDeselect: () => void;
  onContinue?: () => void; onCancel: () => void;
}) {
  return (
    <View style={s.commitBar}>
      {disabled && disabledLabel && (
        <Text style={s.commitHint}>{disabledLabel}</Text>
      )}
      {isChosen ? (
        <View style={s.commitRow}>
          <TouchableOpacity style={s.commitSecondary} onPress={onDeselect}>
            <Text style={s.commitSecondaryText}>Deselect</Text>
          </TouchableOpacity>
          {onContinue && (
            <TouchableOpacity style={s.commitPrimary} onPress={onContinue}>
              <Text style={s.commitPrimaryText}>Continue →</Text>
            </TouchableOpacity>
          )}
        </View>
      ) : (
        <View style={s.commitRow}>
          <TouchableOpacity style={s.commitSecondary} onPress={onCancel}>
            <Text style={s.commitSecondaryText}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.commitPrimary, disabled && s.commitPrimaryDisabled]}
            onPress={disabled ? undefined : onCommit}
            activeOpacity={disabled ? 1 : 0.85}
          >
            <Text style={[s.commitPrimaryText, disabled && s.commitPrimaryTextDisabled]}>{commitLabel}</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

function SelectedPip() {
  return (
    <View style={s.pip}>
      <MaterialCommunityIcons name="check" size={10} color={colors.onPrimary} />
    </View>
  );
}

const s = StyleSheet.create({
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 40 },
  container: { paddingHorizontal: spacing.md, paddingBottom: spacing.lg },
  title: {
    fontSize: 26, fontFamily: fonts.headline, fontWeight: '700',
    color: colors.onSurface, letterSpacing: -0.5, marginTop: 12, marginBottom: 8, lineHeight: 30,
  },
  guidance: { fontSize: 13, fontFamily: fonts.body, color: colors.onSurfaceVariant, lineHeight: 19, marginBottom: 12 },
  filterRow: { marginBottom: 12 },
  filterContent: { flexDirection: 'row', gap: 6 },
  filterBtn: {
    paddingVertical: 6, paddingHorizontal: 12, borderRadius: 999,
    borderWidth: 1, borderColor: colors.outlineVariant,
  },
  filterBtnActive: {
    borderColor: colors.primary,
    backgroundColor: `${colors.primary}22`,
  },
  filterBtnText: {
    fontSize: 11, fontFamily: fonts.label, fontWeight: '600',
    letterSpacing: 0.5, textTransform: 'uppercase', color: colors.onSurfaceVariant,
  },
  filterBtnTextActive: { color: colors.primary },
  list: { gap: 10 },
  card: {
    backgroundColor: colors.surfaceContainer, borderWidth: 1,
    borderColor: colors.outlineVariant, borderRadius: radius.xl, padding: 14, overflow: 'hidden',
  },
  cardSelected: {
    borderColor: colors.primary, backgroundColor: colors.surfaceContainerHigh,
    shadowColor: colors.primary, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.2, shadowRadius: 8, elevation: 3,
  },
  selectedGlow: {
    position: 'absolute', top: 0, right: 0, width: 80, height: 80,
    borderRadius: 40, backgroundColor: colors.primaryContainer, opacity: 0.1,
  },
  cardInner: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  iconBox: {
    width: 44, height: 44, borderRadius: radius.lg,
    backgroundColor: colors.surfaceContainerHighest, borderWidth: 1,
    borderColor: colors.outlineVariant, alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  iconBoxSelected: { backgroundColor: `${colors.primaryContainer}4d`, borderColor: `${colors.primary}40` },
  cardText: { flex: 1, minWidth: 0 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 2 },
  cardName: { fontSize: 17, fontFamily: fonts.headline, fontWeight: '700', color: colors.onSurface },
  cardBlurb: { fontSize: 12, fontFamily: fonts.body, color: colors.onSurfaceVariant, lineHeight: 17, marginTop: 2 },
  pip: {
    width: 16, height: 16, borderRadius: 8, backgroundColor: colors.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  // Detail
  backLink: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    marginTop: spacing.md, marginBottom: 14, paddingVertical: 4, alignSelf: 'flex-start',
  },
  backLinkText: {
    fontSize: 12, fontFamily: fonts.label, fontWeight: '600',
    letterSpacing: 0.5, textTransform: 'uppercase', color: colors.onSurfaceVariant,
  },
  detailHeader: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 6 },
  detailIcon: {
    width: 60, height: 60, borderRadius: radius.lg,
    backgroundColor: `${colors.primaryContainer}4d`, borderWidth: 1,
    borderColor: `${colors.primary}40`, alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  detailTitleWrap: { flex: 1, minWidth: 0 },
  detailTitle: {
    fontSize: 22, fontFamily: fonts.headline, fontWeight: '700',
    color: colors.onSurface, letterSpacing: -0.5, lineHeight: 26, marginBottom: 4,
  },
  detailSubtitle: { fontSize: 12, fontFamily: fonts.body, color: colors.onSurfaceVariant, lineHeight: 17 },
  detailRows: { marginTop: 18 },
  detailRow: { flexDirection: 'row', alignItems: 'baseline', gap: 10, paddingVertical: 3 },
  detailRowLabel: {
    fontSize: 10, fontFamily: fonts.label, fontWeight: '600', letterSpacing: 1.5,
    textTransform: 'uppercase', color: colors.outline, width: 130,
  },
  detailRowValue: { fontSize: 12, fontFamily: fonts.headline, fontWeight: '700', color: colors.primary, flex: 1 },
  sectionLabel: {
    fontSize: 10, fontFamily: fonts.label, fontWeight: '600', letterSpacing: 1.5,
    textTransform: 'uppercase', color: colors.outline, marginTop: 18, marginBottom: 8,
  },
  traitList: { gap: 6 },
  traitItem: { fontSize: 12, fontFamily: fonts.body, lineHeight: 18 },
  traitName: { fontWeight: '700', color: colors.primary, fontFamily: fonts.headline },
  traitDesc: { color: colors.onSurfaceVariant },
  // Skill picker
  skillPickerWrap: {
    marginTop: 16, marginHorizontal: -spacing.md,
    paddingHorizontal: spacing.md, paddingVertical: 14,
    borderTopWidth: 1, borderBottomWidth: 1,
    borderColor: `${colors.primary}33`,
    backgroundColor: `${colors.primary}0d`,
  },
  skillPickerHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 10 },
  skillPickerTitle: {
    fontSize: 10, fontFamily: fonts.label, fontWeight: '600',
    letterSpacing: 1.5, textTransform: 'uppercase', color: colors.primary,
  },
  skillPickerSub: { fontSize: 10, color: colors.outline, marginTop: 2, fontFamily: fonts.body },
  skillCounter: {
    flexDirection: 'row', alignItems: 'baseline',
    paddingHorizontal: 8, paddingVertical: 3,
    backgroundColor: colors.surfaceContainerHigh,
    borderRadius: 999, borderWidth: 1, borderColor: colors.outlineVariant,
  },
  skillCountNum: { fontSize: 11, fontWeight: '700', color: colors.primary, fontFamily: fonts.headline },
  skillCountNumDone: { color: colors.hpHealthy },
  skillCountDenom: { fontSize: 11, color: colors.outline, fontFamily: fonts.body },
  skillChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  skillChip: {
    paddingVertical: 6, paddingHorizontal: 12, borderRadius: 999,
    borderWidth: 1, borderColor: colors.outlineVariant,
    backgroundColor: colors.surfaceContainer,
  },
  skillChipPicked: { backgroundColor: colors.primary, borderColor: colors.primary },
  skillChipDisabled: { opacity: 0.35 },
  skillChipText: { fontSize: 12, fontFamily: fonts.body, fontWeight: '600', color: colors.onSurfaceVariant },
  skillChipTextPicked: { color: colors.onPrimary },
  // Commit bar
  commitBar: { marginTop: 4, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.outlineVariant },
  commitHint: {
    fontSize: 10, fontFamily: fonts.label, textTransform: 'uppercase',
    letterSpacing: 0.5, color: colors.outline, textAlign: 'center', marginBottom: 8,
  },
  commitRow: { flexDirection: 'row', gap: 8 },
  commitSecondary: {
    paddingHorizontal: 16, paddingVertical: 13, borderRadius: radius.xl,
    borderWidth: 1, borderColor: colors.outlineVariant,
  },
  commitSecondaryText: { fontSize: 14, fontFamily: fonts.body, fontWeight: '600', color: colors.onSurfaceVariant },
  commitPrimary: {
    flex: 1, paddingVertical: 14, borderRadius: radius.xl,
    backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center',
  },
  commitPrimaryDisabled: { backgroundColor: colors.surfaceContainerHighest },
  commitPrimaryText: { fontSize: 14, fontFamily: fonts.body, fontWeight: '700', color: colors.onPrimary, letterSpacing: 0.5 },
  commitPrimaryTextDisabled: { color: colors.outline },
});
