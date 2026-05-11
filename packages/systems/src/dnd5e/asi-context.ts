// Ability Score Increase context — single source of truth for who
// grants ASIs to the character and how the player allocates them.
//
// 5e doesn't have a single ASI budget. The source of the +2/+1 depends
// on edition AND whether Customize Your Origin (Tasha's, then default
// in 2024) is on:
//
//   5.1 + CYO off → species' fixed ASIs apply as written
//                    (Dwarf +2 CON, Half-Elf +2 CHA + 2× +1 elsewhere)
//                    Background grants nothing.
//   5.1 + CYO on  → the SAME species ASI budget but the player
//                    reassigns it freely (Tasha's reframing). Background
//                    grants nothing.
//   5.2 + CYO off → background's fixed ASI applies (+2 to one of the
//                    three listed abilities and +1 to a different one,
//                    or +1 to each of the three). Species grants nothing.
//   5.2 + CYO on  → SAME background ASI budget but the player picks
//                    any abilities (background.abilityScoreOptions
//                    becomes "any 6"). Species grants nothing.
//
// The ASI context resolves all four cases into a single descriptor the
// wizard's Ability Scores step (and the finalize math) consume.

import type {
  BackgroundResult,
  Dnd5eAbilityScores,
  SpeciesResult,
  SrdVersion,
} from '@vaultstone/types';

export type AsiMode =
  // Read-only species bonuses apply as written. The wizard shows them
  // but doesn't surface a picker — the bonuses just land.
  | 'species-fixed'
  // Player picks +2/+1 (or +1/+1/+1) from the species' allowed pool.
  // 5.1 + CYO on: pool is all 6 abilities. The species' fixed ASI
  // budget (sum of amounts in `abilityScoreIncreases` + any
  // `abilityScoreChoices`) is reassignable as Custom Origin allows.
  | 'species-custom-origin'
  // Read-only background bonuses apply (2024 default). Player picks
  // their +2 and +1 from the background's `abilityScoreOptions` set.
  | 'background-fixed'
  // Player picks freely from all 6 abilities — 2024 + CYO on.
  | 'background-custom-origin'
  // No ASI source (non-caster homebrew or missing data). The wizard
  // hides the panel.
  | 'none';

export type AsiContext = {
  mode: AsiMode;
  /** Total points the player has to assign across abilities. The
   *  conventional 5e ASI block is 3 points (+2/+1) for both editions. */
  totalPoints: number;
  /** Allowed ability pool for the picker. Empty for read-only modes. */
  allowedAbilities: string[];
  /** Description shown on the wizard's Ability Scores step. */
  sourceLabel: string;
  /** For `species-fixed` mode — the fixed bonuses to auto-apply.
   *  Empty for all other modes (background-fixed handles its own,
   *  custom-origin uses player choices). */
  fixedBonuses: Array<{ ability: string; amount: number }>;
  /** For `species-fixed` mode — Half-Elf-style choice clauses the
   *  player still picks even when CYO is off. */
  fixedChoices: Array<{ count: number; amount: number; from: string[] }>;
};

const SIX_ABILITIES = [
  'strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma',
];

/**
 * Resolve which ASI rules apply to a character. Drives the Ability
 * Scores step + the finalize math + the informational notes on the
 * Species and Background detail cards.
 */
export function computeAsiContext(args: {
  species: SpeciesResult | null;
  background: BackgroundResult | null;
  srdVersion: SrdVersion;
  customizeOrigin: boolean;
}): AsiContext {
  const { species, background, srdVersion, customizeOrigin } = args;
  const is2024 = srdVersion === 'SRD_2.0';

  // 2024: background is the canonical ASI source. Falls through to
  // 'none' if no background is picked yet (early wizard step).
  if (is2024) {
    if (!background) {
      return {
        mode: 'none',
        totalPoints: 0,
        allowedAbilities: [],
        sourceLabel: 'Pick a background to assign ability score increases.',
        fixedBonuses: [],
        fixedChoices: [],
      };
    }
    const totalPoints = 3; // 2024 background grants +2/+1 = 3 points
    if (customizeOrigin) {
      return {
        mode: 'background-custom-origin',
        totalPoints,
        allowedAbilities: SIX_ABILITIES,
        sourceLabel: `Custom Origin: assign +2/+1 (or +1/+1/+1) from your ${background.name} background to any abilities.`,
        fixedBonuses: [],
        fixedChoices: [],
      };
    }
    return {
      mode: 'background-fixed',
      totalPoints,
      allowedAbilities: background.abilityScoreOptions ?? [],
      sourceLabel: `Your ${background.name} background grants +2/+1 across these abilities.`,
      fixedBonuses: [],
      fixedChoices: [],
    };
  }

  // 5.1: species is the ASI source.
  if (!species) {
    return {
      mode: 'none',
      totalPoints: 0,
      allowedAbilities: [],
      sourceLabel: 'Pick a species to assign ability score increases.',
      fixedBonuses: [],
      fixedChoices: [],
    };
  }
  const fixed = species.abilityScoreIncreases ?? [];
  const choices = species.abilityScoreChoices ?? [];

  // Compute the total "budget" — sum of fixed amounts + sum of choice
  // (count × amount). When CYO is on, the player can reassign this
  // total across any abilities. When CYO is off, fixed bonuses land
  // as written and choice clauses surface as targeted pickers.
  const totalPoints = fixed.reduce((s, a) => s + a.amount, 0)
    + choices.reduce((s, c) => s + c.count * c.amount, 0);

  if (totalPoints === 0) {
    // No-ASI species under 5.1 (rare — most have something). Surface
    // a CYO allocator as a fallback so the player at least gets the
    // Tasha's bump when the rule is on.
    if (customizeOrigin) {
      return {
        mode: 'species-custom-origin',
        totalPoints: 3,
        allowedAbilities: SIX_ABILITIES,
        sourceLabel: `Custom Origin: assign +2/+1 (or +1/+1/+1) to any abilities.`,
        fixedBonuses: [],
        fixedChoices: [],
      };
    }
    return {
      mode: 'none',
      totalPoints: 0,
      allowedAbilities: [],
      sourceLabel: `${species.name} grants no ability score increases.`,
      fixedBonuses: [],
      fixedChoices: [],
    };
  }

  if (customizeOrigin) {
    return {
      mode: 'species-custom-origin',
      totalPoints,
      allowedAbilities: SIX_ABILITIES,
      sourceLabel: `Custom Origin: your ${species.name} ASI budget (${describeBudget(fixed, choices)}) reassigns to any abilities.`,
      fixedBonuses: [],
      fixedChoices: [],
    };
  }

  return {
    mode: 'species-fixed',
    totalPoints,
    allowedAbilities: SIX_ABILITIES,
    sourceLabel: `${species.name} grants ${describeBudget(fixed, choices)}.`,
    fixedBonuses: fixed,
    fixedChoices: choices,
  };
}

