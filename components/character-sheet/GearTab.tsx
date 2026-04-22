import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
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
  onUpdateNotes?: (notes: string) => void;
  onUpdateTreasure?: (treasure: string) => void;
}

export function GearTab({
  stats, resources, isOwner, strengthScore,
  onUpdateCoins, onToggleEquipped, onUpdateNotes, onUpdateTreasure,
}: Props) {
  const equipment = resources.equipment ?? [];
  const coins = resources.coins ?? { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 };

  const equippedItems = equipment.filter((i) => i.equipped);
  const carriedItems = equipment.filter((i) => !i.equipped);

  // Attunement
  const attuned = equipment.filter((i) => i.requiresAttunement && i.attuned);
  const attunementMax = 3;

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

      {/* Equipped */}
      <CardBlock title="Equipped" action={isOwner ? '+ Add' : undefined}>
        {equippedItems.length === 0
          ? <Text style={s.emptyHint}>Nothing equipped.</Text>
          : equippedItems.map((item, i) => (
            <EquipRow
              key={item.id}
              item={item}
              canToggle={isOwner}
              onToggle={() => onToggleEquipped?.(item.id)}
              isLast={i === equippedItems.length - 1}
            />
          ))
        }
      </CardBlock>

      {/* Carrying */}
      <CardBlock title="Carrying" action={isOwner ? '+ Add' : undefined}>
        {carriedItems.length === 0
          ? <Text style={s.emptyHint}>Nothing else carried.</Text>
          : carriedItems.map((item, i) => (
            <EquipRow
              key={item.id}
              item={item}
              canToggle={isOwner}
              onToggle={() => onToggleEquipped?.(item.id)}
              isLast={i === carriedItems.length - 1}
            />
          ))
        }
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

    </ScrollView>
  );
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

function CardBlock({ title, action, children, style }: {
  title: string; action?: string; children: React.ReactNode; style?: any;
}) {
  return (
    <View style={[s.card, style]}>
      <View style={s.cardHead}>
        <Text style={s.cardTitle}>{title}</Text>
        {action && <Text style={s.cardAction}>{action}</Text>}
      </View>
      <View style={s.cardBody}>{children}</View>
    </View>
  );
}

function EquipRow({ item, canToggle, onToggle, isLast }: {
  item: Dnd5eEquipmentItem;
  canToggle: boolean;
  onToggle: () => void;
  isLast: boolean;
}) {
  return (
    <View style={[s.equipRow, !isLast && s.equipRowBorder]}>
      <Text style={s.equipName} numberOfLines={1}>{item.name}</Text>
      <View style={s.equipPills}>
        {item.attuned && <Pill label="Attuned" variant="primary" />}
        {item.slot === 'armor' && <Pill label="Armor" />}
        {item.slot === 'weapon' && item.damage && <Pill label={item.damage} />}
        {item.notes && !item.damage && !item.acBase && <Pill label={item.notes} />}
      </View>
      {canToggle && (
        <TouchableOpacity onPress={onToggle} hitSlop={8} activeOpacity={0.7}>
          <MaterialCommunityIcons
            name={item.equipped ? 'checkbox-marked-circle' : 'checkbox-blank-circle-outline'}
            size={16}
            color={item.equipped ? colors.primary : colors.outline}
          />
        </TouchableOpacity>
      )}
    </View>
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
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(String(value));

  function commit() {
    setEditing(false);
    const parsed = parseInt(text, 10);
    if (!isNaN(parsed) && parsed >= 0) onChange(parsed);
    else setText(String(value));
  }

  return (
    <TouchableOpacity
      style={s.coinCell}
      onPress={() => editable && setEditing(true)}
      activeOpacity={editable ? 0.7 : 1}
    >
      <View style={[s.coinDot, { backgroundColor: color }]} />
      {editing ? (
        <TextInput
          style={s.coinInput}
          value={text}
          onChangeText={setText}
          onBlur={commit}
          onSubmitEditing={commit}
          keyboardType="numeric"
          autoFocus
          selectTextOnFocus
        />
      ) : (
        <Text style={s.coinValue}>{value}</Text>
      )}
      <Text style={s.coinLabel}>{label}</Text>
    </TouchableOpacity>
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

  // Equip rows
  equipRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 12, paddingVertical: 11,
  },
  equipRowBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.outlineVariant },
  equipName: { flex: 1, fontSize: 11, fontFamily: fonts.body, fontWeight: '600', color: colors.onSurface },
  equipPills: { flexDirection: 'row', gap: 4, flexShrink: 1 },

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
});
