// Authoring form for HomebrewSpecies entries. Mirrors the SpeciesResult
// shape so authored species behave identically to SRD ones in the
// character creation wizard + character sheet — structured traits,
// fixed and choice-based ASIs, and Custom Origin opt-in.

import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import {
  Input, MetaLabel, SectionHeader,
  Text, colors, spacing, radius, Icon, GhostButton,
} from '@vaultstone/ui';
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

// Ability keys mirror the rest of the wizard — stored lowercase so they
// match the character's Dnd5eAbilityScores keys exactly. Display labels
// stay in the canonical 5e three-letter form for the chip row.
const ABILITIES: Array<{ key: string; label: string }> = [
  { key: 'strength',     label: 'STR' },
  { key: 'dexterity',    label: 'DEX' },
  { key: 'constitution', label: 'CON' },
  { key: 'intelligence', label: 'INT' },
  { key: 'wisdom',       label: 'WIS' },
  { key: 'charisma',     label: 'CHA' },
];
const ABILITY_LABEL: Record<string, string> = Object.fromEntries(
  ABILITIES.map((a) => [a.key, a.label]),
);

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
    traits: [],
    abilityScoreIncreases: [],
    abilityScoreChoices: [],
    // Default to all-false; new species don't auto-opt-in to Custom
    // Origin — the wizard's CYO step gates on this explicitly.
    swapRules: { abilityScores: false, languages: false, skills: false },
  },
};

