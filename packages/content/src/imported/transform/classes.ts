// Transform 5e.tools class + classFeature arrays into our ClassResult
// shape. Same overall pattern as the subclass transform — the two
// arrays live in the same source file (`class/class-fighter.json`,
// `class/class-wizard.json`, etc.); classes reference their features by
// pipe-encoded keys, which we resolve here.
//
// Pipe-encoded classFeatures string format:
//   "name | className | classSource | level | source"
// Trailing source is optional and defaults to classSource.
//
// 5e.tools class quirks worth knowing:
// - `hd: {number, faces}`  — `faces` is the die size (10 = d10).
// - `proficiency: ['str', 'con']` — saving throw proficiencies as
//   lowercase ability abbrevs.
// - `startingProficiencies` is an object with `armor`, `weapons`,
//   `tools`, and `skills` keys — `skills` is wrapped in a `choose: {from, count}`
//   structure (the choices are at character creation time).
// - `multiclassing.requirements.or[]` lists alternative ability-score
//   gates, e.g. `[{str: 13, dex: 13}]` for Fighter (str 13 OR dex 13).
// - `casterProgression: 'full' | 'half' | '1/3' | 'pact' | 'artificer'`
//   marks spellcasters; the absence of this field plus no
//   spellcastingAbility means non-caster.
// - `classTableGroups[]` is the source of the per-level progression
//   table. Each group is one column or column cluster; expanded into
//   our flat progressionColumns + progressionTable shape.
// - `gainSubclassFeature: true` markers in classFeatures indicate the
//   subclass-feature-level slot (e.g. Fighter level 3, 7, 10, 15, 18).
//   We skip those entries from the feature list — they're not real
//   features — and use them to derive subclassUnlockLevel.
//
// Skipped in v1:
//   - `_copy` class entries.
//   - `optionalfeatureProgression` (referenceable optional features
//     like Fighting Style; resolving requires walking optionalfeatures
//     in a separate file).
//   - `subclass` and `subclassFeature` arrays — those go through the
//     existing subclass transform when both content kinds are imported
//     from the same file (the user's import flow runs every applicable
//     transform).
//   - `classTableGroups[].rowsSpellProgression` columns are flattened
//     to slot counts per spell level; if the source file used numeric
//     0s for empty cells, we surface them as '—' so the table reads
//     cleanly in the UI.

import type { ClassResult, ImportSource } from '@vaultstone/types';
import { entriesToText, slugify, sourceLongName, type RawEntry } from './entries';

// ── Source-side type sketches ─────────────────────────────────────────────

type RawProfList = Array<string | { name?: string }>;
type RawSkillChoiceList = Array<{ choose?: { from?: string[]; count?: number } }>;

type RawStartingProficiencies = {
  armor?: RawProfList;
  weapons?: RawProfList;
  tools?: RawProfList;
  skills?: RawSkillChoiceList;
};

type RawMulticlassRequirements = {
  or?: Array<Record<string, number>>;
} & Record<string, number | Array<Record<string, number>> | undefined>;

type RawMulticlassProficienciesGained = {
  armor?: RawProfList;
  weapons?: RawProfList;
  tools?: RawProfList;
  skills?: RawSkillChoiceList;
};

type RawClass = {
  name: string;
  source: string;
  page?: number;
  hd?: { number?: number; faces?: number };
  /** Lowercase ability-score abbreviations granting save proficiency. */
  proficiency?: string[];
  startingProficiencies?: RawStartingProficiencies;
  startingEquipment?: {
    default?: string[];
    goldAlternative?: string;
    additionalFromBackground?: boolean;
  };
  multiclassing?: {
    requirements?: RawMulticlassRequirements;
    proficienciesGained?: RawMulticlassProficienciesGained;
  };
  spellcastingAbility?: string;
  casterProgression?: string;
  classFeatures?: Array<string | { classFeature?: string; gainSubclassFeature?: boolean }>;
  classTableGroups?: RawClassTableGroup[];
  _copy?: { name?: string; source?: string };
};

type RawClassTableGroup = {
  title?: string;
  colLabels?: string[];
  /** Plain row data — array of cells per level. */
  rows?: Array<Array<string | number>>;
  /** Spell-slot row data — array of slot counts per spell level (1-9). */
  rowsSpellProgression?: number[][];
};

type RawClassFeature = {
  name: string;
  source: string;
  className: string;
  classSource?: string;
  level: number;
  page?: number;
  entries?: RawEntry[];
};

