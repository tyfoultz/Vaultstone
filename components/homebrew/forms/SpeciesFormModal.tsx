// Basic authoring form for HomebrewSpecies entries.

import { useState } from 'react';
import { View } from 'react-native';
import { Input, MetaLabel, SectionHeader } from '@vaultstone/ui';
import {
  createHomebrewEntry,
  updateHomebrewEntry,
  type HomebrewContentRow,
  type HomebrewPackRow,
} from '@vaultstone/api';
import { useAuthStore } from '@vaultstone/store';
import type { HomebrewSpeciesData } from '@vaultstone/types';
import { HomebrewFormShell } from './HomebrewFormShell';
import { ChipToggleRow } from './ChipToggleRow';

const SIZES: Array<{ key: HomebrewSpeciesData['size']; label: string }> = [
  { key: 'Small',  label: 'Small' },
  { key: 'Medium', label: 'Medium' },
  { key: 'Large',  label: 'Large' },
];

type Props = {
  pack: HomebrewPackRow;
  entry?: HomebrewContentRow;
  onClose: () => void;
  onSaved: (entry: HomebrewContentRow) => void;
};

const DEFAULTS: { name: string; data: HomebrewSpeciesData } = {
  name: '',
  data: {
    size: 'Medium',
    speed: 30,
    description: '',
  },
};

export function SpeciesFormModal({ pack, entry, onClose, onSaved }: Props) {
  const user = useAuthStore((s) => s.user);
  const initial = entry
    ? { name: entry.name, data: entry.data as unknown as HomebrewSpeciesData }
    : DEFAULTS;

  const [name, setName] = useState(initial.name);
  const [data, setData] = useState<HomebrewSpeciesData>(initial.data);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  function patch<K extends keyof HomebrewSpeciesData>(key: K, value: HomebrewSpeciesData[K]) {
    setData((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit() {
    if (!user) return;
    if (!name.trim()) { setError('Species name is required.'); return; }
    if (!data.description.trim()) { setError('Description is required.'); return; }
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
        payload: { contentType: 'species', data },
      });
      setSubmitting(false);
      if (err || !row) { setError(err?.message ?? 'Failed to save.'); return; }
      onSaved(row);
    }
  }

  return (
    <HomebrewFormShell
      eyebrow={entry ? 'Edit species' : 'New homebrew species'}
      title={entry ? 'Edit species' : 'Create a species'}
      error={error}
      submitting={submitting}
      onClose={onClose}
      onSubmit={handleSubmit}
    >
      <Input
        label="Name"
        placeholder="Twilight-touched"
        value={name}
        onChangeText={setName}
        autoFocus={!entry}
      />

      <View>
        <MetaLabel size="sm">Size</MetaLabel>
        <ChipToggleRow
          options={SIZES}
          values={[data.size]}
          onChange={(next) => {
            const picked = next.find((v) => v !== data.size) ?? data.size;
            patch('size', picked);
          }}
        />
      </View>

      <View style={{ width: 160 }}>
        <MetaLabel size="sm">Speed (ft.)</MetaLabel>
        <Input
          keyboardType="numeric"
          value={String(data.speed)}
          onChangeText={(t) => {
            const n = parseInt(t, 10);
            patch('speed', Number.isFinite(n) ? n : 0);
          }}
        />
      </View>

      <SectionHeader title="Description" meta="Required" />
      <Input
        placeholder="A people born of the boundary between dusk and dawn…"
        value={data.description}
        onChangeText={(t) => patch('description', t)}
        multiline
        numberOfLines={5}
        style={{ minHeight: 120, textAlignVertical: 'top' }}
      />

      <SectionHeader title="Traits & ASI notes" meta="Optional" />
      <Input
        placeholder={'Ability Score Increase. Charisma +2.\nDarkvision. 60 ft.\nFey Ancestry. Advantage on saves vs charm.'}
        value={data.traitsNotes ?? ''}
        onChangeText={(t) => patch('traitsNotes', t)}
        multiline
        numberOfLines={6}
        style={{ minHeight: 140, textAlignVertical: 'top' }}
      />
    </HomebrewFormShell>
  );
}
