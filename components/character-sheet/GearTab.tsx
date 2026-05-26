import { useEffect, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet, Modal, Pressable } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { colors, fonts, spacing, radius, useBreakpoint } from '@vaultstone/ui';
import type { Dnd5eStats, Dnd5eResources, Dnd5eEquipmentItem } from '@vaultstone/types';

const COIN_LABELS: Array<{ key: keyof NonNullable<Dnd5eResources['coins']>; label: string; color: string }> = [
  { key: 'cp', label: 'CP', color: '#b87333' },
  { key: 'sp', label: 'SP', color: '#aaa9ad' },
  { key: 'ep', label: 'EP', color: '#b8b4d4' },
  { key: 'gp', label: 'GP', color: '#e6a255' },
  { key: 'pp', label: 'PP', color: '#e5e4e2' },
];

const SLOT_ICON: Record<string, string> = {
  weapon: 'sword',
  armor: 'shield',
  shield: 'shield-half-full',
  other: 'bag-personal',
};

function abilityMod(score: number) { return Math.floor((score - 10) / 2); }

interface Props {
  stats: Dnd5eStats;
  resources: Dnd5eResources;
  isOwner: boolean;
  /** When true, the tab renders in its compact (mobile / tablet)
   *  density — drops the TYPE + VALUE columns from the inventory
   *  table. Driven by the parent's `isDesktop` threshold; falls back
   *  to a local useBreakpoint() check when omitted. */
  compact?: boolean;
  strengthScore: number;
  onUpdateCoins?: (coins: NonNullable<Dnd5eResources['coins']>) => void;
  onToggleEquipped?: (id: string) => void;
  onToggleAttuned?: (id: string) => void;
  onTogglePinnedToCombat?: (id: string) => void;
  onUpdateNotes?: (notes: string) => void;
  onUpdateTreasure?: (treasure: string) => void;
  /** Open the catalog item picker. The parent owns the modal so it can
   *  pass the campaign + pack scope into ContentResolver. */
  onOpenItemPicker?: () => void;
  onRemoveItem?: (id: string) => void;
  /** Commit a player-edited Value for an equipment item. Empty/whitespace
   *  strings clear the field (the row falls back to em-dash). */
  onUpdateItemValue?: (id: string, value: string) => void;
  /** Commit a player-edited Quantity for an equipment item. The parent
   *  is responsible for clamping (non-negative integers) and dropping
   *  the field when it matches the implicit default of 1. */
  onUpdateItemQuantity?: (id: string, quantity: number) => void;
  /** Open the shared EquipmentDetailModal. Lifted to CharacterSheet so
   *  the Combat tab (and any future surface) can trigger the same modal
   *  without duplicating it. */
  onOpenEquipmentDetail?: (item: Dnd5eEquipmentItem) => void;
}

type SortKey = 'name' | 'type' | 'qty' | 'value';
type SortDir = 'asc' | 'desc';

const SLOT_LABEL: Record<string, string> = {
  weapon: 'Weapon',
  armor: 'Armor',
  shield: 'Shield',
  other: 'Other',
};

