// Authoring form for HomebrewItem entries.

import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import {
  GhostButton,
  Icon,
  Input,
  MetaLabel,
  SectionHeader,
  Text,
  colors,
  radius,
  spacing,
} from '@vaultstone/ui';
import {
  createHomebrewEntry,
  updateHomebrewEntry,
  type HomebrewContentRow,
  type HomebrewPackRow,
} from '@vaultstone/api';
import { useAuthStore } from '@vaultstone/store';
import type { HomebrewItemData } from '@vaultstone/types';
import { HomebrewFormShell } from './HomebrewFormShell';
import { ChipToggleRow } from './ChipToggleRow';

const CATEGORIES: Array<{ key: HomebrewItemData['category']; label: string }> = [
  { key: 'weapon',              label: 'Weapon' },
  { key: 'armor',               label: 'Armor' },
  { key: 'shield',              label: 'Shield' },
  { key: 'adventuring-gear',    label: 'Adv. Gear' },
  { key: 'magic-item',          label: 'Magic Item' },
];

const RARITIES: Array<{ key: NonNullable<HomebrewItemData['rarity']>; label: string }> = [
  { key: 'common',     label: 'Common' },
  { key: 'uncommon',   label: 'Uncommon' },
  { key: 'rare',       label: 'Rare' },
  { key: 'very-rare',  label: 'Very Rare' },
  { key: 'legendary',  label: 'Legendary' },
  { key: 'artifact',   label: 'Artifact' },
];

const MAGIC_KINDS = [
  'wondrous-item', 'wand', 'rod', 'staff', 'ring', 'potion', 'scroll',
];

type Currency = NonNullable<HomebrewItemData['cost']>['currency'];
const CURRENCIES: Array<{ key: Currency; label: string }> = [
  { key: 'cp', label: 'cp' },
  { key: 'sp', label: 'sp' },
  { key: 'ep', label: 'ep' },
  { key: 'gp', label: 'gp' },
  { key: 'pp', label: 'pp' },
];

type Props = {
  pack: HomebrewPackRow;
  entry?: HomebrewContentRow;
  onClose: () => void;
  onSaved: (entry: HomebrewContentRow) => void;
};

const DEFAULTS: { name: string; data: HomebrewItemData } = {
  name: '',
  data: {
    category: 'adventuring-gear',
    requiresAttunement: false,
    properties: [],
    description: '',
  },
};

