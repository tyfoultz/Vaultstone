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
  ActivityIndicator, TextInput, StyleSheet, Platform,
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
  // Single-open inline expansion. Tapping the same row again collapses;
  // tapping a different row swaps the expansion (only one open at a time
  // so the list doesn't grow unbounded as the player browses).
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [filterMenuOpen, setFilterMenuOpen] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setLoading(true);
    setSearch('');
    setLevelFilter('all');
    setExpandedKey(null);
    setFilterMenuOpen(false);
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
  // dropdown options — no point listing 9th-level when the character has
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

  const filterLabel = levelFilter === 'all'
    ? 'All Levels'
    : levelFilter === 0
      ? 'Cantrips'
      : `${LEVEL_LABELS[levelFilter] ?? String(levelFilter)} level`;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={s.backdrop} onPress={onClose}>
        <Pressable style={s.card} onPress={() => {}}>
          <View style={s.header}>
            <Text style={s.title} numberOfLines={1}>Add a spell</Text>
            <TouchableOpacity onPress={onClose} hitSlop={10}>
              <MaterialCommunityIcons name="close" size={22} color={colors.onSurfaceVariant} />
            </TouchableOpacity>
          </View>

          {loading ? (
            <View style={s.loadingWrap}>
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : (
            <>
              <View style={s.controlsRow}>
                <View style={s.searchBox}>
                  <MaterialCommunityIcons name="magnify" size={16} color={colors.outline} />
                  <TextInput
                    style={s.searchInput}
                    placeholder="Search spells…"
                    placeholderTextColor={colors.outline}
                    value={search}
                    onChangeText={setSearch}
                  />
                </View>
                <LevelFilterDropdown
                  value={levelFilter}
                  availableLevels={availableLevels}
                  onChange={setLevelFilter}
                  onOpenNativeMenu={() => setFilterMenuOpen(true)}
                  label={filterLabel}
                />
              </View>

              <ScrollView style={s.list} contentContainerStyle={{ paddingBottom: spacing.md }}>
                {filtered.length === 0 ? (
                  <Text style={s.emptyText}>No matching spells.</Text>
                ) : null}
                {(() => {
                  // When the filter is set to a single level, headers
                  // would just repeat that label — only group when
                  // we're showing the merged "All" view.
                  const showHeaders = levelFilter === 'all';
                  const out: React.ReactNode[] = [];
                  let lastLevel: number | null = null;
                  for (const sp of filtered) {
                    if (showHeaders && sp.level !== lastLevel) {
                      out.push(
                        <View key={`header-${sp.level}`} style={s.groupHeader}>
                          <Text style={s.groupHeaderText}>
                            {sp.level === 0 ? 'CANTRIPS' : `${LEVEL_LABELS[sp.level]?.toUpperCase() ?? `LEVEL ${sp.level}`} LEVEL`}
                          </Text>
                          <View style={s.groupHeaderRule} />
                        </View>
                      );
                      lastLevel = sp.level;
                    }
                    const has = existingKeys.has(sp.key);
                    const expanded = expandedKey === sp.key;
                    out.push(
                      <View key={sp.key} style={[s.rowWrap, expanded && s.rowWrapExpanded]}>
                      <Pressable
                        style={[s.row, has && s.rowDisabled]}
                        onPress={() => setExpandedKey(expanded ? null : sp.key)}
                      >
                        <View style={s.levelBadge}>
                          <Text style={s.levelBadgeText}>{sp.level === 0 ? 'C' : sp.level}</Text>
                        </View>
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text style={s.rowName}>{sp.name}</Text>
                        </View>
                        {has ? (
                          <Text style={s.rowHasText}>Added</Text>
                        ) : (
                          <MaterialCommunityIcons
                            name={expanded ? 'chevron-up' : 'chevron-down'}
                            size={18}
                            color={colors.outline}
                          />
                        )}
                      </Pressable>
                      {expanded ? (
                        <View style={s.expansion}>
                          <View style={s.metaGrid}>
                            <DetailMeta label="Level" value={sp.level === 0 ? 'Cantrip' : LEVEL_LABELS[sp.level] ?? String(sp.level)} />
                            <DetailMeta label="School" value={sp.school} />
                            <DetailMeta label="Casting" value={sp.castingTime} />
                            <DetailMeta label="Range" value={sp.range} />
                            <DetailMeta label="Components" value={sp.components.join(', ')} />
                            <DetailMeta label="Duration" value={sp.duration} />
                          </View>

                          {(sp.concentration || sp.ritual) && (
                            <Text style={s.tagsLine}>
                              {sp.concentration ? 'Concentration' : ''}
                              {sp.concentration && sp.ritual ? ' · ' : ''}
                              {sp.ritual ? 'Ritual' : ''}
                            </Text>
                          )}

                          {sp.classes.length > 0 && (
                            <Text style={s.classesLine}>Available to: {sp.classes.join(', ')}</Text>
                          )}

                          {sp.description ? (
                            <Text style={s.detailDesc}>{sp.description}</Text>
                          ) : null}

                          <TouchableOpacity
                            style={[s.commitBtn, has && s.commitBtnDisabled]}
                            onPress={has ? undefined : () => commit(sp)}
                            activeOpacity={has ? 1 : 0.85}
                          >
                            <Text style={[s.commitText, has && s.commitTextDisabled]}>
                              {has ? 'Already prepared' : `Add ${sp.name}`}
                            </Text>
                          </TouchableOpacity>
                        </View>
                      ) : null}
                    </View>
                    );
                  }
                  return out;
                })()}
              </ScrollView>
            </>
          )}
        </Pressable>
      </Pressable>

      {/* Level filter dropdown — popover-style modal anchored visually
          to the filter button. Single-select; "All Levels" resets. */}
      <Modal
        visible={filterMenuOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setFilterMenuOpen(false)}
      >
        <Pressable style={s.menuBackdrop} onPress={() => setFilterMenuOpen(false)}>
          <Pressable style={s.menuCard} onPress={() => {}}>
            <FilterMenuItem
              label="All Levels"
              active={levelFilter === 'all'}
              onPress={() => { setLevelFilter('all'); setFilterMenuOpen(false); }}
            />
            {availableLevels.map((lvl) => (
              <FilterMenuItem
                key={lvl}
                label={lvl === 0 ? 'Cantrips' : `${LEVEL_LABELS[lvl] ?? String(lvl)} level`}
                active={levelFilter === lvl}
                onPress={() => { setLevelFilter(lvl); setFilterMenuOpen(false); }}
              />
            ))}
          </Pressable>
        </Pressable>
      </Modal>
    </Modal>
  );
}

