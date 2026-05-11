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

import type { BackgroundResult, ImportSource, StartingEquipmentEntry } from '@vaultstone/types';
import { entriesToText, slugify, sourceLongName, srdVersionsForSource, type RawEntry, type RawEntryObject } from './entries';

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
        description: entriesToText(stripStatLabelList(b.entries ?? [])).trim(),
        importSource,
        data: {},
        skillProficiencies: extractSkills(b.skillProficiencies),
        toolProficiency: extractToolProficiency(b.toolProficiencies),
        languages: extractLanguageCount(b.languageProficiencies),
        abilityScoreOptions: extractAbilityOptions(b.ability),
        originFeat: extractOriginFeat(b.feats),
        // Two-pass: extract the freeform string from 5e.tools entries,
        // then try to parse it into the structured shape. The parser is
        // best-effort — when it can't make sense of the prose we leave
        // the array empty and surface the original string through
        // `startingEquipmentText` for display-only fallback.
        ...(() => {
          const text = extractStartingEquipment(b.entries ?? []);
          if (!text) return { startingEquipment: [], startingEquipmentText: null };
          const parsed = parseStartingEquipment(text);
          return parsed.length > 0
            ? { startingEquipment: parsed, startingEquipmentText: text }
            : { startingEquipment: [], startingEquipmentText: text };
        })(),
        srdVersions: srdVersionsForSource(b.source),
      };
    });
}

// ── Internals ─────────────────────────────────────────────────────────────

const STAT_LABEL_PATTERN = /^(Ability Scores?|Feat|Skill Proficienc(y|ies)|Tool Proficienc(y|ies)|Languages?|Equipment)\b/i;

/**
 * Drop the leading "stat block" list that 5e.tools backgrounds put at the
 * top of their `entries` (a `list-hang-notitle` whose items are labels like
 * "Ability Scores:", "Skill Proficiencies:", "Equipment:"). That data is
 * already surfaced through the structured fields (skillProficiencies,
 * abilityScoreOptions, toolProficiency, originFeat) and the detail screen
 * renders it as discrete prof blocks — leaving it in the description body
 * doubles up the same info under different labels.
 *
 * We identify the block structurally (a `list-hang-notitle` whose items are
 * `type: 'item'` named blocks where most names match a stat-label pattern)
 * rather than by position, so non-stat lists in the same entries array
 * survive untouched.
 */
function stripStatLabelList(entries: RawEntry[]): RawEntry[] {
  return entries.filter((e) => !isStatLabelList(e));
}

function isStatLabelList(entry: RawEntry): boolean {
  if (typeof entry === 'string' || entry === null) return false;
  const e = entry as RawEntryObject;
  if (e.type !== 'list') return false;
  if (e.style !== 'list-hang-notitle') return false;
  const items = Array.isArray(e.items) ? (e.items as RawEntry[]) : [];
  if (items.length === 0) return false;
  let labeled = 0;
  for (const item of items) {
    if (typeof item === 'string' || !item) continue;
    const obj = item as RawEntryObject;
    if (obj.type !== 'item') continue;
    if (typeof obj.name === 'string' && STAT_LABEL_PATTERN.test(obj.name)) labeled++;
  }
  // Require a majority of items to look like stat labels before we strip,
  // so an unrelated `list-hang-notitle` that happens to share the style
  // doesn't get eaten.
  return labeled >= Math.ceil(items.length / 2);
}

const EQUIPMENT_LABEL = /^Equipment\b/i;

/**
 * Pull the Equipment line out of the leading stat-label list. We render
 * it as a structured field on the detail screen (alongside skills, tool,
 * origin feat) instead of leaving it in the description body, which keeps
 * imported backgrounds visually consistent with SRD 2024 entries.
 *
 * Returns the trimmed entry text (with {@tag} markup stripped via
 * entriesToText) or null when no Equipment item is present.
 */
function extractStartingEquipment(entries: RawEntry[]): string | null {
  for (const entry of entries) {
    if (!isStatLabelList(entry)) continue;
    const items = ((entry as RawEntryObject).items ?? []) as RawEntry[];
    for (const item of items) {
      if (typeof item === 'string' || !item) continue;
      const obj = item as RawEntryObject;
      if (obj.type !== 'item') continue;
      if (typeof obj.name !== 'string' || !EQUIPMENT_LABEL.test(obj.name)) continue;
      const sub: RawEntry[] = obj.entries ?? (obj.entry !== undefined ? [obj.entry] : []);
      const text = entriesToText(sub).trim();
      return text || null;
    }
  }
  return null;
}