// Note: 5e.tools class files share their top level with the subclasses
// transform input (both read the same `class/class-fighter.json` etc.).
// We expose this as `RawClassesFile` rather than re-exporting another
// `RawClassFile` so consumers don't see two types fighting over the
// same name from the package barrel.
export type RawClassesFile = {
  class?: RawClass[];
  classFeature?: RawClassFeature[];
  [key: string]: unknown;
};

// ── Public transform ──────────────────────────────────────────────────────

export type TransformOptions = {
  systemId: string;
  sourceLabel?: string;
};

/**
 * Transform a parsed 5e.tools class-file payload into ClassResult[].
 * Returns one ClassResult per `class` entry, with features resolved
 * from the sibling `classFeature` array.
 */
export function transformClasses(
  raw: RawClassesFile,
  opts: TransformOptions,
): ClassResult[] {
  const { systemId } = opts;
  const classes = raw.class ?? [];
  const features = raw.classFeature ?? [];

  // Index features by composite key for O(1) lookup.
  const featureIdx = new Map<string, RawClassFeature>();
  for (const f of features) {
    featureIdx.set(featureKey(f), f);
  }

  return classes
    .filter((c) => !c._copy)
    .map((c) => buildClass(c, featureIdx, systemId));
}

// ── Internals ─────────────────────────────────────────────────────────────

function buildClass(
  c: RawClass,
  featureIdx: Map<string, RawClassFeature>,
  systemId: string,
): ClassResult {
  const importSource: ImportSource = {
    code: c.source,
    name: sourceLongName(c.source),
    page: c.page,
  };
  const classSource = c.source;

  // Resolve every classFeatures entry to its full feature record. Keep
  // the gainSubclassFeature markers separate so we can derive the
  // unlock level without polluting the actual feature list.
  const featureRefs = c.classFeatures ?? [];
  const subclassMarkers: number[] = [];
  const resolved: RawClassFeature[] = [];
  for (const ref of featureRefs) {
    const isMarker = typeof ref === 'object' && ref.gainSubclassFeature === true;
    const r = resolveFeatureRef(ref, featureIdx, c, classSource);
    if (!r) continue;
    if (isMarker) {
      subclassMarkers.push(r.level);
    } else {
      resolved.push(r);
    }
  }

  const features: ClassResult['features'] = resolved
    // The bare class-named feature is editorial intro prose — drop it
    // for parity with how the subclass transform handles its
    // self-named feature.
    .filter((f) => f.name.toLowerCase() !== c.name.toLowerCase())
    .map((f) => ({
      level: f.level,
      name: f.name,
      description: entriesToText(f.entries ?? []).trim(),
    }));

  const subclassUnlockLevel = subclassMarkers.length > 0
    ? Math.min(...subclassMarkers)
    : 3; // 2024 default; classes that unlock earlier should declare it via marker

  const { columns, table } = buildProgression(c.classTableGroups);
  const startingEquipment = buildStartingEquipment(c.startingEquipment);
  const multiclassPrerequisite = formatMulticlassRequirements(c.multiclassing?.requirements);
  const multiclassProficiencies = buildMulticlassProficiencies(c.multiclassing?.proficienciesGained);

  const sp = c.startingProficiencies;
  return {
    key: `imported_${systemId}_class_${slugify(c.source)}_${slugify(c.name)}`,
    name: c.name,
    type: 'class',
    tier: 'imported',
    system: systemId,
    description: '',
    importSource,
    data: {},
    hitDie: c.hd?.faces ?? 8,
    primaryAbility: [],
    savingThrows: (c.proficiency ?? []).map(abilityFullName),
    armorProficiencies: flattenStringList(sp?.armor),
    weaponProficiencies: flattenStringList(sp?.weapons),
    toolProficiencies: sp?.tools && sp.tools.length > 0 ? flattenStringList(sp.tools) : undefined,
    skillChoices: extractSkillChoices(sp?.skills),
    spellcasting: !!c.casterProgression || !!c.spellcastingAbility,
    spellcastingAbility: c.spellcastingAbility ? abilityFullName(c.spellcastingAbility) : null,
    subclassUnlockLevel,
    features,
    progressionColumns: columns.length > 0 ? columns : undefined,
    progressionTable: table.length > 0 ? table : undefined,
    startingEquipment: startingEquipment.length > 0 ? startingEquipment : undefined,
    multiclassPrerequisite,
    multiclassProficiencies,
    srdVersions: [],
  };
}