export function GearTab({
  stats, resources, isOwner, compact, strengthScore,
  onUpdateCoins, onToggleEquipped, onToggleAttuned, onTogglePinnedToCombat, onUpdateNotes, onUpdateTreasure,
  onOpenItemPicker, onRemoveItem, onUpdateItemValue, onUpdateItemQuantity,
  onOpenEquipmentDetail,
}: Props) {
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  // Attunement slot interaction: tapping an empty slot opens a picker
  // of attunable-but-not-yet-attuned items; tapping an occupied slot
  // prompts to unattune from that item. Centralizes the attune toggle
  // on the slots strip so the inventory rows stay focused on edit/use.
  const [attunePicker, setAttunePicker] = useState<
    | { kind: 'pick' }
    | { kind: 'confirm-unattune'; item: Dnd5eEquipmentItem }
    | null
  >(null);
  // Coin edit modal — tapping a coin tile opens a focused numeric
  // editor instead of an always-mounted inline input. The inline
  // input rendered a blue selection rim on web and made it easy to
  // accidentally overwrite a stored amount with a stray keystroke.
  const [editCoin, setEditCoin] = useState<{ key: keyof NonNullable<Dnd5eResources['coins']>; label: string } | null>(null);
  // On narrow viewports the TYPE + VALUE columns squeeze the name cell
  // small enough that long pills ("Versatile (1d8)", "1d8 piercing")
  // overflow into adjacent columns. Drop those two cols on mobile —
  // the slot icon already conveys type, and value is empty for the
  // vast majority of inventory rows.
  //
  // The parent (CharacterSheet) drives this via the `compact` prop
  // when it has its own breakpoint context (the tablet portrait case
  // wants compact even though useBreakpoint says isMobile=false).
  // Falls back to a local useBreakpoint when the prop is omitted.
  const bp = useBreakpoint();
  const isMobile = compact ?? bp.isMobile;
  const equipment = resources.equipment ?? [];
  const coins = resources.coins ?? { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 };

  // Attunement
  const attuned = equipment.filter((i) => i.requiresAttunement && i.attuned);
  const attunementMax = 3;

  // Equipped section reuses the full inventory row layout but sorts
  // by slot then name so weapons/armor/shields cluster predictably —
  // matches the at-a-glance ordering a player wants when scanning
  // "what's on me." Equipped items also appear in the full Inventory
  // table below so this section is a focused subset, not a partition.
  const equippedItems = [...equipment.filter((i) => i.equipped)].sort((a, b) => {
    const aT = SLOT_LABEL[a.slot] ?? a.slot;
    const bT = SLOT_LABEL[b.slot] ?? b.slot;
    if (aT !== bT) return aT.localeCompare(bT);
    return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
  });

  // Search filter — case-insensitive substring match on item name.
  const term = search.trim().toLowerCase();
  const filtered = term
    ? equipment.filter((i) => i.name.toLowerCase().includes(term))
    : equipment;

  // Sort. Items missing the active sort field always sort to the bottom,
  // independent of direction — so "—" rows don't intermix with sorted
  // values and force the player to scroll past them.
  const dir = sortDir === 'asc' ? 1 : -1;
  const rows = [...filtered].sort((a, b) => {
    if (sortKey === 'name') {
      return a.name.toLowerCase().localeCompare(b.name.toLowerCase()) * dir;
    }
    if (sortKey === 'type') {
      const aT = SLOT_LABEL[a.slot] ?? a.slot;
      const bT = SLOT_LABEL[b.slot] ?? b.slot;
      if (aT === bT) return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
      return aT.localeCompare(bT) * dir;
    }
    if (sortKey === 'qty') {
      // Quantity treats undefined as the implicit default of 1 (not as
      // "empty") since every item has a real quantity at the table —
      // a missing field just means the player hasn't bumped the stack.
      const aQ = a.quantity ?? 1;
      const bQ = b.quantity ?? 1;
      if (aQ === bQ) return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
      return (aQ - bQ) * dir;
    }
    // value
    const aV = (a.value ?? '').trim();
    const bV = (b.value ?? '').trim();
    if (!aV && !bV) return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
    if (!aV) return 1;
    if (!bV) return -1;
    if (aV.toLowerCase() === bV.toLowerCase()) {
      return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
    }
    return aV.toLowerCase().localeCompare(bV.toLowerCase()) * dir;
  });

  function toggleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  }

  // Carry weight
  const carryMax = strengthScore * 15;
  const carryWeight = equipment.reduce((sum, i) => sum + (i.weight ?? 0), 0);
  const carryRatio = carryMax > 0 ? Math.min(carryWeight / carryMax, 1) : 0;
  const carryLoad = carryWeight <= carryMax * 0.33
    ? 'Unencumbered'
    : carryWeight <= carryMax * 0.66
    ? 'Encumbered'
    : 'Heavily Encumbered';

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={s.colContent} showsVerticalScrollIndicator={false}>

      {/* Attunement Slots — tap a filled slot to unattune, an empty
          slot to pick from attunable inventory. Owner-only. */}
      <SectionLabel accent>ATTUNEMENT SLOTS</SectionLabel>
      <View style={s.attunementSlots}>
        {Array.from({ length: attunementMax }).map((_, i) => {
          const item = attuned[i];
          const handlePress = !isOwner || !onToggleAttuned
            ? undefined
            : () => {
                if (item) setAttunePicker({ kind: 'confirm-unattune', item });
                else setAttunePicker({ kind: 'pick' });
              };
          return (
            <Pressable
              key={i}
              onPress={handlePress}
              disabled={!handlePress}
              style={({ pressed }) => [
                s.attuneSlot,
                item ? s.attuneSlotActive : s.attuneSlotEmpty,
                pressed && handlePress ? s.attuneSlotPressed : null,
              ]}
            >
              <Text style={s.attuneLbl}>Slot {i + 1}</Text>
              {item
                ? <Text style={s.attuneName} numberOfLines={1}>{item.name}</Text>
                : <Text style={s.attuneEmpty}>{handlePress ? '+ add' : '— empty —'}</Text>}
            </Pressable>
          );
        })}
      </View>

      {/* Equipped — at-a-glance section above the main Inventory table.
          Reuses the InventoryRow layout (same columns + controls) so
          interactions stay consistent, but skips search/sort since
          the equipped list is short. Items also still appear in the
          full Inventory table below; this is just a focused view of
          "what's in my hands right now." */}
      {equippedItems.length > 0 ? (
        <>
          <SectionLabel accent style={s.gearSectionLabel}>EQUIPPED</SectionLabel>
          <View style={s.tableHeader}>
            <View style={s.invIconCol} />
            <View style={[s.tableHeaderCell, s.tableCellName]}><Text style={s.tableHeaderText}>NAME</Text></View>
            {!isMobile && <View style={[s.tableHeaderCell, s.tableCellType]}><Text style={s.tableHeaderText}>TYPE</Text></View>}
            <View style={[s.tableHeaderCell, s.tableCellQty]}><Text style={s.tableHeaderText}>QTY</Text></View>
            {!isMobile && <View style={[s.tableHeaderCell, s.tableCellValue]}><Text style={s.tableHeaderText}>VALUE</Text></View>}
            <View style={s.tableCellControls} />
          </View>
          <View style={s.invCardList}>
            {equippedItems.map((item) => (
              <InventoryRow
                key={item.id}
                item={item}
                canEdit={isOwner}
                compact={isMobile}
                onTogglePinnedToCombat={isOwner && onTogglePinnedToCombat ? () => onTogglePinnedToCombat(item.id) : undefined}
                onUpdateValue={isOwner && onUpdateItemValue ? (v: string) => onUpdateItemValue(item.id, v) : undefined}
                onUpdateQuantity={isOwner && onUpdateItemQuantity ? (q: number) => onUpdateItemQuantity(item.id, q) : undefined}
                onOpenDetail={() => onOpenEquipmentDetail?.(item)}
              />
            ))}
          </View>
        </>
      ) : null}

      {/* Inventory — single sortable, searchable table with Name /
          Type / QTY / Value columns plus a trailing controls cluster
          (pin, attune, equipped checkbox, remove). Includes equipped
          items too so the table is the canonical "all my gear" view;
          the Equipped section above is just a focused subset. */}
      <SectionLabel
        accent
        style={s.gearSectionLabel}
        right={isOwner && onOpenItemPicker ? <SectionAddButton label="Add item" onPress={onOpenItemPicker} /> : undefined}
      >INVENTORY</SectionLabel>
      <View style={s.searchWrap}>
        <MaterialCommunityIcons name="magnify" size={14} color={colors.outline} />
        <TextInput
          style={s.searchInput}
          value={search}
          onChangeText={setSearch}
          placeholder="Search items"
          placeholderTextColor={colors.outline}
          returnKeyType="search"
        />
        {search.length > 0 ? (
          <TouchableOpacity onPress={() => setSearch('')} hitSlop={8}>
            <MaterialCommunityIcons name="close-circle" size={14} color={colors.outline} />
          </TouchableOpacity>
        ) : null}
      </View>

      <View style={s.tableHeader}>
        <View style={s.invIconCol} />
        <SortHeader label="NAME" active={sortKey === 'name'} dir={sortDir} onPress={() => toggleSort('name')} style={s.tableCellName} />
        {!isMobile && <SortHeader label="TYPE" active={sortKey === 'type'} dir={sortDir} onPress={() => toggleSort('type')} style={s.tableCellType} />}
        <SortHeader label="QTY" active={sortKey === 'qty'} dir={sortDir} onPress={() => toggleSort('qty')} style={s.tableCellQty} />
        {!isMobile && <SortHeader label="VALUE" active={sortKey === 'value'} dir={sortDir} onPress={() => toggleSort('value')} style={s.tableCellValue} />}
        <View style={s.tableCellControls} />
      </View>

      {equipment.length === 0 ? (
        <Text style={s.emptyHint}>No items yet. Tap + Add to start.</Text>
      ) : rows.length === 0 ? (
        <Text style={s.emptyHint}>No items match your search.</Text>
      ) : (
        <View style={s.invCardList}>
          {rows.map((item) => (
            <InventoryRow
              key={item.id}
              item={item}
              canEdit={isOwner}
              compact={isMobile}
              onTogglePinnedToCombat={isOwner && onTogglePinnedToCombat ? () => onTogglePinnedToCombat(item.id) : undefined}
              onUpdateValue={isOwner && onUpdateItemValue ? (v: string) => onUpdateItemValue(item.id, v) : undefined}
              onUpdateQuantity={isOwner && onUpdateItemQuantity ? (q: number) => onUpdateItemQuantity(item.id, q) : undefined}
              onOpenDetail={() => onOpenEquipmentDetail?.(item)}
            />
          ))}
        </View>
      )}

      {/* Currency */}
      <SectionLabel accent style={s.gearSectionLabel}>CURRENCY</SectionLabel>
      <View style={s.coinRow}>
        {COIN_LABELS.map(({ key, label, color }) => (
          <CoinCell
            key={key}
            label={label}
            value={coins[key]}
            color={color}
            editable={isOwner}
            onPress={isOwner ? () => setEditCoin({ key, label }) : undefined}
          />
        ))}
      </View>

      {/* Carry Capacity */}
      <SectionLabel accent style={s.gearSectionLabel}>CARRY CAPACITY</SectionLabel>
      <View>
        <View style={s.carryNums}>
          <Text style={s.carryWeight}>{carryWeight}</Text>
          <Text style={s.carryMax}>/ {carryMax} lbs</Text>
        </View>
        <View style={s.carryTrack}>
          <View style={[s.carryFill, { width: `${carryRatio * 100}%` as any }]} />
        </View>
        <Text style={s.carryLoad}>{carryLoad} · STR {strengthScore} × 15</Text>
      </View>

      {/* Treasure & Valuables */}
      <SectionLabel accent style={s.gearSectionLabel}>TREASURE & VALUABLES</SectionLabel>
      <EditableText
        value={resources.treasure ?? ''}
        placeholder="Notable loot, gems, art objects…"
        editable={isOwner}
        onCommit={(v) => onUpdateTreasure?.(v)}
      />

      {/* Notes */}
      <SectionLabel accent style={s.gearSectionLabel}>NOTES</SectionLabel>
      <EditableText
        value={resources.notes ?? ''}
        placeholder="Session notes, reminders, loot to identify…"
        editable={isOwner}
        onCommit={(v) => onUpdateNotes?.(v)}
        multiline
      />

      {/* EquipmentDetailModal is now rendered at the CharacterSheet
          level so the Combat tab (and any future surface) can trigger
          the same modal via `onOpenEquipmentDetail`. */}

      <AttunementPickerModal
        visible={attunePicker?.kind === 'pick'}
        candidates={equipment.filter((i) => i.requiresAttunement && !i.attuned)}
        onPick={(id) => {
          onToggleAttuned?.(id);
          setAttunePicker(null);
        }}
        onClose={() => setAttunePicker(null)}
      />
      <UnattuneConfirmModal
        item={attunePicker?.kind === 'confirm-unattune' ? attunePicker.item : null}
        onConfirm={(id) => {
          onToggleAttuned?.(id);
          setAttunePicker(null);
        }}
        onClose={() => setAttunePicker(null)}
      />
      <CoinEditModal
        open={!!editCoin}
        label={editCoin?.label ?? ''}
        currentValue={editCoin ? coins[editCoin.key] : 0}
        onSave={(v) => {
          if (editCoin) onUpdateCoins?.({ ...coins, [editCoin.key]: v });
        }}
        onClose={() => setEditCoin(null)}
      />

    </ScrollView>
  );
}

