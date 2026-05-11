// Authoring form for HomebrewCreature entries. Mirrors the CreatureResult
// shape so authored creatures behave identically to SRD ones in the
// catalog and (eventually) the encounter builder — structured speeds,
// proficient saves/skills, senses, damage R/I/V, condition immunities,
// traits, actions, and environments.

import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import {
  Input, MetaLabel, SectionHeader, Text,
  colors, radius, spacing, Icon, GhostButton,
} from '@vaultstone/ui';
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

const ABILITY_KEYS = ['str', 'dex', 'con', 'int', 'wis', 'cha'] as const;
type AbilityKey = typeof ABILITY_KEYS[number];

// Canonical 5e skill list keyed by snake_case (matches CreatureResult.skills).
const SKILLS: Array<{ key: string; label: string; ability: AbilityKey }> = [
  { key: 'acrobatics',      label: 'Acrobatics',      ability: 'dex' },
  { key: 'animal_handling', label: 'Animal Handling', ability: 'wis' },
  { key: 'arcana',          label: 'Arcana',          ability: 'int' },
  { key: 'athletics',       label: 'Athletics',       ability: 'str' },
  { key: 'deception',       label: 'Deception',       ability: 'cha' },
  { key: 'history',         label: 'History',         ability: 'int' },
  { key: 'insight',         label: 'Insight',         ability: 'wis' },
  { key: 'intimidation',    label: 'Intimidation',    ability: 'cha' },
  { key: 'investigation',   label: 'Investigation',   ability: 'int' },
  { key: 'medicine',        label: 'Medicine',        ability: 'wis' },
  { key: 'nature',          label: 'Nature',          ability: 'int' },
  { key: 'perception',      label: 'Perception',      ability: 'wis' },
  { key: 'performance',     label: 'Performance',     ability: 'cha' },
  { key: 'persuasion',      label: 'Persuasion',      ability: 'cha' },
  { key: 'religion',        label: 'Religion',        ability: 'int' },
  { key: 'sleight_of_hand', label: 'Sleight of Hand', ability: 'dex' },
  { key: 'stealth',         label: 'Stealth',         ability: 'dex' },
  { key: 'survival',        label: 'Survival',        ability: 'wis' },
];

const COMMON_DAMAGE_TYPES = [
  'acid', 'bludgeoning', 'cold', 'fire', 'force', 'lightning',
  'necrotic', 'piercing', 'poison', 'psychic', 'radiant',
  'slashing', 'thunder',
];

const STANDARD_CONDITIONS = [
  'blinded', 'charmed', 'deafened', 'exhaustion', 'frightened',
  'grappled', 'incapacitated', 'invisible', 'paralyzed', 'petrified',
  'poisoned', 'prone', 'restrained', 'stunned', 'unconscious',
];

const ENVIRONMENTS = [
  'arctic', 'coastal', 'desert', 'forest', 'grassland', 'hill',
  'mountain', 'swamp', 'underdark', 'underwater', 'urban',
];

const ACTION_TYPES: Array<{ key: string; label: string }> = [
  { key: 'ACTION', label: 'Action' },
  { key: 'BONUS_ACTION', label: 'Bonus Action' },
  { key: 'REACTION', label: 'Reaction' },
  { key: 'LEGENDARY_ACTION', label: 'Legendary' },
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
    speeds: { walk: 30 },
    challengeRating: '1',
    abilityScores: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
    description: '',
    traits: [],
    actions: [],
  },
};