// Level filter dropdown — uses a native HTML <select> on web for the
// real OS dropdown UI (proper keyboard navigation, no popover-clipping
// at modal edges, no extra Modal stacking). On native (iOS/Android)
// there's no equivalent primitive, so it falls through to opening the
// popover Modal the parent owns.
function LevelFilterDropdown({
  value, availableLevels, onChange, onOpenNativeMenu, label,
}: {
  value: number | 'all';
  availableLevels: number[];
  onChange: (next: number | 'all') => void;
  onOpenNativeMenu: () => void;
  label: string;
}) {
  if (Platform.OS === 'web') {
    return (
      <View style={s.filterBtn}>
        <Text style={s.filterBtnLabel} numberOfLines={1}>{label}</Text>
        <MaterialCommunityIcons name="chevron-down" size={16} color={colors.onSurfaceVariant} />
        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
        {(() => {
          const Select = 'select' as any;
          const Option = 'option' as any;
          return (
            <Select
              style={s.htmlSelect}
              value={value === 'all' ? 'all' : String(value)}
              onChange={(e: { target: { value: string } }) => {
                const v = e.target.value;
                onChange(v === 'all' ? 'all' : parseInt(v, 10));
              }}
            >
              <Option value="all">All Levels</Option>
              {availableLevels.map((lvl) => (
                <Option key={lvl} value={String(lvl)}>
                  {lvl === 0 ? 'Cantrips' : `${LEVEL_LABELS[lvl] ?? String(lvl)} level`}
                </Option>
              ))}
            </Select>
          );
        })()}
      </View>
    );
  }
  return (
    <TouchableOpacity style={s.filterBtn} onPress={onOpenNativeMenu} activeOpacity={0.75}>
      <Text style={s.filterBtnLabel} numberOfLines={1}>{label}</Text>
      <MaterialCommunityIcons name="chevron-down" size={16} color={colors.onSurfaceVariant} />
    </TouchableOpacity>
  );
}

