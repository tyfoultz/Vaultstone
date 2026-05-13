// applyLevelUp — apply one level-up event to a character. Used by
// both the level-up wizard (interactive, one call per Confirm) and
// the starting_level>1 bootstrap (batched, one call per level
// between 1 and the campaign's starting level).
//
// The function is pure: takes the current character state + the
// player's picks for this level, returns the new state. No content
// fetching happens here — callers pass in the resolved class data
// they've already loaded through ContentResolver. That keeps this
// synchronous, trivially testable, and reusable from anywhere.

import type {
  AbilityKey,
  ClassResult,
  Dnd5eAbilityScores,
  Dnd5eClassEntry,
  Dnd5eFeature,
  Dnd5eResources,
  Dnd5eStats,
} from '@vaultstone/types';
import { getClassEntries } from '@vaultstone/types';
import {
  classFeaturesAtLevel,
  conModifier,
  hpGainForLevel,
  spellSlotsForCharacter,
  totalLevel,
} from './leveling';

/**
 * One level-up event's player picks. The caller (wizard, bootstrap)
 * decides what to put here based on the leveled class and the
 * character's current state.
 */
export interface LevelUpPick {
  /**
   * Which class entry is gaining the level. For an existing class,
   * matches an entry's `classKey`. For a brand-new multiclass entry,
   * it's the new class's key — `applyLevelUp` will append a fresh
   * Dnd5eClassEntry for it (level=1, subclassKey=null, primary=false).
   */
  classKey: string;
  /**
   * `true` when this pick is the first level in a brand-new class
   * (multiclass entry). When set, `applyLevelUp` appends a new
   * entry with `primary: false` instead of incrementing an existing
   * one. `false` advances the existing entry by 1.
   */
  newMulticlassEntry: boolean;
  /** HP gained at this level (already rolled / averaged by the caller). */
  hpGain: number;
  /**
   * Subclass key picked at this level. Required when the leveling
   * class hits its `subclassUnlockLevel`; ignored otherwise. Use
   * `null` to defer / skip (e.g. starting_level bootstrap with no
   * default available — the wizard will surface a warning later).
   */
  subclassKey?: string | null;
  /**
   * Ability score improvement picked at this level. Mutually
   * exclusive with `featKey`. Either a single +2 to one ability or
   * +1 to two abilities; the caller validates the SRD constraints
   * before calling.
   */
  abilityScoreImprovement?: Partial<Record<AbilityKey, number>>;
  /**
   * Feat picked in lieu of an ability score improvement. Mutually
   * exclusive with `abilityScoreImprovement`. Only meaningful at
   * ASI levels per the SRD.
   */
  featKey?: string;
  /**
   * Display data for the picked feat — name + description. The
   * caller already resolved the feat through ContentResolver to
   * gate the prereq check; pass it through so we can write the
   * Dnd5eFeature shape onto resources.feats[] without re-fetching.
   */
  featData?: { name: string; description: string };
  /**
   * Class features unlocked at this level, surfaced to the player
   * via the wizard. Pass them through here so applyLevelUp writes
   * them into resources.classFeatures[]. The caller pulls them via
   * `classFeaturesAtLevel(cls, level)`. (Skipping is allowed — the
   * sheet recomputes features from class+level on its own.)
   */
  classFeaturesUnlocked?: Array<{ name: string; description: string; actionType?: 'action' | 'bonus' | 'reaction' | 'free' }>;
}

/**
 * Result of applying one level-up. Both `stats` and `resources` are
 * fresh objects — callers should write them back to the row in
 * lockstep. Persistence is the caller's responsibility.
 */
export interface ApplyLevelUpResult {
  stats: Dnd5eStats;
  resources: Dnd5eResources;
}

/**
 * Apply one level-up event. The state before the call describes a
 * character at level N; the state after describes the same character
 * at level N+1 (or with a new multiclass entry started, when
 * `pick.newMulticlassEntry` is set).
 *
 * Mutations:
 *   - `classes[]` is incremented (or a new entry appended).
 *   - Top-level `level` becomes the new total.
 *   - `hpMax` increases by `pick.hpGain`.
 *   - `resources.hpCurrent` increases by the same amount (so the
 *     character is returned to a healthy state at the same fraction;
 *     applies max gain).
 *   - `resources.spellSlots` is recomputed via `spellSlotsForCharacter`.
 *   - `resources.classFeatures` gains entries for any features
 *     unlocked at this level (when supplied by the caller).
 *   - `resources.feats` gains an entry for a feat picked in lieu
 *     of an ASI.
 *   - `resources.hitDiceRemaining` increases by 1.
 *   - Ability scores update when an ASI is picked.
 *   - Subclass selection writes onto the leveled class entry.
 *
 * Things this does NOT do:
 *   - Validate inputs. Caller must ensure the pick is legal (e.g.
 *     ASI delta sums to +2 or +1+1, the picked feat passes prereqs,
 *     subclass key is set when required).
 *   - Touch starting proficiencies or saving throws — those are
 *     locked at primary-class creation and (for multiclass entries)
 *     adjusted via the multiclass-proficiencies block in a separate
 *     pass. v1 of this function leaves the proficiency arrays
 *     untouched on multiclass entry; the wizard handles that.
 *   - Resolve content. The caller passes in the leveled class's
 *     ClassResult plus a map of all classes so the spell-slot
 *     recompute can see the merged multiclass picture.
 */
