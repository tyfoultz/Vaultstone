// Basic authoring form for HomebrewClass entries. Captures core traits
// (hit die, primary ability, saves, proficiencies) and a free-form
// features-by-level notes field. The structured per-level feature editor
// is a future enhancement.

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
import type { HomebrewClassData } from '@vaultstone/types';
import { HomebrewFormShell } from './HomebrewFormShell';
import { ChipToggleRow } from './ChipToggleRow';

const ABILITIES = ['Strength', 'Dexterity', 'Constitution', 'Intelligence', 'Wisdom', 'Charisma'];

const HIT_DIE_OPTIONS = [
  { key: '6',  label: 'd6' },
  { key: '8',  label: 'd8' },
  { key: '10', label: 'd10' },
  { key: '12', label: 'd12' },
];

type Props = {
  pack: HomebrewPackRow;
  entry?: HomebrewContentRow;
  onClose: () => void;
  onSaved: (entry: HomebrewContentRow) => void;
};

const DEFAULTS: { name: string; data: HomebrewClassData } = {
  name: '',
  data: {
    hitDie: 8,
    primaryAbility: ['Strength'],
    savingThrows: ['Strength', 'Constitution'],
    armorProficiencies: [],
    weaponProficiencies: [],
    toolProficiencies: [],
    skillChoices: { count: 2, from: [] },
    spellcasting: false,
    spellcastingAbility: null,
    subclassUnlockLevel: 3,
    description: '',
  },
};