/**
 * Best-effort parse of a freeform starting-equipment paragraph into the
 * structured shape. Returns an empty array when the input is too
 * irregular to safely break apart — caller falls back to the original
 * text under `startingEquipmentText` in that case.
 *
 * Handles the 2024-style "*Choose A or B:* (A) Foo, Bar, 8 GP; or (B)
 * 50 GP" form cleanly. The 5.1 prose form ("a holy symbol, vestments,
 * and a pouch containing 15 gp") gets a single-option parse with
 * unkeyed item names — the wizard won't auto-grant them, but the
 * structure is at least correct.
 *
 * Item names land with `name` only (no `itemKey`). Resolving names to
 * catalog keys is the wizard's job — bare names render in the sheet
 * but don't auto-populate inventory.
 *
 * Known weaknesses (acceptable for v1):
 * - "X and 2d4 × 10 gp" with no comma before "and" is treated as a
 *   single gold-bearing segment; the leading "X" is lost. The 5.1
 *   convention is "X, and Y" with the Oxford comma — that case parses
 *   correctly.
 * - Item quantities embedded in prose ("5 sticks of incense") stay
 *   inside the `name` field; no `qty` is split out.
 */
export function parseStartingEquipment(input: string): StartingEquipmentEntry[] {
  const cleaned = input
    // Strip leading "*Choose A or B:*" / "Choose one of:" prefixes.
    .replace(/^\*?\s*Choose [^:]+:\*?\s*/i, '')
    // Strip surrounding italics / bold marks.
    .replace(/[*_]+/g, '')
    .trim();
  if (!cleaned) return [];

  // 2024 form: "(A) ... ; or (B) ..." — split on the option markers.
  const optionPattern = /\(([A-Z])\)\s*/g;
  const matches = [...cleaned.matchAll(optionPattern)];
  if (matches.length >= 2) {
    const out: StartingEquipmentEntry[] = [];
    for (let i = 0; i < matches.length; i++) {
      const label = matches[i][1];
      const start = matches[i].index! + matches[i][0].length;
      const end = i + 1 < matches.length ? matches[i + 1].index! : cleaned.length;
      let segment = cleaned.slice(start, end).trim();
      // Drop trailing "; or" that connects to the next option.
      segment = segment.replace(/[;,]\s*or\s*$/i, '').trim();
      const opt = parseOptionSegment(segment);
      out.push({ label, ...opt });
    }
    return out;
  }

  // Single option — flat list.
  return [parseOptionSegment(cleaned)];
}

function parseOptionSegment(segment: string): StartingEquipmentEntry {
  // Split on commas and semicolons. The Oxford "and" before the last
  // entry is common in 5.1 prose ("X, Y, and Z") — normalize it to a
  // comma so the split picks up the last entry.
  const normalized = segment.replace(/,\s*and\s+/i, ', ');
  const segments = normalized
    .split(/[,;]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  const items: { name: string }[] = [];
  let gold: StartingEquipmentEntry['gold'] | undefined;

  for (const seg of segments) {
    const goldMatch = parseGoldSegment(seg);
    if (goldMatch) {
      gold = goldMatch;
      continue;
    }
    items.push({ name: seg });
  }

  const out: StartingEquipmentEntry = {};
  if (items.length > 0) out.items = items;
  if (gold) out.gold = gold;
  return out;
}

/**
 * Match a single segment as a gold-or-currency clause. Handles:
 *   "8 GP" / "50 gp" / "15 cp"           — fixed amount
 *   "a pouch containing 15 gp"           — prose-wrapped fixed amount
 *   "2d4 × 10 gp" / "2d4 x 10 gp"        — dice expression (5.1 style)
 * Returns undefined when the segment doesn't read as a currency clause.
 */
function parseGoldSegment(segment: string): StartingEquipmentEntry['gold'] | undefined {
  const currencyRe = /\b(cp|sp|ep|gp|pp)\b/i;
  if (!currencyRe.test(segment)) return undefined;
  const currency = segment.match(currencyRe)![1].toLowerCase() as 'cp' | 'sp' | 'ep' | 'gp' | 'pp';

  // Dice form: "2d4 × 10 gp" / "2d4 x 10 gp"
  const diceMatch = segment.match(/(\d+d\d+(?:\s*[×x]\s*\d+)?)/i);
  if (diceMatch) {
    return { dice: diceMatch[1].replace(/\s+/g, ' '), currency };
  }
  // Fixed amount.
  const amountMatch = segment.match(/(\d+)\s*(?:cp|sp|ep|gp|pp)\b/i);
  if (amountMatch) {
    return { amount: parseInt(amountMatch[1], 10), currency };
  }
  return undefined;
}


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

function titleCase(s: unknown): string {
  if (typeof s !== 'string' || !s) return '';
  return s
    .split(/[\s_-]+/)
    .map((part) => (part.length > 0 ? part.charAt(0).toUpperCase() + part.slice(1) : part))
    .join(' ');
}