function resolveFeatureRef(
  ref: string | { classFeature?: string },
  idx: Map<string, RawClassFeature>,
  parent: RawClass,
  classSource: string,
): RawClassFeature | null {
  const raw = typeof ref === 'string' ? ref : ref.classFeature;
  if (!raw) return null;
  const parts = raw.split('|').map((p) => p.trim());
  // Pipe format: "name | className | classSource | level | source"
  // Empty fields inherit from parent class.
  const name        = parts[0];
  const className   = parts[1] || parent.name;
  const cSource     = parts[2] || classSource;
  const level       = parts[3] ? parseInt(parts[3], 10) : 0;
  const source      = parts[4] || cSource;
  return idx.get(featureKeyParts(name, className, cSource, level, source)) ?? null;
}

function featureKey(f: RawClassFeature): string {
  return featureKeyParts(f.name, f.className, f.classSource ?? 'PHB', f.level, f.source);
}

function featureKeyParts(
  name: string, className: string, classSource: string, level: number, source: string,
): string {
  return [name, className, classSource, level, source]
    .map((s) => String(s).toLowerCase())
    .join('|');
}

const ABILITY_FULL_NAME: Record<string, string> = {
  str: 'Strength',
  dex: 'Dexterity',
  con: 'Constitution',
  int: 'Intelligence',
  wis: 'Wisdom',
  cha: 'Charisma',
};

function abilityFullName(code: string): string {
  return ABILITY_FULL_NAME[code.toLowerCase()] ?? code;
}

/**
 * 5e.tools proficiency lists hold either bare strings ("light",
 * "martial") or objects with a `name` property. Both flatten to a
 * single string array. We Title Case the bare codes so output reads
 * "Light" / "Martial weapons", matching the SRD bundle's shape.
 */
function flattenStringList(
  list: Array<string | { name?: string }> | undefined,
): string[] {
  if (!list) return [];
  const out: string[] = [];
  for (const entry of list) {
    if (typeof entry === 'string') {
      out.push(titleCase(entry));
    } else if (entry?.name) {
      out.push(entry.name);
    }
  }
  return out;
}

function extractSkillChoices(
  skills: RawSkillChoiceList | undefined,
): ClassResult['skillChoices'] {
  if (!skills || skills.length === 0) return { count: 0, from: [] };
  const first = skills[0];
  const choose = first?.choose;
  if (!choose) return { count: 0, from: [] };
  return {
    count: choose.count ?? 0,
    from: (choose.from ?? []).map(titleCase),
  };
}

/**
 * Build progressionColumns + progressionTable from 5e.tools'
 * classTableGroups. Each group either ships flat row data or
 * `rowsSpellProgression` (per-level spell-slot arrays). For spell
 * progression rows we emit one column per spell level (1st-9th) keyed
 * 'spell1'..'spell9'; zero counts render as '—' so the UI reads
 * cleanly. Inline filter markup ("{@filter Cantrips Known|...}") in
 * column labels is stripped via entriesToText.
 *
 * Returns levels 1-20; rows that the source omits are filled with '—'
 * so each level has a complete value set.
 */
function buildProgression(groups: RawClassTableGroup[] | undefined): {
  columns: NonNullable<ClassResult['progressionColumns']>;
  table: NonNullable<ClassResult['progressionTable']>;
} {
  if (!groups || groups.length === 0) return { columns: [], table: [] };

  const columns: NonNullable<ClassResult['progressionColumns']> = [];
  // valuesByLevel[level][colKey] = cell value; built up across all groups.
  const valuesByLevel: Record<number, Record<string, string | number>> = {};
  for (let lvl = 1; lvl <= 20; lvl++) valuesByLevel[lvl] = {};

  let plainColIdx = 0;
  for (const group of groups) {
    if (Array.isArray(group.rowsSpellProgression)) {
      // Spell-slot block: one column per spell level (1-9).
      const levelCount = group.rowsSpellProgression[0]?.length ?? 9;
      for (let i = 0; i < levelCount; i++) {
        columns.push({ key: `spell${i + 1}`, label: `${ordinal(i + 1)} Slots` });
      }
      group.rowsSpellProgression.forEach((row, idx) => {
        const lvl = idx + 1;
        if (lvl > 20) return;
        row.forEach((slots, i) => {
          valuesByLevel[lvl][`spell${i + 1}`] = slots > 0 ? slots : '—';
        });
      });
    } else if (Array.isArray(group.rows)) {
      // Plain rows: one column per colLabel; key by index across the file.
      const labels = group.colLabels ?? [];
      const colKeys = labels.map((label, i) => {
        const k = `col${plainColIdx + i}`;
        columns.push({ key: k, label: stripInlineMarkup(label) });
        return k;
      });
      plainColIdx += labels.length;
      group.rows.forEach((row, idx) => {
        const lvl = idx + 1;
        if (lvl > 20) return;
        row.forEach((cell, i) => {
          if (i < colKeys.length) {
            valuesByLevel[lvl][colKeys[i]] = typeof cell === 'string' ? stripInlineMarkup(cell) : cell;
          }
        });
      });
    }
  }

  // Materialize the flat table. Levels missing any column get '—' for
  // those slots so each row is complete.
  const table: NonNullable<ClassResult['progressionTable']> = [];
  for (let lvl = 1; lvl <= 20; lvl++) {
    const values: Record<string, string | number> = {};
    for (const col of columns) {
      values[col.key] = valuesByLevel[lvl][col.key] ?? '—';
    }
    table.push({ level: lvl, values });
  }
  return { columns, table };
}

