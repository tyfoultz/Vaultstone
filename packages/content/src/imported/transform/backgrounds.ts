// Transform a 5e.tools backgrounds payload (top-level `background` array)
// into our BackgroundResult shape.
//
// 5e.tools background quirks:
// - `skillProficiencies` is `[{ skill: true, ... }]` — array of objects
//   keyed by lowercased skill names. We collapse the first entry to a
//   string array of Title-Case skill names (matches SRD output).
// - `toolProficiencies` has multiple shapes: named tools, "anyArtisansTool"
//   wildcards, and `choose: { from: [...] }` lists. Our schema only carries
//   one `toolProficiency` string, so we pick the first concrete tool name
//   when present, fall back to a "Choose one of: …" stringification for
//   choose lists, and "Any artisan's tools" for the wildcard form.
// - `languageProficiencies` only appears on 2014-era backgrounds; 2024
//   moved language grants out of backgrounds entirely. We sum the count
//   into `languages` (number).
// - `feats` is `[{ "feat name|source": true }]` — the 2024 origin-feat
//   convention. We parse the key, strip the source suffix, and store
//   the human-readable name in `originFeat`.
// - `ability` carries the 2024 +2/+1 distribution as
//   `[{ choose: { weighted: { from: [...] } } }, ...]`. We unwrap to a
//   string array of full ability names ("intelligence", "wisdom", …)
//   matching the SRD shape.
// - `_copy`-style variant backgrounds (BGDIA Baldur's Gate variants) are
//   skipped in v1 — resolving them needs a base lookup; the import
//   doesn't crash, but those entries don't import.

import type { BackgroundResult, ImportSource } from '@vaultstone/types';
import { entriesToText, slugify, sourceLongName, type RawEntry } from './entries';

// ── Source-side type sketches ─────────────────────────────────────────────

type RawBackground = {
  name: string;
  source: string;
  page?: number;
  skillProficiencies?: Array<Record<string, unknown>>;
  toolProficiencies?: Array<Record<string, unknown>>;
  languageProficiencies?: Array<Record<string, unknown>>;
  feats?: Array<Record<string, unknown>>;
  ability?: RawAbilityChoice[];
  entries?: RawEntry[];
  /** Copies reference a base entry; we skip these in v1. */
  _copy?: { name?: string; source?: string };
  [key: string]: unknown;
};

type RawAbilityChoice = {
  choose?: {
    from?: string[];
    weighted?: { from?: string[] };
  };
  [key: string]: unknown;
};

export type RawBackgroundsFile = {
  background?: RawBackground[];
  [key: string]: unknown;
};

// ── Public transform ──────────────────────────────────────────────────────

export type TransformOptions = {
  systemId: string;
  sourceLabel?: string;
};

/**
 * Transform a parsed 5e.tools backgrounds-file payload into BackgroundResult[].
 * Skips `_copy` variant entries — resolving them requires walking the base
 * background graph, which is a follow-up.
 */
export function transformBackgrounds(
  raw: RawBackgroundsFile,
  opts: TransformOptions,
): BackgroundResult[] {
  const { systemId } = opts;
  const backgrounds = raw.background ?? [];

  return backgrounds
    .filter((b) => !b._copy) // skip variants for v1
    .map((b) => {
      const importSource: ImportSource = {
        code: b.source,
        name: sourceLongName(b.source),
        page: b.page,
      };
      return {
        key: `imported_${systemId}_background_${slugify(b.source)}_${slugify(b.name)}`,
        name: b.name,
        type: 'background',
        tier: 'imported',
        system: systemId,
        description: entriesToText(b.entries ?? []).trim(),
        importSource,
        data: {},
        skillProficiencies: extractSkills(b.skillProficiencies),
        toolProficiency: extractToolProficiency(b.toolProficiencies),
        languages: extractLanguageCount(b.languageProficiencies),
        abilityScoreOptions: extractAbilityOptions(b.ability),
        originFeat: extractOriginFeat(b.feats),
        srdVersions: [],
      };
    });
}

// ── Internals ─────────────────────────────────────────────────────────────

const SKILL_DISPLAY: Record<string, string> = {
  acrobatics: 'Acrobatics',
  'animal handling': 'Animal Handling',
  arcana: 'Arcana',
  athletics: 'Athletics',
  deception: 'Deception',
  history: 'History',
  insight: 'Insight',
  intimidation: 'Intimidation',
  investigation: 'Investigation',
  medicine: 'Medicine',
  nature: 'Nature',
  perception: 'Perception',
  performance: 'Performance',
  persuasion: 'Persuasion',
  religion: 'Religion',
  'sleight of hand': 'Sleight of Hand',
  stealth: 'Stealth',
  survival: 'Survival',
};

