// Prepare Spells modal — picks today's active subset from the
// character's spellbook (resources.spellbook[]). Distinct from Manage
// Spells (which adds/removes from the spellbook itself). Cantrips are
// always prepared in 5e so they render in a read-only header band; the
// toggleable list holds only leveled spells.
//
// This modal never queries ContentResolver — the catalog is purely
// the character's own spellbook, so it's always offline-fast and
// scoped exactly to what the player can prepare.

import { useMemo, useState } from 'react';
import {
  View, Text, Modal, Pressable, ScrollView, TouchableOpacity,
  TextInput, StyleSheet, Platform,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { colors, fonts, radius, spacing } from '@vaultstone/ui';
import type { Dnd5ePreparedSpell } from '@vaultstone/types';

const LEVEL_LABELS = ['Cantrip', '1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th'];

type Props = {
  visible: boolean;
  onClose: () => void;
  /** The character's full spellbook. Cantrips are surfaced separately
   *  because they're always prepared in 5e and don't count toward the
   *  prepared limit. */
  spellbook: Dnd5ePreparedSpell[];
  /** Currently prepared spells — the subset of the spellbook the player
   *  has toggled on for casting today. Cantrips in here are mirrored
   *  from the spellbook automatically (the modal doesn't toggle them). */
  prepared: Dnd5ePreparedSpell[];
  /** Total leveled prepared limit pulled from class progression tables.
   *  Undefined when no limit applies (legacy data, non-caster). */
  preparedLimit?: number;
  /** Replaces the full prepared list. Caller writes to
   *  resources.preparedSpells. */
  onChange: (next: Dnd5ePreparedSpell[]) => void;
};

export function PrepareSpellsModal({
  visible, onClose, spellbook, prepared, preparedLimit, onChange,
}: Props) {
  const [search, setSearch] = useState('');
  const [levelFilter, setLevelFilter] = useState<number | 'all'>('all');
  const [filterMenuOpen, setFilterMenuOpen] = useState(false);

  const preparedKeys = useMemo(
    () => new Set(prepared.map((sp) => sp.id)),
    [prepared],
  );

  // Cantrips always read from the spellbook (they don't get toggled).
  // The player sees them as a status line at the top so they understand
  // the cantrip count is automatic.
  const cantripsInBook = useMemo(
    () => spellbook.filter((sp) => sp.level === 0),
    [spellbook],
  );

  // Leveled spells are the toggleable list.
  const leveledInBook = useMemo(
    () => spellbook.filter((sp) => sp.level > 0).sort((a, b) => a.level - b.level || a.name.localeCompare(b.name)),
    [spellbook],
  );

  const preparedLeveledCount = useMemo(
    () => prepared.filter((sp) => sp.level > 0).length,
    [prepared],
  );

  // Levels actually present drive the dropdown options.
  const availableLevels = useMemo(() => {
    const set = new Set<number>();
    for (const sp of leveledInBook) set.add(sp.level);
    return [...set].sort((a, b) => a - b);
  }, [leveledInBook]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return leveledInBook
      .filter((sp) => levelFilter === 'all' || sp.level === levelFilter)
      .filter((sp) => !q || sp.name.toLowerCase().includes(q) || (sp.school ?? '').toLowerCase().includes(q));
  }, [leveledInBook, search, levelFilter]);

  function togglePrepared(spell: Dnd5ePreparedSpell) {
    if (preparedKeys.has(spell.id)) {
      onChange(prepared.filter((sp) => sp.id !== spell.id));
      return;
    }
    if (preparedLimit !== undefined && preparedLeveledCount >= preparedLimit) {
      // At cap — toggling on would exceed the limit. The button is
      // disabled in this state, but the guard catches double-clicks.
      return;
    }
    onChange([...prepared, spell]);
  }

  const filterLabel = levelFilter === 'all'
    ? 'All Levels'
    : levelFilter === 0
      ? 'Cantrips'
      : `${LEVEL_LABELS[levelFilter] ?? String(levelFilter)} level`;

  const atCap = preparedLimit !== undefined && preparedLeveledCount >= preparedLimit;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={s.backdrop} onPress={onClose}>
        <Pressable style={s.card} onPress={() => {}}>
          <View style={s.header}>
            <Text style={s.title} numberOfLines={1}>Prepare spells</Text>
            <TouchableOpacity onPress={onClose} hitSlop={10}>
              <MaterialCommunityIcons name="close" size={22} color={colors.onSurfaceVariant} />
            </TouchableOpacity>
          </View>

          {/* Cantrips header — always-prepared, just a status display. */}
          {cantripsInBook.length > 0 && (
            <View style={s.cantripBand}>
              <Text style={s.cantripLabel}>CANTRIPS · ALWAYS PREPARED</Text>
              <Text style={s.cantripList} numberOfLines={2}>
                {cantripsInBook.map((c) => c.name).join(' · ')}
              </Text>
            </View>
          )}

          <View style={s.controlsRow}>
            <View style={s.searchBox}>
              <MaterialCommunityIcons name="magnify" size={16} color={colors.outline} />
              <TextInput
                style={s.searchInput}
                placeholder="Search spellbook…"
                placeholderTextColor={colors.outline}
                value={search}
                onChangeText={setSearch}
              />
            </View>
            <PrepLevelFilterDropdown
              value={levelFilter}
              availableLevels={availableLevels}
              onChange={setLevelFilter}
              onOpenNativeMenu={() => setFilterMenuOpen(true)}
              label={filterLabel}
            />
          </View>

          {leveledInBook.length > 0 && (
            <View style={s.summaryRow}>
              <Text style={[s.summaryChunk, atCap && s.summaryChunkAtLimit]}>
                {preparedLimit !== undefined
                  ? `${preparedLeveledCount}/${preparedLimit} prepared`
                  : `${preparedLeveledCount} prepared`}
              </Text>
            </View>
          )}

          <ScrollView style={s.list} contentContainerStyle={{ paddingBottom: spacing.md }}>
            {leveledInBook.length === 0 ? (
              <Text style={s.emptyText}>
                No leveled spells in your spellbook yet. Use Manage Spells to add some.
              </Text>
            ) : filtered.length === 0 ? (
              <Text style={s.emptyText}>No matching spells in your spellbook.</Text>
            ) : null}

            {(() => {
              // Section headers when filter is "all" so the player
              // sees the level-bucket structure of their spellbook.
              const out: React.ReactNode[] = [];
              let lastLevel: number | null = null;
              for (const sp of filtered) {
                if (levelFilter === 'all' && sp.level !== lastLevel) {
                  out.push(
                    <View key={`header-${sp.level}`} style={s.groupHeader}>
                      <Text style={s.groupHeaderText}>
                        {`${LEVEL_LABELS[sp.level]?.toUpperCase() ?? `LEVEL ${sp.level}`} LEVEL`}
                      </Text>
                      <View style={s.groupHeaderRule} />
                    </View>
                  );
                  lastLevel = sp.level;
                }
                const isPrep = preparedKeys.has(sp.id);
                const disabled = !isPrep && atCap;
                out.push(
                  <Pressable
                    key={sp.id}
                    style={[s.row, disabled && s.rowDisabled]}
                    onPress={() => !disabled && togglePrepared(sp)}
                  >
                    <View style={[s.statusCircle, isPrep && s.statusCircleAdded]}>
                      {isPrep ? (
                        <MaterialCommunityIcons name="check" size={12} color={colors.onPrimary} />
                      ) : null}
                    </View>
                    <View style={s.levelBadge}>
                      <Text style={s.levelBadgeText}>{sp.level}</Text>
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={s.rowName}>{sp.name}</Text>
                    </View>
                    {sp.school ? (
                      <Text style={s.rowSource} numberOfLines={1}>{sp.school}</Text>
                    ) : null}
                  </Pressable>
                );
              }
              return out;
            })()}
          </ScrollView>
        </Pressable>
      </Pressable>

      {/* Native popover for level filter on iOS/Android. */}
      <Modal
        visible={filterMenuOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setFilterMenuOpen(false)}
      >
        <Pressable style={s.menuBackdrop} onPress={() => setFilterMenuOpen(false)}>
          <Pressable style={s.menuCard} onPress={() => {}}>
            <PrepFilterMenuItem
              label="All Levels"
              active={levelFilter === 'all'}
              onPress={() => { setLevelFilter('all'); setFilterMenuOpen(false); }}
            />
            {availableLevels.map((lvl) => (
              <PrepFilterMenuItem
                key={lvl}
                label={`${LEVEL_LABELS[lvl] ?? String(lvl)} level`}
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

function PrepLevelFilterDropdown({
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
                <Option key={lvl} value={String(lvl)}>{`${LEVEL_LABELS[lvl] ?? String(lvl)} level`}</Option>
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

function PrepFilterMenuItem({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity style={[s.menuItem, active && s.menuItemActive]} onPress={onPress} activeOpacity={0.7}>
      <Text style={[s.menuItemText, active && s.menuItemTextActive]}>{label}</Text>
      {active ? <MaterialCommunityIcons name="check" size={16} color={colors.primary} /> : null}
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  backdrop: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
  card: {
    width: '100%', maxWidth: 640, maxHeight: '70%',
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

  cantripBand: {
    backgroundColor: colors.surfaceContainerLowest,
    borderRadius: radius.lg,
    padding: spacing.sm,
    marginBottom: spacing.sm,
    borderWidth: 1, borderColor: colors.outlineVariant,
  },
  cantripLabel: {
    fontSize: 9, fontFamily: fonts.label, fontWeight: '700',
    letterSpacing: 1.2, color: colors.primary, marginBottom: 4,
  },
  cantripList: {
    fontSize: 12, fontFamily: fonts.body, color: colors.onSurfaceVariant, lineHeight: 18,
  },

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
  searchInput: { flex: 1, fontSize: 13, fontFamily: fonts.body, color: colors.onSurface },
  filterBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: colors.surfaceContainerHigh,
    borderRadius: radius.lg,
    paddingHorizontal: 12, paddingVertical: 9,
    borderWidth: 1, borderColor: colors.outlineVariant,
    minWidth: 140, position: 'relative',
  },
  filterBtnLabel: {
    flex: 1, fontSize: 12, fontFamily: fonts.label, fontWeight: '600',
    color: colors.onSurface, letterSpacing: 0.3,
  },
  htmlSelect: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    opacity: 0, cursor: 'pointer', appearance: 'none',
    border: 0, background: 'transparent', width: '100%', height: '100%',
  } as any,

  summaryRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingBottom: spacing.sm, paddingHorizontal: 2,
  },
  summaryChunk: {
    fontSize: 11, fontFamily: fonts.label, fontWeight: '600',
    color: colors.outline, letterSpacing: 0.4,
  },
  summaryChunkAtLimit: { color: colors.primary, fontWeight: '700' },

  list: { flexShrink: 1 },
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
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.outlineVariant,
  },
  rowDisabled: { opacity: 0.45 },
  statusCircle: {
    width: 20, height: 20, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: colors.outline,
  },
  statusCircleAdded: { backgroundColor: colors.primary, borderColor: colors.primary },
  levelBadge: {
    width: 24, height: 24, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.surfaceContainerHighest,
    borderWidth: 1, borderColor: colors.outlineVariant,
  },
  levelBadgeText: { fontSize: 10, fontFamily: fonts.label, fontWeight: '700', color: colors.onSurfaceVariant },
  rowName: { fontSize: 14, fontFamily: fonts.headline, fontWeight: '600', color: colors.onSurface },
  rowSource: {
    fontSize: 11, fontFamily: fonts.label, fontWeight: '600',
    color: colors.outline, letterSpacing: 0.3,
    marginRight: 4, maxWidth: 140,
  },

  emptyText: { paddingVertical: 24, textAlign: 'center', color: colors.outline, fontFamily: fonts.body },

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
