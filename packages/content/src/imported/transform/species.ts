// Transform a 5e.tools races payload into our SpeciesResult shape.
//
// 5e.tools splits across two top-level arrays:
//   - `race`    — base races (Dwarf, Elf, Human, Aasimar, …)
//   - `subrace` — variant lineages (Hill Dwarf, High Elf, Fallen Aasimar)
//                 with `raceName` / `raceSource` pointers up to a base
//
// Both flow into a single SpeciesResult[]. Subraces become standalone
// species entries named "<Race> (<Subrace>)", matching how the SRD 5.1
// bundle ships High Elf / Hill Dwarf / Lightfoot etc. as their own
// selectable species. We don't merge subrace traits with parent traits —
// each subrace's own `entries` block becomes its trait list, with
// size/speed defaulting to Medium / 30 ft when the subrace doesn't
// declare them (mirrors the SRD bundle's posture).
//
// Skipped in v1:
//   - `_copy` entries (third-party variant references; resolving them
//     needs base lookups + _mod patching)
//   - `_versions` (inline race variants like Aasimar's three lineages
//     under the 2024 schema; resolving requires patch logic too)
//
// Ability score increases:
//   - 2014 races declare `ability: [{con: 2}, {wis: 1}]` (fixed bonuses).
//     Map to `abilityScoreIncreases: [{ability, amount}, ...]`.
//   - 2014 variant-human-style races declare a `choose` clause —
//     `ability: [{ choose: { from: ['str','dex',...], count: 2, amount: 1 } }]`.
//     Map to `abilityScoreChoices: [{count, amount, from}]` so the
//     wizard's Ability Scores step can surface a picker. Combined
//     with fixed bonuses on the same entry (Half-Elf: +2 CHA fixed +
//     two non-CHA at +1).
//   - 2024 races omit `ability` entirely (ASIs moved to backgrounds).
//     Both arrays end up empty, matching the SRD 2.0 bundle.

import type { SpeciesResult, ImportSource } from '@vaultstone/types';
import { entriesToText, slugify, sourceLongName, type RawEntry, type RawEntryObject } from './entries';

// ── Source-side type sketches ─────────────────────────────────────────────

type RawRace = {
  name: string;
  source: string;
  page?: number;
  /** Letter codes — "S" / "M" / "L". Often a single-element array. */
  size?: string[];
  /** 2014: bare number. 2024: object with walk/fly/swim keys. */
  speed?: number | { walk?: number; fly?: number; swim?: number; climb?: number };
  /** 2014 fixed bonuses. 2024 races omit entirely. */
  ability?: Array<Record<string, number | { from?: string[]; count?: number }>>;
  entries?: RawEntry[];
  _copy?: { name?: string; source?: string };
  _versions?: unknown[];
  [key: string]: unknown;
};

type RawSubrace = RawRace & {
  raceName?: string;
  raceSource?: string;
};

export type RawRacesFile = {
  race?: RawRace[];
  subrace?: RawSubrace[];
  [key: string]: unknown;
};

// ── Public transform ──────────────────────────────────────────────────────

export type TransformOptions = {
  systemId: string;
  sourceLabel?: string;
};

/**
 * Transform a parsed 5e.tools races payload into SpeciesResult[]. Reads
 * both `race` and `subrace` arrays when present. Subraces become
 * standalone species named "<Race> (<Subrace>)".
 */
export function transformSpecies(
  raw: RawRacesFile,
  opts: TransformOptions,
): SpeciesResult[] {
  const { systemId } = opts;
  const out: SpeciesResult[] = [];

  for (const r of raw.race ?? []) {
    if (r._copy) continue;
    out.push(buildSpecies(r, r.name, systemId));
  }

  for (const sr of raw.subrace ?? []) {
    if (sr._copy) continue;
    if (!sr.name) continue; // anonymous lineage entries — skip
    const displayName = sr.raceName ? `${sr.raceName} (${sr.name})` : sr.name;
    out.push(buildSpecies(sr, displayName, systemId));
  }

  return out;
}

// ── Internals ─────────────────────────────────────────────────────────────

/**
 * Build a SpeciesResult from one 5e.tools race or subrace entry, given
 * its display name (which differs for subraces — they get parenthesized
 * lineage form). The remaining fields come straight off the entry.
 */
function buildSpecies(
  r: RawRace,
  displayName: string,
  systemId: string,
): SpeciesResult {
  const importSource: ImportSource = {
    code: r.source,
    name: sourceLongName(r.source),
    page: r.page,
  };
  const { description, traits } = splitEntries(r.entries ?? []);
  const { fixed, choices } = extractAbilityScoreData(r.ability);
  return {
    key: `imported_${systemId}_species_${slugify(r.source)}_${slugify(displayName)}`,
    name: displayName,
    type: 'species',
    tier: 'imported',
    system: systemId,
    description,
    importSource,
    data: {},
    size: extractSize(r.size),
    speed: extractSpeed(r.speed),
    traits,
    abilityScoreIncreases: fixed,
    ...(choices.length > 0 ? { abilityScoreChoices: choices } : {}),
    srdVersions: [],
  };
}