/**
 * Pull skill names from a 5e.tools skillProficiencies array. Each entry is
 * `{ insight: true, religion: true }`-style; multiple entries (rare) get
 * flattened. Unknown keys (chooser objects, "any" wildcards) are dropped
 * for v1 — the schema can't represent them, and dropping is preferable to
 * surfacing literal "any" in the proficiency list.
 */
function extractSkills(profs: Array<Record<string, unknown>> | undefined): string[] {
  if (!profs || profs.length === 0) return [];
  const out: string[] = [];
  for (const group of profs) {
    for (const [key, value] of Object.entries(group)) {
      if (value !== true) continue;
      if (key === 'choose' || key.startsWith('any')) continue;
      const display = SKILL_DISPLAY[key.toLowerCase()] ?? titleCase(key);
      if (!out.includes(display)) out.push(display);
    }
  }
  return out;
}

/**
 * Best-effort flattening of toolProficiencies into the schema's single
 * `toolProficiency` string. When the source carries a real list (e.g. a
 * Soldier-style "choose one kind of Gaming Set") we render that as the
 * string itself; named tools are surfaced verbatim with title-casing.
 *
 * Returns null when the field is empty or only contains shapes we can't
 * compress into one slot.
 */
function extractToolProficiency(profs: Array<Record<string, unknown>> | undefined): string | null {
  if (!profs || profs.length === 0) return null;
  for (const group of profs) {
    for (const [key, value] of Object.entries(group)) {
      if (key === 'choose' && value && typeof value === 'object' && Array.isArray((value as { from?: unknown }).from)) {
        const from = (value as { from?: unknown[] }).from ?? [];
        const opts = from.map((s) => titleCase(String(s))).filter(Boolean);
        if (opts.length > 0) return `Choose one of: ${opts.join(', ')}`;
      }
      if (key === 'anyArtisansTool') return "Any artisan's tools";
      if (key === 'anyMusicalInstrument') return 'Any musical instrument';
      if (key === 'anyGamingSet') return 'Any gaming set';
      if (key === 'anyTool') return 'Any tool';
      if (value === true) return titleCase(key);
    }
  }
  return null;
}

/**
 * Sum the granted-language count across a 5e.tools languageProficiencies
 * array. Recognized counted forms: `anyStandard: N`, `any: N`,
 * `choose: { count: N }`. Returns 0 when no count is found (the 2024
 * baseline, since backgrounds no longer grant languages).
 */
function extractLanguageCount(profs: Array<Record<string, unknown>> | undefined): number {
  if (!profs || profs.length === 0) return 0;
  let total = 0;
  for (const group of profs) {
    for (const [key, value] of Object.entries(group)) {
      if ((key === 'anyStandard' || key === 'any' || key === 'anyExotic') && typeof value === 'number') {
        total += value;
        continue;
      }
      if (key === 'choose' && value && typeof value === 'object') {
        const count = (value as { count?: number }).count;
        if (typeof count === 'number') total += count;
      }
    }
  }
  return total;
}

const ABILITY_FULL_NAME: Record<string, string> = {
  str: 'strength',
  dex: 'dexterity',
  con: 'constitution',
  int: 'intelligence',
  wis: 'wisdom',
  cha: 'charisma',
};

/**
 * Extract the ability score options from the 2024 `ability` field. The
 * weighted-choose form lists the same ability set twice (once for the +2
 * bias, once for the +1) — we only need the unique set, so we read the
 * first entry's `from` array.
 */
function extractAbilityOptions(ability: RawAbilityChoice[] | undefined): string[] {
  if (!ability || ability.length === 0) return [];
  const first = ability[0];
  const from =
    first.choose?.weighted?.from ??
    first.choose?.from ??
    [];
  return from.map((code) => ABILITY_FULL_NAME[code.toLowerCase()] ?? code.toLowerCase());
}

/**
 * Pull the origin feat name out of the 2024 `feats` array. Each entry is
 * `{ "feat name|source": true }`. We strip the source suffix and
 * Title-Case the name. Returns empty string when no feat is granted
 * (matches the SRD 5.1 shape, which has no origin feats).
 */
function extractOriginFeat(feats: Array<Record<string, unknown>> | undefined): string {
  if (!feats || feats.length === 0) return '';
  for (const group of feats) {
    for (const [key, value] of Object.entries(group)) {
      if (value !== true) continue;
      // Pipe-separated key: "magic initiate; cleric|xphb" or "alert|xphb".
      const beforePipe = key.split('|')[0]?.trim() ?? key;
      if (beforePipe) return titleCase(beforePipe);
    }
  }
  return '';
}

function titleCase(s: string): string {
  return s
    .split(/[\s_-]+/)
    .map((part) => (part.length > 0 ? part.charAt(0).toUpperCase() + part.slice(1) : part))
    .join(' ');
}
