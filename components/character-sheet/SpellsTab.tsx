import { useState, useMemo } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, TextInput, StyleSheet, useWindowDimensions,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { colors, fonts, radius } from '@vaultstone/ui';
import type { Dnd5eStats, Dnd5eResources, Dnd5eAbilityScores, Dnd5ePreparedSpell } from '@vaultstone/types';

function abilityMod(score: number) { return Math.floor((score - 10) / 2); }
function fmtMod(n: number) { return n >= 0 ? `+${n}` : `${n}`; }
function capitalize(str: string) { return str.charAt(0).toUpperCase() + str.slice(1); }

const DEFAULT_SLOTS: Dnd5eResources['spellSlots'] = {
  1: { max: 2, remaining: 2 }, 2: { max: 0, remaining: 0 }, 3: { max: 0, remaining: 0 },
  4: { max: 0, remaining: 0 }, 5: { max: 0, remaining: 0 }, 6: { max: 0, remaining: 0 },
  7: { max: 0, remaining: 0 }, 8: { max: 0, remaining: 0 }, 9: { max: 0, remaining: 0 },
};

const CHIP_LABELS = ['-0-', '1ST', '2ND', '3RD', '4TH', '5TH', '6TH', '7TH', '8TH', '9TH'];
const LEVEL_LABELS = ['', '1ST LEVEL', '2ND LEVEL', '3RD LEVEL', '4TH LEVEL', '5TH LEVEL', '6TH LEVEL', '7TH LEVEL', '8TH LEVEL', '9TH LEVEL'];

