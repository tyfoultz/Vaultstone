// Authoring form for HomebrewSubclass entries. Parent class is picked
// from the resolved class catalog for this pack's system (SRD +
// homebrew tiers), so the recorded `parentClassKey` always matches a
// real ClassResult.key downstream. Features are a structured list of
// per-level entries; the legacy `featuresNotes` field is preserved for
// rows authored before this rewrite — the resolver synthesizes a
// single fallback feature from it when no structured features exist.

import { useEffect, useMemo, useState } from 'react';
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
import type { HomebrewSubclassData } from '@vaultstone/types';
import { ContentResolver } from '@vaultstone/content';
import type { ClassResult } from '@vaultstone/types';
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
    features: [],
  },
};

export function SubclassFormModal({ pack, entry, onClose, onSaved }: Props) {
  const user = useAuthStore((s) => s.user);
  const initial = entry
    ? { name: entry.name, data: normalize(entry.data as unknown as HomebrewSubclassData) }
    : DEFAULTS;

  const [name, setName] = useState(initial.name);
  const [data, setData] = useState<HomebrewSubclassData>(initial.data);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [classes, setClasses] = useState<ClassResult[]>([]);
  const [classesLoading, setClassesLoading] = useState(true);

  // Load the resolved class catalog for this pack's system so the
  // parent picker can show real options instead of a free-text input.
  // SRD + homebrew tiers — imported tier is folded into homebrew, so
  // a pack-owned imported class shows up here without a separate fetch.
  useEffect(() => {
    let cancelled = false;
    setClassesLoading(true);
    ContentResolver.search({ system: pack.system, type: 'class', tiers: ['srd', 'homebrew'] })
      .then((results) => {
        if (cancelled) return;
        const filtered = (results as ClassResult[])
          .slice()
          .sort((a, b) => a.name.localeCompare(b.name));
        setClasses(filtered);
        setClassesLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setClasses([]);
        setClassesLoading(false);
      });
    return () => { cancelled = true; };
  }, [pack.system]);

  function patch<K extends keyof HomebrewSubclassData>(key: K, value: HomebrewSubclassData[K]) {
    setData((prev) => ({ ...prev, [key]: value }));
  }

  function selectParentClass(klass: ClassResult) {
    setData((prev) => ({
      ...prev,
      parentClassKey: klass.key,
      parentClassName: klass.name,
      // Snap unlock level to the parent's convention when known.
      unlockLevel: klass.subclassUnlockLevel ?? prev.unlockLevel,
    }));
  }

  // ── Features editor ─────────────────────────────────────────────────────
  const features = data.features ?? [];

  function addFeature() {
    patch('features', [
      ...features,
      { level: data.unlockLevel, name: '', description: '' },
    ]);
  }
  function removeFeature(idx: number) {
    patch('features', features.filter((_, i) => i !== idx));
  }
  function patchFeature(idx: number, field: 'name' | 'description', value: string) {
    const next = features.slice();
    next[idx] = { ...next[idx], [field]: value };
    patch('features', next);
  }
  function patchFeatureLevel(idx: number, raw: string) {
    const next = features.slice();
    const n = Math.max(1, Math.min(20, parseInt(raw, 10) || 1));
    next[idx] = { ...next[idx], level: n };
    patch('features', next);
  }

  // Sort features by level for display only — author order in the
  // underlying array is preserved when we save.
  const sortedFeatures = useMemo(
    () => features
      .map((f, idx) => ({ ...f, idx }))
      .sort((a, b) => a.level - b.level || a.idx - b.idx),
    [features],
  );

  async function handleSubmit() {
    if (!user) return;
    if (!name.trim()) { setError('Subclass name is required.'); return; }
    if (!data.parentClassKey.trim()) { setError('Pick a parent class.'); return; }
    if (!data.description.trim()) { setError('Description is required.'); return; }

    const cleanFeatures = features
      .map((f) => ({
        level: f.level,
        name: f.name.trim(),
        description: f.description.trim(),
      }))
      .filter((f) => f.name || f.description);

    const finalData: HomebrewSubclassData = {
      ...data,
      parentClassKey: data.parentClassKey.trim(),
      parentClassName: data.parentClassName?.trim() || undefined,
      features: cleanFeatures.length > 0 ? cleanFeatures : undefined,
      // featuresNotes preserved if present (legacy fallback); never
      // written to from the form going forward.
      featuresNotes: data.featuresNotes?.trim() || undefined,
    };

    setSubmitting(true);
    setError('');

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

  // Parent-class picker UI: show resolved chips when the catalog has
  // loaded. If the stored parentClassKey doesn't match any resolved
  // class (e.g. the parent was deleted, or this is an older row), keep
  // the saved name visible so the author knows what's there.
  const selectedKlass = classes.find((c) => c.key === data.parentClassKey);
  const orphanParent = !selectedKlass && data.parentClassKey;

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

      <SectionHeader title="Parent class" meta="Where this subclass slots into the class tree." />
      {classesLoading ? (
        <Text variant="body-sm" tone="secondary">Loading classes…</Text>
      ) : classes.length === 0 ? (
        <Text variant="body-sm" tone="secondary">
          No classes resolved for this system. Save a homebrew class first, or
          import a class pack into this system.
        </Text>
      ) : (
        <View style={styles.classChipRow}>
          {classes.map((klass) => {
            const on = klass.key === data.parentClassKey;
            return (
              <Pressable
                key={klass.key}
                onPress={() => selectParentClass(klass)}
                style={[styles.classChip, on && styles.classChipOn]}
              >
                <Text variant="body-sm" weight={on ? 'bold' : 'regular'} style={{ color: on ? colors.onPrimary : colors.onSurface }}>
                  {klass.name}
                </Text>
                <Text variant="body-sm" style={{ color: on ? colors.onPrimary : colors.onSurfaceVariant, marginLeft: 4 }}>
                  {tierBadge(klass)}
                </Text>
              </Pressable>
            );
          })}
        </View>
      )}
      {orphanParent ? (
        <View style={styles.orphanBox}>
          <Text variant="body-sm" tone="secondary">
            Saved parent class:{' '}
            <Text variant="body-sm" weight="bold" style={{ color: colors.onSurface }}>
              {data.parentClassName || data.parentClassKey}
            </Text>
            {' '}— no matching class in this system right now. Pick a new one above, or leave as-is to keep the existing reference.
          </Text>
        </View>
      ) : null}

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
        meta="One row per feature this subclass grants. Level controls when it unlocks."
      />
      {sortedFeatures.map((f) => (
        <View key={f.idx} style={styles.featureBox}>
          <View style={styles.featureHeaderRow}>
            <View style={{ flex: 1 }}>
              <Input
                label="Feature name"
                placeholder="Stormwarden"
                value={f.name}
                onChangeText={(t) => patchFeature(f.idx, 'name', t)}
              />
            </View>
            <View style={{ width: 80 }}>
              <Input
                label="Level"
                keyboardType="number-pad"
                value={String(f.level)}
                onChangeText={(t) => patchFeatureLevel(f.idx, t)}
              />
            </View>
            <Pressable
              onPress={() => removeFeature(f.idx)}
              style={styles.removeBtn}
              accessibilityLabel="Remove feature"
            >
              <Icon name="close" size={16} color={colors.onSurfaceVariant} />
            </Pressable>
          </View>
          <Input
            label="Description"
            placeholder="You gain proficiency with longbows and a +2 bonus to ranged attack rolls during a thunderstorm."
            value={f.description}
            onChangeText={(t) => patchFeature(f.idx, 'description', t)}
            multiline
            numberOfLines={3}
            style={{ minHeight: 90, textAlignVertical: 'top' }}
          />
        </View>
      ))}
      <GhostButton label="+ Add feature" onPress={addFeature} />

      {/* Legacy notes — present only on rows authored before this rewrite. */}
      {data.featuresNotes && data.featuresNotes.trim() ? (
        <>
          <SectionHeader
            title="Legacy features notes (read-only)"
            meta="From an earlier version of the editor. Migrate into the structured Features above and they'll stop appearing on the detail card."
          />
          <View style={styles.legacyBox}>
            <Text variant="body-sm" tone="secondary">{data.featuresNotes}</Text>
          </View>
        </>
      ) : null}
    </HomebrewFormShell>
  );
}

