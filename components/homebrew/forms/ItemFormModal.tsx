// Authoring form for HomebrewItem entries.

import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Input, MetaLabel, SectionHeader, colors, spacing } from '@vaultstone/ui';
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
  { key: 'crafting-equipment',  label: 'Crafting' },
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
    const finalData: HomebrewItemData = { ...data, properties };

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
          <MetaLabel size="sm">Cost (gp)</MetaLabel>
          <Input
            keyboardType="numeric"
            value={typeof data.costGold === 'number' ? String(data.costGold) : ''}
            onChangeText={(t) => {
              const n = parseFloat(t);
              patch('costGold', Number.isFinite(n) ? n : undefined);
            }}
            placeholder="—"
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
  },
  flex1: { flex: 1 },
});
