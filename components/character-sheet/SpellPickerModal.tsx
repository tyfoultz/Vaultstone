// Catalog spell picker for the character sheet's Spells tab "MANAGE
// SPELLS" affordance. Mirrors FeatPickerModal's pattern: pulls from
// ContentResolver scoped to the character's campaign + pack opt-in,
// filters by class so a Wizard doesn't see Cleric-only spells, and
// commits to resources.preparedSpells[] via the parent. Casters who
// multiclass see the union of all class lists; cantrips and leveled
// spells share the same flow.

import { useEffect, useMemo, useState } from 'react';
import {
  View, Text, Modal, Pressable, ScrollView, TouchableOpacity,
  ActivityIndicator, TextInput, StyleSheet,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { ContentResolver } from '@vaultstone/content';
import { colors, fonts, radius, spacing } from '@vaultstone/ui';
import type { Dnd5ePreparedSpell, SpellResult } from '@vaultstone/types';

const LEVEL_LABELS = ['Cantrip', '1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th'];

type Props = {
  visible: boolean;
  onClose: () => void;
  /** Character classes (display names) used to filter the catalog —
   *  e.g. ['Wizard']. Multiclass passes the full list and the picker
   *  surfaces any spell in the union. Empty array shows all spells in
   *  the catalog (homebrew packs may legitimately ship classless spells). */
  classNames: string[];
  /** Already-prepared spell ids (matches SpellResult.key) — disabled in the list. */
  existingKeys: Set<string>;
  campaignId?: string | null;
  packIds?: string[];
  srdVersion?: 'SRD_5.1' | 'SRD_2.0';
  onPick: (spell: Dnd5ePreparedSpell) => void;
};

export function SpellPickerModal({
  visible, onClose, classNames, existingKeys, campaignId, packIds, srdVersion, onPick,
}: Props) {
  const [list, setList] = useState<SpellResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [levelFilter, setLevelFilter] = useState<number | 'all'>('all');
  const [previewKey, setPreviewKey] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setLoading(true);
    setSearch('');
    setLevelFilter('all');
    setPreviewKey(null);
    const includeHomebrew = !!campaignId || (packIds?.length ?? 0) > 0;
    const tiers: Array<'srd' | 'homebrew'> = includeHomebrew ? ['srd', 'homebrew'] : ['srd'];
    ContentResolver.search({
      type: 'spell',
      system: 'dnd5e',
      srdVersion,
      tiers,
      campaignId: campaignId ?? undefined,
      packIds: !campaignId && packIds && packIds.length > 0 ? packIds : undefined,
    })
      .then((r) => setList(r as SpellResult[]))
      .finally(() => setLoading(false));
  }, [visible, srdVersion, campaignId, (packIds ?? []).join(',')]);

  const classNamesLc = useMemo(
    () => new Set(classNames.map((n) => n.toLowerCase())),
    [classNames],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return list
      .filter((s) => {
        // Class filter — the spell either has no class metadata (rare;
        // usually homebrew) or matches one of the character's classes.
        if (s.classes.length === 0) return true;
        if (classNamesLc.size === 0) return true;
        return s.classes.some((cn) => classNamesLc.has(cn.toLowerCase()));
      })
      .filter((s) => levelFilter === 'all' || s.level === levelFilter)
      .filter((s) => !q
        || s.name.toLowerCase().includes(q)
        || s.school.toLowerCase().includes(q)
        || (s.description ?? '').toLowerCase().includes(q),
      )
      .sort((a, b) => a.level - b.level || a.name.localeCompare(b.name));
  }, [list, search, levelFilter, classNamesLc]);

  // Levels actually present in the (class-filtered) catalog drive the
  // chip row — no point showing a 9th-level chip when the character has
  // no 9th-level spells available.
  const availableLevels = useMemo(() => {
    const set = new Set<number>();
    for (const s of list) {
      if (s.classes.length === 0 || classNamesLc.size === 0
        || s.classes.some((cn) => classNamesLc.has(cn.toLowerCase()))) {
        set.add(s.level);
      }
    }
    return [...set].sort((a, b) => a - b);
  }, [list, classNamesLc]);

  const preview = previewKey ? list.find((s) => s.key === previewKey) : null;

  function commit(spell: SpellResult) {
    const prepared: Dnd5ePreparedSpell = {
      id: spell.key,
      name: spell.name,
      level: spell.level,
      school: spell.school,
      ritual: spell.ritual,
      concentration: spell.concentration,
      castingTime: spell.castingTime,
      range: spell.range,
      // Carry the source identifier (class list or "Homebrew") so the
      // sheet can group by source if it wants. Falls through cleanly
      // when the spell has no class list.
      source: spell.classes && spell.classes.length > 0 ? spell.classes[0] : undefined,
    };
    onPick(prepared);
    onClose();
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={s.backdrop} onPress={onClose}>
        <Pressable style={s.card} onPress={() => {}}>
          <View style={s.header}>
            <Text style={s.title} numberOfLines={1}>{preview ? preview.name : 'Add a spell'}</Text>
            <TouchableOpacity onPress={onClose} hitSlop={10}>
              <MaterialCommunityIcons name="close" size={22} color={colors.onSurfaceVariant} />
            </TouchableOpacity>
          </View>

          {loading ? (
            <View style={s.loadingWrap}>
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : preview ? (
            <SpellDetail
              spell={preview}
              alreadyHas={existingKeys.has(preview.key)}
              onBack={() => setPreviewKey(null)}
              onPick={() => commit(preview)}
            />
          ) : (
            <>
              <View style={s.searchRow}>
                <MaterialCommunityIcons name="magnify" size={16} color={colors.outline} />
                <TextInput
                  style={s.searchInput}
                  placeholder="Search spells…"
                  placeholderTextColor={colors.outline}
                  value={search}
                  onChangeText={setSearch}
                />
              </View>

              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chipsRow}>
                <FilterChip
                  label="ALL"
                  active={levelFilter === 'all'}
                  onPress={() => setLevelFilter('all')}
                />
                {availableLevels.map((lvl) => (
                  <FilterChip
                    key={lvl}
                    label={lvl === 0 ? '0' : LEVEL_LABELS[lvl]?.replace(/[a-z]+$/i, '') ?? String(lvl)}
                    active={levelFilter === lvl}
                    onPress={() => setLevelFilter(levelFilter === lvl ? 'all' : lvl)}
                  />
                ))}
              </ScrollView>

              <ScrollView style={s.list} contentContainerStyle={{ paddingBottom: spacing.md }}>
                {filtered.length === 0 ? (
                  <Text style={s.emptyText}>No matching spells.</Text>
                ) : null}
                {filtered.map((sp) => {
                  const has = existingKeys.has(sp.key);
                  return (
                    <Pressable
                      key={sp.key}
                      style={[s.row, has && s.rowDisabled]}
                      onPress={() => setPreviewKey(sp.key)}
                    >
                      <View style={s.levelBadge}>
                        <Text style={s.levelBadgeText}>{sp.level === 0 ? 'C' : sp.level}</Text>
                      </View>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={s.rowName}>{sp.name}</Text>
                        <Text style={s.rowMeta} numberOfLines={1}>
                          {sp.school}
                          {sp.concentration ? ' · Concentration' : ''}
                          {sp.ritual ? ' · Ritual' : ''}
                          {sp.classes.length > 0 ? ` · ${sp.classes.join(', ')}` : ''}
                        </Text>
                      </View>
                      {has ? (
                        <Text style={s.rowHasText}>Added</Text>
                      ) : (
                        <MaterialCommunityIcons name="chevron-right" size={18} color={colors.outline} />
                      )}
                    </Pressable>
                  );
                })}
              </ScrollView>
            </>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function FilterChip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity style={[s.chip, active && s.chipActive]} onPress={onPress} activeOpacity={0.7}>
      <Text style={[s.chipText, active && s.chipTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

function SpellDetail({
  spell, alreadyHas, onBack, onPick,
}: {
  spell: SpellResult;
  alreadyHas: boolean;
  onBack: () => void;
  onPick: () => void;
}) {
  return (
    <ScrollView contentContainerStyle={s.detailWrap}>
      <Pressable onPress={onBack} style={s.backLink}>
        <MaterialCommunityIcons name="chevron-left" size={16} color={colors.onSurfaceVariant} />
        <Text style={s.backText}>Back</Text>
      </Pressable>

      <View style={s.metaGrid}>
        <DetailMeta label="Level" value={spell.level === 0 ? 'Cantrip' : LEVEL_LABELS[spell.level] ?? String(spell.level)} />
        <DetailMeta label="School" value={spell.school} />
        <DetailMeta label="Casting" value={spell.castingTime} />
        <DetailMeta label="Range" value={spell.range} />
        <DetailMeta label="Components" value={spell.components.join(', ')} />
        <DetailMeta label="Duration" value={spell.duration} />
      </View>

      {(spell.concentration || spell.ritual) && (
        <Text style={s.tagsLine}>
          {spell.concentration ? 'Concentration' : ''}
          {spell.concentration && spell.ritual ? ' · ' : ''}
          {spell.ritual ? 'Ritual' : ''}
        </Text>
      )}

      {spell.classes.length > 0 && (
        <Text style={s.classesLine}>Available to: {spell.classes.join(', ')}</Text>
      )}

      {spell.description ? (
        <Text style={s.detailDesc}>{spell.description}</Text>
      ) : null}

      <TouchableOpacity
        style={[s.commitBtn, alreadyHas && s.commitBtnDisabled]}
        onPress={alreadyHas ? undefined : onPick}
        activeOpacity={alreadyHas ? 1 : 0.85}
      >
        <Text style={[s.commitText, alreadyHas && s.commitTextDisabled]}>
          {alreadyHas ? 'Already prepared' : `Add ${spell.name}`}
        </Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

function DetailMeta({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.metaCell}>
      <Text style={s.metaLabel}>{label}</Text>
      <Text style={s.metaValue}>{value}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  backdrop: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
  card: {
    width: '100%', maxWidth: 560, maxHeight: '85%',
    backgroundColor: colors.surfaceContainer,
    borderRadius: radius.xl,
    borderWidth: 1, borderColor: colors.outlineVariant,
    padding: spacing.md,
  },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: spacing.md, gap: spacing.sm,
  },
  title: {
    fontSize: 18, fontFamily: fonts.headline, fontWeight: '700',
    color: colors.onSurface, flex: 1, minWidth: 0,
  },
  loadingWrap: { paddingVertical: 40, alignItems: 'center' },
  searchRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: colors.surfaceContainerHigh,
    borderRadius: radius.lg,
    paddingHorizontal: 12, paddingVertical: 8,
    marginBottom: spacing.sm,
  },
  searchInput: {
    flex: 1, fontSize: 13, fontFamily: fonts.body, color: colors.onSurface,
  },
  chipsRow: { flexDirection: 'row', gap: 6, paddingBottom: spacing.sm },
  chip: {
    paddingHorizontal: 10, paddingVertical: 5,
    borderWidth: 1, borderColor: colors.outlineVariant,
    borderRadius: 100, alignItems: 'center', justifyContent: 'center', minWidth: 36,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: 11, fontFamily: fonts.label, fontWeight: '700', color: colors.outline },
  chipTextActive: { color: colors.onPrimary },

  list: { maxHeight: '60%' },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingVertical: 10, paddingHorizontal: 6,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.outlineVariant,
  },
  rowDisabled: { opacity: 0.5 },
  levelBadge: {
    width: 24, height: 24, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.surfaceContainerHighest,
    borderWidth: 1, borderColor: colors.outlineVariant,
  },
  levelBadgeText: { fontSize: 10, fontFamily: fonts.label, fontWeight: '700', color: colors.onSurfaceVariant },
  rowName: { fontSize: 14, fontFamily: fonts.headline, fontWeight: '600', color: colors.onSurface },
  rowMeta: { fontSize: 11, fontFamily: fonts.body, color: colors.outline, marginTop: 2 },
  rowHasText: { fontSize: 11, fontFamily: fonts.label, fontWeight: '700', color: colors.outline },

  emptyText: { paddingVertical: 24, textAlign: 'center', color: colors.outline, fontFamily: fonts.body },

  detailWrap: { paddingBottom: spacing.lg },
  backLink: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: spacing.sm },
  backText: { fontSize: 13, color: colors.onSurfaceVariant, fontFamily: fonts.label, fontWeight: '600' },

  metaGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.sm },
  metaCell: { minWidth: 120, paddingVertical: 4 },
  metaLabel: {
    fontSize: 9, fontFamily: fonts.label, fontWeight: '700',
    letterSpacing: 1.2, textTransform: 'uppercase', color: colors.outline,
  },
  metaValue: { fontSize: 13, fontFamily: fonts.body, color: colors.onSurface, marginTop: 2 },

  tagsLine: { fontSize: 12, color: colors.primary, fontFamily: fonts.label, fontWeight: '600', marginTop: 4 },
  classesLine: { fontSize: 12, color: colors.outline, fontFamily: fonts.body, marginTop: 4, marginBottom: 8 },
  detailDesc: { fontSize: 13, color: colors.onSurfaceVariant, lineHeight: 19, marginTop: 8 },

  commitBtn: {
    marginTop: spacing.lg,
    backgroundColor: colors.primary,
    paddingVertical: 12, borderRadius: radius.lg,
    alignItems: 'center',
  },
  commitBtnDisabled: { backgroundColor: colors.surfaceContainerHighest },
  commitText: { fontSize: 14, fontFamily: fonts.label, fontWeight: '700', color: colors.onPrimary, letterSpacing: 0.5 },
  commitTextDisabled: { color: colors.outline },
});
