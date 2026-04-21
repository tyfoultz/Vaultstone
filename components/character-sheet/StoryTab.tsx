import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { colors, fonts, spacing, radius } from '@vaultstone/ui';
import type { Dnd5eStats, Dnd5eResources, Dnd5eEquipmentItem } from '@vaultstone/types';

const COIN_LABELS: Array<{ key: keyof NonNullable<Dnd5eResources['coins']>; label: string; color: string }> = [
  { key: 'cp', label: 'CP', color: '#b87333' },
  { key: 'sp', label: 'SP', color: '#aaa9ad' },
  { key: 'ep', label: 'EP', color: '#b8b4d4' },
  { key: 'gp', label: 'GP', color: colors.gm ?? '#e6a255' },
  { key: 'pp', label: 'PP', color: '#e5e4e2' },
];

const SLOT_ICON: Record<string, string> = {
  weapon: 'sword',
  armor: 'shield',
  shield: 'shield-half-full',
  other: 'bag-personal',
};

interface Props {
  stats: Dnd5eStats;
  resources: Dnd5eResources;
  isOwner: boolean;
  onUpdateCoins?: (coins: NonNullable<Dnd5eResources['coins']>) => void;
  onToggleEquipped?: (id: string) => void;
  onNotesChange?: (text: string) => void;
}

export function StoryTab({ stats, resources, isOwner, onUpdateCoins, onToggleEquipped, onNotesChange }: Props) {
  const equipment = resources.equipment ?? [];
  const coins = resources.coins ?? { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 };
  const notes = resources.notes ?? '';

  const equippedItems = equipment.filter((i) => i.equipped);
  const carriedItems = equipment.filter((i) => !i.equipped);

  return (
    <ScrollView contentContainerStyle={s.container} showsVerticalScrollIndicator={false}>

      {/* Identity */}
      <SectionLabel>IDENTITY</SectionLabel>
      <View style={s.identityCard}>
        <IdentRow label="Species" value={stats.speciesKey ?? '—'} />
        <IdentRow label="Class" value={`${stats.classKey ?? '—'} · Level ${stats.level}`} />
        <IdentRow label="Background" value={stats.backgroundKey ?? '—'} />
        {stats.originFeat ? <IdentRow label="Origin Feat" value={stats.originFeat} accent={colors.gm ?? '#e6a255'} /> : null}
        <IdentRow label="Rules" value={stats.srdVersion === 'SRD_2.0' ? '2024 Rules' : '2014 Rules'} last />
      </View>

      {/* Equipment */}
      <SectionLabel style={{ marginTop: 16 }}>EQUIPMENT</SectionLabel>
      {equipment.length === 0 ? (
        <EmptyHint text="No equipment added yet." />
      ) : (
        <>
          {equippedItems.length > 0 && (
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
          {carriedItems.length > 0 && (
            <>
              <Text style={s.equippedLabel}>CARRYING</Text>
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
        </>
      )}

      {/* Coins */}
      <SectionLabel style={{ marginTop: 16 }}>COIN POUCH</SectionLabel>
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

      {/* Notes */}
      <SectionLabel style={{ marginTop: 16 }}>NOTES</SectionLabel>
      <View style={s.notesCard}>
        <TextInput
          style={s.notesInput}
          value={notes}
          onChangeText={isOwner ? onNotesChange : undefined}
          editable={isOwner}
          multiline
          placeholder={isOwner ? 'Add notes, reminders, story beats…' : 'No notes yet.'}
          placeholderTextColor={colors.outline}
          textAlignVertical="top"
        />
      </View>

      <View style={{ height: 16 }} />
    </ScrollView>
  );
}

function SectionLabel({ children, style }: { children: string; style?: any }) {
  return (
    <View style={[s.sectionRow, style]}>
      <Text style={s.sectionLabel}>{children}</Text>
      <View style={s.sectionLine} />
    </View>
  );
}

function IdentRow({ label, value, accent, last }: { label: string; value: string; accent?: string; last?: boolean }) {
  return (
    <View style={[s.identRow, !last && s.identRowBorder]}>
      <Text style={s.identLabel}>{label}</Text>
      <Text style={[s.identValue, accent ? { color: accent } : null]}>{value}</Text>
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
        <Text style={[s.equipName, item.equipped && { color: colors.onSurface }]}>{item.name}</Text>
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
  sectionLine: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: colors.outlineVariant },

  identityCard: {
    backgroundColor: colors.surfaceContainer,
    borderWidth: 1, borderColor: colors.outlineVariant,
    borderRadius: radius.lg, overflow: 'hidden',
  },
  identRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 14, paddingVertical: 10,
  },
  identRowBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.outlineVariant },
  identLabel: {
    fontSize: 11, fontFamily: fonts.label, fontWeight: '600',
    textTransform: 'uppercase', letterSpacing: 0.5, color: colors.outline,
  },
  identValue: { fontSize: 13, fontFamily: fonts.body, color: colors.onSurfaceVariant },

  equippedLabel: {
    fontSize: 9, fontFamily: fonts.label, fontWeight: '700',
    letterSpacing: 1, textTransform: 'uppercase', color: colors.outline,
    marginTop: 8, marginBottom: 6, paddingHorizontal: 2,
  },
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
  equipName: { fontSize: 13, fontFamily: fonts.body, fontWeight: '600', color: colors.onSurfaceVariant },
  equipSub: { fontSize: 10, fontFamily: fonts.label, color: colors.outline, marginTop: 1 },

  coinsGrid: {
    flexDirection: 'row', gap: 6,
  },
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

  notesCard: {
    backgroundColor: colors.surfaceContainer,
    borderWidth: 1, borderColor: colors.outlineVariant,
    borderRadius: radius.lg, padding: 14, minHeight: 140,
  },
  notesInput: {
    fontSize: 13, fontFamily: fonts.body, color: colors.onSurface,
    lineHeight: 20, flex: 1,
  },

  emptyHint: { paddingVertical: 10, paddingHorizontal: 2, marginBottom: 4 },
  emptyHintText: { fontSize: 12, fontFamily: fonts.body, color: colors.outline, fontStyle: 'italic' },
});
