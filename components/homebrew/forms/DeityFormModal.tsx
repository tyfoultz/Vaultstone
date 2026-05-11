// Authoring form for HomebrewDeity entries — Cleric / Paladin patrons.

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
import type { HomebrewDeityData } from '@vaultstone/types';
import { HomebrewFormShell } from './HomebrewFormShell';
import { ChipToggleRow } from './ChipToggleRow';

const ALIGNMENTS: Array<{ key: string; label: string }> = [
  { key: 'LG', label: 'LG' },
  { key: 'NG', label: 'NG' },
  { key: 'CG', label: 'CG' },
  { key: 'LN', label: 'LN' },
  { key: 'N',  label: 'N'  },
  { key: 'CN', label: 'CN' },
  { key: 'LE', label: 'LE' },
  { key: 'NE', label: 'NE' },
  { key: 'CE', label: 'CE' },
];

const DOMAINS: Array<{ key: string; label: string }> = [
  { key: 'Arcana',     label: 'Arcana' },
  { key: 'Death',      label: 'Death' },
  { key: 'Forge',      label: 'Forge' },
  { key: 'Grave',      label: 'Grave' },
  { key: 'Knowledge',  label: 'Knowledge' },
  { key: 'Life',       label: 'Life' },
  { key: 'Light',      label: 'Light' },
  { key: 'Nature',     label: 'Nature' },
  { key: 'Order',      label: 'Order' },
  { key: 'Peace',      label: 'Peace' },
  { key: 'Tempest',    label: 'Tempest' },
  { key: 'Trickery',   label: 'Trickery' },
  { key: 'Twilight',   label: 'Twilight' },
  { key: 'War',        label: 'War' },
];

type Props = {
  pack: HomebrewPackRow;
  entry?: HomebrewContentRow;
  onClose: () => void;
  onSaved: (entry: HomebrewContentRow) => void;
};

const DEFAULTS: { name: string; data: HomebrewDeityData } = {
  name: '',
  data: {
    pantheon: '',
    title: '',
    alignment: [],
    domains: [],
    symbol: '',
    plane: '',
    worshipers: '',
  },
};

export function DeityFormModal({ pack, entry, onClose, onSaved }: Props) {
  const user = useAuthStore((s) => s.user);
  const initial = entry
    ? { name: entry.name, data: entry.data as unknown as HomebrewDeityData }
    : DEFAULTS;

  const [name, setName] = useState(initial.name);
  const [data, setData] = useState<HomebrewDeityData>(initial.data);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  function patch<K extends keyof HomebrewDeityData>(key: K, value: HomebrewDeityData[K]) {
    setData((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit() {
    if (!user) return;
    if (!name.trim()) { setError('Deity name is required.'); return; }
    if (!data.pantheon.trim()) { setError('Pantheon is required.'); return; }
    setSubmitting(true);
    setError('');

    const finalData: HomebrewDeityData = {
      pantheon: data.pantheon.trim(),
      title: data.title?.trim() || undefined,
      alignment: data.alignment && data.alignment.length > 0 ? data.alignment : undefined,
      domains: data.domains && data.domains.length > 0 ? data.domains : undefined,
      symbol: data.symbol?.trim() || undefined,
      plane: data.plane?.trim() || undefined,
      worshipers: data.worshipers?.trim() || undefined,
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
        payload: { contentType: 'deity', data: finalData },
      });
      setSubmitting(false);
      if (err || !row) { setError(err?.message ?? 'Failed to save.'); return; }
      onSaved(row);
    }
  }

  return (
    <HomebrewFormShell
      eyebrow={entry ? 'Edit deity' : 'New homebrew deity'}
      title={entry ? 'Edit deity' : 'Create a deity'}
      error={error}
      submitting={submitting}
      onClose={onClose}
      onSubmit={handleSubmit}
    >
      <Input
        label="Name"
        placeholder="Maerith of the Tides"
        value={name}
        onChangeText={setName}
        autoFocus={!entry}
      />

      <Input
        label="Pantheon"
        placeholder="Faerûn"
        value={data.pantheon}
        onChangeText={(t) => patch('pantheon', t)}
      />

      <Input
        label="Title / domain gloss"
        placeholder="Goddess of the deep sea"
        value={data.title ?? ''}
        onChangeText={(t) => patch('title', t)}
      />

      <View>
        <MetaLabel size="sm">Alignment</MetaLabel>
        <ChipToggleRow
          options={ALIGNMENTS}
          values={data.alignment ?? []}
          onChange={(next) => patch('alignment', next.length > 0 ? next : undefined)}
        />
      </View>

      <View>
        <MetaLabel size="sm">Cleric domains (2014 — gates subclass picks)</MetaLabel>
        <ChipToggleRow
          options={DOMAINS}
          values={data.domains ?? []}
          onChange={(next) => patch('domains', next.length > 0 ? next : undefined)}
        />
      </View>

      <Input
        label="Holy symbol"
        placeholder="A coiling silver wave"
        value={data.symbol ?? ''}
        onChangeText={(t) => patch('symbol', t)}
      />

      <Input
        label="Plane"
        placeholder="Elemental Plane of Water"
        value={data.plane ?? ''}
        onChangeText={(t) => patch('plane', t)}
      />

      <SectionHeader title="Worshipers" />
      <Input
        placeholder="Sailors, pearl-divers, coastal village folk"
        value={data.worshipers ?? ''}
        onChangeText={(t) => patch('worshipers', t)}
        multiline
        numberOfLines={3}
        style={{ minHeight: 80, textAlignVertical: 'top' }}
      />
    </HomebrewFormShell>
  );
}