// Armor types are derived from the parsed dexCap value — the catalog
// doesn't ship a separate light/medium/heavy field. Keep this in sync
// with ItemPickerModal.itemResultToEquipment's parser.
function armorTypeLabel(item: Dnd5eEquipmentItem): string | null {
  if (item.slot !== 'armor') return null;
  if (item.dexCap === 0) return 'Heavy';
  if (typeof item.dexCap === 'number' && item.dexCap > 0) return 'Medium';
  if (item.acBase != null) return 'Light';
  return null;
}

// ── Sub-components ──────────────────────────────────────────────────────────

function SectionLabel({ children, accent, right, style }: {
  children: string;
  /** Render the label in primary color — matches the Combat/Spells
   *  "accent" section header treatment. */
  accent?: boolean;
  /** Optional trailing slot (e.g. a + add affordance) rendered past
   *  the divider line, parallel to the SectionAddButton pattern on
   *  the Combat tab. */
  right?: React.ReactNode;
  style?: any;
}) {
  return (
    <View style={[s.sectionRow, style]}>
      <Text style={[s.sectionLabel, accent && s.sectionLabelAccent]}>{children}</Text>
      <View style={[s.sectionLine, accent && s.sectionLineAccent]} />
      {right}
    </View>
  );
}

/**
 * Small outlined + affordance rendered in a SectionLabel's right slot.
 * Matches the equivalent button on Combat/Spells section headers so
 * the add-from-section pattern reads identically across tabs.
 */
function SectionAddButton({ onPress, label }: { onPress: () => void; label: string }) {
  return (
    <TouchableOpacity style={s.sectionAddBtn} onPress={onPress} activeOpacity={0.7} accessibilityLabel={label}>
      <MaterialCommunityIcons name="plus" size={12} color={colors.primary} />
    </TouchableOpacity>
  );
}

function SortHeader({
  label, active, dir, onPress, style,
}: {
  label: string;
  active: boolean;
  dir: SortDir;
  onPress: () => void;
  style: any;
}) {
  return (
    <Pressable onPress={onPress} hitSlop={4} style={[s.tableHeaderCell, style]}>
      <Text style={[s.tableHeaderText, active && s.tableHeaderTextActive]}>{label}</Text>
      {active ? (
        <MaterialCommunityIcons
          name={dir === 'asc' ? 'chevron-up' : 'chevron-down'}
          size={12}
          color={colors.onSurfaceVariant}
          style={s.sortChevron}
        />
      ) : null}
    </Pressable>
  );
}

/**
 * Pick a slot-appropriate icon for the inventory row. Weapons share the
 * Combat-tab name-pattern mapping (sword / bow / axe / etc.); armor +
 * shield get shield glyphs; everything else lands on a generic sack
 * icon so non-equippable items still anchor the icon column.
 */
function getItemIcon(item: Dnd5eEquipmentItem): React.ComponentProps<typeof MaterialCommunityIcons>['name'] {
  if (item.slot === 'weapon') {
    const name = item.name.toLowerCase();
    if (/(crossbow|bow|sling|blowgun)/.test(name)) return 'bow-arrow';
    if (/(dart|javelin)/.test(name)) return 'arrow-projectile';
    if (/(axe|hatchet)/.test(name)) return 'axe';
    if (/(dagger|knife|dirk|stiletto)/.test(name)) return 'knife';
    if (/(warhammer|hammer|maul|mallet)/.test(name)) return 'hammer';
    if (/(mace|flail|morningstar|club|cudgel)/.test(name)) return 'gavel';
    if (/(staff|quarterstaff)/.test(name)) return 'baseball-bat';
    if (/whip/.test(name)) return 'snake';
    return item.range ? 'bow-arrow' : 'sword-cross';
  }
  if (item.slot === 'armor') return 'tshirt-crew-outline';
  if (item.slot === 'shield') return 'shield-half-full';
  return 'sack';
}

