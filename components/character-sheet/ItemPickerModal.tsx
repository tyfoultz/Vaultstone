// Catalog item picker for the character sheet's GearTab "+ Add"
// affordance. Mirrors FeatPickerModal / SpellPickerModal: pulls from
// ContentResolver scoped to the character's campaign + pack opt-in
// (so imported homebrew items surface), grouped by category with a
// search box, and commits to resources.equipment[] via the parent.
//
// ItemResult → Dnd5eEquipmentItem mapping — the catalog ships weapon
// damage / armor AC inside a `properties: string[]` field as
// human-readable lines ("Damage: 1d8 slashing", "AC 14 + Dex (max 2)").
// We parse those into the structured equipment slots so attack-bonus
// math + AC computation work without the player retyping anything.

import { useEffect, useMemo, useState } from 'react';
import {
  View, Text, Modal, Pressable, ScrollView, TouchableOpacity,
  ActivityIndicator, TextInput, StyleSheet,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { ContentResolver } from '@vaultstone/content';
import { colors, fonts, radius, spacing } from '@vaultstone/ui';
import type { Dnd5eEquipmentItem, EquipmentSlot, ItemResult } from '@vaultstone/types';

type CategoryFilter = 'all' | 'weapon' | 'armor' | 'shield' | 'adventuring-gear' | 'magic-item';

const CATEGORY_LABELS: Record<CategoryFilter, string> = {
  all: 'All',
  weapon: 'Weapons',
  armor: 'Armor',
  shield: 'Shields',
  'adventuring-gear': 'Gear',
  'magic-item': 'Magic',
};

let _itemCache: { key: string; items: ItemResult[]; ts: number } | null = null;
const ITEM_CACHE_TTL = 5 * 60_000;

type Props = {
  visible: boolean;
  onClose: () => void;
  campaignId?: string | null;
  packIds?: string[];
  srdVersion?: 'SRD_5.1' | 'SRD_2.0';
  onPick: (item: Dnd5eEquipmentItem) => void;
};

export function ItemPickerModal({
  visible, onClose, campaignId, packIds, srdVersion, onPick,
}: Props) {
  const cacheKey = `${srdVersion ?? ''}:${campaignId ?? ''}:${(packIds ?? []).join(',')}`;
  const cached = _itemCache && _itemCache.key === cacheKey && Date.now() - _itemCache.ts < ITEM_CACHE_TTL ? _itemCache.items : null;
  const [list, setList] = useState<ItemResult[]>(cached ?? []);
  const [loading, setLoading] = useState(!cached);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<CategoryFilter>('all');
  const [previewKey, setPreviewKey] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setSearch('');
    setCategory('all');
    setPreviewKey(null);
    if (_itemCache && _itemCache.key === cacheKey && Date.now() - _itemCache.ts < ITEM_CACHE_TTL) {
      setList(_itemCache.items);
      setLoading(false);
      return;
    }
    setLoading(true);
    const includeHomebrew = !!campaignId || (packIds?.length ?? 0) > 0;
    const tiers: Array<'srd' | 'homebrew'> = includeHomebrew ? ['srd', 'homebrew'] : ['srd'];
    ContentResolver.search({
      type: 'item',
      system: 'dnd5e',
      srdVersion,
      tiers,
      campaignId: campaignId ?? undefined,
      packIds: !campaignId && packIds && packIds.length > 0 ? packIds : undefined,
    })
      .then((r) => {
        const items = r as ItemResult[];
        _itemCache = { key: cacheKey, items, ts: Date.now() };
        setList(items);
      })
      .finally(() => setLoading(false));
  }, [visible, srdVersion, campaignId, (packIds ?? []).join(',')]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return list
      .filter((it) => category === 'all' || it.category === category)
      .filter((it) => !q
        || it.name.toLowerCase().includes(q)
        || (it.description ?? '').toLowerCase().includes(q),
      )
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [list, search, category]);

  const preview = previewKey ? list.find((it) => it.key === previewKey) : null;

  function commit(item: ItemResult) {
    onPick(itemResultToEquipment(item));
    onClose();
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={s.backdrop} onPress={onClose}>
        <Pressable style={s.card} onPress={() => {}}>
          <View style={s.header}>
            <Text style={s.title} numberOfLines={1}>{preview ? preview.name : 'Add equipment'}</Text>
            <TouchableOpacity onPress={onClose} hitSlop={10}>
              <MaterialCommunityIcons name="close" size={22} color={colors.onSurfaceVariant} />
            </TouchableOpacity>
          </View>

          {loading ? (
            <View style={s.loadingWrap}>
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : preview ? (
            <ItemDetail item={preview} onBack={() => setPreviewKey(null)} onPick={() => commit(preview)} />
          ) : (
            <>
              <View style={s.searchRow}>
                <MaterialCommunityIcons name="magnify" size={16} color={colors.outline} />
                <TextInput
                  style={s.searchInput}
                  placeholder="Search items…"
                  placeholderTextColor={colors.outline}
                  value={search}
                  onChangeText={setSearch}
                />
              </View>

              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chipsRow} style={{ flexGrow: 0 }}>
                {(Object.keys(CATEGORY_LABELS) as CategoryFilter[]).map((cat) => (
                  <Chip
                    key={cat}
                    label={CATEGORY_LABELS[cat]}
                    active={category === cat}
                    onPress={() => setCategory(cat)}
                  />
                ))}
              </ScrollView>

              <ScrollView style={s.list} contentContainerStyle={{ paddingBottom: spacing.md }}>
                {filtered.length === 0 ? (
                  <Text style={s.emptyText}>No matching items.</Text>
                ) : null}
                {filtered.map((it) => (
                  <Pressable key={it.key} style={s.row} onPress={() => setPreviewKey(it.key)}>
                    <View style={s.iconBox}>
                      <MaterialCommunityIcons name={iconFor(it.category) as any} size={16} color={colors.outline} />
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={s.rowName}>{it.name}</Text>
                      <Text style={s.rowMeta} numberOfLines={1}>
                        {CATEGORY_LABELS[it.category as CategoryFilter] ?? it.category}
                        {it.rarity ? ` · ${it.rarity}` : ''}
                        {it.requiresAttunement ? ' · attunement' : ''}
                      </Text>
                    </View>
                    {it.cost ? (
                      <Text style={s.rowCost}>{it.cost.amount} {it.cost.currency}</Text>
                    ) : null}
                    <MaterialCommunityIcons name="chevron-right" size={18} color={colors.outline} />
                  </Pressable>
                ))}
              </ScrollView>
            </>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity style={[s.chip, active && s.chipActive]} onPress={onPress} activeOpacity={0.7}>
      <Text style={[s.chipText, active && s.chipTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

function iconFor(category: ItemResult['category']): string {
  switch (category) {
    case 'weapon': return 'sword';
    case 'armor': return 'shield-account';
    case 'shield': return 'shield-half-full';
    case 'magic-item': return 'star-four-points';
    default: return 'bag-personal';
  }
}

function ItemDetail({ item, onBack, onPick }: { item: ItemResult; onBack: () => void; onPick: () => void }) {
  return (
    <ScrollView contentContainerStyle={s.detailWrap}>
      <Pressable onPress={onBack} style={s.backLink}>
        <MaterialCommunityIcons name="chevron-left" size={16} color={colors.onSurfaceVariant} />
        <Text style={s.backText}>Back</Text>
      </Pressable>

      <View style={s.metaGrid}>
        <DetailMeta label="Category" value={CATEGORY_LABELS[item.category as CategoryFilter] ?? item.category} />
        {item.cost ? <DetailMeta label="Cost" value={`${item.cost.amount} ${item.cost.currency}`} /> : null}
        {typeof item.weight === 'number' ? <DetailMeta label="Weight" value={`${item.weight} lb`} /> : null}
        {item.rarity ? <DetailMeta label="Rarity" value={item.rarity} /> : null}
        {item.requiresAttunement ? <DetailMeta label="Attunement" value="Required" /> : null}
      </View>

      {item.properties && item.properties.length > 0 ? (
        <View style={s.detailBlock}>
          <Text style={s.detailLabel}>PROPERTIES</Text>
          {item.properties.map((p, i) => <Text key={i} style={s.bulletItem}>• {p}</Text>)}
        </View>
      ) : null}

      {item.description ? (
        <Text style={s.detailDesc}>{item.description}</Text>
      ) : null}

      <TouchableOpacity style={s.commitBtn} onPress={onPick} activeOpacity={0.85}>
        <Text style={s.commitText}>{`Add ${item.name}`}</Text>
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

// ItemResult → Dnd5eEquipmentItem. The catalog isn't structured at the
// equipment-slot level (a weapon's damage lives in `properties[]` as a
// string, not a typed field), so we parse the strings into the slots
// the sheet needs. Anything we can't parse falls through to `notes`
// so the player still sees the original prose.
export function itemResultToEquipment(item: ItemResult): Dnd5eEquipmentItem {
  const slot = mapCategoryToSlot(item.category);
  const props = item.properties ?? [];

  // Find the damage line for weapons. Patterns the catalog ships:
  //   "Damage: 1d8 slashing"
  //   "Damage 1d6 piercing"
  //   "1d8 slashing"
  let damage: string | undefined;
  if (slot === 'weapon') {
    const dmgLine = props.find((p) => /damage\s*:?/i.test(p) || /\d+d\d+/.test(p));
    if (dmgLine) {
      const match = dmgLine.match(/(\d+d\d+(?:\s*[+-]\s*\d+)?\s*[a-z]+)/i);
      damage = match ? match[1] : dmgLine.replace(/^damage[:\s]*/i, '').trim();
    }
  }

  // Armor AC. Catalog ships lines like:
  //   "AC 11 + Dex modifier"
  //   "AC 14 + Dex modifier (max 2)"
  //   "AC 18"
  let acBase: number | undefined;
  let dexCap: number | null | undefined;
  if (slot === 'armor') {
    const acLine = props.find((p) => /^ac\s+\d/i.test(p));
    if (acLine) {
      const acMatch = acLine.match(/ac\s+(\d+)/i);
      if (acMatch) acBase = parseInt(acMatch[1], 10);
      // Heavy armor: "AC 18" → no dex bonus.
      // Medium: "AC 14 + Dex modifier (max 2)" → dexCap=2.
      // Light: "AC 11 + Dex modifier" → no cap (full dex).
      const hasPlusDex = /\+\s*dex/i.test(acLine);
      if (!hasPlusDex) {
        dexCap = 0;
      } else {
        const capMatch = acLine.match(/max\s+(\d+)/i);
        dexCap = capMatch ? parseInt(capMatch[1], 10) : null;
      }
    }
  }

  // Shield AC bonus. "AC +2" / "+2 AC".
  let acBonus: number | undefined;
  if (slot === 'shield') {
    const bonusLine = props.find((p) => /\+\s*\d+/.test(p));
    if (bonusLine) {
      const m = bonusLine.match(/\+\s*(\d+)/);
      if (m) acBonus = parseInt(m[1], 10);
    } else {
      acBonus = 2; // SRD shield default
    }
  }

  // Weapon properties (light, finesse, two-handed, etc.) — pull from
  // any property line that isn't the damage / mastery line.
  const flavorProps: string[] = [];
  for (const p of props) {
    if (/damage/i.test(p)) continue;
    if (/^ac\s+/i.test(p)) continue;
    if (/^mastery/i.test(p)) continue;
    flavorProps.push(p);
  }

  return {
    id: item.key,
    name: item.name,
    slot,
    equipped: false,
    damage,
    acBase,
    dexCap,
    acBonus,
    properties: flavorProps.length > 0 ? flavorProps : undefined,
    notes: item.description?.slice(0, 240),
    weight: item.weight,
    requiresAttunement: !!item.requiresAttunement,
    attuned: false,
  };
}

function mapCategoryToSlot(category: ItemResult['category']): EquipmentSlot {
  switch (category) {
    case 'weapon': return 'weapon';
    case 'armor': return 'armor';
    case 'shield': return 'shield';
    default: return 'other';
  }
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
  searchInput: { flex: 1, fontSize: 13, fontFamily: fonts.body, color: colors.onSurface },

  chipsRow: { flexDirection: 'row', gap: 6, paddingBottom: spacing.sm, alignItems: 'flex-start' },
  chip: {
    paddingHorizontal: 10, paddingVertical: 5,
    borderWidth: 1, borderColor: colors.outlineVariant,
    borderRadius: 100, alignSelf: 'flex-start',
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
  iconBox: {
    width: 28, height: 28, borderRadius: 6,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.surfaceContainerHighest,
    borderWidth: 1, borderColor: colors.outlineVariant,
  },
  rowName: { fontSize: 14, fontFamily: fonts.headline, fontWeight: '600', color: colors.onSurface },
  rowMeta: { fontSize: 11, fontFamily: fonts.body, color: colors.outline, marginTop: 2 },
  rowCost: { fontSize: 11, fontFamily: fonts.label, fontWeight: '600', color: colors.outline },
  emptyText: { paddingVertical: 24, textAlign: 'center', color: colors.outline, fontFamily: fonts.body },

  detailWrap: { paddingBottom: spacing.lg },
  backLink: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: spacing.sm },
  backText: { fontSize: 13, color: colors.onSurfaceVariant, fontFamily: fonts.label, fontWeight: '600' },
  metaGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.sm },
  metaCell: { minWidth: 100, paddingVertical: 4 },
  metaLabel: { fontSize: 9, fontFamily: fonts.label, fontWeight: '700', letterSpacing: 1.2, textTransform: 'uppercase', color: colors.outline },
  metaValue: { fontSize: 13, fontFamily: fonts.body, color: colors.onSurface, marginTop: 2, textTransform: 'capitalize' },
  detailBlock: { marginVertical: spacing.sm },
  detailLabel: { fontSize: 9, fontFamily: fonts.label, fontWeight: '700', letterSpacing: 1.2, color: colors.outline, marginBottom: 4 },
  bulletItem: { fontSize: 12, color: colors.onSurfaceVariant, lineHeight: 18, marginBottom: 2 },
  detailDesc: { fontSize: 13, color: colors.onSurfaceVariant, lineHeight: 19, marginTop: 8 },

  commitBtn: {
    marginTop: spacing.lg,
    backgroundColor: colors.primary,
    paddingVertical: 12, borderRadius: radius.lg,
    alignItems: 'center',
  },
  commitText: { fontSize: 14, fontFamily: fonts.label, fontWeight: '700', color: colors.onPrimary, letterSpacing: 0.5 },
});
