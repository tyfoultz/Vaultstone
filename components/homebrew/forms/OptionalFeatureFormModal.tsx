// Authoring form for HomebrewOptionalFeature entries — Eldritch
// Invocations, Metamagic Options, Battle Master Maneuvers, Fighting
// Styles, Artificer Infusions, Pact Boons, etc.

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
import type {
  HomebrewOptionalFeatureData, HomebrewOptionalFeatureKind,
} from '@vaultstone/types';
import { HomebrewFormShell } from './HomebrewFormShell';
import { ChipToggleRow } from './ChipToggleRow';

const KINDS: Array<{ key: HomebrewOptionalFeatureKind; label: string }> = [
  { key: 'invocation',            label: 'Invocation' },
  { key: 'metamagic',             label: 'Metamagic' },
  { key: 'maneuver',              label: 'Maneuver' },
  { key: 'fighting-style',        label: 'Fighting Style' },
  { key: 'pact-boon',             label: 'Pact Boon' },
  { key: 'artificer-infusion',    label: 'Infusion' },
  { key: 'arcane-shot',           label: 'Arcane Shot' },
  { key: 'elemental-discipline',  label: 'Elemental Discipline' },
  { key: 'rune',                  label: 'Rune' },
  { key: 'class-feature-variant', label: 'Class-Feature Variant' },
  { key: 'other',                 label: 'Other' },
];

type Props = {
  pack: HomebrewPackRow;
  entry?: HomebrewContentRow;
  onClose: () => void;
  onSaved: (entry: HomebrewContentRow) => void;
};

const DEFAULTS: { name: string; data: HomebrewOptionalFeatureData } = {
  name: '',
  data: {
    kinds: ['invocation'],
    prerequisites: '',
    consumes: undefined,
    description: '',
  },
};

export function OptionalFeatureFormModal({ pack, entry, onClose, onSaved }: Props) {
  const user = useAuthStore((s) => s.user);
  const initial = entry
    ? { name: entry.name, data: entry.data as unknown as HomebrewOptionalFeatureData }
    : DEFAULTS;

  const [name, setName] = useState(initial.name);
  const [data, setData] = useState<HomebrewOptionalFeatureData>(initial.data);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  function patch<K extends keyof HomebrewOptionalFeatureData>(key: K, value: HomebrewOptionalFeatureData[K]) {
    setData((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit() {
    if (!user) return;
    if (!name.trim()) { setError('Feature name is required.'); return; }
    if (data.kinds.length === 0) { setError('Pick at least one kind.'); return; }
    if (!data.description.trim()) { setError('Description is required.'); return; }
    setSubmitting(true);
    setError('');

    const finalData: HomebrewOptionalFeatureData = {
      ...data,
      prerequisites: data.prerequisites?.trim() || undefined,
      consumes: data.consumes?.trim() || undefined,
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
        payload: { contentType: 'optional-feature', data: finalData },
      });
      setSubmitting(false);
      if (err || !row) { setError(err?.message ?? 'Failed to save.'); return; }
      onSaved(row);
    }
  }

  return (
    <HomebrewFormShell
      eyebrow={entry ? 'Edit optional feature' : 'New homebrew option'}
      title={entry ? 'Edit optional feature' : 'Create an optional feature'}
      error={error}
      submitting={submitting}
      onClose={onClose}
      onSubmit={handleSubmit}
    >
      <Input
        label="Name"
        placeholder="Pact of the Cinder"
        value={name}
        onChangeText={setName}
        autoFocus={!entry}
      />

      <View>
        <MetaLabel size="sm">Kinds (one entry can belong to multiple)</MetaLabel>
        <ChipToggleRow
          options={KINDS}
          values={data.kinds}
          onChange={(next) => patch('kinds', next as HomebrewOptionalFeatureKind[])}
        />
      </View>

      <Input
        label="Prerequisites"
        placeholder="Warlock 5"
        value={data.prerequisites ?? ''}
        onChangeText={(t) => patch('prerequisites', t)}
      />

      <Input
        label="Consumes resource"
        placeholder="Sorcery Point / Superiority Die"
        value={data.consumes ?? ''}
        onChangeText={(t) => patch('consumes', t)}
      />

      <SectionHeader title="Description" meta="Required" />
      <Input
        placeholder="As a bonus action, you wreathe your weapon in fire…"
        value={data.description}
        onChangeText={(t) => patch('description', t)}
        multiline
        numberOfLines={5}
        style={{ minHeight: 120, textAlignVertical: 'top' }}
      />
    </HomebrewFormShell>
  );
}
