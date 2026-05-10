// Shared prereq checker for the D&D 5e character builder. Used by
// both the wizard's feat picker step and the character sheet's
// "+ feat" surface — same code path, same behavior.
//
// The checker takes a candidate character snapshot (the in-progress
// draft from the wizard, or the persisted character from the sheet)
// and a structured `FeatPrerequisite[]` from the catalog entry, and
// returns whether the candidate satisfies every clause (AND).
//
// Returning a structured `{ ok, reason }` instead of a bare boolean
// lets the picker show the player *why* a feat is locked
// ("Requires Strength 13") rather than silently disabling rows.

import type {
  AbilityKey, FeatPrerequisite,
} from '@vaultstone/types';

/**
 * Snapshot of the bits of character state the prereq checker reads.
 * Loose by design — the wizard's draft store, the persisted sheet,
 * and tests can all build one of these without going through a
 * heavier `Dnd5eStats` constructor.
 */
export interface PrereqCharacter {
  /** Current ability scores. Missing keys default to 10 (the SRD
   *  baseline — no modifier, no proficient bonus). */
  abilityScores?: Partial<Record<AbilityKey, number>>;
  /** Total character level. Defaults to 1 when omitted. */
  level?: number;
  /**
   * Class features the character already has access to, by name
   * (case-insensitive). The checker compares feature names verbatim,
   * so callers must include features granted by subclass + base
   * class progression at the candidate's current level.
   */
  classFeatures?: string[];
}

/**
 * Result of a prereq check. When `ok` is false, `reason` is a short
 * player-facing line ("Strength 13+" / "Level 4+") that the picker
 * surfaces below the locked feat. `details` carries every failing
 * clause in case the caller wants to render them all (the wizard
 * shows just the first, the sheet's detail modal shows them all).
 */
export type PrereqCheckResult =
  | { ok: true }
  | { ok: false; reason: string; details: string[] };

const ABILITY_LABEL: Record<AbilityKey, string> = {
  strength: 'Strength', dexterity: 'Dexterity', constitution: 'Constitution',
  intelligence: 'Intelligence', wisdom: 'Wisdom', charisma: 'Charisma',
};

/**
 * Check a candidate character against a structured prereq list.
 * Empty / missing prereqs always pass.
 *
 * Prose-kind clauses are skipped during gating (they're informational
 * — the prereq prose isn't structured enough to evaluate). Callers
 * that want strict gating on prose should pre-filter to only the
 * structured kinds and surface the prose separately.
 */
export function checkPrerequisites(
  character: PrereqCharacter,
  prereqs: FeatPrerequisite[] | undefined,
): PrereqCheckResult {
  if (!prereqs || prereqs.length === 0) return { ok: true };

  const failures: string[] = [];
  for (const clause of prereqs) {
    const fail = checkClause(character, clause);
    if (fail) failures.push(fail);
  }
  if (failures.length === 0) return { ok: true };
  return { ok: false, reason: failures[0], details: failures };
}

function checkClause(c: PrereqCharacter, clause: FeatPrerequisite): string | null {
  switch (clause.kind) {
    case 'ability-score': {
      const scores = c.abilityScores ?? {};
      const ok = clause.abilities.some((a) => (scores[a] ?? 10) >= clause.minimum);
      if (ok) return null;
      const labels = clause.abilities.map((a) => ABILITY_LABEL[a]);
      const joined = labels.length === 1
        ? labels[0]
        : labels.length === 2
          ? `${labels[0]} or ${labels[1]}`
          : `${labels.slice(0, -1).join(', ')}, or ${labels[labels.length - 1]}`;
      return `Requires ${joined} ${clause.minimum}+`;
    }
    case 'character-level': {
      const lvl = c.level ?? 1;
      if (lvl >= clause.minimum) return null;
      return `Requires level ${clause.minimum}+`;
    }
    case 'class-feature': {
      const owned = (c.classFeatures ?? []).map((s) => s.toLowerCase().trim());
      const want = clause.featureName.toLowerCase().trim();
      if (owned.includes(want)) return null;
      return `Requires the ${clause.featureName} feature`;
    }
    case 'prose':
      // Informational only — don't gate.
      return null;
  }
}
