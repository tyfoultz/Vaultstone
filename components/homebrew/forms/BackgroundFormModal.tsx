// Authoring form for HomebrewBackground entries.

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
import type { HomebrewBackgroundData } from '@vaultstone/types';
import { HomebrewFormShell } from './HomebrewFormShell';
import { ChipToggleRow } from './ChipToggleRow';

const SKILLS = [
  'Acrobatics', 'Animal Handling', 'Arcana', 'Athletics', 'Deception',
  'History', 'Insight', 'Intimidation', 'Investigation', 'Medicine',
  'Nature', 'Perception', 'Performance', 'Persuasion', 'Religion',
  'Sleight of Hand', 'Stealth', 'Survival',
];
const ABILITIES: Array<{ key: string; label: string }> = [
  { key: 'strength',     label: 'STR' },
  { key: 'dexterity',    label: 'DEX' },
  { key: 'constitution', label: 'CON' },
  { key: 'intelligence', label: 'INT' },
  { key: 'wisdom',       label: 'WIS' },
  { key: 'charisma',     label: 'CHA' },
];

type Props = {
  pack: HomebrewPackRow;
  entry?: HomebrewContentRow;
  onClose: () => void;
  onSaved: (entry: HomebrewContentRow) => void;
};

const DEFAULTS: { name: string; data: HomebrewBackgroundData } = {
  name: '',
  data: {
    skillProficiencies: [],
    toolProficiency: null,
    languages: 0,
    abilityScoreOptions: [],
    originFeat: '',
    startingEquipment: null,
    description: '',
  },
};

export function BackgroundFormModal({ pack, entry, onClose, onSaved }: Props) {
  const user = useAuthStore((s) => s.user);
  const initial = entry
    ? { name: entry.name, data: entry.data as unknown as HomebrewBackgroundData }
    : DEFAULTS;

  const [name, setName] = useState(initial.name);
  const [data, setData] = useState<HomebrewBackgroundData>(initial.data);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  function patch<K extends keyof HomebrewBackgroundData>(key: K, value: HomebrewBackgroundData[K]) {
    setData((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit() {
    if (!user) return;
    if (!name.trim()) { setError('Background name is required.'); return; }
    if (!data.description.trim()) { setError('Description is required.'); return; }
    setSubmitting(true);
    setError('');

    const finalData: HomebrewBackgroundData = {
      ...data,
      toolProficiency: data.toolProficiency?.trim() || null,
      originFeat: data.originFeat.trim(),
      startingEquipment: data.startingEquipment?.trim() || null,
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
        payload: { contentType: 'background', data: finalData },
      });
      setSubmitting(false);
      if (err || !row) { setError(err?.message ?? 'Failed to save.'); return; }
      onSaved(row);
    }
  }

  return (
    <HomebrewFormShell
      eyebrow={entry ? 'Edit background' : 'New homebrew background'}
      title={entry ? 'Edit background' : 'Create a background'}
      error={error}
      submitting={submitting}
      onClose={onClose}
      onSubmit={handleSubmit}
    >
      <Input
        label="Name"
        placeholder="Tavern Brawler"
        value={name}
        onChangeText={setName}
        autoFocus={!entry}
      />

      <View>
        <MetaLabel size="sm">Skill proficiencies</MetaLabel>
        <ChipToggleRow
          options={SKILLS.map((s) => ({ key: s, label: s }))}
          values={data.skillProficiencies}
          onChange={(next) => patch('skillProficiencies', next)}
        />
      </View>

      <Input
        label="Tool proficiency"
        placeholder="Brewer's supplies"
        value={data.toolProficiency ?? ''}
        onChangeText={(t) => patch('toolProficiency', t || null)}
      />

      <Input
        label="Bonus languages"
        placeholder="0"
        keyboardType="number-pad"
        value={String(data.languages)}
        onChangeText={(t) => {
          const n = parseInt(t, 10);
          patch('languages', Number.isFinite(n) ? Math.max(0, n) : 0);
        }}
      />

      <View>
        <MetaLabel size="sm">Ability score options (2024 — pick the three abilities the +2/+1 distributes across)</MetaLabel>
        <ChipToggleRow
          options={ABILITIES}
          values={data.abilityScoreOptions}
          onChange={(next) => patch('abilityScoreOptions', next)}
        />
      </View>

      <Input
        label="Origin feat (2024)"
        placeholder="Magic Initiate (Wizard)"
        value={data.originFeat}
        onChangeText={(t) => patch('originFeat', t)}
      />

      <Input
        label="Starting equipment"
        placeholder="Brewer's supplies, a wineskin, 10 gp"
        value={data.startingEquipment ?? ''}
        onChangeText={(t) => patch('startingEquipment', t || null)}
        multiline
        numberOfLines={2}
        style={{ minHeight: 60, textAlignVertical: 'top' }}
      />

      <SectionHeader title="Description" meta="Required" />
      <Input
        placeholder="Years of slinging fists in roadside taverns…"
        value={data.description}
        onChangeText={(t) => patch('description', t)}
        multiline
        numberOfLines={5}
        style={{ minHeight: 120, textAlignVertical: 'top' }}
      />
    </HomebrewFormShell>
  );
}
