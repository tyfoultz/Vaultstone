import { useEffect, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet, Modal, Pressable } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { colors, fonts, spacing, radius } from '@vaultstone/ui';
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
  stats, resources, isOwner, strengthScore,
  onUpdateCoins, onToggleEquipped, onToggleAttuned, onTogglePinnedToCombat, onUpdateNotes, onUpdateTreasure,
  onOpenItemPicker, onRemoveItem, onUpdateItemValue, onUpdateItemQuantity,
}: Props) {
  const [detailItem, setDetailItem] = useState<Dnd5eEquipmentItem | null>(null);
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const equipment = resources.equipment ?? [];
  const coins = resources.coins ?? { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 };

  // Attunement
  const attuned = equipment.filter((i) => i.requiresAttunement && i.attuned);
  const attunementMax = 3;

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

      {/* Attunement Slots */}
      <SectionLabel>Attunement Slots</SectionLabel>
      <View style={s.attunementSlots}>
        {Array.from({ length: attunementMax }).map((_, i) => {
          const item = attuned[i];
          return (
            <View key={i} style={[s.attuneSlot, item ? s.attuneSlotActive : s.attuneSlotEmpty]}>
              <Text style={s.attuneLbl}>Slot {i + 1}</Text>
              {item
                ? <Text style={s.attuneName} numberOfLines={1}>{item.name}</Text>
                : <Text style={s.attuneEmpty}>— empty —</Text>}
            </View>
          );
        })}
      </View>

      {/* Inventory — single sortable, searchable table with Name /
          Type / Value columns plus a trailing controls cluster (pin,
          attune, equipped checkbox, remove). Replaces the old split
          Equipped + Carrying lists; sort by Type clusters by slot
          when that grouping matters. */}
      <CardBlock title="Inventory" action={isOwner ? '+ Add' : undefined} onAction={onOpenItemPicker}>
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
          <SortHeader label="Name" active={sortKey === 'name'} dir={sortDir} onPress={() => toggleSort('name')} style={s.tableCellName} />
          <SortHeader label="Type" active={sortKey === 'type'} dir={sortDir} onPress={() => toggleSort('type')} style={s.tableCellType} />
          <SortHeader label="QTY" active={sortKey === 'qty'} dir={sortDir} onPress={() => toggleSort('qty')} style={s.tableCellQty} />
          <SortHeader label="Value" active={sortKey === 'value'} dir={sortDir} onPress={() => toggleSort('value')} style={s.tableCellValue} />
          <View style={s.tableCellControls} />
        </View>

        {equipment.length === 0 ? (
          <Text style={s.emptyHint}>No items yet. Tap + Add to start.</Text>
        ) : rows.length === 0 ? (
          <Text style={s.emptyHint}>No items match your search.</Text>
        ) : (
          rows.map((item, i) => (
            <InventoryRow
              key={item.id}
              item={item}
              canEdit={isOwner}
              isLast={i === rows.length - 1}
              onToggle={() => onToggleEquipped?.(item.id)}
              onToggleAttuned={isOwner && onToggleAttuned ? () => onToggleAttuned(item.id) : undefined}
              onTogglePinnedToCombat={isOwner && onTogglePinnedToCombat ? () => onTogglePinnedToCombat(item.id) : undefined}
              onRemove={isOwner && onRemoveItem ? () => onRemoveItem(item.id) : undefined}
              onUpdateValue={isOwner && onUpdateItemValue ? (v: string) => onUpdateItemValue(item.id, v) : undefined}
              onUpdateQuantity={isOwner && onUpdateItemQuantity ? (q: number) => onUpdateItemQuantity(item.id, q) : undefined}
              onOpenDetail={() => setDetailItem(item)}
            />
          ))
        )}
      </CardBlock>

      {/* Currency */}
      <SectionLabel>Currency</SectionLabel>
      <View style={s.coinRow}>
        {COIN_LABELS.map(({ key, label, color }) => (
          <CoinCell
            key={key}
            label={label}
            value={coins[key]}
            color={color}
            editable={isOwner}
            onChange={(v) => onUpdateCoins?.({ ...coins, [key]: v })}
          />
        ))}
      </View>

      {/* Carry Capacity */}
      <CardBlock title="Carry Capacity">
        <View style={s.carryNums}>
          <Text style={s.carryWeight}>{carryWeight}</Text>
          <Text style={s.carryMax}>/ {carryMax} lbs</Text>
        </View>
        <View style={s.carryTrack}>
          <View style={[s.carryFill, { width: `${carryRatio * 100}%` as any }]} />
        </View>
        <Text style={s.carryLoad}>{carryLoad} · STR {strengthScore} × 15</Text>
      </CardBlock>

      {/* Treasure & Valuables */}
      <CardBlock title="Treasure & Valuables">
        <EditableText
          value={resources.treasure ?? ''}
          placeholder="Notable loot, gems, art objects…"
          editable={isOwner}
          onCommit={(v) => onUpdateTreasure?.(v)}
        />
      </CardBlock>

      {/* Notes */}
      <CardBlock title="Notes">
        <EditableText
          value={resources.notes ?? ''}
          placeholder="Session notes, reminders, loot to identify…"
          editable={isOwner}
          onCommit={(v) => onUpdateNotes?.(v)}
          multiline
        />
      </CardBlock>

      {detailItem && (
        <EquipmentDetailModal
          item={detailItem}
          onClose={() => setDetailItem(null)}
          onUpdateValue={isOwner && onUpdateItemValue
            ? (v: string) => onUpdateItemValue(detailItem.id, v)
            : undefined}
          onUpdateQuantity={isOwner && onUpdateItemQuantity
            ? (q: number) => onUpdateItemQuantity(detailItem.id, q)
            : undefined}
          canEdit={isOwner}
        />
      )}

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

function SectionLabel({ children }: { children: string }) {
  return (
    <View style={s.sectionRow}>
      <Text style={s.sectionLabel}>{children}</Text>
      <View style={s.sectionLine} />
    </View>
  );
}

function CardBlock({ title, action, onAction, children, style }: {
  title: string; action?: string; onAction?: () => void; children: React.ReactNode; style?: any;
}) {
  return (
    <View style={[s.card, style]}>
      <View style={s.cardHead}>
        <Text style={s.cardTitle}>{title}</Text>
        {action && (
          onAction ? (
            <TouchableOpacity onPress={onAction} hitSlop={8} activeOpacity={0.7}>
              <Text style={s.cardAction}>{action}</Text>
            </TouchableOpacity>
          ) : (
            <Text style={s.cardAction}>{action}</Text>
          )
        )}
      </View>
      <View style={s.cardBody}>{children}</View>
    </View>
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

function InventoryRow({
  item, canEdit, isLast,
  onToggle, onToggleAttuned, onTogglePinnedToCombat, onRemove, onUpdateValue, onUpdateQuantity, onOpenDetail,
}: {
  item: Dnd5eEquipmentItem;
  canEdit: boolean;
  isLast: boolean;
  onToggle: () => void;
  onToggleAttuned?: () => void;
  onTogglePinnedToCombat?: () => void;
  onRemove?: () => void;
  onUpdateValue?: (v: string) => void;
  onUpdateQuantity?: (q: number) => void;
  onOpenDetail: () => void;
}) {
  const armorType = armorTypeLabel(item);
  const typeLabel = SLOT_LABEL[item.slot] ?? item.slot;
  return (
    <View style={[s.tableRow, !isLast && s.tableRowBorder]}>
      {/* Name cell — tap to open the detail modal. Pills wrap below
          the name so narrow viewports don't push them off-screen. */}
      <Pressable onPress={onOpenDetail} style={s.tableCellName}>
        <Text style={s.tableCellNameText} numberOfLines={2}>{item.name}</Text>
        {(armorType || item.slot === 'armor' || item.slot === 'shield' || (item.slot === 'weapon' && item.damage) || item.miscACBonus || item.attuned) ? (
          <View style={s.tableCellNamePills}>
            {armorType && <Pill label={armorType} />}
            {item.slot === 'armor' && !armorType && <Pill label="Armor" />}
            {item.slot === 'shield' && <Pill label="Shield" />}
            {item.slot === 'weapon' && item.damage && <Pill label={item.damage} />}
            {item.miscACBonus ? <Pill label={`+${item.miscACBonus} AC`} variant="primary" /> : null}
            {item.attuned && <Pill label="Attuned" variant="primary" />}
          </View>
        ) : null}
      </Pressable>

      <Text style={[s.tableCellType, s.tableCellTypeText]}>{typeLabel}</Text>

      <View style={s.tableCellQty}>
        <InlineQuantityCell
          quantity={item.quantity ?? 1}
          editable={canEdit && !!onUpdateQuantity}
          onCommit={(q) => onUpdateQuantity?.(q)}
        />
      </View>

      <View style={s.tableCellValue}>
        <InlineValueCell value={item.value ?? ''} editable={canEdit && !!onUpdateValue} onCommit={(v) => onUpdateValue?.(v)} />
      </View>

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
        {canEdit && item.requiresAttunement && onToggleAttuned && (
          <TouchableOpacity onPress={onToggleAttuned} hitSlop={6} activeOpacity={0.7}>
            <MaterialCommunityIcons
              name={item.attuned ? 'star' : 'star-outline'}
              size={16}
              color={item.attuned ? colors.primary : colors.outline}
            />
          </TouchableOpacity>
        )}
        {canEdit && (
          <TouchableOpacity onPress={onToggle} hitSlop={6} activeOpacity={0.7}>
            <MaterialCommunityIcons
              name={item.equipped ? 'checkbox-marked-circle' : 'checkbox-blank-circle-outline'}
              size={16}
              color={item.equipped ? colors.primary : colors.outline}
            />
          </TouchableOpacity>
        )}
        {onRemove && (
          <TouchableOpacity onPress={onRemove} hitSlop={6} activeOpacity={0.7}>
            <MaterialCommunityIcons name="close" size={14} color={colors.outline} />
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

function EquipmentDetailModal({
  item,
  onClose,
  onUpdateValue,
  onUpdateQuantity,
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
  if (item.requiresAttunement) {
    rows.push({ label: 'Attunement', value: item.attuned ? 'Attuned' : 'Required, not attuned' });
  }
  if (typeof item.weight === 'number') rows.push({ label: 'Weight', value: `${item.weight} lb` });
  if (item.equipped) rows.push({ label: 'Status', value: 'Equipped' });

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

function CoinCell({ label, value, color, editable, onChange }: {
  label: string; value: number; color: string; editable: boolean;
  onChange: (v: number) => void;
}) {
  // Always-rendered TextInput. The previous tap-to-edit pattern wrapped
  // the cell in TouchableOpacity and only mounted the TextInput on
  // `editing=true` — on mobile, the press-then-autoFocus handshake
  // routinely failed (the keyboard never opened), making it impossible
  // to edit gold. Keeping the input always mounted lets the user tap
  // directly into it.
  const [text, setText] = useState(String(value));
  useEffect(() => { setText(String(value)); }, [value]);

  function commit() {
    const parsed = parseInt(text, 10);
    if (!isNaN(parsed) && parsed >= 0) {
      if (parsed !== value) onChange(parsed);
    } else {
      setText(String(value));
    }
  }

  return (
    <View style={s.coinCell}>
      <View style={[s.coinDot, { backgroundColor: color }]} />
      {editable ? (
        <TextInput
          style={s.coinInput}
          value={text}
          onChangeText={setText}
          onBlur={commit}
          onSubmitEditing={commit}
          keyboardType="number-pad"
          selectTextOnFocus
          returnKeyType="done"
        />
      ) : (
        <Text style={s.coinValue}>{value}</Text>
      )}
      <Text style={s.coinLabel}>{label}</Text>
    </View>
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

  sectionRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 2 },
  sectionLabel: {
    fontSize: 8, fontFamily: fonts.label, fontWeight: '700',
    letterSpacing: 1.5, textTransform: 'uppercase', color: colors.outline,
  },
  sectionLine: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: colors.outlineVariant },

  // Attunement
  attunementSlots: { flexDirection: 'row', gap: 5, marginBottom: 4 },
  attuneSlot: {
    flex: 1, borderRadius: 6, padding: 9,
  },
  attuneSlotActive: {
    backgroundColor: `${colors.primary}18`,
    borderWidth: 1, borderColor: `${colors.primary}55`,
  },
  attuneSlotEmpty: {
    backgroundColor: colors.surfaceContainer,
    borderWidth: 1, borderColor: colors.outlineVariant,
  },
  attuneLbl: { fontSize: 7, color: colors.outline, letterSpacing: 0.8, textTransform: 'uppercase' },
  attuneName: { fontSize: 9, fontWeight: '700', color: colors.primary, marginTop: 2 },
  attuneEmpty: { fontSize: 9, color: colors.outline, marginTop: 2 },

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
  tableCellName: { flex: 1, gap: 3 },
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
    width: 110,
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
  coinDot: { width: 7, height: 7, borderRadius: 4 },
  coinValue: { fontSize: 14, fontFamily: fonts.headline, fontWeight: '700', color: colors.onSurface },
  coinInput: {
    fontSize: 14, fontFamily: fonts.headline, fontWeight: '700', color: colors.primary,
    textAlign: 'center', minWidth: 30,
  },
  coinLabel: {
    fontSize: 7, fontFamily: fonts.label, fontWeight: '700',
    letterSpacing: 1, textTransform: 'uppercase', color: colors.outline,
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
});
