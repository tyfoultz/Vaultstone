import { useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { colors, fonts, spacing, radius } from '@vaultstone/ui';
import type { Dnd5eStats, Dnd5eResources, Dnd5eAbilityScores, Dnd5ePreparedSpell } from '@vaultstone/types';

const ABILITY_SHORT: Record<string, string> = {
  strength: 'STR', dexterity: 'DEX', constitution: 'CON',
  intelligence: 'INT', wisdom: 'WIS', charisma: 'CHA',
};

const SCHOOL_COLORS: Record<string, string> = {
  abjuration: '#adc6ff',
  conjuration: '#b5e8b0',
  divination: '#f5c518',
  enchantment: '#ffb3de',
  evocation: '#ff8a65',
  illusion: '#ce93d8',
  necromancy: '#78909c',
  transmutation: '#a5d6a7',
};

function abilityMod(score: number) { return Math.floor((score - 10) / 2); }
function fmtMod(n: number) { return n >= 0 ? `+${n}` : `${n}`; }

const DEFAULT_SLOTS: Dnd5eResources['spellSlots'] = {
  1: { max: 2, remaining: 2 }, 2: { max: 0, remaining: 0 }, 3: { max: 0, remaining: 0 },
  4: { max: 0, remaining: 0 }, 5: { max: 0, remaining: 0 }, 6: { max: 0, remaining: 0 },
  7: { max: 0, remaining: 0 }, 8: { max: 0, remaining: 0 }, 9: { max: 0, remaining: 0 },
};

interface Props {
  stats: Dnd5eStats;
  resources: Dnd5eResources;
  scores: Dnd5eAbilityScores;
  prof: number;
  isOwner: boolean;
  onSpellSlotChange?: (level: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9, delta: -1 | 1) => void;
  onConcentrationClear?: () => void;
}

export function SpellsTab({
  stats, resources, scores, prof, isOwner, onSpellSlotChange, onConcentrationClear,
}: Props) {
  const spellAbility = stats.spellcastingAbility;
  const isSpellcaster = !!spellAbility;
  const spellSlots = resources.spellSlots ?? (isSpellcaster ? DEFAULT_SLOTS : null);
  const concentration = resources.concentrationSpell ?? null;
  const preparedSpells = resources.preparedSpells ?? [];

  const spellMod = spellAbility ? abilityMod(scores[spellAbility as keyof Dnd5eAbilityScores] ?? 10) : null;
  const spellDC = spellMod !== null ? 8 + prof + spellMod : null;
  const spellAttack = spellMod !== null ? prof + spellMod : null;

  const cantrips = preparedSpells.filter((s) => s.level === 0);
  const spellsByLevel = [1, 2, 3, 4, 5, 6, 7, 8, 9].map((lvl) => ({
    level: lvl,
    spells: preparedSpells.filter((s) => s.level === lvl),
    slot: spellSlots?.[lvl as 1] ?? null,
  })).filter((g) => g.spells.length > 0 || (g.slot && g.slot.max > 0));

  return (
    <ScrollView contentContainerStyle={s.container} showsVerticalScrollIndicator={false}>

      {/* ── SPELLCASTING STATS ── */}
      {spellAbility && (
        <>
          <SectionLabel>SPELLCASTING</SectionLabel>
          <View style={s.statsRow}>
            <StatTile label="ABILITY" value={ABILITY_SHORT[spellAbility] ?? spellAbility.toUpperCase()} />
            <StatTile label="SPELL DC" value={spellDC !== null ? String(spellDC) : '—'} accent />
            <StatTile label="ATTACK" value={spellAttack !== null ? fmtMod(spellAttack) : '—'} accent />
          </View>
        </>
      )}

      {/* ── CONCENTRATION ── */}
      {concentration && (
        <>
          <SectionLabel style={{ marginTop: 14 }} accent>CONCENTRATION</SectionLabel>
          <View style={s.concentrationCard}>
            <MaterialCommunityIcons name="focus-field" size={16} color={colors.primary} />
            <Text style={s.concentrationName} numberOfLines={1}>{concentration}</Text>
            {isOwner && (
              <TouchableOpacity
                style={s.concentrationEnd}
                onPress={onConcentrationClear}
                activeOpacity={0.7}
              >
                <Text style={s.concentrationEndText}>End</Text>
              </TouchableOpacity>
            )}
          </View>
        </>
      )}

      {/* ── SPELL SLOTS ── */}
      {spellSlots && (
        <>
          <SectionLabel style={{ marginTop: 14 }} accent>SPELL SLOTS</SectionLabel>
          <View style={s.slotsGrid}>
            {([1, 2, 3, 4, 5, 6, 7, 8, 9] as const).map((lvl) => {
              const slot = spellSlots[lvl];
              if (slot.max === 0) return null;
              return (
                <View key={lvl} style={s.slotCard}>
                  <Text style={s.slotLevel}>LVL {lvl}</Text>
                  <View style={s.slotPips}>
                    {Array.from({ length: slot.max }).map((_, i) => (
                      <TouchableOpacity
                        key={i}
                        onPress={() => {
                          if (!isOwner || !onSpellSlotChange) return;
                          onSpellSlotChange(lvl, i < slot.remaining ? -1 : 1);
                        }}
                        activeOpacity={isOwner ? 0.7 : 1}
                      >
                        <View style={[s.slotPip, i < slot.remaining ? s.slotPipFull : s.slotPipEmpty]} />
                      </TouchableOpacity>
                    ))}
                  </View>
                  <Text style={s.slotCount}>{slot.remaining}/{slot.max}</Text>
                </View>
              );
            })}
          </View>
        </>
      )}

      {/* ── CANTRIPS ── */}
      {cantrips.length > 0 && (
        <>
          <SectionLabel style={{ marginTop: 14 }}>CANTRIPS</SectionLabel>
          <View style={s.spellsCard}>
            {cantrips.map((spell, i) => (
              <SpellRow
                key={spell.id}
                spell={spell}
                isLast={i === cantrips.length - 1}
              />
            ))}
          </View>
        </>
      )}

      {/* ── PREPARED SPELLS (by level) ── */}
      {spellsByLevel.map(({ level, spells, slot }) => (
        spells.length > 0 ? (
          <View key={level}>
            <SectionLabel style={{ marginTop: 14 }}>
              {`LEVEL ${level}${slot ? ` · ${slot.remaining}/${slot.max} SLOTS` : ''}`}
            </SectionLabel>
            <View style={s.spellsCard}>
              {spells.map((spell, i) => (
                <SpellRow
                  key={spell.id}
                  spell={spell}
                  isLast={i === spells.length - 1}
                />
              ))}
            </View>
          </View>
        ) : null
      ))}

      {/* ── EMPTY STATE ── */}
      {preparedSpells.length === 0 && !spellAbility && (
        <View style={s.emptyState}>
          <MaterialCommunityIcons name="auto-fix" size={32} color={colors.outlineVariant} />
          <Text style={s.emptyTitle}>No Spells</Text>
          <Text style={s.emptyBody}>
            This character has no spellcasting ability. Spells can be added once a spellcasting class is selected.
          </Text>
        </View>
      )}
      {preparedSpells.length === 0 && spellAbility && (
        <View style={s.emptyState}>
          <MaterialCommunityIcons name="book-open-outline" size={32} color={colors.outlineVariant} />
          <Text style={s.emptyTitle}>No Spells Prepared</Text>
          <Text style={s.emptyBody}>
            Spell management is coming soon. Slots and concentration are tracked above.
          </Text>
        </View>
      )}

      <View style={{ height: 16 }} />
    </ScrollView>
  );
}

function SectionLabel({ children, style, accent }: { children: string; style?: any; accent?: boolean }) {
  return (
    <View style={[s.sectionRow, style]}>
      <Text style={[s.sectionLabel, accent && s.sectionLabelAccent]}>{children}</Text>
      <View style={[s.sectionLine, accent && s.sectionLineAccent]} />
    </View>
  );
}

function StatTile({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <View style={s.statTile}>
      <Text style={s.statLabel}>{label}</Text>
      <Text style={[s.statValue, accent && s.statValueAccent]}>{value}</Text>
    </View>
  );
}

function SpellRow({ spell, isLast }: { spell: Dnd5ePreparedSpell; isLast: boolean }) {
  const schoolColor = spell.school ? (SCHOOL_COLORS[spell.school.toLowerCase()] ?? colors.outline) : colors.outline;
  return (
    <View style={[s.spellRow, !isLast && s.spellRowBorder]}>
      {spell.school && (
        <View style={[s.schoolDot, { backgroundColor: schoolColor }]} />
      )}
      <View style={s.spellInfo}>
        <Text style={s.spellName}>{spell.name}</Text>
        {spell.school && <Text style={s.spellSchool}>{spell.school}</Text>}
      </View>
      <View style={s.spellBadges}>
        {spell.ritual && (
          <View style={s.badge}>
            <Text style={s.badgeText}>R</Text>
          </View>
        )}
        {spell.concentration && (
          <View style={[s.badge, s.badgeConc]}>
            <Text style={[s.badgeText, s.badgeTextConc]}>C</Text>
          </View>
        )}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  container: { paddingHorizontal: spacing.md, paddingTop: 14, paddingBottom: 16 },

  sectionRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  sectionLabel: {
    fontSize: 9, fontFamily: fonts.label, fontWeight: '700',
    letterSpacing: 1.5, textTransform: 'uppercase', color: colors.outline,
  },
  sectionLabelAccent: { color: colors.primary },
  sectionLine: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: colors.outlineVariant },
  sectionLineAccent: { backgroundColor: `${colors.primary}44` },

  // Spellcasting stats
  statsRow: { flexDirection: 'row', gap: 8 },
  statTile: {
    flex: 1, alignItems: 'center', paddingVertical: 10, paddingHorizontal: 6,
    backgroundColor: colors.surfaceContainer,
    borderWidth: 1, borderColor: colors.outlineVariant,
    borderRadius: radius.lg,
  },
  statLabel: {
    fontSize: 8, fontFamily: fonts.label, fontWeight: '700',
    letterSpacing: 1.5, color: colors.outline, marginBottom: 4,
  },
  statValue: {
    fontSize: 20, fontFamily: fonts.headline, fontWeight: '800', color: colors.onSurface,
  },
  statValueAccent: { color: colors.primary },

  // Concentration
  concentrationCard: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 14, paddingVertical: 11,
    backgroundColor: `${colors.primary}14`,
    borderWidth: 1, borderColor: `${colors.primary}44`,
    borderRadius: radius.lg,
  },
  concentrationName: {
    flex: 1, fontSize: 14, fontFamily: fonts.headline, fontWeight: '600', color: colors.onSurface,
  },
  concentrationEnd: {
    paddingHorizontal: 10, paddingVertical: 4,
    backgroundColor: colors.surfaceContainerHighest,
    borderWidth: 1, borderColor: colors.outlineVariant,
    borderRadius: radius.lg,
  },
  concentrationEndText: {
    fontSize: 11, fontFamily: fonts.label, fontWeight: '700', color: colors.outline,
  },

  // Spell slots grid
  slotsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  slotCard: {
    alignItems: 'center',
    paddingHorizontal: 10, paddingVertical: 8,
    backgroundColor: colors.surfaceContainer,
    borderWidth: 1, borderColor: `${colors.primary}44`,
    borderRadius: radius.lg, gap: 5,
  },
  slotLevel: {
    fontSize: 8, fontFamily: fonts.label, fontWeight: '700',
    letterSpacing: 1.5, color: colors.primary,
  },
  slotPips: { flexDirection: 'row', gap: 4 },
  slotPip: { width: 10, height: 10, borderRadius: 5, borderWidth: 1.5 },
  slotPipFull: { backgroundColor: colors.primary, borderColor: colors.primary },
  slotPipEmpty: { backgroundColor: 'transparent', borderColor: colors.outlineVariant },
  slotCount: {
    fontSize: 10, fontFamily: fonts.headline, fontWeight: '600', color: colors.onSurfaceVariant,
  },

  // Spells list
  spellsCard: {
    backgroundColor: colors.surfaceContainer,
    borderWidth: 1, borderColor: colors.outlineVariant,
    borderRadius: radius.lg, overflow: 'hidden',
  },
  spellRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 12, paddingVertical: 10,
  },
  spellRowBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.outlineVariant },
  schoolDot: { width: 8, height: 8, borderRadius: 4, flexShrink: 0 },
  spellInfo: { flex: 1, minWidth: 0 },
  spellName: { fontSize: 13, fontFamily: fonts.body, fontWeight: '600', color: colors.onSurface },
  spellSchool: {
    fontSize: 9, fontFamily: fonts.label, fontWeight: '600',
    textTransform: 'capitalize', color: colors.outline, marginTop: 1,
  },
  spellBadges: { flexDirection: 'row', gap: 4 },
  badge: {
    width: 18, height: 18, borderRadius: 9,
    borderWidth: 1, borderColor: colors.outlineVariant,
    alignItems: 'center', justifyContent: 'center',
  },
  badgeConc: { borderColor: `${colors.primary}66`, backgroundColor: `${colors.primary}18` },
  badgeText: { fontSize: 9, fontFamily: fonts.label, fontWeight: '700', color: colors.outline },
  badgeTextConc: { color: colors.primary },

  // Empty state
  emptyState: {
    alignItems: 'center', paddingVertical: 40, paddingHorizontal: 20, gap: 10,
  },
  emptyTitle: {
    fontSize: 15, fontFamily: fonts.headline, fontWeight: '700', color: colors.onSurfaceVariant,
  },
  emptyBody: {
    fontSize: 13, fontFamily: fonts.body, color: colors.outline,
    textAlign: 'center', lineHeight: 19,
  },
});