export function ClassFormModal({ pack, entry, onClose, onSaved }: Props) {
  const user = useAuthStore((s) => s.user);
  const initial = entry
    ? { name: entry.name, data: entry.data as unknown as HomebrewClassData }
    : DEFAULTS;

  const [name, setName] = useState(initial.name);
  const [data, setData] = useState<HomebrewClassData>(initial.data);
  const [armorText, setArmorText] = useState((initial.data.armorProficiencies ?? []).join(', '));
  const [weaponText, setWeaponText] = useState((initial.data.weaponProficiencies ?? []).join(', '));
  const [toolText, setToolText] = useState((initial.data.toolProficiencies ?? []).join(', '));
  const [skillsFromText, setSkillsFromText] = useState((initial.data.skillChoices?.from ?? []).join(', '));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  function patch<K extends keyof HomebrewClassData>(key: K, value: HomebrewClassData[K]) {
    setData((prev) => ({ ...prev, [key]: value }));
  }

  function splitCsv(s: string) {
    return s.split(',').map((x) => x.trim()).filter(Boolean);
  }

  async function handleSubmit() {
    if (!user) return;
    if (!name.trim()) { setError('Class name is required.'); return; }
    if (!data.description.trim()) { setError('Description is required.'); return; }
    setSubmitting(true);
    setError('');

    const finalData: HomebrewClassData = {
      ...data,
      armorProficiencies: splitCsv(armorText),
      weaponProficiencies: splitCsv(weaponText),
      toolProficiencies: splitCsv(toolText),
      skillChoices: { count: data.skillChoices.count, from: splitCsv(skillsFromText) },
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
        campaignId: pack.campaign_id,
        name: name.trim(),
        payload: { contentType: 'class', data: finalData },
      });
      setSubmitting(false);
      if (err || !row) { setError(err?.message ?? 'Failed to save.'); return; }
      onSaved(row);
    }
  }

  return (
    <HomebrewFormShell
      eyebrow={entry ? 'Edit class' : 'New homebrew class'}
      title={entry ? 'Edit class' : 'Create a class'}
      error={error}
      submitting={submitting}
      onClose={onClose}
      onSubmit={handleSubmit}
    >
      <Input
        label="Name"
        placeholder="Beast Tamer"
        value={name}
        onChangeText={setName}
        autoFocus={!entry}
      />

      <View>
        <MetaLabel size="sm">Hit die</MetaLabel>
        <ChipToggleRow
          options={HIT_DIE_OPTIONS}
          values={[String(data.hitDie)]}
          onChange={(next) => {
            const picked = next.find((v) => v !== String(data.hitDie)) ?? String(data.hitDie);
            patch('hitDie', parseInt(picked, 10));
          }}
        />
      </View>

      <View>
        <MetaLabel size="sm">Primary ability</MetaLabel>
        <ChipToggleRow
          options={ABILITIES.map((a) => ({ key: a, label: a.slice(0, 3) }))}
          values={data.primaryAbility}
          onChange={(next) => patch('primaryAbility', next)}
        />
      </View>

      <View>
        <MetaLabel size="sm">Saving throws</MetaLabel>
        <ChipToggleRow
          options={ABILITIES.map((a) => ({ key: a, label: a.slice(0, 3) }))}
          values={data.savingThrows}
          onChange={(next) => patch('savingThrows', next)}
        />
      </View>

      <Input
        label="Armor proficiencies"
        placeholder="Light armor, Medium armor, Shields"
        value={armorText}
        onChangeText={setArmorText}
      />
      <Input
        label="Weapon proficiencies"
        placeholder="Simple weapons, Martial weapons"
        value={weaponText}
        onChangeText={setWeaponText}
      />
      <Input
        label="Tool proficiencies"
        placeholder="Thieves' tools"
        value={toolText}
        onChangeText={setToolText}
      />

      <SectionHeader title="Skill choices" />
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <View style={{ width: 100 }}>
          <MetaLabel size="sm">Choose</MetaLabel>
          <Input
            keyboardType="numeric"
            value={String(data.skillChoices.count)}
            onChangeText={(t) => {
              const n = parseInt(t, 10);
              patch('skillChoices', { ...data.skillChoices, count: Number.isFinite(n) ? n : 0 });
            }}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Input
            label="From (comma-separated)"
            placeholder="Athletics, Perception, Survival"
            value={skillsFromText}
            onChangeText={setSkillsFromText}
          />
        </View>
      </View>

      <View>
        <MetaLabel size="sm">Spellcasting</MetaLabel>
        <ChipToggleRow
          options={[{ key: 'caster' as const, label: 'Spellcaster' }]}
          values={data.spellcasting ? ['caster'] : []}
          onChange={(next) => {
            const isCaster = next.includes('caster');
            patch('spellcasting', isCaster);
            if (!isCaster) patch('spellcastingAbility', null);
          }}
        />
      </View>

      {data.spellcasting ? (
        <View>
          <MetaLabel size="sm">Spellcasting ability</MetaLabel>
          <ChipToggleRow
            options={ABILITIES.slice(3).map((a) => ({ key: a, label: a }))}
            values={data.spellcastingAbility ? [data.spellcastingAbility] : []}
            onChange={(next) => {
              const picked = next.find((v) => v !== data.spellcastingAbility) ?? null;
              patch('spellcastingAbility', picked);
            }}
          />
        </View>
      ) : null}

      <View style={{ width: 160 }}>
        <MetaLabel size="sm">Subclass unlock level</MetaLabel>
        <Input
          keyboardType="numeric"
          value={String(data.subclassUnlockLevel)}
          onChangeText={(t) => {
            const n = parseInt(t, 10);
            patch('subclassUnlockLevel', Number.isFinite(n) ? n : 3);
          }}
        />
      </View>

      <SectionHeader title="Description" meta="Required" />
      <Input
        placeholder="A bond between mortal and beast that channels primal power…"
        value={data.description}
        onChangeText={(t) => patch('description', t)}
        multiline
        numberOfLines={5}
        style={{ minHeight: 120, textAlignVertical: 'top' }}
      />

      <SectionHeader title="Per-level features (notes)" meta="Optional" />
      <Input
        placeholder={'Level 1: Bonded Companion. Choose a beast…\nLevel 2: Pack Tactics. ...'}
        value={data.featuresNotes ?? ''}
        onChangeText={(t) => patch('featuresNotes', t)}
        multiline
        numberOfLines={6}
        style={{ minHeight: 140, textAlignVertical: 'top' }}
      />
    </HomebrewFormShell>
  );
}
