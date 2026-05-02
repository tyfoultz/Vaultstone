// Basic authoring form for HomebrewCreature entries. Captures the core
// stat block (size, type, AC, HP, speed, CR, ability scores, alignment)
// plus a free-form notes field for traits/actions until the structured
// editor lands.

import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Input, MetaLabel, SectionHeader, spacing } from '@vaultstone/ui';
import {
  createHomebrewEntry,
  updateHomebrewEntry,
  type HomebrewContentRow,
  type HomebrewPackRow,
} from '@vaultstone/api';
import { useAuthStore } from '@vaultstone/store';
import type { HomebrewCreatureData } from '@vaultstone/types';
import { HomebrewFormShell } from './HomebrewFormShell';
import { ChipToggleRow } from './ChipToggleRow';

const SIZES = ['Tiny', 'Small', 'Medium', 'Large', 'Huge', 'Gargantuan'];

const CR_OPTIONS = [
  '0', '1/8', '1/4', '1/2',
  '1', '2', '3', '4', '5', '6', '7', '8', '9', '10',
  '11', '12', '13', '14', '15', '16', '17', '18', '19', '20',
  '21', '22', '23', '24', '25', '26', '27', '28', '29', '30',
];

type Props = {
  pack: HomebrewPackRow;
  entry?: HomebrewContentRow;
  onClose: () => void;
  onSaved: (entry: HomebrewContentRow) => void;
};

const DEFAULTS: { name: string; data: HomebrewCreatureData } = {
  name: '',
  data: {
    size: 'Medium',
    creatureType: 'Humanoid',
    alignment: 'Neutral',
    ac: 12,
    hp: 20,
    speed: '30 ft.',
    challengeRating: '1',
    abilityScores: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
    description: '',
  },
};

export function CreatureFormModal({ pack, entry, onClose, onSaved }: Props) {
  const user = useAuthStore((s) => s.user);
  const initial = entry
    ? { name: entry.name, data: entry.data as unknown as HomebrewCreatureData }
    : DEFAULTS;

  const [name, setName] = useState(initial.name);
  const [data, setData] = useState<HomebrewCreatureData>(initial.data);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  function patch<K extends keyof HomebrewCreatureData>(key: K, value: HomebrewCreatureData[K]) {
    setData((prev) => ({ ...prev, [key]: value }));
  }

  function patchAbility(key: keyof HomebrewCreatureData['abilityScores'], value: number) {
    setData((prev) => ({
      ...prev,
      abilityScores: { ...prev.abilityScores, [key]: value },
    }));
  }

  async function handleSubmit() {
    if (!user) return;
    if (!name.trim()) { setError('Creature name is required.'); return; }
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
        campaignId: pack.campaign_id,
        name: name.trim(),
        payload: { contentType: 'creature', data },
      });
      setSubmitting(false);
      if (err || !row) { setError(err?.message ?? 'Failed to save.'); return; }
      onSaved(row);
    }
  }

  return (
    <HomebrewFormShell
      eyebrow={entry ? 'Edit creature' : 'New homebrew creature'}
      title={entry ? 'Edit creature' : 'Create a creature'}
      error={error}
      submitting={submitting}
      onClose={onClose}
      onSubmit={handleSubmit}
    >
      <Input
        label="Name"
        placeholder="Stub-Beast of the Old Wood"
        value={name}
        onChangeText={setName}
        autoFocus={!entry}
      />

      <View>
        <MetaLabel size="sm">Size</MetaLabel>
        <ChipToggleRow
          options={SIZES.map((s) => ({ key: s, label: s }))}
          values={[data.size]}
          onChange={(next) => {
            const picked = next.find((v) => v !== data.size) ?? data.size;
            patch('size', picked);
          }}
        />
      </View>

      <Input
        label="Creature type"
        placeholder="Beast (canine)"
        value={data.creatureType}
        onChangeText={(t) => patch('creatureType', t)}
      />
      <Input
        label="Alignment"
        placeholder="Chaotic neutral"
        value={data.alignment}
        onChangeText={(t) => patch('alignment', t)}
      />

      <View style={styles.row}>
        <View style={styles.flex1}>
          <MetaLabel size="sm">AC</MetaLabel>
          <Input
            keyboardType="numeric"
            value={String(data.ac)}
            onChangeText={(t) => {
              const n = parseInt(t, 10);
              patch('ac', Number.isFinite(n) ? n : 0);
            }}
          />
        </View>
        <View style={styles.flex2}>
          <Input
            label="Armor detail (optional)"
            placeholder="natural armor"
            value={data.armorDetail ?? ''}
            onChangeText={(t) => patch('armorDetail', t)}
          />
        </View>
      </View>

      <View style={styles.row}>
        <View style={styles.flex1}>
          <MetaLabel size="sm">HP</MetaLabel>
          <Input
            keyboardType="numeric"
            value={String(data.hp)}
            onChangeText={(t) => {
              const n = parseInt(t, 10);
              patch('hp', Number.isFinite(n) ? n : 0);
            }}
          />
        </View>
        <View style={styles.flex2}>
          <Input
            label="Hit dice (optional)"
            placeholder="3d8 + 6"
            value={data.hitDice ?? ''}
            onChangeText={(t) => patch('hitDice', t)}
          />
        </View>
      </View>

      <Input
        label="Speed"
        placeholder="30 ft., fly 60 ft."
        value={data.speed}
        onChangeText={(t) => patch('speed', t)}
      />

      <View>
        <MetaLabel size="sm">Challenge rating</MetaLabel>
        <ChipToggleRow
          options={CR_OPTIONS.map((c) => ({ key: c, label: c }))}
          values={[String(data.challengeRating)]}
          onChange={(next) => {
            const picked = next.find((v) => v !== String(data.challengeRating)) ?? String(data.challengeRating);
            patch('challengeRating', picked);
          }}
        />
      </View>

      <SectionHeader title="Ability scores" />
      <View style={styles.abilityGrid}>
        {(['str', 'dex', 'con', 'int', 'wis', 'cha'] as const).map((ab) => (
          <View key={ab} style={styles.abilityCell}>
            <MetaLabel size="sm">{ab.toUpperCase()}</MetaLabel>
            <Input
              keyboardType="numeric"
              value={String(data.abilityScores[ab])}
              onChangeText={(t) => {
                const n = parseInt(t, 10);
                patchAbility(ab, Number.isFinite(n) ? n : 0);
              }}
            />
          </View>
        ))}
      </View>

      <SectionHeader title="Description" meta="Required" />
      <Input
        placeholder="A hulking quadruped with bark-like hide and antlers of tangled briar…"
        value={data.description}
        onChangeText={(t) => patch('description', t)}
        multiline
        numberOfLines={5}
        style={{ minHeight: 120, textAlignVertical: 'top' }}
      />

      <SectionHeader title="Traits & actions notes" meta="Optional" />
      <Input
        placeholder={'Pack Tactics. Advantage on attack rolls when an ally is adjacent.\n\nMultiattack. Two bite attacks.'}
        value={data.traitsNotes ?? ''}
        onChangeText={(t) => patch('traitsNotes', t)}
        multiline
        numberOfLines={5}
        style={{ minHeight: 120, textAlignVertical: 'top' }}
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
  abilityGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  abilityCell: {
    flexBasis: '30%',
    flexGrow: 1,
    minWidth: 80,
  },
});