export function SpeciesFormModal({ pack, entry, onClose, onSaved }: Props) {
  const user = useAuthStore((s) => s.user);
  const initial = entry
    ? { name: entry.name, data: normalize(entry.data as unknown as HomebrewSpeciesData) }
    : DEFAULTS;

  const [name, setName] = useState(initial.name);
  const [data, setData] = useState<HomebrewSpeciesData>(initial.data);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  function patch<K extends keyof HomebrewSpeciesData>(key: K, value: HomebrewSpeciesData[K]) {
    setData((prev) => ({ ...prev, [key]: value }));
  }

  // ── Ability score increases (fixed) ─────────────────────────────────────
  const asiByAbility = useMemo(() => {
    const map: Record<string, number> = {};
    for (const a of data.abilityScoreIncreases) map[a.ability] = a.amount;
    return map;
  }, [data.abilityScoreIncreases]);

  function setAsiAmount(ability: string, amount: number) {
    const others = data.abilityScoreIncreases.filter((a) => a.ability !== ability);
    if (amount === 0) {
      patch('abilityScoreIncreases', others);
      return;
    }
    patch('abilityScoreIncreases', [...others, { ability, amount }]);
  }

  // ── Ability score choices (Half-Elf style) ──────────────────────────────
  // The data shape supports multiple clauses, but the common case is a
  // single one. The form ships a single editable clause for now; an
  // "Add clause" button can land later if a real use case shows up.
  const clause = data.abilityScoreChoices?.[0] ?? null;

  function setClause(next: { count: number; amount: number; from: string[] } | null) {
    if (!next) {
      patch('abilityScoreChoices', []);
      return;
    }
    patch('abilityScoreChoices', [next]);
  }

  function toggleClauseEnabled() {
    if (clause) {
      setClause(null);
    } else {
      setClause({ count: 2, amount: 1, from: ABILITIES.map((a) => a.key) });
    }
  }

  // ── Traits editor ───────────────────────────────────────────────────────
  function addTrait() {
    patch('traits', [...data.traits, { name: '', description: '' }]);
  }
  function removeTrait(idx: number) {
    patch('traits', data.traits.filter((_, i) => i !== idx));
  }
  function patchTrait(idx: number, field: 'name' | 'description', value: string) {
    const next = data.traits.slice();
    next[idx] = { ...next[idx], [field]: value };
    patch('traits', next);
  }
  function patchTraitLevel(idx: number, raw: string) {
    const next = data.traits.slice();
    const trimmed = raw.trim();
    if (trimmed === '') {
      const { level: _drop, ...rest } = next[idx];
      next[idx] = rest;
    } else {
      const n = Math.max(1, Math.min(20, Math.floor(Number(trimmed) || 1)));
      next[idx] = { ...next[idx], level: n };
    }
    patch('traits', next);
  }

  // ── Custom Origin swap rules ────────────────────────────────────────────
  const swap = data.swapRules ?? { abilityScores: false, languages: false, skills: false };
  function toggleSwap(key: 'abilityScores' | 'languages' | 'skills') {
    patch('swapRules', { ...swap, [key]: !swap[key] });
  }

  async function handleSubmit() {
    if (!user) return;
    if (!name.trim()) { setError('Species name is required.'); return; }
    if (!data.description.trim()) { setError('Description is required.'); return; }
    // Drop empty trait rows so we don't ship junk to the resolver.
    const cleanTraits = data.traits
      .map((t) => {
        const out: { name: string; description: string; level?: number } = {
          name: t.name.trim(),
          description: t.description.trim(),
        };
        if (typeof t.level === 'number' && t.level > 1) out.level = t.level;
        return out;
      })
      .filter((t) => t.name || t.description);
    const final: HomebrewSpeciesData = {
      ...data,
      traits: cleanTraits,
      // Drop the optional fields when empty so the row doesn't carry
      // marker keys that fail the resolver's "is this set?" checks.
      abilityScoreChoices:
        data.abilityScoreChoices && data.abilityScoreChoices.length > 0
          ? data.abilityScoreChoices
          : undefined,
      // traitsNotes is preserved if present (migration fallback), but
      // we never write new values to it from this form.
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
        payload: { contentType: 'species', data: final },
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

      <SectionHeader
        title="Ability Score Increases"
        meta="Fixed bonuses (e.g. +2 CON). Use the choice clause below for Half-Elf-style picks."
      />
      <View style={styles.asiGrid}>
        {ABILITIES.map((a) => (
          <View key={a.key} style={styles.asiRow}>
            <View style={styles.asiLabel}>
              <Text variant="label-md" weight="semibold" style={{ color: colors.onSurfaceVariant, letterSpacing: 0.6 }}>
                {a.label}
              </Text>
            </View>
            <View style={styles.asiStepper}>
              <Pressable
                onPress={() => setAsiAmount(a.key, Math.max(0, (asiByAbility[a.key] ?? 0) - 1))}
                style={styles.asiBtn}
              >
                <Icon name="remove" size={16} color={colors.onSurfaceVariant} />
              </Pressable>
              <View style={styles.asiValueWrap}>
                <Text variant="label-md" weight="bold" style={{ color: colors.onSurface }}>
                  {asiByAbility[a.key] ? `+${asiByAbility[a.key]}` : '—'}
                </Text>
              </View>
              <Pressable
                onPress={() => setAsiAmount(a.key, Math.min(5, (asiByAbility[a.key] ?? 0) + 1))}
                style={styles.asiBtn}
              >
                <Icon name="add" size={16} color={colors.onSurfaceVariant} />
              </Pressable>
            </View>
          </View>
        ))}
      </View>

      <SectionHeader
        title="Choice clause (optional)"
        meta="Half-Elf style: '+1 to N abilities of the player's choice'."
      />
      <Pressable onPress={toggleClauseEnabled} style={styles.toggleRow}>
        <View style={[styles.toggleBox, clause && styles.toggleBoxOn]}>
          {clause ? <Icon name="check" size={14} color={colors.onPrimary} /> : null}
        </View>
        <Text variant="body-md" style={{ color: colors.onSurface }}>
          {clause ? 'Choice clause enabled' : 'Add a choice clause'}
        </Text>
      </Pressable>
      {clause ? (
        <View style={styles.clauseBox}>
          <View style={styles.clauseRow}>
            <View style={{ width: 110 }}>
              <MetaLabel size="sm">Count</MetaLabel>
              <Input
                keyboardType="numeric"
                value={String(clause.count)}
                onChangeText={(t) => {
                  const n = parseInt(t, 10);
                  setClause({ ...clause, count: Number.isFinite(n) ? Math.max(1, Math.min(6, n)) : 1 });
                }}
              />
            </View>
            <View style={{ width: 110 }}>
              <MetaLabel size="sm">Amount each</MetaLabel>
              <Input
                keyboardType="numeric"
                value={String(clause.amount)}
                onChangeText={(t) => {
                  const n = parseInt(t, 10);
                  setClause({ ...clause, amount: Number.isFinite(n) ? Math.max(1, Math.min(3, n)) : 1 });
                }}
              />
            </View>
          </View>
          <MetaLabel size="sm" style={{ marginTop: spacing.sm }}>Pickable from</MetaLabel>
          <ChipToggleRow
            options={ABILITIES}
            values={clause.from}
            onChange={(next) => setClause({ ...clause, from: next })}
          />
        </View>
      ) : null}

      <SectionHeader
        title="Traits"
        meta="Named feature blocks (Darkvision, Fey Ancestry, etc.)"
      />
      {data.traits.map((trait, idx) => (
        <View key={idx} style={styles.traitBox}>
          <View style={styles.traitHeaderRow}>
            <View style={{ flex: 1 }}>
              <Input
                label="Trait name"
                placeholder="Darkvision"
                value={trait.name}
                onChangeText={(t) => patchTrait(idx, 'name', t)}
              />
            </View>
            <View style={{ width: 96 }}>
              <Input
                label="Gained at level"
                placeholder="1"
                keyboardType="number-pad"
                value={trait.level !== undefined ? String(trait.level) : ''}
                onChangeText={(t) => patchTraitLevel(idx, t)}
              />
            </View>
            <Pressable
              onPress={() => removeTrait(idx)}
              style={styles.traitRemoveBtn}
              accessibilityLabel="Remove trait"
            >
              <Icon name="close" size={16} color={colors.onSurfaceVariant} />
            </Pressable>
          </View>
          <Input
            label="Description"
            placeholder="You can see in dim light within 60 feet of you as if it were bright light…"
            value={trait.description}
            onChangeText={(t) => patchTrait(idx, 'description', t)}
            multiline
            numberOfLines={3}
            style={{ minHeight: 80, textAlignVertical: 'top' }}
          />
        </View>
      ))}
      <GhostButton label="+ Add trait" onPress={addTrait} />

      <SectionHeader
        title="Customize Your Origin"
        meta="What can the player reassign during character creation when CYO is on?"
      />
      <View style={styles.swapRow}>
        <SwapToggle
          label="Ability scores"
          on={!!swap.abilityScores}
          onPress={() => toggleSwap('abilityScores')}
        />
        <SwapToggle
          label="Languages"
          on={!!swap.languages}
          onPress={() => toggleSwap('languages')}
        />
        <SwapToggle
          label="Skills"
          on={!!swap.skills}
          onPress={() => toggleSwap('skills')}
        />
      </View>

      {/* If the row came in with legacy free-form notes, show them in
          a read-only block so the author can copy what they want over
          into the structured fields before saving. The form never
          writes back to traitsNotes. */}
      {data.traitsNotes && data.traitsNotes.trim() ? (
        <>
          <SectionHeader
            title="Legacy trait notes (read-only)"
            meta="From an earlier version of the editor. Migrate into the structured fields above and they'll stop appearing on the detail card."
          />
          <View style={styles.legacyBox}>
            <Text variant="body-sm" tone="secondary">{data.traitsNotes}</Text>
          </View>
        </>
      ) : null}
    </HomebrewFormShell>
  );
}

function SwapToggle({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={styles.swapToggle}>
      <View style={[styles.toggleBox, on && styles.toggleBoxOn]}>
        {on ? <Icon name="check" size={14} color={colors.onPrimary} /> : null}
      </View>
      <Text variant="body-md" style={{ color: colors.onSurface }}>{label}</Text>
    </Pressable>
  );
}

// Normalize a stored row: fill in defaults for any fields that pre-
// structure rows may omit, so the form's controlled inputs always have
// a defined value.
function normalize(d: Partial<HomebrewSpeciesData>): HomebrewSpeciesData {
  return {
    size: d.size ?? 'Medium',
    speed: d.speed ?? 30,
    description: d.description ?? '',
    traits: d.traits ?? [],
    abilityScoreIncreases: d.abilityScoreIncreases ?? [],
    abilityScoreChoices: d.abilityScoreChoices ?? [],
    swapRules: d.swapRules ?? { abilityScores: false, languages: false, skills: false },
    traitsNotes: d.traitsNotes,
  };
}

const styles = StyleSheet.create({
  asiGrid: {
    flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs + 2,
  },
  asiRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs + 2,
    borderRadius: radius.lg,
    borderWidth: 1, borderColor: colors.outlineVariant + '55',
    minWidth: 140,
  },
  asiLabel: { width: 38 },
  asiStepper: { flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1, justifyContent: 'flex-end' },
  asiBtn: {
    width: 28, height: 28, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: colors.outlineVariant,
  },
  asiValueWrap: { minWidth: 32, alignItems: 'center' },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xs },
  toggleBox: {
    width: 22, height: 22, borderRadius: 4,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: colors.outline,
  },
  toggleBoxOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  clauseBox: {
    padding: spacing.sm,
    backgroundColor: colors.surfaceContainerLowest,
    borderRadius: radius.lg,
    borderWidth: 1, borderColor: colors.outlineVariant + '55',
  },
  clauseRow: { flexDirection: 'row', gap: spacing.md },
  traitBox: {
    padding: spacing.sm,
    backgroundColor: colors.surfaceContainerLowest,
    borderRadius: radius.lg,
    borderWidth: 1, borderColor: colors.outlineVariant + '55',
    marginBottom: spacing.sm,
  },
  traitHeaderRow: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm },
  traitRemoveBtn: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: colors.outlineVariant + '55',
    marginBottom: 2,
  },
  swapRow: { flexDirection: 'column', gap: spacing.xs + 2 },
  swapToggle: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xs },
  legacyBox: {
    padding: spacing.sm,
    backgroundColor: colors.surfaceContainerLowest,
    borderRadius: radius.lg,
    borderWidth: 1, borderColor: colors.outlineVariant + '33',
  },
});
