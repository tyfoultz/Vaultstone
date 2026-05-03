// Authoring form for HomebrewSpell entries.

import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Input, MetaLabel, SectionHeader, Text, colors, spacing } from '@vaultstone/ui';
import {
  createHomebrewEntry,
  updateHomebrewEntry,
  type HomebrewContentRow,
  type HomebrewPackRow,
} from '@vaultstone/api';
import { useAuthStore } from '@vaultstone/store';
import type { HomebrewSpellData } from '@vaultstone/types';
import { HomebrewFormShell } from './HomebrewFormShell';
import { ChipToggleRow } from './ChipToggleRow';

const SCHOOLS = [
  'Abjuration', 'Conjuration', 'Divination', 'Enchantment',
  'Evocation', 'Illusion', 'Necromancy', 'Transmutation',
];

const CLASSES_5E = [
  'Bard', 'Cleric', 'Druid', 'Paladin', 'Ranger',
  'Sorcerer', 'Warlock', 'Wizard',
];

const COMPONENT_OPTIONS = [
  { key: 'V' as const, label: 'V' },
  { key: 'S' as const, label: 'S' },
  { key: 'M' as const, label: 'M' },
];

type Props = {
  pack: HomebrewPackRow;
  /** Pass an existing row to open the form in edit mode. Omit for create. */
  entry?: HomebrewContentRow;
  onClose: () => void;
  onSaved: (entry: HomebrewContentRow) => void;
};

const DEFAULTS: { name: string; data: HomebrewSpellData } = {
  name: '',
  data: {
    level: 1,
    school: 'Evocation',
    castingTime: '1 action',
    range: '60 feet',
    components: ['V', 'S'],
    materialComponents: '',
    duration: 'Instantaneous',
    concentration: false,
    ritual: false,
    description: '',
    higherLevels: '',
    classes: ['Wizard'],
  },
};

export function SpellFormModal({ pack, entry, onClose, onSaved }: Props) {
  const user = useAuthStore((s) => s.user);
  const initial = entry
    ? { name: entry.name, data: entry.data as unknown as HomebrewSpellData }
    : DEFAULTS;

  const [name, setName] = useState(initial.name);
  const [data, setData] = useState<HomebrewSpellData>(initial.data);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  function patch<K extends keyof HomebrewSpellData>(key: K, value: HomebrewSpellData[K]) {
    setData((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit() {
    if (!user) return;
    if (!name.trim()) {
      setError('Spell name is required.');
      return;
    }
    if (!data.description.trim()) {
      setError('Description is required.');
      return;
    }
    setSubmitting(true);
    setError('');

    if (entry) {
      const { data: row, error: err } = await updateHomebrewEntry(entry.id, {
        name: name.trim(),
        data,
      });
      setSubmitting(false);
      if (err || !row) { setError(err?.message ?? 'Failed to save.'); return; }
      onSaved(row);
    } else {
      const { data: row, error: err } = await createHomebrewEntry({
        userId: user.id,
        packId: pack.id,
        name: name.trim(),
        payload: { contentType: 'spell', data },
      });
      setSubmitting(false);
      if (err || !row) { setError(err?.message ?? 'Failed to save.'); return; }
      onSaved(row);
    }
  }

  return (
    <HomebrewFormShell
      eyebrow={entry ? 'Edit spell' : 'New homebrew spell'}
      title={entry ? 'Edit spell' : 'Create a spell'}
      error={error}
      submitting={submitting}
      onClose={onClose}
      onSubmit={handleSubmit}
    >
      <Input
        label="Name"
        placeholder="Power Word: Stub"
        value={name}
        onChangeText={setName}
        autoFocus={!entry}
      />

      <View style={styles.row}>
        <View style={styles.flex1}>
          <MetaLabel size="sm">Level</MetaLabel>
          <Input
            keyboardType="numeric"
            value={String(data.level)}
            onChangeText={(t) => {
              const n = parseInt(t, 10);
              patch('level', Number.isFinite(n) ? Math.max(0, Math.min(9, n)) : 0);
            }}
          />
        </View>
        <View style={styles.flex2}>
          <MetaLabel size="sm">School</MetaLabel>
          <View style={styles.chipScroll}>
            <ChipToggleRow
              options={SCHOOLS.map((s) => ({ key: s, label: s }))}
              values={[data.school]}
              onChange={(next) => {
                // Single-select via toggle: take the last value the user added,
                // ignore deselection (one school always required).
                const picked = next.find((v) => v !== data.school) ?? data.school;
                patch('school', picked);
              }}
            />
          </View>
        </View>
      </View>

      <Input
        label="Casting time"
        placeholder="1 action"
        value={data.castingTime}
        onChangeText={(t) => patch('castingTime', t)}
      />
      <Input
        label="Range"
        placeholder="60 feet"
        value={data.range}
        onChangeText={(t) => patch('range', t)}
      />
      <Input
        label="Duration"
        placeholder="Instantaneous"
        value={data.duration}
        onChangeText={(t) => patch('duration', t)}
      />

      <View>
        <MetaLabel size="sm">Components</MetaLabel>
        <ChipToggleRow
          options={COMPONENT_OPTIONS}
          values={data.components}
          onChange={(next) => patch('components', next)}
        />
      </View>
      {data.components.includes('M') ? (
        <Input
          label="Material components"
          placeholder="A pinch of bat guano and sulfur"
          value={data.materialComponents ?? ''}
          onChangeText={(t) => patch('materialComponents', t)}
        />
      ) : null}

      <View>
        <MetaLabel size="sm">Flags</MetaLabel>
        <ChipToggleRow
          options={[
            { key: 'concentration', label: 'Concentration' },
            { key: 'ritual', label: 'Ritual' },
          ]}
          values={[
            ...(data.concentration ? ['concentration'] : []),
            ...(data.ritual ? ['ritual'] : []),
          ] as Array<'concentration' | 'ritual'>}
          onChange={(next) => {
            patch('concentration', next.includes('concentration'));
            patch('ritual', next.includes('ritual'));
          }}
        />
      </View>

      <View>
        <MetaLabel size="sm">Classes</MetaLabel>
        <ChipToggleRow
          options={CLASSES_5E.map((c) => ({ key: c, label: c }))}
          values={data.classes}
          onChange={(next) => patch('classes', next)}
        />
      </View>

      <SectionHeader title="Description" meta="Required" />
      <Input
        placeholder="A flickering ray of force lances out from your finger…"
        value={data.description}
        onChangeText={(t) => patch('description', t)}
        multiline
        numberOfLines={6}
        style={{ minHeight: 140, textAlignVertical: 'top' }}
      />

      <SectionHeader title="At higher levels" meta="Optional" />
      <Input
        placeholder="When cast at 2nd level or higher, the damage increases by 1d8."
        value={data.higherLevels ?? ''}
        onChangeText={(t) => patch('higherLevels', t)}
        multiline
        numberOfLines={3}
        style={{ minHeight: 72, textAlignVertical: 'top' }}
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
  flex2: { flex: 2 },
  chipScroll: {
    marginTop: 6,
  },
});
