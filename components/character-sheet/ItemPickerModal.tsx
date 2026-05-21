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
  const [customOpen, setCustomOpen] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setSearch('');
    setCategory('all');
    setPreviewKey(null);
    setCustomOpen(false);
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

  // Collapse magic-item variants into a single row. Variants ship in
  // several naming flavors:
  //   SRD            → "Longsword (+1)"           (parens suffix)
  //   5e.tools alt 1 → "Longsword +1"             (bare suffix)
  //   5e.tools alt 2 → "+1 Longsword"             (bare prefix)
  // The 5e.tools import transform also stamps `data.baseItemRef.name`
  // directly on each generated variant — we prefer that signal when
  // present and fall back to regex stripping for everything else.
  const grouped = useMemo(() => {
    const stripVariant = (name: string) => name
      .replace(/\s*\(\+\d+\)\s*$/, '')      // "Longsword (+1)"
      .replace(/\s+\+\d+\s*$/, '')           // "Longsword +1"
      .replace(/^\+\d+\s+/, '')              // "+1 Longsword"
      .trim();
    const parsePlus = (name: string): number => {
      const m = name.match(/(?:\(\+(\d+)\)|\s\+(\d+)|^\+(\d+)\s)/);
      if (!m) return 0;
      const v = m[1] ?? m[2] ?? m[3];
      return v ? parseInt(v, 10) : 0;
    };
    const baseRefName = (it: ItemResult): string | null => {
      const ref = (it as { data?: { baseItemRef?: { name?: string } } }).data?.baseItemRef;
      return ref?.name ?? null;
    };
    const groupKey = (it: ItemResult) => {
      // Prefer the import transform's explicit baseItemRef.name — it
      // groups "Longsword", "+1 Longsword", "+2 Longsword", and
      // "Adamantine Longsword" reliably even when the prefix/suffix
      // varies. Falls back to regex-stripped name for SRD entries.
      const explicitBase = baseRefName(it);
      const base = (explicitBase ?? stripVariant(it.name)).toLowerCase();
      // Different slots → different objects (a Shield +1 isn't a
      // Longsword +1), so include the resolved slot in the key.
      return `${mapItemToSlot(it)}::${base}`;
    };
    const groups = new Map<string, { baseName: string; variants: ItemResult[] }>();
    for (const it of filtered) {
      const k = groupKey(it);
      const cur = groups.get(k);
      if (cur) cur.variants.push(it);
      else groups.set(k, { baseName: stripVariant(it.name), variants: [it] });
    }
    // Sort variants inside each group: mundane / +0 first, then
    // +N ascending, then non-numeric variant labels (Adamantine,
    // Vorpal, …) alphabetically. Keeps the chip strip readable.
    for (const g of groups.values()) {
      g.variants.sort((a, b) => {
        const pa = parsePlus(a.name);
        const pb = parsePlus(b.name);
        if (pa !== pb) return pa - pb;
        return a.name.localeCompare(b.name);
      });
    }
    // Group order follows the picker's sort (alphabetical by base
    // name). Lone groups behave like the old single-row entries.
    return Array.from(groups.values())
      .sort((a, b) => a.baseName.localeCompare(b.baseName));
  }, [filtered]);

  // When the player taps a row, the picker tracks which variant is
  // selected within the group by the variant's own catalog key.
  // Defaults to the head variant (mundane / lowest +N) on open.
  const [variantKey, setVariantKey] = useState<string | null>(null);
  useEffect(() => {
    if (!previewKey) return;
    setVariantKey(previewKey);
  }, [previewKey]);

  const previewGroup = previewKey
    ? grouped.find((g) => g.variants.some((v) => v.key === previewKey))
    : null;
  const preview = previewGroup
    ? previewGroup.variants.find((v) => v.key === variantKey) ?? previewGroup.variants[0]
    : (previewKey ? list.find((it) => it.key === previewKey) : null);

  function commit(item: ItemResult) {
    onPick(itemResultToEquipment(item));
    onClose();
  }

  function commitCustom(custom: Dnd5eEquipmentItem) {
    onPick(custom);
    onClose();
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={s.backdrop} onPress={onClose}>
        <Pressable style={s.card} onPress={() => {}}>
          <View style={s.header}>
            <Text style={s.title} numberOfLines={1}>
              {customOpen ? 'Custom item' : preview ? preview.name : 'Add equipment'}
            </Text>
            <TouchableOpacity onPress={onClose} hitSlop={10}>
              <MaterialCommunityIcons name="close" size={22} color={colors.onSurfaceVariant} />
            </TouchableOpacity>
          </View>

          {loading ? (
            <View style={s.loadingWrap}>
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : customOpen ? (
            <CustomItemForm
              onBack={() => setCustomOpen(false)}
              onCommit={commitCustom}
            />
          ) : preview ? (
            <ItemDetail
              item={preview}
              variants={previewGroup && previewGroup.variants.length > 1 ? previewGroup.variants : null}
              groupBaseName={previewGroup?.baseName}
              selectedKey={preview.key}
              onSelectKey={setVariantKey}
              onBack={() => setPreviewKey(null)}
              onPick={() => commit(preview)}
            />
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

              <TouchableOpacity
                style={s.customAddBtn}
                onPress={() => setCustomOpen(true)}
                activeOpacity={0.7}
              >
                <MaterialCommunityIcons name="plus-circle-outline" size={14} color={colors.primary} />
                <Text style={s.customAddText}>Add custom item</Text>
              </TouchableOpacity>

              <ScrollView style={s.list} contentContainerStyle={{ paddingBottom: spacing.md }}>
                {grouped.length === 0 ? (
                  <Text style={s.emptyText}>No matching items.</Text>
                ) : null}
                {grouped.map((group) => {
                  // The base variant (mundane / +0) is the representative
                  // for the row; if the group is magic-only, fall back to
                  // the lowest +N entry. Category + rarity meta line
                  // mirrors the variant the user would land on by default.
                  const head = group.variants[0];
                  const hasVariants = group.variants.length > 1;
                  return (
                    <Pressable key={head.key} style={s.row} onPress={() => setPreviewKey(head.key)}>
                      <View style={s.iconBox}>
                        <MaterialCommunityIcons name={iconFor(head.category) as any} size={16} color={colors.outline} />
                      </View>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={s.rowName}>{group.baseName}</Text>
                        <Text style={s.rowMeta} numberOfLines={1}>
                          {CATEGORY_LABELS[head.category as CategoryFilter] ?? head.category}
                          {head.rarity ? ` · ${head.rarity}` : ''}
                          {head.requiresAttunement ? ' · attunement' : ''}
                          {hasVariants ? ` · ${group.variants.length} variants` : ''}
                        </Text>
                      </View>
                      {head.cost ? (
                        <Text style={s.rowCost}>{head.cost.amount} {head.cost.currency}</Text>
                      ) : null}
                      <MaterialCommunityIcons name="chevron-right" size={18} color={colors.outline} />
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

function ItemDetail({ item, variants, groupBaseName, selectedKey, onSelectKey, onBack, onPick }: {
  item: ItemResult;
  /** Sibling variants (incl. the current one) when the picker grouped
   *  related rows together. Null when the item is a one-off. */
  variants?: ItemResult[] | null;
  groupBaseName?: string;
  selectedKey: string;
  onSelectKey: (key: string) => void;
  onBack: () => void;
  onPick: () => void;
}) {
  // Chip label: prefer the import transform's explicit variantLabel
  // (e.g. "+1", "Adamantine", "Vorpal"), else infer from the name —
  // either a +N suffix/prefix or, when the variant matches the group's
  // base name, "Mundane".
  const variantChipLabel = (v: ItemResult): string => {
    const explicit = (v as { data?: { variantLabel?: string } }).data?.variantLabel;
    if (explicit && explicit.trim().length > 0) return explicit.trim();
    const plusMatch = v.name.match(/(?:\(\+(\d+)\)|\s\+(\d+)|^\+(\d+)\s)/);
    if (plusMatch) {
      const plus = plusMatch[1] ?? plusMatch[2] ?? plusMatch[3];
      if (plus) return `+${plus}`;
    }
    if (groupBaseName && v.name.toLowerCase() === groupBaseName.toLowerCase()) {
      return 'Mundane';
    }
    return v.name;
  };
  return (
    <ScrollView contentContainerStyle={s.detailWrap}>
      <Pressable onPress={onBack} style={s.backLink}>
        <MaterialCommunityIcons name="chevron-left" size={16} color={colors.onSurfaceVariant} />
        <Text style={s.backText}>Back</Text>
      </Pressable>

      {variants && variants.length > 1 ? (
        <View style={s.variantStrip}>
          <Text style={s.variantLabel}>Variant</Text>
          <View style={s.variantChips}>
            {variants.map((v) => {
              const active = v.key === selectedKey;
              return (
                <TouchableOpacity
                  key={v.key}
                  onPress={() => onSelectKey(v.key)}
                  activeOpacity={0.7}
                  style={[s.variantChip, active && s.variantChipActive]}
                >
                  <Text style={[s.variantChipText, active && s.variantChipTextActive]}>
                    {variantChipLabel(v)}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      ) : null}

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
  const slot = mapItemToSlot(item);
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

  // Armor AC. Two property shapes ship through here:
  //   SRD       → "AC 11 + Dex modifier" / "AC 14 + Dex modifier (max 2)" / "AC 18"
  //   Imported  → "Base AC 12" (no DEX info; the armor type code that
  //               carried it lives upstream as LA/MA/HA and never made
  //               it into properties). Light/Medium/Heavy needs to be
  //               inferred from a separate "Light Armor" / "Medium
  //               Armor" / "Heavy Armor" property line when present.
  let acBase: number | undefined;
  let dexCap: number | null | undefined;
  if (slot === 'armor') {
    const acLine = props.find((p) => /^(?:base\s+)?ac\s+\d/i.test(p));
    if (acLine) {
      const acMatch = acLine.match(/ac\s+(\d+)/i);
      if (acMatch) acBase = parseInt(acMatch[1], 10);
      // Prefer the inline " + Dex" / "max N" signal when the line
      // carries it (SRD shape).
      const hasPlusDex = /\+\s*dex/i.test(acLine);
      const isBaseAcLine = /^base\s+ac/i.test(acLine);
      if (hasPlusDex) {
        const capMatch = acLine.match(/max\s+(\d+)/i);
        dexCap = capMatch ? parseInt(capMatch[1], 10) : null;
      } else if (!isBaseAcLine) {
        // SRD "AC 18" with no "+ Dex" → heavy, no DEX.
        dexCap = 0;
      }
      // Imported "Base AC 12" with no inline DEX info → fall through
      // to the type-line check below. We can't assume heavy; that
      // gave Studded Leather no DEX bonus.
    }
    // Type line — present on the SRD shape ("Light Armor") and on
    // imported-content output once the transform fix lands. Falls
    // back to null (full DEX) when nothing matches; better to over-
    // give DEX than to silently null it out and surprise the player.
    if (dexCap === undefined) {
      const typeLine = props.find((p) => /^(?:light|medium|heavy)\s+armor$/i.test(p));
      if (typeLine) {
        if (/^heavy/i.test(typeLine)) dexCap = 0;
        else if (/^medium/i.test(typeLine)) dexCap = 2;
        else dexCap = null;
      } else {
        dexCap = null;
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
  // any property line that isn't the damage / mastery / structured-AC
  // line we already absorbed.
  const flavorProps: string[] = [];
  for (const p of props) {
    if (/damage/i.test(p)) continue;
    if (/^(?:base\s+)?ac\s+/i.test(p)) continue;
    if (/^mastery/i.test(p)) continue;
    // Armor-type lines are absorbed into the dexCap field. Drop them
    // from flavor too, since the row already shows a Light/Medium/
    // Heavy pill derived from the structured fields. Also drop from
    // shields, where the Open5e SRD 2024 mis-categorization ships a
    // bogus "Heavy Armor" tag on the Shield.
    if (/^(heavy|medium|light)\s+armor$/i.test(p)) continue;
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
    miscACBonus: parseMagicACBonus(item),
    properties: flavorProps.length > 0 ? flavorProps : undefined,
    notes: item.description?.slice(0, 240),
    weight: item.weight,
    requiresAttunement: !!item.requiresAttunement,
    attuned: false,
  };
}

/**
 * Pick the equipment slot for a catalog item. Mundane items map by
 * category. Magic items carry their physical form on `data.magicItemKind`
 * (set by the SRD/imported-content transforms): a "Plate Armor +1"
 * lands as category='magic-item' but kind='armor', so we route it to
 * the armor slot so it actually contributes to AC.
 *
 * Open5e SRD 2024 data quirk: the Shield entry ships as
 * category='armor' with properties=["AC 2", "Heavy Armor"] — clearly
 * an upstream data bug (it's a shield, not heavy armor). Detect by
 * exact name and re-route to the shield slot so the +2 actually
 * applies. The 5.1 dataset has it correctly as category='shield'.
 */
function mapItemToSlot(item: ItemResult): EquipmentSlot {
  if (item.category === 'armor' && /^shield$/i.test(item.name.trim())) return 'shield';
  if (item.category === 'magic-item') {
    const kind = (item as { data?: { magicItemKind?: string | null } }).data?.magicItemKind;
    if (kind === 'armor') return 'armor';
    if (kind === 'shield') return 'shield';
    if (kind === 'weapon') return 'weapon';
    return 'other';
  }
  switch (item.category) {
    case 'weapon': return 'weapon';
    case 'armor': return 'armor';
    case 'shield': return 'shield';
    default: return 'other';
  }
}

/**
 * Look for a numeric AC bonus in a magic item's description / properties.
 * Covers Cloak of Protection ("+1 bonus to AC"), Ring of Protection,
 * Bracers of Defense ("AC ... increase by 2"), and the +N suffix
 * convention for magic armor/shields/weapons. Returns undefined when
 * nothing matches — non-AC items should leave the field unset.
 */
function parseMagicACBonus(item: ItemResult): number | undefined {
  if (item.category !== 'magic-item') return undefined;
  const haystack = `${item.description ?? ''} ${(item.properties ?? []).join(' ')}`;
  const patterns: RegExp[] = [
    /\+\s*(\d+)\s+bonus to (?:your\s+)?(?:AC|Armor Class)/i,
    /\+\s*(\d+)\s+to (?:your\s+)?(?:AC|Armor Class)/i,
    /bonus to (?:your\s+)?(?:AC|Armor Class)(?:[^.]*?)of\s+\+?\s*(\d+)/i,
    /(?:AC|Armor Class)(?:[^.]*?)(?:increases?|increased)\s+by\s+(\d+)/i,
  ];
  for (const re of patterns) {
    const m = haystack.match(re);
    if (m) return parseInt(m[1], 10);
  }
  // Fall back to a "+N" suffix on the item name — the conventional
  // form for magic armor/shields/weapons ("Plate Armor +1").
  const nameMatch = item.name.match(/\+\s*(\d+)\s*$/);
  if (nameMatch) return parseInt(nameMatch[1], 10);
  return undefined;
}

// Lets players add one-off items the SRD doesn't ship (DM-granted
// quest items, custom homebrew gear, etc.) without round-tripping
// through the homebrew pack authoring flow. The fields mirror the
// ones GearTab actually displays, so anything entered here renders
// the same way a catalog pick does.
function CustomItemForm({
  onBack,
  onCommit,
}: {
  onBack: () => void;
  onCommit: (item: Dnd5eEquipmentItem) => void;
}) {
  const [name, setName] = useState('');
  const [slot, setSlot] = useState<EquipmentSlot>('other');
  const [damage, setDamage] = useState('');
  const [acBase, setAcBase] = useState('');
  const [weight, setWeight] = useState('');
  const [notes, setNotes] = useState('');

  const canCommit = name.trim().length > 0;

  function build(): Dnd5eEquipmentItem {
    const weightNum = weight ? parseFloat(weight) : undefined;
    const acBaseNum = acBase ? parseInt(acBase, 10) : undefined;
    return {
      id: `custom-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name: name.trim(),
      slot,
      equipped: false,
      damage: slot === 'weapon' && damage.trim() ? damage.trim() : undefined,
      acBase: slot === 'armor' && acBaseNum != null && !isNaN(acBaseNum) ? acBaseNum : undefined,
      weight: weightNum != null && !isNaN(weightNum) ? weightNum : undefined,
      notes: notes.trim() || undefined,
      requiresAttunement: false,
      attuned: false,
    };
  }

  const SLOT_OPTIONS: Array<{ value: EquipmentSlot; label: string }> = [
    { value: 'other', label: 'Gear' },
    { value: 'weapon', label: 'Weapon' },
    { value: 'armor', label: 'Armor' },
    { value: 'shield', label: 'Shield' },
  ];

  return (
    <ScrollView contentContainerStyle={s.detailWrap} keyboardShouldPersistTaps="handled">
      <Pressable onPress={onBack} style={s.backLink}>
        <MaterialCommunityIcons name="chevron-left" size={16} color={colors.onSurfaceVariant} />
        <Text style={s.backText}>Back to catalog</Text>
      </Pressable>

      <Text style={s.fieldLabel}>Name</Text>
      <TextInput
        style={s.fieldInput}
        value={name}
        onChangeText={setName}
        placeholder="Heirloom dagger, signet ring, lockpicks…"
        placeholderTextColor={colors.outline}
      />

      <Text style={s.fieldLabel}>Slot</Text>
      <View style={s.chipsRow}>
        {SLOT_OPTIONS.map((opt) => (
          <Chip
            key={opt.value}
            label={opt.label}
            active={slot === opt.value}
            onPress={() => setSlot(opt.value)}
          />
        ))}
      </View>

      {slot === 'weapon' && (
        <>
          <Text style={s.fieldLabel}>Damage</Text>
          <TextInput
            style={s.fieldInput}
            value={damage}
            onChangeText={setDamage}
            placeholder="1d8 slashing"
            placeholderTextColor={colors.outline}
          />
        </>
      )}

      {slot === 'armor' && (
        <>
          <Text style={s.fieldLabel}>Base AC</Text>
          <TextInput
            style={s.fieldInput}
            value={acBase}
            onChangeText={setAcBase}
            placeholder="14"
            placeholderTextColor={colors.outline}
            keyboardType="number-pad"
          />
        </>
      )}

      <Text style={s.fieldLabel}>Weight (lb)</Text>
      <TextInput
        style={s.fieldInput}
        value={weight}
        onChangeText={setWeight}
        placeholder="0"
        placeholderTextColor={colors.outline}
        keyboardType="decimal-pad"
      />

      <Text style={s.fieldLabel}>Notes</Text>
      <TextInput
        style={[s.fieldInput, s.fieldInputMulti]}
        value={notes}
        onChangeText={setNotes}
        placeholder="Description, flavor, mechanics…"
        placeholderTextColor={colors.outline}
        multiline
      />

      <TouchableOpacity
        style={[s.commitBtn, !canCommit && s.commitBtnDisabled]}
        onPress={canCommit ? () => onCommit(build()) : undefined}
        activeOpacity={canCommit ? 0.85 : 1}
      >
        <Text style={s.commitText}>Add item</Text>
      </TouchableOpacity>
    </ScrollView>
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

  // Lets the list grow to fill available card height when there's a lot
  // of content, and stay snug to its content when the result set is
  // short. Without this, an old `maxHeight: '60%'` left ~25% of the
  // modal blank below short lists.
  list: { flexShrink: 1, minHeight: 0 },
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

  variantStrip: { marginBottom: spacing.sm },
  variantLabel: {
    fontSize: 9, fontFamily: fonts.label, fontWeight: '700',
    letterSpacing: 1.2, textTransform: 'uppercase',
    color: colors.outline, marginBottom: 6,
  },
  variantChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  variantChip: {
    paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1, borderColor: colors.outlineVariant,
    backgroundColor: colors.surfaceContainer,
  },
  variantChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  variantChipText: { fontSize: 11, fontFamily: fonts.label, fontWeight: '700', color: colors.outline },
  variantChipTextActive: { color: colors.onPrimary },
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
  commitBtnDisabled: { backgroundColor: colors.surfaceContainerHigh },
  commitText: { fontSize: 14, fontFamily: fonts.label, fontWeight: '700', color: colors.onPrimary, letterSpacing: 0.5 },

  customAddBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingVertical: 8, paddingHorizontal: 10,
    borderRadius: radius.lg,
    borderWidth: 1, borderColor: colors.outlineVariant,
    borderStyle: 'dashed',
    backgroundColor: colors.surfaceContainer,
    alignSelf: 'flex-start',
    marginBottom: spacing.sm,
  },
  customAddText: {
    fontSize: 12, fontFamily: fonts.label, fontWeight: '700',
    color: colors.primary, letterSpacing: 0.3,
  },

  fieldLabel: {
    fontSize: 9, fontFamily: fonts.label, fontWeight: '700',
    letterSpacing: 1.2, textTransform: 'uppercase', color: colors.outline,
    marginTop: spacing.sm, marginBottom: 4,
  },
  fieldInput: {
    fontSize: 13, fontFamily: fonts.body, color: colors.onSurface,
    backgroundColor: colors.surfaceContainerHigh,
    borderRadius: radius.lg,
    paddingHorizontal: 12, paddingVertical: 9,
    borderWidth: 1, borderColor: colors.outlineVariant,
  },
  fieldInputMulti: { minHeight: 64, textAlignVertical: 'top' },
});
