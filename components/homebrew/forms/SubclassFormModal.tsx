// Authoring form for HomebrewSubclass entries. Parent class is picked
// from a free-text input today — picking by name + recording the
// resolved key needs the wizard's ContentResolver scope. A follow-up
// can wire that picker; for now the user pastes the parent class key
// (or types the class name and we'll backfill via the resolver).

import { useState } from 'react';
import { Input, SectionHeader } from '@vaultstone/ui';
import {
  createHomebrewEntry,
  updateHomebrewEntry,
  type HomebrewContentRow,
  type HomebrewPackRow,
} from '@vaultstone/api';
import { useAuthStore } from '@vaultstone/store';
import type { HomebrewSubclassData } from '@vaultstone/types';
import { HomebrewFormShell } from './HomebrewFormShell';

type Props = {
  pack: HomebrewPackRow;
  entry?: HomebrewContentRow;
  onClose: () => void;
  onSaved: (entry: HomebrewContentRow) => void;
};

const DEFAULTS: { name: string; data: HomebrewSubclassData } = {
  name: '',
  data: {
    parentClassKey: '',
    parentClassName: '',
    unlockLevel: 3,
    description: '',
    featuresNotes: '',
  },
};

export function SubclassFormModal({ pack, entry, onClose, onSaved }: Props) {
  const user = useAuthStore((s) => s.user);
  const initial = entry
    ? { name: entry.name, data: entry.data as unknown as HomebrewSubclassData }
    : DEFAULTS;

  const [name, setName] = useState(initial.name);
  const [data, setData] = useState<HomebrewSubclassData>(initial.data);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  function patch<K extends keyof HomebrewSubclassData>(key: K, value: HomebrewSubclassData[K]) {
    setData((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit() {
    if (!user) return;
    if (!name.trim()) { setError('Subclass name is required.'); return; }
    if (!data.parentClassKey.trim()) { setError('Parent class key is required.'); return; }
    if (!data.description.trim()) { setError('Description is required.'); return; }
    setSubmitting(true);
    setError('');

    const finalData: HomebrewSubclassData = {
      ...data,
      parentClassKey: data.parentClassKey.trim(),
      parentClassName: data.parentClassName?.trim() || undefined,
      featuresNotes: data.featuresNotes?.trim() || undefined,
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
        payload: { contentType: 'subclass', data: finalData },
      });
      setSubmitting(false);
      if (err || !row) { setError(err?.message ?? 'Failed to save.'); return; }
      onSaved(row);
    }
  }

  return (
    <HomebrewFormShell
      eyebrow={entry ? 'Edit subclass' : 'New homebrew subclass'}
      title={entry ? 'Edit subclass' : 'Create a subclass'}
      error={error}
      submitting={submitting}
      onClose={onClose}
      onSubmit={handleSubmit}
    >
      <Input
        label="Name"
        placeholder="Path of the Stormwarden"
        value={name}
        onChangeText={setName}
        autoFocus={!entry}
      />

      <Input
        label="Parent class key"
        placeholder="barbarian-srd-2-0 or homebrew_<uuid>"
        value={data.parentClassKey}
        onChangeText={(t) => patch('parentClassKey', t)}
      />

      <Input
        label="Parent class display name"
        placeholder="Barbarian"
        value={data.parentClassName ?? ''}
        onChangeText={(t) => patch('parentClassName', t)}
      />

      <Input
        label="Unlock level"
        keyboardType="number-pad"
        value={String(data.unlockLevel)}
        onChangeText={(t) => {
          const n = parseInt(t, 10);
          patch('unlockLevel', Number.isFinite(n) ? Math.max(1, Math.min(20, n)) : 3);
        }}
      />

      <SectionHeader title="Description" meta="Required" />
      <Input
        placeholder="Channel the fury of the gale through every swing of your axe…"
        value={data.description}
        onChangeText={(t) => patch('description', t)}
        multiline
        numberOfLines={5}
        style={{ minHeight: 120, textAlignVertical: 'top' }}
      />

      <SectionHeader
        title="Per-level features"
        meta="Free-form prose for now. A structured editor will land later."
      />
      <Input
        placeholder={'3rd level — Stormwarden. You gain proficiency with longbows…\n6th level — Eye of the Storm…'}
        value={data.featuresNotes ?? ''}
        onChangeText={(t) => patch('featuresNotes', t)}
        multiline
        numberOfLines={6}
        style={{ minHeight: 150, textAlignVertical: 'top' }}
      />
    </HomebrewFormShell>
  );
}