export function applyLevelUp(
  before: { stats: Dnd5eStats; resources: Dnd5eResources },
  pick: LevelUpPick,
  cls: ClassResult,
  classByKey: Map<string, ClassResult>,
): ApplyLevelUpResult {
  // Clone everything we'll mutate so the inputs stay untouched.
  const stats: Dnd5eStats = { ...before.stats };
  const resources: Dnd5eResources = { ...before.resources };

  // ── Class entries ──
  const entriesBefore = getClassEntries(before.stats);
  const entries: Dnd5eClassEntry[] = entriesBefore.map((e) => ({ ...e }));

  if (pick.newMulticlassEntry) {
    // Append a new class entry. Subclass picks at L1 are extremely
    // rare (only Cleric, Sorcerer, Warlock in 5.1; nobody in 2024),
    // and in any case the caller will pass `subclassKey` if so.
    entries.push({
      classKey: pick.classKey,
      level: 1,
      subclassKey: pick.subclassKey ?? null,
      hitDie: cls.hitDie,
      primary: false,
    });
  } else {
    // Find the entry to advance. Prefer an exact key match; fall
    // back to a slug match (strip the edition suffix) so a character
    // whose stored classKey predates the edition split (e.g. plain
    // 'cleric' vs the catalog's 'cleric-srd-2-0') still resolves to
    // its single class entry. When the lenient match wins we also
    // re-pin the entry's classKey + hitDie to the catalog values so
    // future level-ups go through the exact-match path.
    let idx = entries.findIndex((e) => e.classKey === pick.classKey);
    if (idx < 0) {
      const stripEdition = (k: string) => k.replace(/-srd-.*$/i, '').toLowerCase();
      const target = stripEdition(pick.classKey);
      idx = entries.findIndex((e) => stripEdition(e.classKey) === target);
    }
    if (idx < 0) {
      // Caller bug; return state unchanged so we don't corrupt the
      // character. The wizard validates this before the call.
      return { stats, resources };
    }
    entries[idx] = {
      ...entries[idx],
      classKey: pick.classKey,    // pin to catalog key for future ops
      hitDie: cls.hitDie,         // pin in case the legacy hitDie was wrong
      level: entries[idx].level + 1,
      ...(pick.subclassKey !== undefined ? { subclassKey: pick.subclassKey } : {}),
    };
  }

  stats.classes = entries;
  stats.level = totalLevel(entries);

  // The legacy top-level `classKey` / `level` / `hitDie` mirror the
  // primary entry. The level-up flow may bump the primary's level
  // (or, on multiclass, leave the primary alone but raise the total).
  const primary = entries.find((e) => e.primary) ?? entries[0];
  stats.classKey = primary.classKey;
  // `level` already reflects total level (set above); `hitDie` stays
  // pinned to the primary class's die since that's what the sheet
  // header surfaces. Multi-class hit-dice spending uses
  // `entries[].hitDie` directly via getClassEntries().
  stats.hitDie = primary.hitDie;

  // ── Ability score improvement ──
  if (pick.abilityScoreImprovement) {
    const newScores: Dnd5eAbilityScores = { ...stats.abilityScores };
    for (const [k, delta] of Object.entries(pick.abilityScoreImprovement)) {
      if (typeof delta !== 'number') continue;
      const key = k as AbilityKey;
      newScores[key] = Math.min(20, (newScores[key] ?? 10) + delta);
    }
    stats.abilityScores = newScores;
  }

  // ── HP ──
  stats.hpMax = stats.hpMax + pick.hpGain;
  resources.hpCurrent = (resources.hpCurrent ?? stats.hpMax) + pick.hpGain;

  // ── Hit dice ──
  resources.hitDiceRemaining = (resources.hitDiceRemaining ?? 0) + 1;

  // ── Spell slots (recompute from full multiclass picture) ──
  resources.spellSlots = spellSlotsForCharacter(entries, classByKey);

  // ── Class features unlocked at this level ──
  if (pick.classFeaturesUnlocked && pick.classFeaturesUnlocked.length > 0) {
    const existing = resources.classFeatures ?? [];
    const additions: Dnd5eFeature[] = pick.classFeaturesUnlocked.map((f) => ({
      id: `class-${pick.classKey}-${slugify(f.name)}`,
      name: f.name,
      description: f.description,
      ...(f.actionType ? { actionType: f.actionType } : {}),
    }));
    const seen = new Set(existing.map((f) => f.id));
    resources.classFeatures = [
      ...existing,
      ...additions.filter((f) => !seen.has(f.id)),
    ];
  }

  // ── Feat picked in lieu of ASI ──
  if (pick.featKey && pick.featData) {
    const existing = resources.feats ?? [];
    if (!existing.some((f) => f.id === pick.featKey)) {
      resources.feats = [
        ...existing,
        {
          id: pick.featKey,
          name: pick.featData.name,
          description: pick.featData.description,
        },
      ];
    }
  }

  return { stats, resources };
}

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

/**
 * Convenience wrapper for the common case of picking the average
 * HP gain. Reads the character's hitPointMethod setting + CON mod
 * + leveled class's hit die and produces the right HP gain number,
 * which the caller can drop straight into a LevelUpPick.
 */
export function defaultHpGain(
  stats: Dnd5eStats,
  cls: ClassResult,
  options?: { rolledValue?: number },
): number {
  const method = stats.settings?.hitPointMethod ?? 'fixed';
  const conMod = conModifier(stats.abilityScores);
  return hpGainForLevel({
    hitDie: cls.hitDie,
    conMod,
    method,
    roll: options?.rolledValue,
  });
}

/**
 * Helper for callers that need to format a feature shape pulled
 * from `classFeaturesAtLevel(cls, newLevel)` for the LevelUpPick.
 * Strips the level + parentName fields the SRD data carries; keeps
 * just name + description.
 */
export function unpackClassFeaturesForPick(
  features: ReturnType<typeof classFeaturesAtLevel>,
): Array<{ name: string; description: string }> {
  return features.map((f) => ({
    name: f.name,
    description: f.description ?? '',
  }));
}