/**
 * Apply the ASI context to a set of raw scores, returning the final
 * scores the wizard writes to the character. Pulls fixed bonuses from
 * the context directly, then layers in the player's allocator picks
 * (stored in `speciesAbilityChoices` on the draft for both species
 * and background sources — the field is overloaded).
 */
export function applyAsiContext(
  context: AsiContext,
  rawScores: Dnd5eAbilityScores,
  allocatorPicks: Record<string, number>,
): Dnd5eAbilityScores {
  const out = { ...rawScores };
  // species-fixed: fixed bonuses + choice clauses (Half-Elf-style)
  if (context.mode === 'species-fixed') {
    for (const a of context.fixedBonuses) {
      const key = a.ability.toLowerCase() as keyof Dnd5eAbilityScores;
      out[key] = (out[key] ?? 10) + a.amount;
    }
    // Player picks for the choice clauses route through `allocatorPicks`
    // as well — they share the same draft field.
    for (const [ability, amount] of Object.entries(allocatorPicks)) {
      const key = ability.toLowerCase() as keyof Dnd5eAbilityScores;
      out[key] = (out[key] ?? 10) + amount;
    }
    return out;
  }
  // All player-allocated modes: just sum the picks. Whatever totals
  // the player allocated in the wizard get applied as-is.
  if (
    context.mode === 'species-custom-origin'
    || context.mode === 'background-custom-origin'
    || context.mode === 'background-fixed'
  ) {
    for (const [ability, amount] of Object.entries(allocatorPicks)) {
      const key = ability.toLowerCase() as keyof Dnd5eAbilityScores;
      out[key] = (out[key] ?? 10) + amount;
    }
    return out;
  }
  // 'none' — no bonuses.
  return out;
}

/** Validate that the player has fully allocated the context's budget.
 *  Used to gate the Continue button on the Ability Scores step. */
export function asiContextComplete(
  context: AsiContext,
  allocatorPicks: Record<string, number>,
): boolean {
  if (context.mode === 'none') return true;
  if (context.mode === 'species-fixed') {
    // Fixed bonuses auto-apply; only the choice clauses need
    // confirmation. Sum allocatorPicks should match the total of all
    // choice clauses' count × amount.
    const choiceTotal = context.fixedChoices
      .reduce((s, c) => s + c.count * c.amount, 0);
    if (choiceTotal === 0) return true;
    const allocated = Object.values(allocatorPicks).reduce((s, v) => s + v, 0);
    return allocated >= choiceTotal;
  }
  const allocated = Object.values(allocatorPicks).reduce((s, v) => s + v, 0);
  return allocated >= context.totalPoints;
}

/** Human-readable description of a species' ASI budget (e.g.
 *  "+2 DEX, +1 INT" or "+2 CHA, +1 to two abilities"). Used in the
 *  source label so the player can see what they're working with. */
function describeBudget(
  fixed: Array<{ ability: string; amount: number }>,
  choices: Array<{ count: number; amount: number; from: string[] }>,
): string {
  const short: Record<string, string> = {
    strength: 'STR', dexterity: 'DEX', constitution: 'CON',
    intelligence: 'INT', wisdom: 'WIS', charisma: 'CHA',
  };
  const fixedParts = fixed.map((a) =>
    `+${a.amount} ${short[a.ability.toLowerCase()] ?? a.ability.toUpperCase()}`,
  );
  const choiceParts = choices.map((c) =>
    `+${c.amount} to ${c.count} ${c.from.length === 6 ? 'of your choice' : 'other abilities'}`,
  );
  return [...fixedParts, ...choiceParts].join(', ');
}
