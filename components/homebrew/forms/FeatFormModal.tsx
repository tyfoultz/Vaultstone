// Authoring form for HomebrewFeat entries.

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
import type { HomebrewFeatData } from '@vaultstone/types';
import { HomebrewFormShell } from './HomebrewFormShell';
import { ChipToggleRow } from './ChipToggleRow';

const CATEGORIES: Array<{ key: HomebrewFeatData['category']; label: string }> = [
  { key: 'origin',          label: 'Origin' },
  { key: 'general',         label: 'General' },
  { key: 'fighting-style',  label: 'Fighting Style' },
  { key: 'epic-boon',       label: 'Epic Boon' },
];

type Props = {
  pack: HomebrewPackRow;
  entry?: HomebrewContentRow;
  onClose: () => void;
  onSaved: (entry: HomebrewContentRow) => void;
};

const DEFAULTS: { name: string; data: HomebrewFeatData } = {
  name: '',
  data: {
    category: 'general',
    benefits: [],
    description: '',
  },
};

export function FeatFormModal({ pack, entry, onClose, onSaved }: Props) {
  const user = useAuthStore((s) => s.user);
  const initial = entry
    ? { name: entry.name, data: entry.data as unknown as HomebrewFeatData }
    : DEFAULTS;

  const [name, setName] = useState(initial.name);
  const [data, setData] = useState<HomebrewFeatData>(initial.data);
  const [benefitsText, setBenefitsText] = useState((initial.data.benefits ?? []).join('\n'));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  function patch<K extends keyof HomebrewFeatData>(key: K, value: HomebrewFeatData[K]) {
    setData((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit() {
    if (!user) return;
    if (!name.trim()) { setError('Feat name is required.'); return; }
    if (!data.description.trim()) { setError('Description is required.'); return; }
    setSubmitting(true);
    setError('');

    const benefits = benefitsText
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);
    const finalData: HomebrewFeatData = { ...data, benefits };

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
        payload: { contentType: 'feat', data: finalData },
      });
      setSubmitting(false);
      if (err || !row) { setError(err?.message ?? 'Failed to save.'); return; }
      onSaved(row);
    }
  }

  return (
    <HomebrewFormShell
      eyebrow={entry ? 'Edit feat' : 'New homebrew feat'}
      title={entry ? 'Edit feat' : 'Create a feat'}
      error={error}
      submitting={submitting}
      onClose={onClose}
      onSubmit={handleSubmit}
    >
      <Input
        label="Name"
        placeholder="Reforged Arsenal"
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

      <Input
        label="Prerequisites (optional)"
        placeholder="Strength 13+; Level 4+"
        value={data.prerequisites ?? ''}
        onChangeText={(t) => patch('prerequisites', t)}
      />

      <SectionHeader title="Benefits" meta="One per line" />
      <Input
        placeholder={'Increase your Strength by 1.\nGain proficiency with smith’s tools.'}
        value={benefitsText}
        onChangeText={setBenefitsText}
        multiline
        numberOfLines={4}
        style={{ minHeight: 100, textAlignVertical: 'top' }}
      />

      <SectionHeader title="Description" meta="Required" />
      <Input
        placeholder="You have studied the lost arts of dwarven smithing…"
        value={data.description}
        onChangeText={(t) => patch('description', t)}
        multiline
        numberOfLines={5}
        style={{ minHeight: 120, textAlignVertical: 'top' }}
      />
    </HomebrewFormShell>
  );
}
