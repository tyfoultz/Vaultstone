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
}

export function GearTab({ stats, resources, isOwner, strengthScore, onUpdateCoins, onToggleEquipped }: Props) {
  const equipment = resources.equipment ?? [];
  const coins = resources.coins ?? { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 };

  const equippedItems = equipment.filter((i) => i.equipped);
  const carriedItems = equipment.filter((i) => !i.equipped);

  // Attunement
  const requiresAttunement = equipment.filter((i) => i.requiresAttunement);
  const attuned = requiresAttunement.filter((i) => i.attuned);
  const attunementUsed = attuned.length;
  const attunementMax = 3;

  // Carry weight (STR × 15 lbs — simple encumbrance)
  const carryMax = strengthScore * 15;

  return (
    <ScrollView contentContainerStyle={s.container} showsVerticalScrollIndicator={false}>

      {/* ── ATTUNEMENT ── */}
      {requiresAttunement.length > 0 && (
        <>
          <SectionLabel accent>ATTUNEMENT</SectionLabel>
          <View style={s.attunementCard}>
            <View style={s.attunementPips}>
              {Array.from({ length: attunementMax }).map((_, i) => (
                <View key={i} style={[s.attunementPip, i < attunementUsed && s.attunementPipActive]} />
              ))}
            </View>
            <Text style={s.attunementCount}>{attunementUsed}/{attunementMax} slots used</Text>
            {attuned.length > 0 && (
              <View style={s.attunedList}>
                {attuned.map((item) => (
                  <View key={item.id} style={s.attunedRow}>
                    <MaterialCommunityIcons name="star-four-points" size={10} color={colors.primary} />
                    <Text style={s.attunedName}>{item.name}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        </>
      )}

      {/* ── EQUIPPED ── */}
      <SectionLabel style={requiresAttunement.length > 0 ? { marginTop: 14 } : undefined}>EQUIPPED</SectionLabel>
      {equippedItems.length === 0 ? (
        <EmptyHint text="Nothing equipped." />
      ) : (
        <View style={s.equipCard}>
          {equippedItems.map((item, i) => (
            <EquipRow
              key={item.id}
              item={item}
              canToggle={isOwner}
              onToggle={() => onToggleEquipped?.(item.id)}
              isLast={i === equippedItems.length - 1}
            />
          ))}
        </View>
      )}

      {/* ── CARRYING ── */}
      {carriedItems.length > 0 && (
        <>
          <SectionLabel style={{ marginTop: 14 }}>CARRYING</SectionLabel>
          <View style={s.equipCard}>
            {carriedItems.map((item, i) => (
              <EquipRow
                key={item.id}
                item={item}
                canToggle={isOwner}
                onToggle={() => onToggleEquipped?.(item.id)}
                isLast={i === carriedItems.length - 1}
              />
            ))}
          </View>
        </>
      )}

      {/* ── CARRY WEIGHT ── */}
      <View style={s.carryRow}>
        <MaterialCommunityIcons name="weight" size={12} color={colors.outline} />
        <Text style={s.carryText}>Carry capacity: <Text style={s.carryMax}>{carryMax} lb</Text></Text>
      </View>

      {/* ── COINS ── */}
      <SectionLabel style={{ marginTop: 14 }}>COIN POUCH</SectionLabel>
      <View style={s.coinsGrid}>
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

function EquipRow({ item, canToggle, onToggle, isLast }: {
  item: Dnd5eEquipmentItem;
  canToggle: boolean;
  onToggle: () => void;
  isLast: boolean;
}) {
  return (
    <View style={[s.equipRow, !isLast && s.equipRowBorder]}>
      <View style={s.equipSlotIcon}>
        <MaterialCommunityIcons
          name={SLOT_ICON[item.slot] as any}
          size={14}
          color={item.equipped ? colors.primary : colors.outline}
        />
      </View>
      <View style={s.equipInfo}>
        <View style={s.equipNameRow}>
          <Text style={[s.equipName, item.equipped && s.equipNameActive]}>{item.name}</Text>
          {item.requiresAttunement && (
            <MaterialCommunityIcons
              name={item.attuned ? 'star-four-points' : 'star-four-points-outline'}
              size={11}
              color={item.attuned ? colors.primary : colors.outline}
            />
          )}
        </View>
        {item.damage ? (
          <Text style={s.equipSub}>{item.damage}{item.range ? ` · ${item.range} ft` : ''}</Text>
        ) : item.acBase ? (
          <Text style={s.equipSub}>AC {item.acBase}{item.dexCap != null ? ` (DEX max ${item.dexCap})` : ''}</Text>
        ) : item.notes ? (
          <Text style={s.equipSub}>{item.notes}</Text>
        ) : null}
      </View>
      {canToggle && (
        <TouchableOpacity onPress={onToggle} hitSlop={8} activeOpacity={0.7}>
          <MaterialCommunityIcons
            name={item.equipped ? 'checkbox-marked-circle' : 'checkbox-blank-circle-outline'}
            size={18}
            color={item.equipped ? colors.primary : colors.outline}
          />
        </TouchableOpacity>
      )}
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

function EmptyHint({ text }: { text: string }) {
  return (
    <View style={s.emptyHint}>
      <Text style={s.emptyHintText}>{text}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  container: { paddingHorizontal: spacing.md, paddingTop: 14 },

  sectionRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  sectionLabel: {
    fontSize: 9, fontFamily: fonts.label, fontWeight: '700',
    letterSpacing: 1.5, textTransform: 'uppercase', color: colors.outline,
  },
  sectionLabelAccent: { color: colors.primary },
  sectionLine: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: colors.outlineVariant },
  sectionLineAccent: { backgroundColor: `${colors.primary}44` },

  // Attunement
  attunementCard: {
    backgroundColor: `${colors.primary}10`,
    borderWidth: 1, borderColor: `${colors.primary}44`,
    borderRadius: radius.lg, padding: 14, gap: 8,
  },
  attunementPips: { flexDirection: 'row', gap: 8 },
  attunementPip: {
    width: 16, height: 16, borderRadius: 8,
    borderWidth: 1.5, borderColor: colors.outlineVariant,
  },
  attunementPipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  attunementCount: {
    fontSize: 11, fontFamily: fonts.label, fontWeight: '600',
    letterSpacing: 0.5, color: colors.onSurfaceVariant,
  },
  attunedList: { gap: 4, marginTop: 2 },
  attunedRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  attunedName: { fontSize: 12, fontFamily: fonts.body, color: colors.onSurface },

  // Equipment
  equipCard: {
    backgroundColor: colors.surfaceContainer,
    borderWidth: 1, borderColor: colors.outlineVariant,
    borderRadius: radius.lg, overflow: 'hidden',
  },
  equipRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 12, paddingVertical: 10,
  },
  equipRowBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.outlineVariant },
  equipSlotIcon: {
    width: 26, height: 26, borderRadius: 6,
    backgroundColor: colors.surfaceContainerHigh,
    alignItems: 'center', justifyContent: 'center',
  },
  equipInfo: { flex: 1, minWidth: 0 },
  equipNameRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  equipName: { fontSize: 13, fontFamily: fonts.body, fontWeight: '600', color: colors.onSurfaceVariant },
  equipNameActive: { color: colors.onSurface },
  equipSub: { fontSize: 10, fontFamily: fonts.label, color: colors.outline, marginTop: 1 },

  // Carry weight
  carryRow: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    marginTop: 8, paddingHorizontal: 2,
  },
  carryText: {
    fontSize: 11, fontFamily: fonts.label, fontWeight: '500', color: colors.outline,
  },
  carryMax: { fontWeight: '700', color: colors.onSurfaceVariant },

  // Coins
  coinsGrid: { flexDirection: 'row', gap: 6 },
  coinCell: {
    flex: 1, alignItems: 'center',
    backgroundColor: colors.surfaceContainer,
    borderWidth: 1, borderColor: colors.outlineVariant,
    borderRadius: radius.lg, paddingVertical: 10, paddingHorizontal: 4,
    gap: 4,
  },
  coinDot: { width: 8, height: 8, borderRadius: 4 },
  coinValue: {
    fontSize: 15, fontFamily: fonts.headline, fontWeight: '700', color: colors.onSurface,
  },
  coinInput: {
    fontSize: 15, fontFamily: fonts.headline, fontWeight: '700', color: colors.primary,
    textAlign: 'center', minWidth: 36,
  },
  coinLabel: {
    fontSize: 8, fontFamily: fonts.label, fontWeight: '700',
    letterSpacing: 1, textTransform: 'uppercase', color: colors.outline,
  },

  emptyHint: { paddingVertical: 10, paddingHorizontal: 2, marginBottom: 4 },
  emptyHintText: { fontSize: 12, fontFamily: fonts.body, color: colors.outline, fontStyle: 'italic' },
});