export function ItemFormModal({ pack, entry, onClose, onSaved }: Props) {
  const user = useAuthStore((s) => s.user);
  const initial = entry
    ? { name: entry.name, data: entry.data as unknown as HomebrewItemData }
    : DEFAULTS;

  const [name, setName] = useState(initial.name);
  const [data, setData] = useState<HomebrewItemData>(initial.data);
  const [propertiesText, setPropertiesText] = useState((initial.data.properties ?? []).join('\n'));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  function patch<K extends keyof HomebrewItemData>(key: K, value: HomebrewItemData[K]) {
    setData((prev) => ({ ...prev, [key]: value }));
  }

  // ── Cost (structured) ───────────────────────────────────────────────────
  // Default currency to gp when the row only had legacy `costGold`, so the
  // user sees the value they originally entered. New rows default to gp.
  const cost = data.cost
    ?? (typeof data.costGold === 'number'
      ? { amount: data.costGold, currency: 'gp' as Currency }
      : null);

  function patchCostAmount(raw: string) {
    const trimmed = raw.trim();
    if (trimmed === '') { patch('cost', undefined); return; }
    const n = parseFloat(trimmed);
    if (!Number.isFinite(n)) { patch('cost', undefined); return; }
    patch('cost', { amount: n, currency: cost?.currency ?? 'gp' });
  }
  function patchCostCurrency(c: Currency) {
    if (!cost) { patch('cost', { amount: 0, currency: c }); return; }
    patch('cost', { ...cost, currency: c });
  }

  // ── Pack contents ───────────────────────────────────────────────────────
  const packContents = data.packContents ?? [];
  function addPackEntry() {
    patch('packContents', [...packContents, { name: '', quantity: 1 }]);
  }
  function removePackEntry(idx: number) {
    patch('packContents', packContents.filter((_, i) => i !== idx));
  }
  function patchPackEntryName(idx: number, value: string) {
    const next = packContents.slice();
    next[idx] = { ...next[idx], name: value };
    patch('packContents', next);
  }
  function patchPackEntryQuantity(idx: number, raw: string) {
    const next = packContents.slice();
    const n = Math.max(1, parseInt(raw, 10) || 1);
    next[idx] = { ...next[idx], quantity: n };
    patch('packContents', next);
  }

  async function handleSubmit() {
    if (!user) return;
    if (!name.trim()) { setError('Item name is required.'); return; }
    if (!data.description.trim()) { setError('Description is required.'); return; }
    setSubmitting(true);
    setError('');

    const properties = propertiesText
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);
    // Strip empty pack-content rows so the resolver's "is this set?" check
    // doesn't trip on a row with no name. Quantity defaults to 1 if 0/NaN.
    const cleanPackContents = packContents
      .map((p) => ({ name: p.name.trim(), quantity: Math.max(1, p.quantity || 1) }))
      .filter((p) => p.name);
    const finalData: HomebrewItemData = {
      ...data,
      properties,
      packContents: cleanPackContents.length > 0 ? cleanPackContents : undefined,
      // costGold lives on for legacy reads but the form never writes new
      // values to it — the structured `cost` is canonical now.
      costGold: undefined,
    };

    if (entry) {
      const { data: row, error: err } = await updateHomebrewEntry(entry.id, {
        name: name.trim(),
        data: finalData,
      });
      setSubmitting(false);
      if (err || !row) { setError(err?.message ?? 'Failed to save.'); return; }
      onSaved(row);
    } else {
      const { data: row, error: err } = await createHomebrewEntry({
        userId: user.id,
        packId: pack.id,
        name: name.trim(),
        payload: { contentType: 'item', data: finalData },
      });
      setSubmitting(false);
      if (err || !row) { setError(err?.message ?? 'Failed to save.'); return; }
      onSaved(row);
    }
  }

  return (
    <HomebrewFormShell
      eyebrow={entry ? 'Edit item' : 'New homebrew item'}
      title={entry ? 'Edit item' : 'Create an item'}
      error={error}
      submitting={submitting}
      onClose={onClose}
      onSubmit={handleSubmit}
    >
      <Input
        label="Name"
        placeholder="Vorpal Stub"
        value={name}
        onChangeText={setName}
        autoFocus={!entry}
      />

      <View>
        <MetaLabel size="sm">Category</MetaLabel>
        <ChipToggleRow
          options={CATEGORIES}
          values={[data.category]}
          onChange={(next) => {
            const picked = next.find((v) => v !== data.category) ?? data.category;
            patch('category', picked);
          }}
        />
      </View>

      {data.category === 'magic-item' ? (
        <View>
          <MetaLabel size="sm">Magic item kind</MetaLabel>
          <ChipToggleRow
            options={MAGIC_KINDS.map((k) => ({ key: k, label: k.replace('-', ' ') }))}
            values={data.magicItemKind ? [data.magicItemKind] : []}
            onChange={(next) => {
              const picked = next.find((v) => v !== data.magicItemKind) ?? null;
              patch('magicItemKind', picked ?? undefined);
            }}
          />
        </View>
      ) : null}

      <View>
        <MetaLabel size="sm">Rarity</MetaLabel>
        <ChipToggleRow
          options={RARITIES}
          values={data.rarity ? [data.rarity] : []}
          onChange={(next) => {
            const picked = next.find((v) => v !== data.rarity) ?? null;
            patch('rarity', picked ?? undefined);
          }}
        />
      </View>

      <View>
        <MetaLabel size="sm">Attunement</MetaLabel>
        <ChipToggleRow
          options={[{ key: 'attune' as const, label: 'Requires attunement' }]}
          values={data.requiresAttunement ? ['attune'] : []}
          onChange={(next) => patch('requiresAttunement', next.includes('attune'))}
        />
      </View>

      {data.requiresAttunement ? (
        <Input
          label="Attunement condition"
          placeholder="By a wizard, sorcerer, or warlock"
          value={data.attunementCondition ?? ''}
          onChangeText={(t) => patch('attunementCondition', t)}
        />
      ) : null}

      <View style={styles.row}>
        <View style={styles.flex1}>
          <MetaLabel size="sm">Cost</MetaLabel>
          <Input
            keyboardType="numeric"
            value={cost ? String(cost.amount) : ''}
            onChangeText={patchCostAmount}
            placeholder="—"
          />
        </View>
        <View style={styles.flex2}>
          <MetaLabel size="sm">Currency</MetaLabel>
          <ChipToggleRow
            options={CURRENCIES}
            values={[cost?.currency ?? 'gp']}
            onChange={(next) => {
              const picked = (next.find((v) => v !== (cost?.currency ?? 'gp')) ?? cost?.currency ?? 'gp') as Currency;
              patchCostCurrency(picked);
            }}
          />
        </View>
        <View style={styles.flex1}>
          <MetaLabel size="sm">Weight (lb)</MetaLabel>
          <Input
            keyboardType="numeric"
            value={typeof data.weight === 'number' ? String(data.weight) : ''}
            onChangeText={(t) => {
              const n = parseFloat(t);
              patch('weight', Number.isFinite(n) ? n : undefined);
            }}
            placeholder="—"
          />
        </View>
      </View>

      <SectionHeader title="Properties" meta="One per line" />
      <Input
        placeholder={'Versatile (1d10)\nDisadvantage on Stealth'}
        value={propertiesText}
        onChangeText={setPropertiesText}
        multiline
        numberOfLines={3}
        style={{ minHeight: 72, textAlignVertical: 'top' }}
      />

      {data.category === 'adventuring-gear' ? (
        <>
          <SectionHeader
            title="Pack contents"
            meta="Use when this entry is an equipment pack (Burglar's Pack, etc.). Otherwise leave empty."
          />
          {packContents.map((p, idx) => (
            <View key={idx} style={styles.packRow}>
              <View style={{ flex: 1 }}>
                <Input
                  label="Item name"
                  placeholder="Candle"
                  value={p.name}
                  onChangeText={(t) => patchPackEntryName(idx, t)}
                />
              </View>
              <View style={{ width: 96 }}>
                <Input
                  label="Quantity"
                  keyboardType="number-pad"
                  value={String(p.quantity)}
                  onChangeText={(t) => patchPackEntryQuantity(idx, t)}
                />
              </View>
              <Pressable
                onPress={() => removePackEntry(idx)}
                style={styles.removeBtn}
                accessibilityLabel="Remove pack entry"
              >
                <Icon name="close" size={16} color={colors.onSurfaceVariant} />
              </Pressable>
            </View>
          ))}
          <GhostButton label="+ Add pack entry" onPress={addPackEntry} />
        </>
      ) : null}

      <SectionHeader title="Description" meta="Required" />
      <Input
        placeholder="This sword's edge thrums with arcane resonance…"
        value={data.description}
        onChangeText={(t) => patch('description', t)}
        multiline
        numberOfLines={6}
        style={{ minHeight: 140, textAlignVertical: 'top' }}
      />
    </HomebrewFormShell>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'flex-end',
  },
  flex1: { flex: 1 },
  flex2: { flex: 2 },
  packRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'flex-end',
    padding: spacing.sm,
    backgroundColor: colors.surfaceContainerLowest,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.outlineVariant + '55',
    marginBottom: spacing.sm,
  },
  removeBtn: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: colors.outlineVariant + '55',
    marginBottom: 2,
  },
});