const SIZE_BY_CODE: Record<string, SpeciesResult['size']> = {
  S: 'Small',
  M: 'Medium',
  L: 'Large',
};

/**
 * Pick the first size code from the race's size array and map to our
 * union. Defaults to Medium when missing — matches the SRD bundle's
 * default for subraces that don't redeclare size.
 */
function extractSize(size: string[] | undefined): SpeciesResult['size'] {
  if (!size || size.length === 0) return 'Medium';
  const first = size[0]?.toUpperCase();
  return SIZE_BY_CODE[first] ?? 'Medium';
}

/**
 * Walking speed in feet. 2014 races use a bare number; 2024 races use
 * an object whose `walk` key holds the value. Falls back to 30 (the
 * baseline in both editions) when no speed is declared — matches how
 * SRD 5.1 subraces ship.
 */
function extractSpeed(speed: RawRace['speed']): number {
  if (typeof speed === 'number') return speed;
  if (speed && typeof speed === 'object' && typeof speed.walk === 'number') {
    return speed.walk;
  }
  return 30;
}

const ABILITY_FULL_NAME: Record<string, string> = {
  str: 'strength',
  dex: 'dexterity',
  con: 'constitution',
  int: 'intelligence',
  wis: 'wisdom',
  cha: 'charisma',
};

type ExtractedAbility = {
  fixed: SpeciesResult['abilityScoreIncreases'];
  choices: NonNullable<SpeciesResult['abilityScoreChoices']>;
};

/**
 * Split a 5e.tools `ability` payload into the two SpeciesResult fields.
 *
 * Fixed bonuses: `{ con: 2 }` / `{ wis: 1 }` keys → `abilityScoreIncreases`.
 *
 * Choice clauses: `{ choose: { from, count, amount } }` → `abilityScoreChoices`.
 * 5e.tools sometimes ships `count` and/or `amount` missing — defaults are
 * count = 1, amount = 1 (matches the Variant Human pattern). The Half-Elf
 * pattern is a SHORT `from` list (5 non-CHA abilities) with count = 2,
 * amount = 1; we just pass the structure through.
 *
 * 2024 races omit `ability` entirely and end up with empty arrays.
 */
function extractAbilityScoreData(ability: RawRace['ability']): ExtractedAbility {
  if (!ability || ability.length === 0) return { fixed: [], choices: [] };
  const fixed: ExtractedAbility['fixed'] = [];
  const choices: ExtractedAbility['choices'] = [];
  for (const group of ability) {
    for (const [key, value] of Object.entries(group)) {
      if (key.toLowerCase() === 'choose') {
        // Choose object — pull from / count / amount with defaults.
        if (!value || typeof value !== 'object') continue;
        const choose = value as { from?: string[]; count?: number; amount?: number };
        const from = (choose.from ?? [])
          .map((c) => ABILITY_FULL_NAME[c.toLowerCase()])
          .filter((c): c is string => !!c);
        if (from.length === 0) continue;
        choices.push({
          count: choose.count ?? 1,
          amount: choose.amount ?? 1,
          from,
        });
        continue;
      }
      if (typeof value !== 'number') continue;
      const ab = ABILITY_FULL_NAME[key.toLowerCase()];
      if (!ab) continue;
      fixed.push({ ability: ab, amount: value });
    }
  }
  return { fixed, choices };
}

/**
 * Split a race's `entries` into description (lead strings) + traits
 * (one per named sub-block). Mirrors the feat transform's split, since
 * 5e.tools uses the same `{type: 'entries', name, entries}` named-block
 * convention for race traits.
 *
 * Strings before the first named block become the description; named
 * blocks become trait entries. Strings *after* a named block (rare —
 * usually editorial) are appended to the most recent trait so the prose
 * isn't lost.
 */
function splitEntries(entries: RawEntry[]): {
  description: string;
  traits: SpeciesResult['traits'];
} {
  if (entries.length === 0) return { description: '', traits: [] };

  const traits: SpeciesResult['traits'] = [];
  const leadParts: string[] = [];
  let seenNamedBlock = false;

  for (const e of entries) {
    if (typeof e === 'string') {
      if (!seenNamedBlock) {
        leadParts.push(e);
      } else if (traits.length > 0) {
        traits[traits.length - 1].description += `\n\n${entriesToText([e])}`;
      } else {
        leadParts.push(e);
      }
      continue;
    }
    const obj = e as RawEntryObject;
    if (obj.name && (obj.type === 'entries' || obj.type === undefined)) {
      seenNamedBlock = true;
      traits.push({
        name: obj.name,
        description: entriesToText(obj.entries ?? []).trim(),
      });
      continue;
    }
    // Lists, tables, unnamed nested entries — render and append to the
    // current trait (or the lead if we haven't started traits yet).
    const rendered = entriesToText([e]);
    if (seenNamedBlock && traits.length > 0) {
      traits[traits.length - 1].description += `\n\n${rendered}`;
    } else {
      leadParts.push(rendered);
    }
  }

  return {
    description: leadParts.join('\n\n').trim(),
    traits,
  };
}