type FilterKey = 'all' | 'conc' | number;

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
  const { width } = useWindowDimensions();
  const isWide = width >= 560;
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<FilterKey>('all');

  const spellAbility = stats.spellcastingAbility;
  const isSpellcaster = !!spellAbility;
  const spellSlots = resources.spellSlots ?? (isSpellcaster ? DEFAULT_SLOTS : null);
  const preparedSpells = resources.preparedSpells ?? [];
  const concentration = resources.concentrationSpell ?? null;

  const spellMod = spellAbility
    ? abilityMod(scores[spellAbility as keyof Dnd5eAbilityScores] ?? 10)
    : null;
  const spellDC = spellMod !== null ? 8 + prof + spellMod : null;
  const spellAttack = spellMod !== null ? prof + spellMod : null;

  const availableLevels = useMemo(() => {
    const levels = new Set<number>();
    preparedSpells.forEach((s) => levels.add(s.level));
    if (spellSlots) {
      ([1, 2, 3, 4, 5, 6, 7, 8, 9] as const).forEach((l) => {
        if (spellSlots[l].max > 0) levels.add(l);
      });
    }
    return [...levels].sort((a, b) => a - b);
  }, [preparedSpells, spellSlots]);

  const filteredSpells = useMemo(() => {
    let spells = preparedSpells;
    if (search.trim()) {
      const q = search.toLowerCase();
      spells = spells.filter((s) =>
        s.name.toLowerCase().includes(q) ||
        s.notes?.toLowerCase().includes(q) ||
        s.school?.toLowerCase().includes(q) ||
        s.source?.toLowerCase().includes(q)
      );
    }
    if (filter === 'conc') return spells.filter((s) => s.concentration);
    if (filter !== 'all') return spells.filter((s) => s.level === filter);
    return spells;
  }, [preparedSpells, search, filter]);

  const cantrips = filteredSpells.filter((s) => s.level === 0);
  const leveledGroups = ([1, 2, 3, 4, 5, 6, 7, 8, 9] as const).map((lvl) => ({
    level: lvl,
    spells: filteredSpells.filter((s) => s.level === lvl),
    slot: spellSlots?.[lvl] ?? null,
  })).filter((g) => {
    if (filter !== 'all' && filter !== 'conc' && filter !== g.level) return false;
    return g.spells.length > 0 || (g.slot && g.slot.max > 0);
  });

  return (
    <ScrollView contentContainerStyle={s.container} showsVerticalScrollIndicator={false}>

      {/* ── Spellcasting stats header ── */}
      {spellAbility && (
        <View style={s.statsRow}>
          <View style={s.statBlock}>
            <Text style={s.statValue}>{spellMod !== null ? fmtMod(spellMod) : '—'}</Text>
            <Text style={s.statLabel}>MODIFIER</Text>
          </View>
          <View style={s.statDivider} />
          <View style={s.statBlock}>
            <Text style={s.statValue}>{spellAttack !== null ? fmtMod(spellAttack) : '—'}</Text>
            <Text style={s.statLabel}>SPELL ATTACK</Text>
          </View>
          <View style={s.statDivider} />
          <View style={s.statBlock}>
            <Text style={s.statValue}>{spellDC !== null ? String(spellDC) : '—'}</Text>
            <Text style={s.statLabel}>SAVE DC</Text>
          </View>
        </View>
      )}

      {/* ── Search + Manage ── */}
      <View style={s.searchRow}>
        <View style={s.searchBox}>
          <MaterialCommunityIcons name="magnify" size={15} color={colors.outline} />
          <TextInput
            style={s.searchInput}
            placeholder="Search Spell Names, Schools or Notes"
            placeholderTextColor={colors.outline}
            value={search}
            onChangeText={setSearch}
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch('')} activeOpacity={0.7}>
              <MaterialCommunityIcons name="close-circle" size={14} color={colors.outline} />
            </TouchableOpacity>
          )}
        </View>
        <TouchableOpacity style={s.manageBtn} activeOpacity={0.7}>
          <Text style={s.manageBtnText}>MANAGE SPELLS</Text>
        </TouchableOpacity>
      </View>

      {/* ── Level filter chips ── */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.filtersRow}>
        <FilterChip label="ALL" active={filter === 'all'} onPress={() => setFilter('all')} />
        {availableLevels.map((lvl) => (
          <FilterChip
            key={lvl}
            label={CHIP_LABELS[lvl]}
            active={filter === lvl}
            onPress={() => setFilter(filter === lvl ? 'all' : lvl)}
          />
        ))}
        <TouchableOpacity
          style={[s.chip, filter === 'conc' && s.chipActive]}
          onPress={() => setFilter(filter === 'conc' ? 'all' : 'conc')}
          activeOpacity={0.7}
        >
          <MaterialCommunityIcons
            name="diamond-stone"
            size={12}
            color={filter === 'conc' ? colors.onPrimary : colors.outline}
          />
        </TouchableOpacity>
      </ScrollView>

      {/* ── Concentration banner ── */}
      {concentration && (
        <View style={s.concBanner}>
          <MaterialCommunityIcons name="focus-field" size={14} color={colors.primary} />
          <Text style={s.concName} numberOfLines={1}>{concentration}</Text>
          {isOwner && (
            <TouchableOpacity onPress={onConcentrationClear} style={s.concEnd} activeOpacity={0.7}>
              <Text style={s.concEndText}>End</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* ── Cantrips ── */}
      {cantrips.length > 0 && (
        <View style={s.section}>
          <View style={s.sectionHead}>
            <Text style={s.sectionHeadLabel}>CANTRIP</Text>
          </View>
          <ColHeaders isWide={isWide} />
          {cantrips.map((spell, i) => (
            <SpellRow
              key={spell.id}
              spell={spell}
              isLast={i === cantrips.length - 1}
              isWide={isWide}
            />
          ))}
        </View>
      )}

      {/* ── Leveled spell groups ── */}
      {leveledGroups.map(({ level, spells, slot }) => (
        <View key={level} style={s.section}>
          <View style={s.sectionHead}>
            <Text style={s.sectionHeadLabel}>{LEVEL_LABELS[level]}</Text>
            {slot && slot.max > 0 && (
              <View style={s.slotRow}>
                {Array.from({ length: slot.max }).map((_, i) => (
                  <TouchableOpacity
                    key={i}
                    onPress={() => {
                      if (!isOwner || !onSpellSlotChange) return;
                      onSpellSlotChange(level, i < slot.remaining ? -1 : 1);
                    }}
                    activeOpacity={isOwner ? 0.7 : 1}
                  >
                    <View style={[s.slotBox, i < slot.remaining && s.slotBoxFull]} />
                  </TouchableOpacity>
                ))}
                <Text style={s.slotsLabel}>SLOTS</Text>
              </View>
            )}
          </View>
          {spells.length > 0 && <ColHeaders isWide={isWide} />}
          {spells.map((spell, i) => (
            <SpellRow
              key={spell.id}
              spell={spell}
              isLast={i === spells.length - 1}
              slot={slot}
              isOwner={isOwner}
              isWide={isWide}
            />
          ))}
          {spells.length === 0 && slot && slot.max > 0 && (
            <Text style={s.emptyLevel}>No spells prepared at this level</Text>
          )}
        </View>
      ))}

      {/* ── Empty states ── */}
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

      <View style={{ height: 24 }} />
    </ScrollView>
  );
}

// ── Sub-components ──────────────────────────────────────────────────────────

function FilterChip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity style={[s.chip, active && s.chipActive]} onPress={onPress} activeOpacity={0.7}>
      <Text style={[s.chipText, active && s.chipTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

function ColHeaders({ isWide }: { isWide: boolean }) {
  return (
    <View style={s.colHead}>
      <View style={s.colBadge} />
      <Text style={[s.colLabel, s.colName]}>NAME</Text>
      <Text style={[s.colLabel, s.colTime]}>TIME</Text>
      <Text style={[s.colLabel, s.colRange]}>RANGE</Text>
      {isWide && <Text style={[s.colLabel, s.colHit]}>HIT / DC</Text>}
      {isWide && <Text style={[s.colLabel, s.colEffect]}>EFFECT</Text>}
      <Text style={[s.colLabel, s.colNotes]}>NOTES</Text>
    </View>
  );
}

function SpellRow({
  spell, isLast, slot, isOwner, isWide,
}: {
  spell: Dnd5ePreparedSpell;
  isLast: boolean;
  slot?: { max: number; remaining: number } | null;
  isOwner?: boolean;
  isWide?: boolean;
}) {
  const isCantrip = spell.level === 0;
  const hasSlots = slot ? slot.remaining > 0 : false;

  return (
    <View style={[s.spellRow, !isLast && s.spellRowBorder]}>

      {/* Badge: AT WILL or USE */}
      <View style={s.colBadge}>
        {isCantrip ? (
          <View style={s.badgeAtWill}>
            <Text style={s.badgeAtWillText}>AT{'\n'}WILL</Text>
          </View>
        ) : (
          <View style={[s.badgeUse, !hasSlots && s.badgeUsed]}>
            <Text style={[s.badgeUseText, !hasSlots && s.badgeUsedText]}>USE</Text>
          </View>
        )}
      </View>

      {/* Spell name + optional source line */}
      <View style={s.colName}>
        <View style={s.nameInner}>
          <Text style={s.spellName} numberOfLines={1}>{spell.name}</Text>
          {spell.ritual && (
            <MaterialCommunityIcons name="rotate-right" size={10} color={colors.outline} />
          )}
          {spell.concentration && (
            <MaterialCommunityIcons name="diamond-stone" size={10} color={colors.outline} />
          )}
        </View>
        {(spell.source || spell.school) && (
          <Text style={s.spellSource} numberOfLines={1}>
            {spell.source ?? capitalize(spell.school!)}
          </Text>
        )}
      </View>

      {/* Stat columns */}
      <Text style={[s.cellText, s.colTime]} numberOfLines={1}>{spell.castingTime ?? '1A'}</Text>
      <Text style={[s.cellText, s.colRange]} numberOfLines={1}>{spell.range ?? '—'}</Text>
      {isWide && <Text style={[s.cellText, s.colHit]} numberOfLines={1}>{spell.hitDc ?? '—'}</Text>}
      {isWide && (
        <Text style={[s.cellText, s.colEffect]} numberOfLines={1}>
          {spell.effectType ?? (spell.school ? capitalize(spell.school) : '—')}
        </Text>
      )}
      <Text style={[s.cellText, s.colNotes]} numberOfLines={2}>{spell.notes ?? '—'}</Text>
    </View>
  );
}

// ── Styles ──────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  container: { paddingBottom: 16 },

  // Spellcasting stats header
  statsRow: {
    flexDirection: 'row',
    paddingVertical: 18, paddingHorizontal: 20,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.outlineVariant,
  },
  statBlock: { flex: 1, alignItems: 'center', gap: 4 },
  statValue: { fontSize: 26, fontFamily: fonts.headline, fontWeight: '800', color: colors.onSurface },
  statLabel: { fontSize: 9, fontFamily: fonts.label, fontWeight: '700', letterSpacing: 1.5, color: colors.outline },
  statDivider: { width: StyleSheet.hairlineWidth, height: 30, backgroundColor: colors.outlineVariant, alignSelf: 'center' },

  // Search row
  searchRow: { flexDirection: 'row', gap: 8, padding: 12 },
  searchBox: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: colors.surfaceContainer,
    borderWidth: 1, borderColor: colors.outlineVariant,
    borderRadius: radius.lg, paddingHorizontal: 10, paddingVertical: 7,
  },
  searchInput: { flex: 1, fontSize: 12, fontFamily: fonts.body, color: colors.onSurface },
  manageBtn: {
    paddingHorizontal: 12, paddingVertical: 7,
    borderWidth: 1.5, borderColor: colors.primary,
    borderRadius: radius.lg, justifyContent: 'center',
  },
  manageBtnText: { fontSize: 10, fontFamily: fonts.label, fontWeight: '700', letterSpacing: 1, color: colors.primary },

  // Filter chips
  filtersRow: { flexDirection: 'row', gap: 6, paddingHorizontal: 12, paddingBottom: 10 },
  chip: {
    paddingHorizontal: 10, paddingVertical: 5,
    borderWidth: 1, borderColor: colors.outlineVariant,
    borderRadius: 100, alignItems: 'center', justifyContent: 'center', minWidth: 36,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: 11, fontFamily: fonts.label, fontWeight: '700', color: colors.outline },
  chipTextActive: { color: colors.onPrimary },

  // Concentration banner
  concBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginHorizontal: 12, marginBottom: 8,
    paddingHorizontal: 12, paddingVertical: 8,
    backgroundColor: `${colors.primary}14`,
    borderWidth: 1, borderColor: `${colors.primary}44`,
    borderRadius: radius.lg,
  },
  concName: { flex: 1, fontSize: 13, fontFamily: fonts.headline, fontWeight: '600', color: colors.onSurface },
  concEnd: {
    paddingHorizontal: 8, paddingVertical: 3,
    backgroundColor: colors.surfaceContainerHighest,
    borderWidth: 1, borderColor: colors.outlineVariant,
    borderRadius: radius.lg,
  },
  concEndText: { fontSize: 10, fontFamily: fonts.label, fontWeight: '700', color: colors.outline },

  // Spell sections
  section: { marginTop: 6 },
  sectionHead: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 12, paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.outlineVariant,
  },
  sectionHeadLabel: {
    fontSize: 12, fontFamily: fonts.label, fontWeight: '800', letterSpacing: 1.5, color: colors.primary,
  },
  slotRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  slotBox: {
    width: 16, height: 16, borderRadius: 2,
    borderWidth: 1.5, borderColor: colors.outlineVariant,
  },
  slotBoxFull: { backgroundColor: colors.primary, borderColor: colors.primary },
  slotsLabel: {
    fontSize: 9, fontFamily: fonts.label, fontWeight: '700',
    letterSpacing: 1.5, color: colors.outline, marginLeft: 2,
  },

  // Column headers
  colHead: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 12, paddingVertical: 5,
    backgroundColor: colors.surfaceContainerLowest,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.outlineVariant,
  },
  colLabel: {
    fontSize: 8, fontFamily: fonts.label, fontWeight: '700',
    letterSpacing: 1.2, color: colors.outline,
  },

  // Column layout (shared between header + spell rows)
  colBadge: { width: 50 },
  colName: { flex: 1.5, minWidth: 80 },
  colTime: { width: 38 },
  colRange: { width: 68, paddingLeft: 4 },
  colHit: { width: 56, paddingLeft: 4 },
  colEffect: { width: 76, paddingLeft: 4 },
  colNotes: { flex: 1, minWidth: 60, paddingLeft: 4 },

  // Spell rows
  spellRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 12, paddingVertical: 9,
  },
  spellRowBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.outlineVariant },

  // AT WILL badge (cantrips)
  badgeAtWill: {
    width: 36, alignItems: 'center',
    paddingVertical: 3,
    borderWidth: 1, borderColor: colors.outlineVariant, borderRadius: 3,
  },
  badgeAtWillText: {
    fontSize: 7, fontFamily: fonts.label, fontWeight: '800',
    letterSpacing: 0.3, textAlign: 'center', lineHeight: 9, color: colors.outline,
  },

  // USE badge (leveled spells)
  badgeUse: {
    width: 36, alignItems: 'center',
    paddingVertical: 5,
    backgroundColor: colors.primary, borderRadius: 3,
  },
  badgeUsed: { backgroundColor: colors.surfaceContainerHighest, opacity: 0.55 },
  badgeUseText: {
    fontSize: 9, fontFamily: fonts.label, fontWeight: '800',
    letterSpacing: 0.5, color: colors.onPrimary,
  },
  badgeUsedText: { color: colors.outline },

  // Spell name cell
  nameInner: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  spellName: {
    fontSize: 13, fontFamily: fonts.headline, fontWeight: '600',
    color: colors.onSurface, fontStyle: 'italic', flexShrink: 1,
  },
  spellSource: {
    fontSize: 9, fontFamily: fonts.label, fontWeight: '500',
    color: colors.outline, marginTop: 1,
  },
  cellText: { fontSize: 12, fontFamily: fonts.body, color: colors.onSurfaceVariant },

  // Empty
  emptyLevel: {
    fontSize: 11, fontFamily: fonts.label, fontStyle: 'italic',
    color: colors.outline, paddingHorizontal: 12, paddingVertical: 10,
  },
  emptyState: { alignItems: 'center', paddingVertical: 40, paddingHorizontal: 20, gap: 10 },
  emptyTitle: { fontSize: 15, fontFamily: fonts.headline, fontWeight: '700', color: colors.onSurfaceVariant },
  emptyBody: { fontSize: 13, fontFamily: fonts.body, color: colors.outline, textAlign: 'center', lineHeight: 19 },
});
