// Authoring form for HomebrewCondition entries — a custom status effect
// that surfaces in the character sheet's condition picker.

import { useState } from 'react';
import { Input, SectionHeader } from '@vaultstone/ui';
import {
  createHomebrewEntry,
  updateHomebrewEntry,
  type HomebrewContentRow,
  type HomebrewPackRow,
} from '@vaultstone/api';
import { useAuthStore } from '@vaultstone/store';
import type { HomebrewConditionData } from '@vaultstone/types';
import { HomebrewFormShell } from './HomebrewFormShell';

type Props = {
  pack: HomebrewPackRow;
  entry?: HomebrewContentRow;
  onClose: () => void;
  onSaved: (entry: HomebrewContentRow) => void;
};

const DEFAULTS: { name: string; data: HomebrewConditionData } = {
  name: '',
  data: {
    effects: [],
    description: '',
  },
};

export function ConditionFormModal({ pack, entry, onClose, onSaved }: Props) {
  const user = useAuthStore((s) => s.user);
  const initial = entry
    ? { name: entry.name, data: entry.data as unknown as HomebrewConditionData }
    : DEFAULTS;

  const [name, setName] = useState(initial.name);
  const [data, setData] = useState<HomebrewConditionData>(initial.data);
  const [effectsText, setEffectsText] = useState((initial.data.effects ?? []).join('\n'));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  function patch<K extends keyof HomebrewConditionData>(key: K, value: HomebrewConditionData[K]) {
    setData((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit() {
    if (!user) return;
    if (!name.trim()) { setError('Condition name is required.'); return; }
    setSubmitting(true);
    setError('');

    const effects = effectsText
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);
    const finalData: HomebrewConditionData = {
      ...data,
      effects,
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
        payload: { contentType: 'condition', data: finalData },
      });
      setSubmitting(false);
      if (err || !row) { setError(err?.message ?? 'Failed to save.'); return; }
      onSaved(row);
    }
  }

  return (
    <HomebrewFormShell
      eyebrow={entry ? 'Edit condition' : 'New homebrew condition'}
      title={entry ? 'Edit condition' : 'Create a condition'}
      error={error}
      submitting={submitting}
      onClose={onClose}
      onSubmit={handleSubmit}
    >
      <Input
        label="Name"
        placeholder="Mistwalking"
        value={name}
        onChangeText={setName}
        autoFocus={!entry}
      />

      <SectionHeader title="Effects" meta="One per line — render as rule bullets" />
      <Input
        placeholder={"Your speed is halved.\nDisadvantage on Wisdom checks.\nAt the end of each of your turns, repeat the Wisdom save."}
        value={effectsText}
        onChangeText={setEffectsText}
        multiline
        numberOfLines={4}
        style={{ minHeight: 110, textAlignVertical: 'top' }}
      />

      <SectionHeader title="Description" />
      <Input
        placeholder="A clinging mist seeps into your senses, dragging your mind back to half-remembered dreams…"
        value={data.description}
        onChangeText={(t) => patch('description', t)}
        multiline
        numberOfLines={4}
        style={{ minHeight: 100, textAlignVertical: 'top' }}
      />
    </HomebrewFormShell>
  );
}
