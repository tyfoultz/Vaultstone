// Structured editor for `StartingEquipmentEntry[]` values authored on
// homebrew background / class forms.
//
// Default to a single-option layout (the common case — one fixed
// equipment list). "Add alternate option" lifts the value into the
// A/B/C shape; each option then renders as its own labeled sub-card.
//
// Items inside an option are typed `StartingEquipmentItem` — bare
// strings (legacy) round-trip through the picker as `{ name, itemKey }`
// so the wizard's resolver has the catalog key it needs to grant.

import { useState } from 'react';
import { Pressable, View } from 'react-native';
import {
  Input, MetaLabel, Text, GhostButton, colors, spacing, radius, Icon,
} from '@vaultstone/ui';
import type { StartingEquipmentEntry, StartingEquipmentItem } from '@vaultstone/types';
import { normalizeStartingEquipmentItem } from '@vaultstone/types';
import { ItemPickerModal } from '../../character-sheet/ItemPickerModal';

const CURRENCIES: Array<{ key: 'cp' | 'sp' | 'ep' | 'gp' | 'pp'; label: string }> = [
  { key: 'cp', label: 'CP' },
  { key: 'sp', label: 'SP' },
  { key: 'ep', label: 'EP' },
  { key: 'gp', label: 'GP' },
  { key: 'pp', label: 'PP' },
];

type Props = {
  value: StartingEquipmentEntry[];
  onChange: (next: StartingEquipmentEntry[]) => void;
  /** Pack context — propagated to the item picker so homebrew items
   *  show up alongside the SRD catalog. */
  packIds?: string[];
  srdVersion?: 'SRD_5.1' | 'SRD_2.0';
};