function InventoryRow({
  item, canEdit, compact,
  onTogglePinnedToCombat, onUpdateValue, onUpdateQuantity, onOpenDetail,
}: {
  item: Dnd5eEquipmentItem;
  canEdit: boolean;
  /** Mobile-density variant — drops the TYPE and VALUE columns so the
   *  name cell has enough width for its pills to wrap cleanly. */
  compact?: boolean;
  onTogglePinnedToCombat?: () => void;
  onUpdateValue?: (v: string) => void;
  onUpdateQuantity?: (q: number) => void;
  onOpenDetail: () => void;
}) {
  const armorType = armorTypeLabel(item);
  const typeLabel = SLOT_LABEL[item.slot] ?? item.slot;
  const iconName = getItemIcon(item);
  const hasPills = armorType || item.slot === 'armor' || item.slot === 'shield'
    || (item.slot === 'weapon' && item.damage) || item.miscACBonus || item.miscSaveBonus || item.attuned;
  return (
    <View style={s.invCard}>
      <View style={[s.invCardBar, { backgroundColor: item.attuned ? colors.hpWarning : colors.primary }]} />
      <View style={s.invIconCol}>
        <MaterialCommunityIcons name={iconName} size={13} color={colors.primary} />
      </View>
      <Pressable onPress={onOpenDetail} style={[s.tableCellName, s.invNameCell]}>
        <Text style={s.tableCellNameText} numberOfLines={1}>{item.name}</Text>
        {hasPills ? (
          <View style={s.tableCellNamePills}>
            {armorType && <Pill label={armorType} />}
            {item.slot === 'armor' && !armorType && <Pill label="Armor" />}
            {item.slot === 'shield' && <Pill label="Shield" />}
            {item.slot === 'weapon' && item.damage && <Pill label={item.damage} />}
            {item.miscACBonus ? <Pill label={`+${item.miscACBonus} AC`} variant="primary" /> : null}
            {item.miscSaveBonus ? <Pill label={`+${item.miscSaveBonus} saves`} variant="primary" /> : null}
            {item.attuned && <Pill label="Attuned" variant="primary" />}
          </View>
        ) : null}
      </Pressable>

      {!compact && <Text style={[s.tableCellType, s.tableCellTypeText]}>{typeLabel}</Text>}

      <View style={s.tableCellQty}>
        <InlineQuantityCell
          quantity={item.quantity ?? 1}
          editable={canEdit && !!onUpdateQuantity}
          onCommit={(q) => onUpdateQuantity?.(q)}
        />
      </View>

      {!compact && (
        <View style={s.tableCellValue}>
          <InlineValueCell value={item.value ?? ''} editable={canEdit && !!onUpdateValue} onCommit={(v) => onUpdateValue?.(v)} />
        </View>
      )}

      <View style={s.tableCellControls}>
        {canEdit && onTogglePinnedToCombat && (
          <TouchableOpacity onPress={onTogglePinnedToCombat} hitSlop={6} activeOpacity={0.7}>
            <MaterialCommunityIcons
              name={item.pinnedToCombat ? 'pin' : 'pin-outline'}
              size={15}
              color={item.pinnedToCombat ? colors.primary : colors.outline}
            />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

/**
 * Inline editable cell for the QTY column. Treats quantity 1 as the
 * implicit default so existing rows (and freshly-picked items) read
 * naturally without forcing the player to type "1". Commits on blur
 * or submit; invalid input reverts to the previous quantity.
 */
function InlineQuantityCell({
  quantity, editable, onCommit, size = 'sm',
}: {
  quantity: number;
  editable: boolean;
  onCommit: (q: number) => void;
  size?: 'sm' | 'md';
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(String(quantity));
  useEffect(() => { setText(String(quantity)); }, [quantity]);

  const textStyle = size === 'md' ? s.tableCellQtyTextMd : s.tableCellQtyText;
  const inputStyle = size === 'md' ? s.tableCellQtyInputMd : s.tableCellQtyInput;

  function commit() {
    setEditing(false);
    const parsed = parseInt(text, 10);
    if (!Number.isFinite(parsed) || parsed < 0) {
      setText(String(quantity));
      return;
    }
    if (parsed !== quantity) onCommit(parsed);
  }

  if (!editable) {
    return <Text style={textStyle}>{quantity}</Text>;
  }

  if (editing) {
    return (
      <TextInput
        style={inputStyle}
        value={text}
        onChangeText={setText}
        onBlur={commit}
        onSubmitEditing={commit}
        autoFocus
        keyboardType="number-pad"
        selectTextOnFocus
        returnKeyType="done"
      />
    );
  }

  return (
    <TouchableOpacity onPress={() => setEditing(true)} activeOpacity={0.7} hitSlop={4}>
      <Text style={textStyle}>{quantity}</Text>
    </TouchableOpacity>
  );
}

/**
 * Inline editable cell for the Value column. Tap-to-edit so the table
 * stays compact; renders an em-dash placeholder when empty. Commits on
 * blur or submit. Read-only mode skips the Pressable wrap so the row
 * doesn't get a misleading tap target.
 */
function InlineValueCell({
  value, editable, onCommit, size = 'sm',
}: {
  value: string;
  editable: boolean;
  onCommit: (v: string) => void;
  /** `sm` (default) renders at the inventory-row size (11pt); `md`
   *  bumps to 13pt for the detail modal so the value sits flush with
   *  the rest of the meta-data column. */
  size?: 'sm' | 'md';
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(value);
  useEffect(() => { setText(value); }, [value]);

  const textStyle = size === 'md' ? s.tableCellValueTextMd : s.tableCellValueText;
  const placeholderStyle = size === 'md' ? s.tableCellValuePlaceholderMd : s.tableCellValuePlaceholder;
  const inputStyle = size === 'md' ? s.tableCellValueInputMd : s.tableCellValueInput;

  if (!editable) {
    return value
      ? <Text style={textStyle}>{value}</Text>
      : <Text style={placeholderStyle}>—</Text>;
  }

  if (editing) {
    return (
      <TextInput
        style={inputStyle}
        value={text}
        onChangeText={setText}
        onBlur={() => { setEditing(false); onCommit(text); }}
        onSubmitEditing={() => { setEditing(false); onCommit(text); }}
        autoFocus
        placeholder="e.g. 15 gp"
        placeholderTextColor={colors.outline}
        returnKeyType="done"
      />
    );
  }

  return (
    <TouchableOpacity onPress={() => setEditing(true)} activeOpacity={0.7} hitSlop={4}>
      {value
        ? <Text style={textStyle}>{value}</Text>
        : <Text style={placeholderStyle}>—</Text>}
    </TouchableOpacity>
  );
}

export function EquipmentDetailModal({
  item,
  onClose,
  onUpdateValue,
  onUpdateQuantity,
  onToggleEquipped,
  onRemove,
  canEdit,
}: {
  item: Dnd5eEquipmentItem;
  onClose: () => void;
  /** When provided, Value renders as an inline editable field — matches
   *  the row-level affordance so the modal isn't a read-only dead end. */
  onUpdateValue?: (v: string) => void;
  /** When provided, Quantity renders as an inline editable field
   *  alongside Value. */
  onUpdateQuantity?: (q: number) => void;
  /** Toggle equipped state. Owner-only — gated by canEdit upstream. */
  onToggleEquipped?: () => void;
  /** Trigger the delete flow. The parent owns the confirm dialog and
   *  is expected to close this modal as part of opening that one. */
  onRemove?: () => void;
  canEdit: boolean;
}) {
  const armorType = armorTypeLabel(item);
  const rows: Array<{ label: string; value: string }> = [];
  rows.push({ label: 'Slot', value: item.slot.charAt(0).toUpperCase() + item.slot.slice(1) });
  if (armorType) rows.push({ label: 'Armor type', value: armorType });
  if (item.slot === 'weapon' && item.damage) rows.push({ label: 'Damage', value: item.damage });
  if (item.range) rows.push({ label: 'Range', value: item.range });
  if (item.acBase != null) {
    const dex = item.dexCap === 0
      ? ''
      : item.dexCap != null
        ? ` + DEX (max ${item.dexCap})`
        : ' + DEX';
    rows.push({ label: 'Base AC', value: `${item.acBase}${dex}` });
  }
  if (item.acBonus != null) rows.push({ label: 'Shield bonus', value: `+${item.acBonus}` });
  if (item.miscACBonus != null) rows.push({ label: 'Magic AC bonus', value: `+${item.miscACBonus}` });
  if (item.miscSaveBonus != null) rows.push({ label: 'Magic save bonus', value: `+${item.miscSaveBonus} to all saves` });
  if (item.requiresAttunement) {
    rows.push({ label: 'Attunement', value: item.attuned ? 'Attuned' : 'Required, not attuned' });
  }
  if (typeof item.weight === 'number') rows.push({ label: 'Weight', value: `${item.weight} lb` });
  // Equipped status is now conveyed by the Equip/Unequip action button
  // at the bottom of the modal, so the meta row is redundant.

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={s.detailBackdrop} onPress={onClose}>
        <Pressable style={s.detailCard} onPress={() => {}}>
          <View style={s.detailHeader}>
            <Text style={s.detailTitle} numberOfLines={2}>{item.name}</Text>
            <TouchableOpacity onPress={onClose} hitSlop={10}>
              <MaterialCommunityIcons name="close" size={20} color={colors.onSurfaceVariant} />
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={{ paddingBottom: spacing.md }}>
            <View style={s.detailMetaGrid}>
              {rows.map((r) => (
                <View key={r.label} style={s.detailMetaCell}>
                  <Text style={s.detailMetaLabel}>{r.label}</Text>
                  <Text style={s.detailMetaValue}>{r.value}</Text>
                </View>
              ))}
            </View>
            <View style={s.detailEditableRow}>
              <View style={s.detailEditableCell}>
                <Text style={s.detailMetaLabel}>Quantity</Text>
                <View style={s.detailValueInline}>
                  <InlineQuantityCell
                    quantity={item.quantity ?? 1}
                    editable={canEdit && !!onUpdateQuantity}
                    onCommit={(q) => onUpdateQuantity?.(q)}
                    size="md"
                  />
                </View>
              </View>
              <View style={s.detailEditableCell}>
                <Text style={s.detailMetaLabel}>Value</Text>
                <View style={s.detailValueInline}>
                  <InlineValueCell
                    value={item.value ?? ''}
                    editable={canEdit && !!onUpdateValue}
                    onCommit={(v) => onUpdateValue?.(v)}
                    size="md"
                  />
                </View>
              </View>
            </View>
            {item.properties && item.properties.length > 0 ? (
              <View style={{ marginTop: spacing.sm }}>
                <Text style={s.detailMetaLabel}>Properties</Text>
                {item.properties.map((p, i) => (
                  <Text key={i} style={s.detailBullet}>• {p}</Text>
                ))}
              </View>
            ) : null}
            {item.notes ? (
              <View style={{ marginTop: spacing.sm }}>
                <Text style={s.detailMetaLabel}>Notes</Text>
                <Text style={s.detailNotes}>{item.notes}</Text>
              </View>
            ) : null}
          </ScrollView>
          {canEdit && (onToggleEquipped || onRemove) ? (
            <View style={s.detailActions}>
              {onToggleEquipped ? (
                <TouchableOpacity
                  onPress={onToggleEquipped}
                  style={[s.detailActionBtn, item.equipped ? s.detailActionBtnActive : s.detailActionBtnPrimary]}
                  activeOpacity={0.7}
                >
                  <MaterialCommunityIcons
                    name={item.equipped ? 'checkbox-marked-circle' : 'checkbox-blank-circle-outline'}
                    size={14}
                    color={item.equipped ? colors.primary : colors.onPrimary}
                  />
                  <Text style={item.equipped ? s.detailActionBtnActiveText : s.detailActionBtnPrimaryText}>
                    {item.equipped ? 'Unequip' : 'Equip'}
                  </Text>
                </TouchableOpacity>
              ) : null}
              {onRemove ? (
                <TouchableOpacity
                  onPress={onRemove}
                  style={[s.detailActionBtn, s.detailActionBtnDestructive]}
                  activeOpacity={0.7}
                >
                  <MaterialCommunityIcons name="trash-can-outline" size={14} color={colors.hpDanger} />
                  <Text style={s.detailActionBtnDestructiveText}>Delete</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          ) : null}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/**
 * Modal listing inventory items that require attunement but aren't yet
 * attuned. Tapping an item attunes it and closes. Renders an empty
 * state when no attunable items exist (so the player knows the slot
 * is reachable but the inventory has nothing to fill it).
 */
function AttunementPickerModal({ visible, candidates, onPick, onClose }: {
  visible: boolean;
  candidates: Dnd5eEquipmentItem[];
  onPick: (id: string) => void;
  onClose: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={s.attuneModalBackdrop} onPress={onClose}>
        <Pressable style={s.attuneModalCard} onPress={() => {}}>
          <View style={s.attuneModalHeader}>
            <Text style={s.attuneModalTitle}>Attune to…</Text>
            <TouchableOpacity onPress={onClose} hitSlop={10} activeOpacity={0.7}>
              <MaterialCommunityIcons name="close" size={18} color={colors.outline} />
            </TouchableOpacity>
          </View>
          {candidates.length === 0 ? (
            <Text style={s.attuneModalEmpty}>
              No attunable items in your inventory yet. Items in the catalog flagged "Requires Attunement" will show up here.
            </Text>
          ) : (
            <ScrollView style={{ maxHeight: 360 }} showsVerticalScrollIndicator={false}>
              {candidates.map((item) => (
                <TouchableOpacity
                  key={item.id}
                  style={s.attuneCandidateRow}
                  onPress={() => onPick(item.id)}
                  activeOpacity={0.7}
                >
                  <MaterialCommunityIcons name={getItemIcon(item)} size={14} color={colors.primary} />
                  <Text style={s.attuneCandidateName} numberOfLines={1}>{item.name}</Text>
                  <MaterialCommunityIcons name="chevron-right" size={16} color={colors.outline} />
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/**
 * Small confirm dialog for unattuning. Triggered by tapping an occupied
 * attunement slot — keeps the destructive step explicit since attune /
 * unattune happens during a long rest in fiction.
 */
function UnattuneConfirmModal({ item, onConfirm, onClose }: {
  item: Dnd5eEquipmentItem | null;
  onConfirm: (id: string) => void;
  onClose: () => void;
}) {
  return (
    <Modal visible={!!item} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={s.attuneModalBackdrop} onPress={onClose}>
        <Pressable style={s.attuneModalCard} onPress={() => {}}>
          <Text style={s.attuneModalTitle}>Unattune?</Text>
          <Text style={s.attuneConfirmBody}>
            Release attunement from <Text style={s.attuneConfirmName}>{item?.name}</Text>?
          </Text>
          <View style={s.attuneConfirmActions}>
            <TouchableOpacity onPress={onClose} style={[s.attuneConfirmBtn, s.attuneConfirmCancel]} activeOpacity={0.7}>
              <Text style={s.attuneConfirmCancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => item && onConfirm(item.id)}
              style={[s.attuneConfirmBtn, s.attuneConfirmDestructive]}
              activeOpacity={0.7}
            >
              <Text style={s.attuneConfirmDestructiveText}>Unattune</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function Pill({ label, variant }: { label: string; variant?: 'primary' | 'gm' }) {
  const pillStyle = variant === 'primary'
    ? [s.pill, s.pillPrimary]
    : variant === 'gm'
    ? [s.pill, s.pillGm]
    : [s.pill];
  const textStyle = variant === 'primary'
    ? [s.pillText, s.pillTextPrimary]
    : variant === 'gm'
    ? [s.pillText, s.pillTextGm]
    : [s.pillText];
  return (
    <View style={pillStyle}>
      <Text style={textStyle} numberOfLines={1}>{label}</Text>
    </View>
  );
}

/**
 * Coin tile — displays the stored amount and (when editable) opens
 * a focused CoinEditModal on tap. The previous always-mounted inline
 * TextInput caused a blue web selection rim and made it easy to
 * accidentally overwrite a value with a stray keystroke, so the edit
 * flow is now an explicit modal.
 */
function CoinCell({ label, value, color, editable, onPress }: {
  label: string; value: number; color: string; editable: boolean;
  onPress?: () => void;
}) {
  return (
    <Pressable
      onPress={editable ? onPress : undefined}
      disabled={!editable || !onPress}
      style={({ pressed }) => [
        s.coinCell,
        pressed && editable ? s.coinCellPressed : null,
      ]}
    >
      <View style={[s.coinDot, { backgroundColor: color }]} />
      <Text style={s.coinValue}>{value}</Text>
      <Text style={s.coinLabel}>{label}</Text>
    </Pressable>
  );
}

/**
 * Modal numeric editor for a single coin denomination. Pre-fills with
 * the current amount, selects on focus, commits on Save / clears on
 * Cancel. Empty / invalid input is rejected silently (Save no-ops).
 */
function CoinEditModal({ open, label, currentValue, onSave, onClose }: {
  open: boolean;
  label: string;
  currentValue: number;
  onSave: (v: number) => void;
  onClose: () => void;
}) {
  const [text, setText] = useState(String(currentValue));
  // Reset the buffer each time the modal opens for a different denom
  // so the previous edit doesn't leak in.
  useEffect(() => { if (open) setText(String(currentValue)); }, [open, currentValue]);

  function handleSave() {
    const parsed = parseInt(text, 10);
    if (!isNaN(parsed) && parsed >= 0) {
      if (parsed !== currentValue) onSave(parsed);
      onClose();
    }
  }

  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={s.attuneModalBackdrop} onPress={onClose}>
        <Pressable style={s.attuneModalCard} onPress={() => {}}>
          <View style={s.attuneModalHeader}>
            <Text style={s.attuneModalTitle}>Edit {label}</Text>
            <TouchableOpacity onPress={onClose} hitSlop={10} activeOpacity={0.7}>
              <MaterialCommunityIcons name="close" size={18} color={colors.outline} />
            </TouchableOpacity>
          </View>
          <TextInput
            style={s.coinEditInput}
            value={text}
            onChangeText={setText}
            onSubmitEditing={handleSave}
            keyboardType="number-pad"
            selectTextOnFocus
            autoFocus
            returnKeyType="done"
          />
          <View style={s.attuneConfirmActions}>
            <TouchableOpacity onPress={onClose} style={[s.attuneConfirmBtn, s.attuneConfirmCancel]} activeOpacity={0.7}>
              <Text style={s.attuneConfirmCancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={handleSave} style={[s.attuneConfirmBtn, s.coinEditSave]} activeOpacity={0.7}>
              <Text style={s.coinEditSaveText}>Save</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function EditableText({ value, placeholder, editable, onCommit, multiline }: {
  value: string; placeholder: string; editable: boolean;
  onCommit: (v: string) => void; multiline?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(value);

  if (editable && editing) {
    return (
      <TextInput
        style={[s.editableInput, multiline && s.editableInputMulti]}
        value={text}
        onChangeText={setText}
        onBlur={() => { setEditing(false); onCommit(text); }}
        autoFocus
        multiline={multiline}
        placeholder={placeholder}
        placeholderTextColor={colors.outline}
      />
    );
  }

  return (
    <TouchableOpacity onPress={() => editable && setEditing(true)} activeOpacity={editable ? 0.7 : 1}>
      {value
        ? <Text style={s.editableText}>{value}</Text>
        : <Text style={s.editablePlaceholder}>{placeholder}</Text>}
    </TouchableOpacity>
  );
}

// ── Styles ──────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1, flexDirection: 'row' },

  col: { flex: 1 },
  colContent: { padding: 12, gap: 12, paddingBottom: 24 },
  colDivider: { width: StyleSheet.hairlineWidth, backgroundColor: colors.outlineVariant },

  sectionRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 8 },
  sectionLabel: {
    fontSize: 8, fontFamily: fonts.label, fontWeight: '700',
    letterSpacing: 1.5, textTransform: 'uppercase', color: colors.outline,
  },
  /** Primary-tinted variant — used by every section header in this tab
   *  to match the Combat/Spells accent-label treatment. */
  sectionLabelAccent: { color: colors.primary },
  sectionLine: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: colors.outlineVariant },
  sectionLineAccent: { backgroundColor: `${colors.primary}44` },
  /** Top margin applied to every SectionLabel after the first one so
   *  the bare (no-CardBlock) sections still read as discrete blocks. */
  gearSectionLabel: { marginTop: 18 },
  /** Small + affordance for SectionLabel right slot — mirrors Combat. */
  sectionAddBtn: {
    width: 22, height: 22, borderRadius: 11,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: `${colors.primary}66`,
    backgroundColor: `${colors.primary}14`,
  },

  // Inventory card chassis — mirrors the Combat equipCard pattern:
  // transparent fill, thin outline, full-height 2px accent bar, compact
  // body. Replaces the old flat tableRow + hairline separator look.
  invCardList: { gap: 4 },
  invCard: {
    flexDirection: 'row', alignItems: 'center',
    borderWidth: 1, borderColor: colors.outlineVariant,
    borderRadius: 6, overflow: 'hidden',
  },
  invCardBar: { width: 2, alignSelf: 'stretch' },
  /** Fixed-width icon slot mirrored in the table header (empty cell)
   *  so the NAME column always lines up. */
  invIconCol: { width: 28, alignItems: 'center', justifyContent: 'center' },
  /** Tighten the name cell padding for the new card chassis. */
  invNameCell: { paddingVertical: 6 },

  // Attunement
  attunementSlots: { flexDirection: 'row', gap: 5, marginBottom: 4 },
  attuneSlot: {
    flex: 1, borderRadius: 6, padding: 9,
  },
  attuneSlotActive: {
    backgroundColor: `${colors.hpWarning}18`,
    borderWidth: 1, borderColor: `${colors.hpWarning}66`,
  },
  attuneSlotEmpty: {
    backgroundColor: colors.surfaceContainer,
    borderWidth: 1, borderColor: colors.outlineVariant,
  },
  /** Pressed-state feedback for the interactive slot. */
  attuneSlotPressed: { opacity: 0.7 },
  attuneLbl: { fontSize: 7, color: colors.outline, letterSpacing: 0.8, textTransform: 'uppercase' },
  attuneName: { fontSize: 9, fontWeight: '700', color: colors.hpWarning, marginTop: 2 },
  attuneEmpty: { fontSize: 9, color: colors.outline, marginTop: 2 },

  // Attunement picker / unattune confirm modal
  attuneModalBackdrop: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center', justifyContent: 'center', padding: 20,
  },
  attuneModalCard: {
    width: '100%', maxWidth: 360,
    backgroundColor: colors.surfaceContainerHigh,
    borderWidth: 1, borderColor: colors.outlineVariant,
    borderRadius: radius.lg, padding: 14, gap: 10,
  },
  attuneModalHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  attuneModalTitle: {
    fontSize: 13, fontFamily: fonts.headline, fontWeight: '700',
    color: colors.onSurface, letterSpacing: 0.3,
  },
  attuneModalEmpty: {
    fontSize: 12, fontFamily: fonts.body, color: colors.onSurfaceVariant,
    lineHeight: 18, fontStyle: 'italic',
  },
  attuneCandidateRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 10, paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.outlineVariant,
  },
  attuneCandidateName: {
    flex: 1, fontSize: 12, fontFamily: fonts.body, fontWeight: '600',
    color: colors.onSurface,
  },
  attuneConfirmBody: {
    fontSize: 12, fontFamily: fonts.body, color: colors.onSurfaceVariant,
    lineHeight: 18,
  },
  attuneConfirmName: { color: colors.onSurface, fontWeight: '700' },
  attuneConfirmActions: { flexDirection: 'row', gap: 8, justifyContent: 'flex-end', marginTop: 4 },
  attuneConfirmBtn: {
    paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: radius.lg, borderWidth: 1,
  },
  attuneConfirmCancel: { borderColor: colors.outlineVariant, backgroundColor: 'transparent' },
  attuneConfirmCancelText: { fontSize: 12, fontFamily: fonts.label, fontWeight: '700', color: colors.onSurfaceVariant },
  attuneConfirmDestructive: { borderColor: `${colors.hpWarning}88`, backgroundColor: `${colors.hpWarning}22` },
  attuneConfirmDestructiveText: { fontSize: 12, fontFamily: fonts.label, fontWeight: '700', color: colors.hpWarning },

  // Card block
  card: {
    backgroundColor: colors.surfaceContainer,
    borderWidth: 1, borderColor: colors.outlineVariant,
    borderRadius: radius.lg, overflow: 'hidden',
  },
  cardHead: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 12, paddingVertical: 9,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.outlineVariant,
    backgroundColor: colors.surfaceContainerHigh,
  },
  cardTitle: {
    fontSize: 9, fontFamily: fonts.label, fontWeight: '700',
    letterSpacing: 1, textTransform: 'uppercase', color: colors.onSurfaceVariant,
  },
  cardAction: {
    fontSize: 9, fontFamily: fonts.label, fontWeight: '600',
    color: colors.primary, letterSpacing: 0.3,
  },
  cardBody: { padding: 4 },

  // Inventory table
  searchWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    marginHorizontal: 8, marginTop: 6, marginBottom: 4,
    paddingHorizontal: 10, paddingVertical: 6,
    backgroundColor: colors.surfaceContainerHigh,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth, borderColor: colors.outlineVariant,
  },
  searchInput: {
    flex: 1, fontSize: 11, fontFamily: fonts.body, color: colors.onSurface,
    paddingVertical: 0,
  },
  tableHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 12, paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.outlineVariant,
    backgroundColor: colors.surfaceContainerHigh,
  },
  tableHeaderCell: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  tableHeaderText: {
    fontSize: 8, fontFamily: fonts.label, fontWeight: '700',
    letterSpacing: 1, textTransform: 'uppercase', color: colors.outline,
  },
  tableHeaderTextActive: { color: colors.onSurfaceVariant },
  sortChevron: { marginLeft: 0 },
  tableRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 6,
    paddingHorizontal: 12, paddingVertical: 10,
  },
  tableRowBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.outlineVariant },
  tableCellName: { flex: 1, minWidth: 0, gap: 3 },
  tableCellNameText: { fontSize: 11, fontFamily: fonts.body, fontWeight: '600', color: colors.onSurface },
  tableCellNamePills: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  tableCellType: { width: 72 },
  tableCellTypeText: { fontSize: 10, fontFamily: fonts.body, color: colors.onSurfaceVariant },
  tableCellQty: { width: 48, justifyContent: 'flex-start' },
  tableCellQtyText: { fontSize: 11, fontFamily: fonts.body, fontWeight: '600', color: colors.onSurface },
  tableCellQtyInput: {
    fontSize: 11, fontFamily: fonts.body, fontWeight: '600', color: colors.primary,
    paddingVertical: 0, minWidth: 32,
  },
  tableCellQtyTextMd: { fontSize: 13, fontFamily: fonts.body, fontWeight: '600', color: colors.onSurface },
  tableCellQtyInputMd: {
    fontSize: 13, fontFamily: fonts.body, fontWeight: '600', color: colors.primary,
    paddingVertical: 0, minWidth: 40,
  },
  tableCellValue: { width: 88, justifyContent: 'flex-start' },
  tableCellValueText: { fontSize: 11, fontFamily: fonts.body, color: colors.onSurface },
  tableCellValuePlaceholder: { fontSize: 11, fontFamily: fonts.body, color: colors.outline },
  tableCellValueInput: {
    fontSize: 11, fontFamily: fonts.body, color: colors.primary,
    paddingVertical: 0, minWidth: 60,
  },
  /** `md` variants of the Value cell text/input styles — used by the
   *  detail modal so the inline editor matches the rest of the meta
   *  column's 13pt body type. */
  tableCellValueTextMd: { fontSize: 13, fontFamily: fonts.body, color: colors.onSurface },
  tableCellValuePlaceholderMd: { fontSize: 13, fontFamily: fonts.body, color: colors.outline },
  tableCellValueInputMd: {
    fontSize: 13, fontFamily: fonts.body, color: colors.primary,
    paddingVertical: 0, minWidth: 80,
  },
  tableCellControls: {
    // Just the pin toggle now — equip/delete moved into the detail
    // modal — so the cluster only needs room for a single icon.
    width: 28,
    flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center',
    gap: 8,
  },

  // Pills
  pill: {
    paddingHorizontal: 6, paddingVertical: 2, borderRadius: 999,
    borderWidth: 1, borderColor: colors.outlineVariant,
    backgroundColor: colors.surfaceContainer,
  },
  pillPrimary: { borderColor: `${colors.primary}66`, backgroundColor: `${colors.primary}18` },
  pillGm: { borderColor: `${colors.gm}66`, backgroundColor: `${colors.gmContainer}` },
  pillText: { fontSize: 8, fontWeight: '700', color: colors.onSurfaceVariant },
  pillTextPrimary: { color: colors.primary },
  pillTextGm: { color: colors.gm },

  emptyHint: { fontSize: 11, fontFamily: fonts.body, color: colors.outline, fontStyle: 'italic', padding: 2 },

  // Currency
  coinRow: { flexDirection: 'row', gap: 5 },
  coinCell: {
    flex: 1, alignItems: 'center',
    backgroundColor: colors.surfaceContainer,
    borderWidth: 1, borderColor: colors.outlineVariant,
    borderRadius: radius.lg, paddingVertical: 8, paddingHorizontal: 2,
    gap: 3,
  },
  coinCellPressed: { opacity: 0.7 },
  coinDot: { width: 7, height: 7, borderRadius: 4 },
  coinValue: { fontSize: 14, fontFamily: fonts.headline, fontWeight: '700', color: colors.onSurface },
  coinLabel: {
    fontSize: 7, fontFamily: fonts.label, fontWeight: '700',
    letterSpacing: 1, textTransform: 'uppercase', color: colors.outline,
  },
  /** Modal numeric editor for a coin denomination. Mirrors the
   *  attunement confirm chassis (shares backdrop / card / actions). */
  coinEditInput: {
    fontSize: 22, fontFamily: fonts.headline, fontWeight: '700',
    color: colors.onSurface, textAlign: 'center',
    backgroundColor: colors.surfaceContainer,
    borderWidth: 1, borderColor: colors.outlineVariant,
    borderRadius: radius.lg,
    paddingVertical: 10, paddingHorizontal: 14,
  },
  coinEditSave: {
    backgroundColor: colors.primaryContainer,
    borderColor: colors.primaryContainer,
  },
  coinEditSaveText: {
    fontSize: 12, fontFamily: fonts.label, fontWeight: '700',
    color: colors.onPrimary, letterSpacing: 0.3,
  },

  // Carry capacity
  carryNums: { flexDirection: 'row', alignItems: 'baseline', gap: 4, marginBottom: 6 },
  carryWeight: { fontSize: 20, fontFamily: fonts.headline, fontWeight: '800', color: colors.onSurface },
  carryMax: { fontSize: 11, color: colors.outline },
  carryTrack: {
    height: 5, borderRadius: 3,
    backgroundColor: colors.outlineVariant, overflow: 'hidden', marginBottom: 4,
  },
  carryFill: { height: '100%', borderRadius: 3, backgroundColor: colors.hpHealthy },
  carryLoad: { fontSize: 9, color: colors.outline, letterSpacing: 0.3 },

  // Editable text areas
  editableText: { fontSize: 11, fontFamily: fonts.body, color: colors.onSurfaceVariant, lineHeight: 17 },
  editablePlaceholder: { fontSize: 11, fontFamily: fonts.body, color: colors.outline, fontStyle: 'italic', lineHeight: 17 },
  editableInput: { fontSize: 11, fontFamily: fonts.body, color: colors.onSurface, lineHeight: 17 },
  editableInputMulti: { minHeight: 60 },

  // Detail modal
  detailBackdrop: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
  detailCard: {
    width: '100%', maxWidth: 480, maxHeight: '80%',
    backgroundColor: colors.surfaceContainer,
    borderRadius: radius.xl,
    borderWidth: 1, borderColor: colors.outlineVariant,
    padding: spacing.md,
  },
  detailHeader: {
    flexDirection: 'row', alignItems: 'flex-start',
    justifyContent: 'space-between', gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  detailTitle: {
    flex: 1, fontSize: 16, fontFamily: fonts.headline, fontWeight: '700',
    color: colors.onSurface,
  },
  detailMetaGrid: {
    flexDirection: 'row', flexWrap: 'wrap',
    gap: spacing.sm,
  },
  detailMetaCell: { minWidth: 100, paddingVertical: 4 },
  detailMetaLabel: {
    fontSize: 9, fontFamily: fonts.label, fontWeight: '700',
    letterSpacing: 1.2, textTransform: 'uppercase', color: colors.outline,
  },
  detailMetaValue: { fontSize: 13, fontFamily: fonts.body, color: colors.onSurface, marginTop: 2 },
  /** Wraps the inline value editor inside the detail modal so the row
   *  visually matches `detailMetaValue` (margin + larger text size).
   *  Bumps the InlineValueCell's child text via the parent fontSize
   *  override since the cell inherits its own size for the table cell. */
  detailValueInline: { marginTop: 2 },
  /** Two-column row inside the detail modal that holds the editable
   *  Quantity and Value fields side by side. */
  detailEditableRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.sm,
  },
  detailEditableCell: { minWidth: 100, flex: 1 },
  detailBullet: { fontSize: 12, color: colors.onSurfaceVariant, lineHeight: 18, marginTop: 2 },
  detailNotes: { fontSize: 13, color: colors.onSurfaceVariant, lineHeight: 19, marginTop: 4 },
  /** Footer action bar — sits below the scrolling content so the
   *  Equip/Unequip + Delete buttons stay anchored to the bottom of
   *  the modal card and don't scroll off with long descriptions. */
  detailActions: {
    flexDirection: 'row', gap: 8, marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.outlineVariant,
  },
  detailActionBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingHorizontal: 12, paddingVertical: 10,
    borderRadius: radius.lg, borderWidth: 1,
  },
  /** Filled primary — call-to-action style for "Equip" (the unequipped
   *  → equipped transition is the more common case in a session). */
  detailActionBtnPrimary: {
    backgroundColor: colors.primaryContainer,
    borderColor: colors.primaryContainer,
  },
  detailActionBtnPrimaryText: {
    fontSize: 12, fontFamily: fonts.label, fontWeight: '700',
    color: colors.onPrimary, letterSpacing: 0.3,
  },
  /** Outlined primary — softer "Unequip" state so the active item
   *  reads as already-engaged rather than the next action. */
  detailActionBtnActive: {
    backgroundColor: `${colors.primary}14`,
    borderColor: `${colors.primary}55`,
  },
  detailActionBtnActiveText: {
    fontSize: 12, fontFamily: fonts.label, fontWeight: '700',
    color: colors.primary, letterSpacing: 0.3,
  },
  /** Destructive outline for Delete — danger-tinted so accidental
   *  taps are visually obvious before the confirm dialog appears. */
  detailActionBtnDestructive: {
    backgroundColor: `${colors.hpDanger}14`,
    borderColor: `${colors.hpDanger}66`,
  },
  detailActionBtnDestructiveText: {
    fontSize: 12, fontFamily: fonts.label, fontWeight: '700',
    color: colors.hpDanger, letterSpacing: 0.3,
  },
});