function FilterMenuItem({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity style={[s.menuItem, active && s.menuItemActive]} onPress={onPress} activeOpacity={0.7}>
      <Text style={[s.menuItemText, active && s.menuItemTextActive]}>{label}</Text>
      {active ? (
        <MaterialCommunityIcons name="check" size={16} color={colors.primary} />
      ) : null}
    </TouchableOpacity>
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
    width: '100%', maxWidth: 880, maxHeight: '88%',
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

  controlsRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  searchBox: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: colors.surfaceContainerHigh,
    borderRadius: radius.lg,
    paddingHorizontal: 12, paddingVertical: 8,
  },
  searchInput: {
    flex: 1, fontSize: 13, fontFamily: fonts.body, color: colors.onSurface,
  },
  filterBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: colors.surfaceContainerHigh,
    borderRadius: radius.lg,
    paddingHorizontal: 12, paddingVertical: 9,
    borderWidth: 1, borderColor: colors.outlineVariant,
    minWidth: 140,
    // Anchor the absolutely-positioned <select> overlay (web only).
    position: 'relative',
  },
  // Web-only: a real <select> is layered over the styled button so the
  // browser opens its native dropdown on click while the visual chrome
  // (chevron, label, surface) stays on-brand.
  htmlSelect: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    opacity: 0, cursor: 'pointer', appearance: 'none',
    border: 0, background: 'transparent', width: '100%', height: '100%',
  } as any,
  filterBtnLabel: {
    flex: 1, fontSize: 12, fontFamily: fonts.label, fontWeight: '600',
    color: colors.onSurface, letterSpacing: 0.3,
  },

  // No maxHeight — let the ScrollView take only the space it needs.
  // The outer card's maxHeight (88%) caps the whole modal when the
  // catalog is large; on short lists the modal shrinks to fit so we
  // don't get a swathe of empty space below the last row.
  list: { flexShrink: 1 },
  rowWrap: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.outlineVariant,
  },
  // When a row is expanded the dark canvas extends up behind the row
  // header so the selected spell visually reads as one card (header +
  // detail) instead of a row sitting on top of a separate dark block.
  rowWrapExpanded: {
    backgroundColor: colors.surfaceContainerLowest,
    borderBottomColor: 'transparent',
  },
  groupHeader: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingTop: spacing.md, paddingBottom: 6, paddingHorizontal: 6,
  },
  groupHeaderText: {
    fontSize: 10, fontFamily: fonts.label, fontWeight: '700',
    letterSpacing: 1.5, color: colors.primary,
  },
  groupHeaderRule: {
    flex: 1, height: StyleSheet.hairlineWidth,
    backgroundColor: colors.outlineVariant,
  },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingVertical: 10, paddingHorizontal: 6,
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

  // Background sits on the wrapper (`rowWrapExpanded`) so the row
  // header inherits it; the expansion just owns padding.
  expansion: {
    paddingHorizontal: 12, paddingTop: 4, paddingBottom: spacing.md,
  },

  emptyText: { paddingVertical: 24, textAlign: 'center', color: colors.outline, fontFamily: fonts.body },

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
    marginTop: spacing.md,
    backgroundColor: colors.primary,
    paddingVertical: 11, borderRadius: radius.lg,
    alignItems: 'center',
  },
  commitBtnDisabled: { backgroundColor: colors.surfaceContainerHighest },
  commitText: { fontSize: 13, fontFamily: fonts.label, fontWeight: '700', color: colors.onPrimary, letterSpacing: 0.5 },
  commitTextDisabled: { color: colors.outline },

  // Filter dropdown menu
  menuBackdrop: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
  menuCard: {
    width: '100%', maxWidth: 280,
    backgroundColor: colors.surfaceContainerHigh,
    borderRadius: radius.lg,
    borderWidth: 1, borderColor: colors.outlineVariant,
    padding: 6,
  },
  menuItem: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 10, paddingHorizontal: 12,
    borderRadius: radius.lg,
  },
  menuItemActive: { backgroundColor: colors.surfaceContainerHighest },
  menuItemText: { fontSize: 13, fontFamily: fonts.body, color: colors.onSurfaceVariant },
  menuItemTextActive: { color: colors.onSurface, fontWeight: '600' },
});