export function StartingEquipmentEditor({ value, onChange, packIds, srdVersion }: Props) {
  // Empty array → render an "Add equipment" CTA only; first add seeds
  // a single-option entry. Single option → flat layout. Multi → cards
  // with labels.
  const options = value;
  const [pickerForOption, setPickerForOption] = useState<number | null>(null);

  function updateOption(idx: number, mutate: (opt: StartingEquipmentEntry) => StartingEquipmentEntry) {
    onChange(options.map((opt, i) => (i === idx ? mutate(opt) : opt)));
  }

  function addOption() {
    // First option seeds the array; subsequent ones promote it to
    // A/B/C with explicit labels for the first two entries.
    if (options.length === 0) {
      onChange([{ items: [] }]);
      return;
    }
    const nextLetter = String.fromCharCode(65 + options.length); // 'B', 'C', …
    const promotedFirst: StartingEquipmentEntry = { ...options[0], label: options[0].label ?? 'A' };
    const rest = options.slice(1);
    onChange([promotedFirst, ...rest, { label: nextLetter, items: [] }]);
  }

  function removeOption(idx: number) {
    const next = options.filter((_, i) => i !== idx);
    // Collapsing back to one option strips the label so the UI re-flattens.
    if (next.length === 1) {
      onChange([{ ...next[0], label: undefined }]);
    } else {
      onChange(next);
    }
  }

  function addItem(idx: number, item: StartingEquipmentItem) {
    updateOption(idx, (opt) => ({
      ...opt,
      items: [...(opt.items ?? []), item],
    }));
  }

  function removeItem(optionIdx: number, itemIdx: number) {
    updateOption(optionIdx, (opt) => ({
      ...opt,
      items: (opt.items ?? []).filter((_, i) => i !== itemIdx),
    }));
  }

  function updateItem(optionIdx: number, itemIdx: number, mutate: (i: ReturnType<typeof normalizeStartingEquipmentItem>) => ReturnType<typeof normalizeStartingEquipmentItem>) {
    updateOption(optionIdx, (opt) => ({
      ...opt,
      items: (opt.items ?? []).map((it, i) => {
        if (i !== itemIdx) return it;
        const norm = normalizeStartingEquipmentItem(it);
        return mutate(norm);
      }),
    }));
  }

  function updateGold(idx: number, gold: StartingEquipmentEntry['gold']) {
    updateOption(idx, (opt) => ({ ...opt, gold }));
  }

  if (options.length === 0) {
    return (
      <View style={{ gap: spacing.xs }}>
        <MetaLabel size="sm">Starting equipment</MetaLabel>
        <Text variant="body-sm" tone="secondary">
          Items the wizard adds to the character&apos;s inventory at creation. Leave empty to skip.
        </Text>
        <GhostButton label="+ Add equipment" onPress={addOption} />
      </View>
    );
  }

  const isMulti = options.length > 1;

  return (
    <View style={{ gap: spacing.sm }}>
      <MetaLabel size="sm">Starting equipment</MetaLabel>
      <Text variant="body-sm" tone="secondary">
        {isMulti
          ? 'Players will pick one option at character creation.'
          : 'Items the wizard adds to the character\'s inventory at creation.'}
      </Text>

      {options.map((opt, idx) => (
        <View
          key={idx}
          style={{
            borderWidth: isMulti ? 1 : 0,
            borderColor: colors.outlineVariant,
            borderRadius: radius.lg,
            padding: isMulti ? spacing.sm + 4 : 0,
            gap: spacing.sm,
            backgroundColor: isMulti ? colors.surfaceContainer : 'transparent',
          }}
        >
          {isMulti ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Input
                label={`Option ${opt.label ?? String.fromCharCode(65 + idx)}`}
                placeholder="A"
                value={opt.label ?? ''}
                onChangeText={(t) => updateOption(idx, (o) => ({ ...o, label: t || undefined }))}
                style={{ flex: 1 }}
              />
              <Pressable onPress={() => removeOption(idx)} hitSlop={8} style={{ marginLeft: spacing.sm }}>
                <Icon name="close" size={18} color={colors.hpDanger} />
              </Pressable>
            </View>
          ) : null}

          {(opt.items ?? []).map((item, itemIdx) => {
            const n = normalizeStartingEquipmentItem(item);
            return (
              <View key={itemIdx} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                <Input
                  label="Qty"
                  placeholder="1"
                  keyboardType="number-pad"
                  value={n.qty ? String(n.qty) : ''}
                  onChangeText={(t) => {
                    const q = parseInt(t, 10);
                    updateItem(idx, itemIdx, (cur) => ({
                      ...cur,
                      qty: Number.isFinite(q) && q > 0 ? q : undefined,
                    }));
                  }}
                  style={{ width: 60 }}
                />
                <View style={{ flex: 1 }}>
                  <MetaLabel size="sm">{n.name}</MetaLabel>
                  {n.itemKey ? (
                    <Text variant="label-sm" tone="secondary">{n.itemKey}</Text>
                  ) : (
                    <Text variant="label-sm" style={{ color: colors.hpWarning }}>
                      No catalog key — won&apos;t auto-grant
                    </Text>
                  )}
                </View>
                <Pressable onPress={() => removeItem(idx, itemIdx)} hitSlop={8}>
                  <Icon name="close" size={16} color={colors.hpDanger} />
                </Pressable>
              </View>
            );
          })}

          <GhostButton label="+ Add item" onPress={() => setPickerForOption(idx)} />

          {/* Gold row */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
            <Input
              label="Gold (amount)"
              placeholder="15"
              keyboardType="number-pad"
              value={opt.gold?.amount !== undefined ? String(opt.gold.amount) : ''}
              onChangeText={(t) => {
                const n = parseInt(t, 10);
                if (!Number.isFinite(n)) {
                  // Empty input collapses the gold field unless a dice
                  // expression is present.
                  updateGold(idx, opt.gold?.dice ? { ...opt.gold, amount: undefined } : undefined);
                } else {
                  updateGold(idx, { ...opt.gold, currency: opt.gold?.currency ?? 'gp', amount: n });
                }
              }}
              style={{ flex: 1 }}
            />
            <Input
              label="… or dice"
              placeholder="2d4 × 10"
              value={opt.gold?.dice ?? ''}
              onChangeText={(t) => {
                if (!t.trim()) {
                  updateGold(idx, opt.gold?.amount !== undefined ? { ...opt.gold, dice: undefined } : undefined);
                } else {
                  updateGold(idx, { ...opt.gold, currency: opt.gold?.currency ?? 'gp', dice: t });
                }
              }}
              style={{ flex: 1 }}
            />
          </View>
          {opt.gold ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}>
              {CURRENCIES.map((c) => {
                const selected = (opt.gold?.currency ?? 'gp') === c.key;
                return (
                  <Pressable
                    key={c.key}
                    onPress={() => updateGold(idx, { ...opt.gold!, currency: c.key })}
                    style={{
                      paddingVertical: 4,
                      paddingHorizontal: 10,
                      borderRadius: radius.full,
                      borderWidth: 1,
                      borderColor: selected ? colors.primary : colors.outlineVariant,
                      backgroundColor: selected ? colors.primaryContainer + '33' : 'transparent',
                    }}
                  >
                    <Text
                      variant="label-sm"
                      style={{ color: selected ? colors.primary : colors.onSurfaceVariant }}
                    >
                      {c.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          ) : null}
        </View>
      ))}

      <GhostButton
        label={isMulti ? '+ Add another alternate' : '+ Offer an alternate option (A or B)'}
        onPress={addOption}
      />

      <ItemPickerModal
        visible={pickerForOption !== null}
        onClose={() => setPickerForOption(null)}
        packIds={packIds}
        srdVersion={srdVersion}
        onPick={(item) => {
          if (pickerForOption === null) return;
          addItem(pickerForOption, { name: item.name, itemKey: item.id, qty: 1 });
          setPickerForOption(null);
        }}
      />
    </View>
  );
}