/**
 * 5e.tools `default[]` is a flat list of equipment-line strings, often
 * with embedded `(a) … or (b) …` choice prose. Our schema expects an
 * array of options where each carries either an `items[]` list or a
 * `gold` alternative. We collapse: the whole `default[]` becomes one
 * option (label "A") with the strings flattened by stripInlineMarkup;
 * `goldAlternative` (a dice expression) becomes a second option with
 * its prose in `label`. Real choice expansion is a follow-up.
 */
function buildStartingEquipment(
  se: RawClass['startingEquipment'],
): NonNullable<ClassResult['startingEquipment']> {
  if (!se) return [];
  const out: NonNullable<ClassResult['startingEquipment']> = [];
  if (Array.isArray(se.default) && se.default.length > 0) {
    out.push({
      label: 'A',
      items: se.default.map(stripInlineMarkup),
    });
  }
  if (typeof se.goldAlternative === 'string' && se.goldAlternative.trim()) {
    out.push({ label: `B: ${stripInlineMarkup(se.goldAlternative)}` });
  }
  return out;
}

/**
 * Flatten 5e.tools multiclassing.requirements into a free-text string
 * matching the SRD shape ("Strength 13" / "Strength 13 or Dexterity 13").
 * The `or[]` form lists alternative score sets — within a set, all
 * scores are AND'd; across sets, OR'd. Returns undefined when no
 * requirement is declared.
 */
function formatMulticlassRequirements(
  requirements: RawMulticlassRequirements | undefined,
): ClassResult['multiclassPrerequisite'] {
  if (!requirements) return undefined;
  const groups: Array<Record<string, number>> = Array.isArray(requirements.or)
    ? requirements.or
    : [stripOrFromRequirements(requirements)];
  const formatted = groups
    .map((g) => formatRequirementGroup(g))
    .filter(Boolean);
  if (formatted.length === 0) return undefined;
  return formatted.join(' or ');
}

/** Drop the `or` field from a requirements object, leaving the bare scores. */
function stripOrFromRequirements(
  req: Record<string, unknown> | undefined,
): Record<string, number> {
  if (!req) return {};
  const out: Record<string, number> = {};
  for (const [key, value] of Object.entries(req)) {
    if (key === 'or') continue;
    if (typeof value === 'number') out[key] = value;
  }
  return out;
}

function formatRequirementGroup(group: Record<string, number>): string {
  return Object.entries(group)
    .map(([ab, score]) => `${abilityFullName(ab)} ${score}`)
    .join(', ');
}

function buildMulticlassProficiencies(
  gained: RawMulticlassProficienciesGained | undefined,
): ClassResult['multiclassProficiencies'] {
  if (!gained) return undefined;
  const out: NonNullable<ClassResult['multiclassProficiencies']> = {};
  if (Array.isArray(gained.armor)) out.armor = flattenStringList(gained.armor);
  if (Array.isArray(gained.weapons)) out.weapons = flattenStringList(gained.weapons);
  if (Array.isArray(gained.tools)) out.tools = flattenStringList(gained.tools);
  if (Array.isArray(gained.skills) && gained.skills.length > 0) {
    const choose = gained.skills[0]?.choose;
    if (choose) {
      out.skills = {
        count: choose.count ?? 0,
        from: (choose.from ?? []).map(titleCase),
      };
    }
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/**
 * Strip 5e.tools inline markup tags from a single string. We reuse the
 * shared entriesToText pipeline by wrapping in a single-element array,
 * which strips `{@spell ...}`/`{@filter ...}`/`{@dice ...}` tags via
 * stripMarkup under the hood.
 */
function stripInlineMarkup(s: string): string {
  return entriesToText([s]).trim();
}

function ordinal(n: number): string {
  if (n === 1) return '1st';
  if (n === 2) return '2nd';
  if (n === 3) return '3rd';
  return `${n}th`;
}

function titleCase(s: string): string {
  return s
    .split(/[\s_-]+/)
    .map((part) => (part.length > 0 ? part.charAt(0).toUpperCase() + part.slice(1).toLowerCase() : part))
    .join(' ');
}