// Short provenance tag shown on the parent-class chip. Distinguishes
// SRD classes (edition-suffixed) from homebrew/imported when the user
// has multiple "Barbarian" entries in scope.
function tierBadge(klass: ClassResult): string {
  if (klass.tier === 'srd') {
    return klass.srdVersions?.includes('SRD_2.0') ? '2024' : '5.1';
  }
  return klass.importSource?.code ?? 'homebrew';
}

function normalize(d: Partial<HomebrewSubclassData>): HomebrewSubclassData {
  return {
    parentClassKey: d.parentClassKey ?? '',
    parentClassName: d.parentClassName ?? '',
    unlockLevel: d.unlockLevel ?? 3,
    description: d.description ?? '',
    features: d.features ?? [],
    featuresNotes: d.featuresNotes,
  };
}

const styles = StyleSheet.create({
  classChipRow: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4,
  },
  classChip: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: spacing.sm, paddingVertical: 6,
    borderRadius: radius.full,
    borderWidth: 1, borderColor: colors.outlineVariant,
    backgroundColor: colors.surfaceContainerLowest,
  },
  classChipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  orphanBox: {
    padding: spacing.sm,
    backgroundColor: colors.surfaceContainerLowest,
    borderRadius: radius.lg,
    borderWidth: 1, borderColor: colors.outlineVariant + '55',
    marginTop: spacing.xs,
  },
  featureBox: {
    padding: spacing.sm,
    backgroundColor: colors.surfaceContainerLowest,
    borderRadius: radius.lg,
    borderWidth: 1, borderColor: colors.outlineVariant + '55',
    marginBottom: spacing.sm,
    gap: 6,
  },
  featureHeaderRow: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm },
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