export function CreatureFormModal({ pack, entry, onClose, onSaved }: Props) {
  const user = useAuthStore((s) => s.user);
  const initial = entry
    ? { name: entry.name, data: normalize(entry.data as unknown as HomebrewCreatureData) }
    : DEFAULTS;

  const [name, setName] = useState(initial.name);
  const [data, setData] = useState<HomebrewCreatureData>(initial.data);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [customDmgType, setCustomDmgType] = useState('');

  function patch<K extends keyof HomebrewCreatureData>(key: K, value: HomebrewCreatureData[K]) {
    setData((prev) => ({ ...prev, [key]: value }));
  }

  function patchAbility(key: AbilityKey, value: number) {
    setData((prev) => ({
      ...prev,
      abilityScores: { ...prev.abilityScores, [key]: value },
    }));
  }

  // ── Speeds ──────────────────────────────────────────────────────────────
  const speeds = data.speeds ?? {};
  function patchSpeed(key: keyof NonNullable<HomebrewCreatureData['speeds']>, raw: string) {
    const trimmed = raw.trim();
    const next = { ...speeds };
    if (trimmed === '') {
      delete next[key];
    } else if (key === 'hover') {
      next.hover = trimmed === 'true';
    } else {
      const n = Math.max(0, parseInt(trimmed, 10) || 0);
      next[key] = n as never; // numeric speed mode
    }
    patch('speeds', next);
  }
  function toggleHover() {
    patch('speeds', { ...speeds, hover: !speeds.hover });
  }

  // ── Saving throws (proficient + bonus) ──────────────────────────────────
  const saves = data.savingThrows ?? {};
  const profBonus = data.proficiencyBonus ?? defaultProfFromCR(data.challengeRating);
  function toggleSaveProf(ability: AbilityKey) {
    const next = { ...saves };
    if (ability in next) {
      delete next[ability];
    } else {
      const mod = abilityMod(data.abilityScores[ability]);
      next[ability] = mod + profBonus;
    }
    patch('savingThrows', next);
  }
  function patchSaveBonus(ability: AbilityKey, raw: string) {
    const n = parseInt(raw, 10);
    const next = { ...saves, [ability]: Number.isFinite(n) ? n : 0 };
    patch('savingThrows', next);
  }

  // ── Skills (proficient + bonus) ────────────────────────────────────────
  const skills = data.skills ?? {};
  function toggleSkillProf(skillKey: string) {
    const next = { ...skills };
    if (skillKey in next) {
      delete next[skillKey];
    } else {
      const sk = SKILLS.find((s) => s.key === skillKey);
      const mod = sk ? abilityMod(data.abilityScores[sk.ability]) : 0;
      next[skillKey] = mod + profBonus;
    }
    patch('skills', next);
  }
  function patchSkillBonus(skillKey: string, raw: string) {
    const n = parseInt(raw, 10);
    patch('skills', { ...skills, [skillKey]: Number.isFinite(n) ? n : 0 });
  }

  // ── Senses ──────────────────────────────────────────────────────────────
  const senses = data.senses ?? {};
  function patchSense(key: keyof NonNullable<HomebrewCreatureData['senses']>, raw: string) {
    const trimmed = raw.trim();
    const next = { ...senses };
    if (trimmed === '') {
      delete next[key];
    } else {
      const n = Math.max(0, parseInt(trimmed, 10) || 0);
      next[key] = n;
    }
    patch('senses', next);
  }

  // ── Damage R/I/V + condition immunities ─────────────────────────────────
  function toggleInList(field: 'damageResistances' | 'damageImmunities' | 'damageVulnerabilities' | 'conditionImmunities', value: string) {
    const cur = data[field] ?? [];
    const has = cur.includes(value);
    patch(field, has ? cur.filter((v) => v !== value) : [...cur, value]);
  }
  function addCustomDmgType(field: 'damageResistances' | 'damageImmunities' | 'damageVulnerabilities') {
    const v = customDmgType.trim().toLowerCase();
    if (!v) return;
    const cur = data[field] ?? [];
    if (cur.includes(v)) { setCustomDmgType(''); return; }
    patch(field, [...cur, v]);
    setCustomDmgType('');
  }

  // ── Traits ──────────────────────────────────────────────────────────────
  const traits = data.traits ?? [];
  function addTrait() {
    patch('traits', [...traits, { name: '', description: '' }]);
  }
  function removeTrait(idx: number) {
    patch('traits', traits.filter((_, i) => i !== idx));
  }
  function patchTrait(idx: number, field: 'name' | 'description', value: string) {
    const next = traits.slice();
    next[idx] = { ...next[idx], [field]: value };
    patch('traits', next);
  }

  // ── Actions ─────────────────────────────────────────────────────────────
  const actions = data.actions ?? [];
  function addAction() {
    patch('actions', [...actions, { name: '', description: '', actionType: 'ACTION' }]);
  }
  function removeAction(idx: number) {
    patch('actions', actions.filter((_, i) => i !== idx));
  }
  function patchAction(idx: number, field: 'name' | 'description' | 'actionType', value: string) {
    const next = actions.slice();
    next[idx] = { ...next[idx], [field]: value };
    patch('actions', next);
  }

  const modifiers = useMemo(() => ({
    str: abilityMod(data.abilityScores.str),
    dex: abilityMod(data.abilityScores.dex),
    con: abilityMod(data.abilityScores.con),
    int: abilityMod(data.abilityScores.int),
    wis: abilityMod(data.abilityScores.wis),
    cha: abilityMod(data.abilityScores.cha),
  }), [data.abilityScores]);

  async function handleSubmit() {
    if (!user) return;
    if (!name.trim()) { setError('Creature name is required.'); return; }
    if (!data.description.trim()) { setError('Description is required.'); return; }

    // Strip empty rows / undefined-only optional fields so the row doesn't
    // carry empty markers that confuse the resolver's "is this set?" checks.
    const cleanTraits = traits
      .map((t) => ({ name: t.name.trim(), description: t.description.trim() }))
      .filter((t) => t.name || t.description);
    const cleanActions = actions
      .map((a) => ({
        name: a.name.trim(),
        description: a.description.trim(),
        actionType: a.actionType,
      }))
      .filter((a) => a.name || a.description);

    const final: HomebrewCreatureData = {
      ...data,
      traits: cleanTraits.length > 0 ? cleanTraits : undefined,
      actions: cleanActions.length > 0 ? cleanActions : undefined,
      speeds: speeds && Object.keys(speeds).length > 0 ? speeds : undefined,
      savingThrows: saves && Object.keys(saves).length > 0 ? saves : undefined,
      skills: skills && Object.keys(skills).length > 0 ? skills : undefined,
      senses: senses && Object.keys(senses).length > 0 ? senses : undefined,
      damageResistances: data.damageResistances && data.damageResistances.length > 0 ? data.damageResistances : undefined,
      damageImmunities: data.damageImmunities && data.damageImmunities.length > 0 ? data.damageImmunities : undefined,
      damageVulnerabilities: data.damageVulnerabilities && data.damageVulnerabilities.length > 0 ? data.damageVulnerabilities : undefined,
      conditionImmunities: data.conditionImmunities && data.conditionImmunities.length > 0 ? data.conditionImmunities : undefined,
      environments: data.environments && data.environments.length > 0 ? data.environments : undefined,
      languages: data.languages?.trim() ? data.languages.trim() : undefined,
    };

    setSubmitting(true);
    setError('');

    if (entry) {
      const { data: row, error: err } = await updateHomebrewEntry(entry.id, {
        name: name.trim(),
        data: final,
      });
      setSubmitting(false);
      if (err || !row) { setError(err?.message ?? 'Failed to save.'); return; }
      onSaved(row);
    } else {
      const { data: row, error: err } = await createHomebrewEntry({
        userId: user.id,
        packId: pack.id,
        name: name.trim(),
        payload: { contentType: 'creature', data: final },
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

      <View style={styles.row}>
        <View style={styles.flex1}>
          <Input
            label="Creature type"
            placeholder="Beast (canine)"
            value={data.creatureType}
            onChangeText={(t) => patch('creatureType', t)}
          />
        </View>
        <View style={styles.flex1}>
          <Input
            label="Alignment"
            placeholder="Chaotic neutral"
            value={data.alignment}
            onChangeText={(t) => patch('alignment', t)}
          />
        </View>
      </View>

      <SectionHeader title="Defenses" />
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

      <SectionHeader title="Speeds" meta="In feet. Leave blank for modes the creature doesn't have." />
      <View style={styles.speedGrid}>
        {(['walk', 'fly', 'swim', 'climb', 'burrow'] as const).map((mode) => (
          <View key={mode} style={styles.speedCell}>
            <MetaLabel size="sm">{mode}</MetaLabel>
            <Input
              keyboardType="number-pad"
              placeholder="0"
              value={speeds[mode] != null ? String(speeds[mode]) : ''}
              onChangeText={(t) => patchSpeed(mode, t)}
            />
          </View>
        ))}
      </View>
      <Pressable onPress={toggleHover} style={styles.toggleRow}>
        <View style={[styles.toggleBox, speeds.hover && styles.toggleBoxOn]}>
          {speeds.hover ? <Icon name="check" size={14} color={colors.onPrimary} /> : null}
        </View>
        <Text variant="body-md" style={{ color: colors.onSurface }}>Can hover</Text>
      </Pressable>

      <SectionHeader title="Challenge Rating" />
      <View>
        <ChipToggleRow
          options={CR_OPTIONS.map((c) => ({ key: c, label: c }))}
          values={[String(data.challengeRating)]}
          onChange={(next) => {
            const picked = next.find((v) => v !== String(data.challengeRating)) ?? String(data.challengeRating);
            patch('challengeRating', picked);
          }}
        />
      </View>
      <View style={styles.row}>
        <View style={styles.flex1}>
          <Input
            label="XP (optional)"
            keyboardType="number-pad"
            placeholder={String(defaultXpFromCR(data.challengeRating))}
            value={data.xp != null ? String(data.xp) : ''}
            onChangeText={(t) => {
              const trimmed = t.trim();
              if (trimmed === '') { patch('xp', undefined); return; }
              const n = parseInt(trimmed, 10);
              patch('xp', Number.isFinite(n) ? n : undefined);
            }}
          />
        </View>
        <View style={styles.flex1}>
          <Input
            label={`Proficiency bonus (default +${defaultProfFromCR(data.challengeRating)})`}
            keyboardType="number-pad"
            placeholder={`+${defaultProfFromCR(data.challengeRating)}`}
            value={data.proficiencyBonus != null ? String(data.proficiencyBonus) : ''}
            onChangeText={(t) => {
              const trimmed = t.trim();
              if (trimmed === '') { patch('proficiencyBonus', undefined); return; }
              const n = parseInt(trimmed, 10);
              patch('proficiencyBonus', Number.isFinite(n) ? n : undefined);
            }}
          />
        </View>
      </View>

      <SectionHeader title="Ability Scores" />
      <View style={styles.abilityGrid}>
        {ABILITY_KEYS.map((ab) => (
          <View key={ab} style={styles.abilityCell}>
            <MetaLabel size="sm">{`${ab.toUpperCase()} (${modSign(modifiers[ab])})`}</MetaLabel>
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

      <SectionHeader title="Saving Throws" meta="Toggle proficient saves. Bonus auto-fills from ability mod + prof; edit any cell to override." />
      <View style={styles.saveGrid}>
        {ABILITY_KEYS.map((ab) => {
          const on = ab in saves;
          return (
            <View key={ab} style={styles.saveCell}>
              <Pressable onPress={() => toggleSaveProf(ab)} style={styles.saveToggleRow}>
                <View style={[styles.toggleBox, on && styles.toggleBoxOn]}>
                  {on ? <Icon name="check" size={12} color={colors.onPrimary} /> : null}
                </View>
                <Text variant="label-md" weight="semibold" style={{ color: colors.onSurface }}>
                  {ab.toUpperCase()}
                </Text>
              </Pressable>
              {on ? (
                <Input
                  keyboardType="numeric"
                  value={String(saves[ab])}
                  onChangeText={(t) => patchSaveBonus(ab, t)}
                  style={styles.bonusInput}
                />
              ) : null}
            </View>
          );
        })}
      </View>

      <SectionHeader title="Skill Proficiencies" />
      <View style={styles.skillGrid}>
        {SKILLS.map((sk) => {
          const on = sk.key in skills;
          return (
            <View key={sk.key} style={styles.skillRow}>
              <Pressable onPress={() => toggleSkillProf(sk.key)} style={styles.skillToggle}>
                <View style={[styles.toggleBox, on && styles.toggleBoxOn]}>
                  {on ? <Icon name="check" size={12} color={colors.onPrimary} /> : null}
                </View>
                <Text variant="body-sm" style={{ color: colors.onSurface, flex: 1 }}>
                  {sk.label}
                </Text>
              </Pressable>
              {on ? (
                <Input
                  keyboardType="numeric"
                  value={String(skills[sk.key])}
                  onChangeText={(t) => patchSkillBonus(sk.key, t)}
                  style={styles.bonusInput}
                />
              ) : null}
            </View>
          );
        })}
      </View>

      <SectionHeader title="Senses" meta="Range in feet. Passive perception overrides the derived value when set." />
      <View style={styles.senseGrid}>
        {(['darkvision', 'blindsight', 'tremorsense', 'truesight', 'passivePerception'] as const).map((s) => (
          <View key={s} style={styles.senseCell}>
            <MetaLabel size="sm">{s === 'passivePerception' ? 'passive perception' : s}</MetaLabel>
            <Input
              keyboardType="number-pad"
              placeholder="0"
              value={senses[s] != null ? String(senses[s]) : ''}
              onChangeText={(t) => patchSense(s, t)}
            />
          </View>
        ))}
      </View>

      <Input
        label="Languages"
        placeholder="Common, Draconic, telepathy 60 ft."
        value={data.languages ?? ''}
        onChangeText={(t) => patch('languages', t)}
      />

      <SectionHeader title="Damage & Conditions" />
      <DamageList
        label="Resistances"
        selected={data.damageResistances ?? []}
        onToggle={(v) => toggleInList('damageResistances', v)}
      />
      <DamageList
        label="Immunities"
        selected={data.damageImmunities ?? []}
        onToggle={(v) => toggleInList('damageImmunities', v)}
      />
      <DamageList
        label="Vulnerabilities"
        selected={data.damageVulnerabilities ?? []}
        onToggle={(v) => toggleInList('damageVulnerabilities', v)}
      />
      <View style={styles.row}>
        <View style={styles.flex2}>
          <Input
            label="Add custom damage type"
            placeholder="radiant"
            value={customDmgType}
            onChangeText={setCustomDmgType}
          />
        </View>
        <View style={{ gap: 4 }}>
          <GhostButton label="+ Resistance" onPress={() => addCustomDmgType('damageResistances')} />
          <GhostButton label="+ Immunity" onPress={() => addCustomDmgType('damageImmunities')} />
          <GhostButton label="+ Vulnerability" onPress={() => addCustomDmgType('damageVulnerabilities')} />
        </View>
      </View>
      <MetaLabel size="sm">Condition Immunities</MetaLabel>
      <View style={styles.dmgChipRow}>
        {STANDARD_CONDITIONS.map((c) => {
          const on = (data.conditionImmunities ?? []).includes(c);
          return (
            <Pressable
              key={c}
              onPress={() => toggleInList('conditionImmunities', c)}
              style={[styles.dmgChip, on && styles.dmgChipOn]}
            >
              <Text variant="body-sm" style={{ color: on ? colors.onPrimary : colors.onSurface }}>{c}</Text>
            </Pressable>
          );
        })}
      </View>

      <SectionHeader title="Traits" meta="Always-on abilities (Pack Tactics, Magic Resistance, etc.)" />
      {traits.map((t, idx) => (
        <View key={idx} style={styles.entryBox}>
          <View style={styles.entryHeaderRow}>
            <View style={{ flex: 1 }}>
              <Input
                label="Trait name"
                placeholder="Pack Tactics"
                value={t.name}
                onChangeText={(v) => patchTrait(idx, 'name', v)}
              />
            </View>
            <Pressable
              onPress={() => removeTrait(idx)}
              style={styles.removeBtn}
              accessibilityLabel="Remove trait"
            >
              <Icon name="close" size={16} color={colors.onSurfaceVariant} />
            </Pressable>
          </View>
          <Input
            label="Description"
            placeholder="Advantage on attack rolls when an ally is adjacent."
            value={t.description}
            onChangeText={(v) => patchTrait(idx, 'description', v)}
            multiline
            numberOfLines={2}
            style={{ minHeight: 70, textAlignVertical: 'top' }}
          />
        </View>
      ))}
      <GhostButton label="+ Add trait" onPress={addTrait} />

      <SectionHeader title="Actions" meta="Multiattack, attacks, spells, breath weapons, etc." />
      {actions.map((a, idx) => (
        <View key={idx} style={styles.entryBox}>
          <View style={styles.entryHeaderRow}>
            <View style={{ flex: 1 }}>
              <Input
                label="Action name"
                placeholder="Bite"
                value={a.name}
                onChangeText={(v) => patchAction(idx, 'name', v)}
              />
            </View>
            <Pressable
              onPress={() => removeAction(idx)}
              style={styles.removeBtn}
              accessibilityLabel="Remove action"
            >
              <Icon name="close" size={16} color={colors.onSurfaceVariant} />
            </Pressable>
          </View>
          <View style={{ marginBottom: 6 }}>
            <MetaLabel size="sm">Type</MetaLabel>
            <ChipToggleRow
              options={ACTION_TYPES}
              values={[a.actionType ?? 'ACTION']}
              onChange={(next) => {
                const picked = next.find((v) => v !== a.actionType) ?? a.actionType ?? 'ACTION';
                patchAction(idx, 'actionType', picked);
              }}
            />
          </View>
          <Input
            label="Description"
            placeholder="Melee Weapon Attack: +5 to hit, reach 5 ft., one target. Hit: 7 (1d8 + 3) piercing damage."
            value={a.description}
            onChangeText={(v) => patchAction(idx, 'description', v)}
            multiline
            numberOfLines={3}
            style={{ minHeight: 90, textAlignVertical: 'top' }}
          />
        </View>
      ))}
      <GhostButton label="+ Add action" onPress={addAction} />

      <SectionHeader title="Environments" meta="Where this creature is typically found." />
      <View style={styles.dmgChipRow}>
        {ENVIRONMENTS.map((env) => {
          const on = (data.environments ?? []).includes(env);
          return (
            <Pressable
              key={env}
              onPress={() => {
                const cur = data.environments ?? [];
                patch('environments', cur.includes(env) ? cur.filter((e) => e !== env) : [...cur, env]);
              }}
              style={[styles.dmgChip, on && styles.dmgChipOn]}
            >
              <Text variant="body-sm" style={{ color: on ? colors.onPrimary : colors.onSurface }}>{env}</Text>
            </Pressable>
          );
        })}
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

      {/* Legacy notes — present only on rows authored before this rewrite. */}
      {data.traitsNotes && data.traitsNotes.trim() ? (
        <>
          <SectionHeader
            title="Legacy trait notes (read-only)"
            meta="From an earlier version of the editor. Migrate the contents into the structured Traits / Actions above and they'll stop appearing on the detail card."
          />
          <View style={styles.legacyBox}>
            <Text variant="body-sm" tone="secondary">{data.traitsNotes}</Text>
          </View>
        </>
      ) : null}
    </HomebrewFormShell>
  );
}

function DamageList({ label, selected, onToggle }: {
  label: string;
  selected: string[];
  onToggle: (value: string) => void;
}) {
  return (
    <>
      <MetaLabel size="sm">{label}</MetaLabel>
      <View style={styles.dmgChipRow}>
        {COMMON_DAMAGE_TYPES.map((t) => {
          const on = selected.includes(t);
          return (
            <Pressable
              key={t}
              onPress={() => onToggle(t)}
              style={[styles.dmgChip, on && styles.dmgChipOn]}
            >
              <Text variant="body-sm" style={{ color: on ? colors.onPrimary : colors.onSurface }}>{t}</Text>
            </Pressable>
          );
        })}
        {selected
          .filter((t) => !COMMON_DAMAGE_TYPES.includes(t))
          .map((t) => (
            <Pressable
              key={t}
              onPress={() => onToggle(t)}
              style={[styles.dmgChip, styles.dmgChipOn]}
            >
              <Text variant="body-sm" style={{ color: colors.onPrimary, marginRight: 4 }}>{t}</Text>
              <Icon name="close" size={12} color={colors.onPrimary} />
            </Pressable>
          ))}
      </View>
    </>
  );
}

function abilityMod(score: number): number {
  return Math.floor((score - 10) / 2);
}
function modSign(mod: number): string {
  return mod >= 0 ? `+${mod}` : String(mod);
}

// Standard 5e proficiency bonus by CR. Authors can override per-creature
// via the Proficiency bonus input.
function defaultProfFromCR(cr: string | number): number {
  const n = typeof cr === 'number' ? cr : (cr.includes('/') ? 0 : parseInt(cr, 10) || 0);
  if (n <= 4) return 2;
  if (n <= 8) return 3;
  if (n <= 12) return 4;
  if (n <= 16) return 5;
  if (n <= 20) return 6;
  if (n <= 24) return 7;
  if (n <= 28) return 8;
  return 9;
}

// Standard 5e XP table by CR. Used as a placeholder hint; authors can
// type a different number.
function defaultXpFromCR(cr: string): number {
  const table: Record<string, number> = {
    '0': 10, '1/8': 25, '1/4': 50, '1/2': 100,
    '1': 200, '2': 450, '3': 700, '4': 1100, '5': 1800,
    '6': 2300, '7': 2900, '8': 3900, '9': 5000, '10': 5900,
    '11': 7200, '12': 8400, '13': 10000, '14': 11500, '15': 13000,
    '16': 15000, '17': 18000, '18': 20000, '19': 22000, '20': 25000,
    '21': 33000, '22': 41000, '23': 50000, '24': 62000, '25': 75000,
    '26': 90000, '27': 105000, '28': 120000, '29': 135000, '30': 155000,
  };
  return table[cr] ?? 0;
}

function normalize(d: Partial<HomebrewCreatureData>): HomebrewCreatureData {
  return {
    size: d.size ?? 'Medium',
    creatureType: d.creatureType ?? '',
    alignment: d.alignment ?? '',
    ac: d.ac ?? 10,
    armorDetail: d.armorDetail,
    hp: d.hp ?? 1,
    hitDice: d.hitDice,
    speed: d.speed ?? '30 ft.',
    speeds: d.speeds,
    challengeRating: d.challengeRating ?? '0',
    xp: d.xp,
    proficiencyBonus: d.proficiencyBonus,
    abilityScores: d.abilityScores ?? { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
    savingThrows: d.savingThrows,
    skills: d.skills,
    senses: d.senses,
    languages: d.languages,
    damageResistances: d.damageResistances,
    damageImmunities: d.damageImmunities,
    damageVulnerabilities: d.damageVulnerabilities,
    conditionImmunities: d.conditionImmunities,
    traits: d.traits ?? [],
    actions: d.actions ?? [],
    environments: d.environments,
    description: d.description ?? '',
    traitsNotes: d.traitsNotes,
  };
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-end' },
  flex1: { flex: 1 },
  flex2: { flex: 2 },
  abilityGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  abilityCell: { flexBasis: '30%', flexGrow: 1, minWidth: 80 },
  speedGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  speedCell: { flexBasis: '18%', flexGrow: 1, minWidth: 80 },
  saveGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  saveCell: {
    flexBasis: '30%', flexGrow: 1, minWidth: 120,
    padding: spacing.xs,
    borderRadius: radius.lg,
    borderWidth: 1, borderColor: colors.outlineVariant + '33',
  },
  saveToggleRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 4 },
  skillGrid: { gap: 4 },
  skillRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 2 },
  skillToggle: { flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 },
  bonusInput: { width: 56, textAlign: 'center' },
  senseGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  senseCell: { flexBasis: '30%', flexGrow: 1, minWidth: 110 },
  dmgChipRow: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 6,
    marginTop: 4, marginBottom: spacing.sm,
  },
  dmgChip: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: spacing.sm, paddingVertical: 6,
    borderRadius: radius.full,
    borderWidth: 1, borderColor: colors.outlineVariant,
    backgroundColor: colors.surfaceContainerLowest,
  },
  dmgChipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xs },
  toggleBox: {
    width: 18, height: 18, borderRadius: 4,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: colors.outline,
  },
  toggleBoxOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  entryBox: {
    padding: spacing.sm,
    backgroundColor: colors.surfaceContainerLowest,
    borderRadius: radius.lg,
    borderWidth: 1, borderColor: colors.outlineVariant + '55',
    marginBottom: spacing.sm,
    gap: 6,
  },
  entryHeaderRow: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm },
  removeBtn: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: colors.outlineVariant + '55',
    marginBottom: 2,
  },
  legacyBox: {
    padding: spacing.sm,
    backgroundColor: colors.surfaceContainerLowest,
    borderRadius: radius.lg,
    borderWidth: 1, borderColor: colors.outlineVariant + '33',
  },
});
