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
import { entriesToText, slugify, sourceLongName, srdVersionsForSource, type RawEntry, type RawEntryObject } from './entries';
import { stripMarkup } from './markup';

// ── Source-side type sketches ─────────────────────────────────────────────

type RawProfList = Array<string | { name?: string }>;
type RawSkillChoiceList = Array<{
  choose?: { from?: string[]; count?: number };
  /** 5e.tools 2024 shape: "choose N from any skill" with no explicit
   *  list. XPHB Bard ships `{any: 3}`. */
  any?: number;
}>;

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
  /** Subclass-feature heading per class — "Primal Path" (Barbarian),
   *  "Druid Circle" (Druid), "Sacred Oath" (Paladin), etc. Used to
   *  detect placeholder "<subclassTitle> feature" rows the source
   *  ships at subclass-feature levels (L6/L10/L14 typically). */
  subclassTitle?: string;
  /** 5e.tools 2024 ships primary ability as an array of `{ <abilityCode>: true }`
   *  objects (e.g. Barbarian → `[{str: true}]`, Ranger → `[{dex: true, wis: true}]`).
   *  Each element is one ability; multiple keys inside one element AND
   *  together; multiple elements OR together. 5.1 SRD doesn't ship this
   *  field — primary ability for SRD comes from the proficiencies feature
   *  prose. */
  primaryAbility?: Array<Record<string, boolean>>;
  startingProficiencies?: RawStartingProficiencies;
  startingEquipment?: {
    /** 5.1 SRD shape: pre-flattened option-A items (string per line). */
    default?: string[];
    /** 5.1 SRD shape: free-text alt currency option ("Or 75 gp"). */
    goldAlternative?: string;
    additionalFromBackground?: boolean;
    /** 2024 XPHB shape: pre-rendered prose lines like
     *  "{@i Choose A or B:} (A) {@item Greataxe|XPHB}, 4 {@item Handaxe…},
     *  and 15 GP; or (B) 75 GP". When present, used as the rendered
     *  source — strip markup, split on the "; or " separator into
     *  per-option entries. */
    entries?: string[];
  };
  multiclassing?: {
    requirements?: RawMulticlassRequirements;
    /** 5e.tools 2024 ships some prereqs as free-text overrides (e.g.
     *  Barbarian XPHB: `"Strength 13"`). Used when the structured
     *  `requirements` object is absent. */
    requirementsSpecial?: string;
    proficienciesGained?: RawMulticlassProficienciesGained;
  };
  spellcastingAbility?: string;
  casterProgression?: string;
  classFeatures?: Array<string | { classFeature?: string; gainSubclassFeature?: boolean }>;
  classTableGroups?: RawClassTableGroup[];
  _copy?: { name?: string; source?: string };
};

export type RawClassTableGroup = {
  title?: string;
  colLabels?: string[];
  /** Plain row data — array of cells per level. Cells may be strings,
   *  numbers, or 5e.tools-typed objects (e.g. dice, bonuses) which need
   *  rendering through `formatCell`. */
  rows?: Array<Array<RawCell>>;
  /** Spell-slot row data — array of slot counts per spell level (1-9). */
  rowsSpellProgression?: number[][];
};

type RawCell =
  | string
  | number
  | { type: 'dice'; toRoll?: Array<{ number?: number; faces?: number; modifier?: number }> }
  | { type: 'bonus'; value?: number }
  | { type: 'bonusSpeed'; value?: number }
  | { type?: string; [k: string]: unknown };

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
      // 2024 XPHB ships gainSubclassFeature markers that resolve to a
      // real, named feature ("Fighter Subclass", "Primal Path", "Bardic
      // College") with prose. 5.1 markers are bare — no resolvable
      // record. Surface the named entry when present so the detailed
      // list shows the canonical text instead of just a placeholder.
      // Heuristic: keep features with non-empty entries.
      if (r.entries && r.entries.length > 0) {
        resolved.push(r);
      }
    } else {
      resolved.push(r);
    }
  }

  // 5e.tools class files (especially older editions) sometimes nest
  // sub-features inside a parent feature's `entries` as
  // `{type: 'refClassFeature', classFeature}` blocks rather than
  // listing them in the class's top-level `classFeatures` array.
  // Artificer's L2 Infuse Item → Infusions Known is the canonical
  // example. Walk each resolved feature's entries recursively, resolve
  // the refs, and surface them as standalone features so the rendered
  // class card shows them at the right level.
  const seenKeys = new Set(resolved.map((f) => featureKey(f)));
  const expanded: Array<RawClassFeature & { parentName?: string }> = [];
  // Tracks parent name during recursive descent so each expanded child
  // gets stamped with the feature it sub-divides (e.g. Cleric Divine
  // Order's Protector/Thaumaturge get parentName='Divine Order'). The
  // renderer uses this to nest children under their parent in the
  // detailed list.
  function collectRefs(entries: RawEntry[] | undefined, parentName?: string): void {
    if (!entries) return;
    for (const e of entries) {
      if (typeof e === 'string') continue;
      if (
        e.type === 'refClassFeature'
        && typeof (e as { classFeature?: unknown }).classFeature === 'string'
      ) {
        const refStr = (e as { classFeature?: string }).classFeature!;
        const r = resolveFeatureRef(refStr, featureIdx, c, classSource);
        if (r && !seenKeys.has(featureKey(r))) {
          seenKeys.add(featureKey(r));
          expanded.push({ ...r, parentName });
          collectRefs(r.entries, r.name);
        }
        continue;
      }
      const obj = e as RawEntryObject;
      if (Array.isArray(obj.entries)) collectRefs(obj.entries, parentName);
      if (Array.isArray(obj.items)) collectRefs(obj.items as RawEntry[], parentName);
    }
  }
  for (const f of resolved) collectRefs(f.entries, f.name);
  const allResolved: Array<RawClassFeature & { parentName?: string }> = [...resolved, ...expanded];

  // Sort by level so expanded refs interleave correctly. Stable within
  // a level (preserves the authored order — title first, then
  // sub-features as encountered).
  const sortedFeatures = allResolved
    .map((f, i) => ({ f, i }))
    .sort((a, b) => a.f.level - b.f.level || a.i - b.i)
    .map(({ f }) => f);

  const features: ClassResult['features'] = sortedFeatures
    // The bare class-named feature is editorial intro prose — drop it
    // for parity with how the subclass transform handles its
    // self-named feature.
    .filter((f) => f.name.toLowerCase() !== c.name.toLowerCase())
    // Drop placeholder "<subclassTitle> feature" entries that 5.1
    // ships at L6/L10/L14 — they're stubs ("you gain a feature from
    // your Primal Path") with no real content. Each class has its
    // own subclass title (Primal Path / Bard College / Divine Domain
    // / Druid Circle / Martial Archetype / Monastic Tradition /
    // Sacred Oath / Ranger Archetype / Roguish Archetype / Sorcerous
    // Origin / Otherworldly Patron / Arcane Tradition), so we pass
    // the class's `subclassTitle` to the detector. The system page
    // already injects a "Subclass feature" placeholder at the
    // matching subclassFeatureLevels — leaving these stubs in would
    // double up the row.
    .filter((f) => !isSubclassFeaturePlaceholder(f, c.subclassTitle))
    .flatMap((f) => {
      const fullDesc = stripVariantPrefix(entriesToText(f.entries ?? []).trim());
      const split = splitSubOptions(fullDesc);
      const parent: NonNullable<ClassResult['features']>[number] = {
        level: f.level,
        name: f.name,
        description: split.parentDesc,
        // refClassFeature children inherit parentName from the original
        // ref's collectRefs descent (e.g. Artificer's Infusions Known).
        ...(f.parentName ? { parentName: f.parentName } : {}),
      };
      // Inline-bold sub-blocks (`**Cantrips.** ...`) split out as
      // discrete children with parentName set to this feature. Mirrors
      // the SRD transform's splitSubOptions behavior so XPHB Spellcasting
      // shows Cantrips / Spell Slots / etc. nested under Spellcasting,
      // not embedded in a single long paragraph.
      const children: NonNullable<ClassResult['features']> = split.children.map((sub) => ({
        level: f.level,
        name: sub.name,
        description: sub.desc,
        parentName: f.name,
      }));
      return [parent, ...children];
    });

  const subclassUnlockLevel = subclassMarkers.length > 0
    ? Math.min(...subclassMarkers)
    : 3; // 2024 default; classes that unlock earlier should declare it via marker
  const subclassFeatureLevels = subclassMarkers.length > 0
    ? [...new Set(subclassMarkers)].sort((a, b) => a - b)
    : undefined;

  const { columns, table } = buildProgression(c.classTableGroups);
  const startingEquipment = buildStartingEquipment(c.startingEquipment);
  const multiclassPrerequisite =
    formatMulticlassRequirements(c.multiclassing?.requirements)
    ?? (c.multiclassing?.requirementsSpecial
        ? stripInlineMarkup(c.multiclassing.requirementsSpecial)
        : KNOWN_MULTICLASS_PREREQS[c.name])
    ?? undefined;
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
    primaryAbility: resolvePrimaryAbility(c),
    savingThrows: (c.proficiency ?? []).map(abilityFullName),
    armorProficiencies: flattenStringList(sp?.armor),
    weaponProficiencies: flattenStringList(sp?.weapons),
    toolProficiencies: sp?.tools && sp.tools.length > 0 ? flattenStringList(sp.tools) : undefined,
    skillChoices: extractSkillChoices(sp?.skills),
    spellcasting: !!c.casterProgression || !!c.spellcastingAbility,
    spellcastingAbility: c.spellcastingAbility ? abilityFullName(c.spellcastingAbility) : null,
    subclassUnlockLevel,
    subclassFeatureLevels,
    features,
    progressionColumns: columns.length > 0 ? columns : undefined,
    progressionTable: table.length > 0 ? table : undefined,
    startingEquipment: startingEquipment.length > 0 ? startingEquipment : undefined,
    multiclassPrerequisite,
    multiclassProficiencies,
    srdVersions: srdVersionsForSource(c.source),
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
  return featureKeyParts(f.name, f.className, f.classSource ?? f.source, f.level, f.source);
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

export function abilityFullName(code: string): string {
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
      out.push(formatProfEntry(entry));
    } else if (entry?.name) {
      out.push(formatProfEntry(entry.name));
    }
  }
  return out;
}

/**
 * Class proficiency lists mix bare codes ("light", "martial", "simple")
 * with prose entries that carry 5e.tools markup
 * (`"{@item Thieves' Tools|XPHB}"`, `"one type of {@item Artisan's
 * Tools|XPHB} of your choice"`). Bare single-word codes get Title-Cased so
 * they read as labels; prose strings get their markup stripped but
 * otherwise preserve the source's casing.
 */
function formatProfEntry(entry: string): string {
  const trimmed = entry.trim();
  if (!trimmed) return '';
  // Single bare word with no whitespace or markup — treat as a code
  // ("light", "martial") and Title Case it.
  if (!/[\s{]/.test(trimmed)) return titleCase(trimmed);
  // Markup-bearing entry — strip tags, then title-case so 5.1's
  // lowercase entity names ("hand crossbows", "thieves' tools")
  // render as "Hand Crossbows", "Thieves' Tools". The fixSkillCasing
  // pass keeps small joiners like "of" lowercase ("Tasha's Cauldron
  // of Everything", though that's a book title not a prof — same
  // rule applies).
  const stripped = stripMarkup(trimmed);
  return fixSkillCasing(titleCase(stripped));
}

/**
 * Convert XPHB's `primaryAbility` shape — an array of
 * `{ <abilityCode>: true }` objects where each element is an ability
 * group — into the `string[]` shape the UI consumes. Within a group all
 * keys AND together (joined with " & "); across groups they OR together
 * (separate entries). Empty arrays surface as `[]` so callers can
 * distinguish "not declared" from "no primary ability".
 *
 * Examples:
 *   [{str: true}]                  → ['Strength']
 *   [{dex: true}, {wis: true}]     → ['Dexterity', 'Wisdom']  (Ranger 5.1: D OR W)
 *   [{dex: true, wis: true}]       → ['Dexterity & Wisdom']
 */
function extractPrimaryAbility(
  raw: Array<Record<string, boolean>> | undefined,
): string[] {
  if (!Array.isArray(raw) || raw.length === 0) return [];
  const out: string[] = [];
  for (const group of raw) {
    if (!group || typeof group !== 'object') continue;
    const keys = Object.keys(group).filter((k) => group[k] === true);
    if (keys.length === 0) continue;
    out.push(keys.map(abilityFullName).join(' & '));
  }
  return out;
}

/**
 * Resolve a class's primary ability. The 2024 XPHB ships
 * `primaryAbility` as structured data; the 2014 PHB doesn't ship the
 * field at all (the rule was prose-only in that edition). Fall back to
 * a hardcoded table keyed on class name for entries the source omits —
 * the standard 2014 SRD class set has stable, well-known primary
 * abilities.
 */
function resolvePrimaryAbility(c: RawClass): string[] {
  const fromData = extractPrimaryAbility(c.primaryAbility);
  if (fromData.length > 0) return fromData;
  return PRIMARY_ABILITY_FALLBACK[c.name] ?? [];
}

/** Hardcoded primary-ability table for 2014 SRD classes (the source
 *  doesn't carry the field). Multi-ability entries use OR semantics
 *  (separate strings) for "either-or" classes (Fighter), and AND
 *  semantics (joined with " & ") for true multi-stat classes (Monk,
 *  Paladin, Ranger). */
const PRIMARY_ABILITY_FALLBACK: Record<string, string[]> = {
  Barbarian: ['Strength'],
  Bard:      ['Charisma'],
  Cleric:    ['Wisdom'],
  Druid:     ['Wisdom'],
  Fighter:   ['Strength', 'Dexterity'],
  Monk:      ['Dexterity & Wisdom'],
  Paladin:   ['Strength & Charisma'],
  Ranger:    ['Dexterity & Wisdom'],
  Rogue:     ['Dexterity'],
  Sorcerer:  ['Charisma'],
  Warlock:   ['Charisma'],
  Wizard:    ['Intelligence'],
};

/** Full 5e skill list, used to expand `{any: N}` skill choices into an
 *  explicit `from` set. Stable across 5.1 and 2024 — both editions share
 *  the same 18 skills tied to the same abilities. */
const ALL_SKILLS = [
  'Acrobatics', 'Animal Handling', 'Arcana', 'Athletics', 'Deception',
  'History', 'Insight', 'Intimidation', 'Investigation', 'Medicine',
  'Nature', 'Perception', 'Performance', 'Persuasion', 'Religion',
  'Sleight of Hand', 'Stealth', 'Survival',
];

function extractSkillChoices(
  skills: RawSkillChoiceList | undefined,
): ClassResult['skillChoices'] {
  if (!skills || skills.length === 0) return { count: 0, from: [] };
  const first = skills[0];
  if (!first) return { count: 0, from: [] };
  // 2024 XPHB shape: `{any: N}` — choose N from any skill. Bard, Rogue,
  // and a few others use this. Expand to the full skill list so the UI
  // can render the same "Choose N (Skill, Skill, …)" block as classes
  // with explicit lists.
  if (typeof first.any === 'number') {
    return { count: first.any, from: [...ALL_SKILLS] };
  }
  const choose = first.choose;
  if (!choose) return { count: 0, from: [] };
  return {
    count: choose.count ?? 0,
    // 5.1 ships skill names lowercased ("sleight of hand"); titleCase
    // makes them "Sleight Of Hand" but proper SRD casing is "Sleight
    // of Hand". fixSkillCasing un-capitalizes the joiner words.
    from: (choose.from ?? []).map(titleCase).map(fixSkillCasing),
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
/**
 * Render a single class-table cell to a string/number. 5e.tools' XPHB
 * data ships typed cell objects ({type: 'dice', ...}, {type: 'bonus',
 * value: 2}, etc.) for columns like Rage Damage and Martial Arts Die;
 * without this they'd serialize as `[object Object]` in the UI.
 * Strings and numbers pass through (with markup stripped on strings).
 */
function formatCell(cell: RawCell): string | number {
  if (typeof cell === 'string') return stripInlineMarkup(cell);
  if (typeof cell === 'number') return cell;
  if (!cell || typeof cell !== 'object') return '—';
  const obj = cell as { type?: string; toRoll?: Array<{ number?: number; faces?: number; modifier?: number }>; value?: number };
  if (obj.type === 'dice' && Array.isArray(obj.toRoll)) {
    // Render `[{number:1, faces:4}, {modifier: 1}]` as "1d4+1". 5e.tools
    // splits dice + modifier into separate toRoll entries; concat them.
    const parts: string[] = [];
    for (const r of obj.toRoll) {
      if (r.number && r.faces) parts.push(`${r.number}d${r.faces}`);
      if (r.modifier) parts.push(`${r.modifier > 0 ? '+' : ''}${r.modifier}`);
    }
    return parts.join('') || '—';
  }
  if (obj.type === 'bonus' && typeof obj.value === 'number') {
    return `${obj.value > 0 ? '+' : ''}${obj.value}`;
  }
  if (obj.type === 'bonusSpeed' && typeof obj.value === 'number') {
    return `${obj.value > 0 ? '+' : ''}${obj.value} ft.`;
  }
  // Unknown cell type — surface a placeholder rather than silently
  // showing "[object Object]". Cell types we miss can be added above.
  return '—';
}

export function buildProgression(groups: RawClassTableGroup[] | undefined): {
  columns: NonNullable<ClassResult['progressionColumns']>;
  table: NonNullable<ClassResult['progressionTable']>;
} {
  if (!groups || groups.length === 0) return { columns: [], table: [] };

  const columns: NonNullable<ClassResult['progressionColumns']> = [];
  // valuesByLevel[level][colKey] = cell value; built up across all groups.
  const valuesByLevel: Record<number, Record<string, string | number>> = {};
  for (let lvl = 1; lvl <= 20; lvl++) valuesByLevel[lvl] = {};

  // Prof. Bonus is universal across every 5e class but isn't part of
  // 5e.tools' classTableGroups (which only carries class-specific columns
  // like Rages, Spell Slots, Sneak Attack). Prepend it manually to match
  // the SRD transform's output and what users see on D&D Beyond.
  columns.push({ key: 'profBonus', label: 'Prof. Bonus' });
  for (let lvl = 1; lvl <= 20; lvl++) {
    const pb = 2 + Math.floor((lvl - 1) / 4);
    valuesByLevel[lvl].profBonus = `+${pb}`;
  }

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
            valuesByLevel[lvl][colKeys[i]] = formatCell(cell);
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

  // XPHB path — `entries` carries pre-rendered prose. Each lettered
  // option is delimited by either "; or (X)" (Barbarian: A→B) OR a
  // bare "; (X)" with no "or" between A and B (Fighter: A→B→C). Split
  // on the boundary that immediately precedes a "(LETTER)" label so
  // the form variations both work, then a final pass on "; or " catches
  // the trailing option that doesn't have its own label. The "Choose
  // A or B:" preamble is dropped since the option list is self-
  // explanatory in the rendered cards.
  if (Array.isArray(se.entries) && se.entries.length > 0) {
    const flattened = se.entries.map(stripInlineMarkup).join(' ').replace(/\s+/g, ' ').trim();
    const cleaned = flattened.replace(/^Choose\s+(?:.+?):\s*/i, '');
    // Split on `;\s*(?:or\s+)?` whenever the next token starts with
    // `(LETTER)`. Lookahead keeps the label attached to its option so
    // the per-part match below can pull it out.
    const parts = cleaned
      .split(/;\s*(?:or\s+)?(?=\([A-Z]\))/i)
      .map((s) => s.trim())
      .filter(Boolean);
    for (const part of parts) {
      // Strip the "(A) " / "(B) " parenthesized label and use it as
      // the column label so the modal renders "Option A" / "Option B"
      // headings the way the SRD path does.
      const m = part.match(/^\(([A-Z])\)\s*(.*)$/);
      if (m) {
        out.push({ label: m[1], items: splitEquipmentList(m[2]) });
      } else {
        out.push({ label: '', items: splitEquipmentList(part) });
      }
    }
    return out;
  }

  // 5.1 SRD path — pre-split string list with optional gold alternative.
  if (Array.isArray(se.default) && se.default.length > 0) {
    out.push({
      label: 'A',
      items: se.default.map(stripInlineMarkup),
    });
  }
  if (typeof se.goldAlternative === 'string' && se.goldAlternative.trim()) {
    // 5.1 ships goldAlternative as a markup expression like
    // "{@dice 2d4 × 10|2d4 × 10|Starting Gold}". Strip markup to get
    // "2d4 × 10", then surface it as a structured `gold.dice` value
    // so the renderer can show it as "Roll 2d4 × 10 gp" instead of
    // baking the dice into a label string.
    const stripped = stripInlineMarkup(se.goldAlternative).trim();
    const dice = parseGoldAlternative(stripped);
    if (dice) {
      out.push({ label: 'B', gold: { dice, currency: 'gp' } });
    } else {
      // Fallback for unrecognized expressions — keep them visible so
      // the user notices and we can extend the parser.
      out.push({ label: 'B', gold: { dice: stripped, currency: 'gp' } });
    }
  }
  return out;
}

/**
 * Pull a dice expression out of a 5.1 `goldAlternative` string. Typical
 * shapes after markup stripping: "2d4 × 10" (most classes), "5d4"
 * (Monk's special case — they get 5d4 gp without the ×10 multiplier).
 * Returns the canonical form ("NdM × 10" or "NdM"). Returns null when
 * the string doesn't look like a dice expression at all.
 */
function parseGoldAlternative(text: string): string | null {
  const withMultiplier = text.match(/(\d+d\d+)\s*[×x*]\s*(\d+)/);
  if (withMultiplier) return `${withMultiplier[1]} × ${withMultiplier[2]}`;
  const bare = text.match(/^\s*(\d+d\d+)\s*$/);
  if (bare) return bare[1];
  return null;
}

/**
 * Split a comma-separated equipment line into per-item entries while
 * preserving the trailing "and 15 GP" gold clause as its own entry. The
 * "and" before the last item is dropped so list rendering doesn't show
 * "and 15 GP" out of context.
 */
function splitEquipmentList(line: string): string[] {
  return line
    .split(/,\s*(?:and\s+)?/i)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Flatten 5e.tools multiclassing.requirements into a free-text string
 * matching the SRD shape ("Strength 13" / "Strength 13 or Dexterity 13").
 * The `or[]` form lists alternative score sets — within a set, all
 * scores are AND'd; across sets, OR'd. Returns undefined when no
 * requirement is declared.
 */
/**
 * Multiclass ability-score prerequisites for the 2024 PHB. 5e.tools'
 * per-class JSON omits `multiclassing.requirements` for XPHB classes —
 * the prereqs live in a separate document. We recover them from the
 * published table since they're stable across the edition.
 *
 * 5.1 SRD classes ship `requirements` directly, so this fallback only
 * kicks in when the structured + free-text fields are both absent.
 * Class names are stable across editions so a single map suffices.
 */
const KNOWN_MULTICLASS_PREREQS: Record<string, string> = {
  Barbarian: 'Strength 13',
  Bard: 'Charisma 13',
  Cleric: 'Wisdom 13',
  Druid: 'Wisdom 13',
  Fighter: 'Strength 13 or Dexterity 13',
  Monk: 'Dexterity 13 and Wisdom 13',
  Paladin: 'Strength 13 and Charisma 13',
  Ranger: 'Dexterity 13 and Wisdom 13',
  Rogue: 'Dexterity 13',
  Sorcerer: 'Charisma 13',
  Warlock: 'Charisma 13',
  Wizard: 'Intelligence 13',
};

function formatMulticlassRequirements(
  requirements: RawMulticlassRequirements | undefined,
): ClassResult['multiclassPrerequisite'] {
  if (!requirements) return undefined;
  let groups: Array<Record<string, number>> = Array.isArray(requirements.or)
    ? requirements.or
    : [stripOrFromRequirements(requirements)];
  // Fighter ships `{"or":[{"str":13,"dex":13}]}` — one group with two
  // ability scores inside. The intent is "Strength 13 OR Dexterity 13",
  // not the AND-joined "Strength 13, Dexterity 13" the bare reader
  // produces. Detect the single-group multi-key case and split each
  // ability into its own group so the OR formatting kicks in.
  if (groups.length === 1 && Object.keys(groups[0]).length > 1) {
    groups = Object.entries(groups[0]).map(([k, v]) => ({ [k]: v }));
  }
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
  if (Array.isArray(gained.armor)) out.armor = flattenStringList(gained.armor).map(formatArmorTrait);
  if (Array.isArray(gained.weapons)) out.weapons = flattenStringList(gained.weapons).map(formatWeaponTrait);
  if (Array.isArray(gained.tools)) out.tools = flattenStringList(gained.tools).map(formatToolTrait);
  if (Array.isArray(gained.skills) && gained.skills.length > 0) {
    const choose = gained.skills[0]?.choose;
    if (choose) {
      out.skills = {
        count: choose.count ?? 0,
        // titleCase capitalizes every word ("Sleight Of Hand"); fix the
        // lowercase joiners ("of", "the") that should stay lowercase
        // mid-name. Keeps "Animal Handling" and other multi-word skills
        // correct while normalizing "Sleight of Hand", "Hand of [...]"
        // patterns.
        from: (choose.from ?? []).map(titleCase).map(fixSkillCasing),
      };
    }
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/**
 * Normalize an armor proficiency entry. 5e.tools 2024 ships bare codes
 * ("Light", "Medium", "Heavy", "Shield") while 5.1 SRD ships full names
 * ("Light armor", "Medium armor", "Shields"). Append "Armor" to bare
 * weight codes and pluralize "Shield" → "Shields" so both editions
 * surface the same prose.
 */
function formatArmorTrait(s: string): string {
  const trimmed = s.trim();
  if (!trimmed) return trimmed;
  // Bare "Shield" → "Shields" (matches SRD 5.1 phrasing).
  if (/^shield$/i.test(trimmed)) return 'Shields';
  // Already-formed entries pass through.
  if (/\b(armor|shields?)\b/i.test(trimmed)) return trimmed;
  return `${trimmed} Armor`;
}

/**
 * Normalize a weapon proficiency entry. 5e.tools 2024 ships bare
 * categories ("Simple", "Martial") while 5.1 SRD ships "Simple weapons"
 * / "Martial weapons". Append " weapons" to bare-code entries so the
 * multiclass-traits sentence reads "proficiency with martial weapons",
 * not "proficiency with martial".
 */
function formatWeaponTrait(s: string): string {
  const trimmed = s.trim();
  if (!trimmed) return trimmed;
  if (/\bweapons?\b/i.test(trimmed)) return trimmed;
  return `${trimmed} Weapons`;
}

/**
 * Normalize a tool proficiency entry. XPHB sometimes ships choice
 * prose like "Choose one Musical Instrument", which reads awkwardly
 * inside "proficiency with X". Rewrite "Choose one Y" → "one Y of your
 * choice" so the sentence flows. Plain tool names ("Thieves' Tools")
 * pass through unchanged.
 */
function formatToolTrait(s: string): string {
  const trimmed = s.trim();
  if (!trimmed) return trimmed;
  const m = trimmed.match(/^Choose\s+(?:(\d+|one|a|an)\s+)?(.+)$/i);
  if (m) {
    const count = m[1]?.toLowerCase() ?? 'one';
    const noun = m[2].trim();
    return `${count} ${noun} of your choice`;
  }
  return trimmed;
}

/**
 * Fix multi-word names where titleCase over-capitalizes joining
 * words. "Sleight of Hand" is the canonical case but the rule is
 * general: lowercase short joiners and articles (of, the, a, an, in,
 * on, to, for, your, with, and, or) when they aren't the first word.
 * Used for skill names and proficiency entries where 5.1 ships the
 * source lowercased and titleCase elevates everything to caps.
 */
function fixSkillCasing(s: string): string {
  return s
    .replace(/\b(Of|The|A|An|In|On|To|For|Your|With|And|Or)\b/g, (_, p1) => p1.toLowerCase())
    .replace(/^[a-z]/, (c) => c.toUpperCase());
}

/**
 * Split a feature description into a parent-level paragraph plus any
 * `**Name.** body` sub-option blocks at its tail. Used to turn XPHB
 * Spellcasting's embedded Cantrips / Spell Slots / Prepared Spells
 * paragraphs (and Cleric's Divine Order → Protector / Thaumaturge
 * inline form) into discrete child features the renderer can indent.
 *
 * Mirrors the SRD transform's splitter (scripts/import-srd/transforms/
 * classes.js) so SRD and imported variants produce matching shapes.
 *
 * Detection rule: the description must contain ≥ 2 paragraph-leading
 * `**Name.**` patterns. A single `**Foo.**` is more likely inline
 * emphasis (spell name, defined term) than a real sub-feature, so we
 * leave the description untouched in that case.
 */
/**
 * Detect 5.1-style "Path feature" / "Subclass feature" stub entries —
 * these only say "you gain a feature from your Primal Path" and exist
 * to flag the slot in the source. Our system page injects a proper
 * "Subclass feature" placeholder at every subclassFeatureLevel, so
 * importing these stubs would double up the row.
 */
function isSubclassFeaturePlaceholder(
  f: { name: string; entries?: RawEntry[] },
  subclassTitle: string | undefined,
): boolean {
  const trimmed = f.name.trim();
  // Generic "Path feature" / "Subclass feature" naming, plus per-class
  // "<subclassTitle> feature" (Druid → "Druid Circle feature", Bard
  // → "Bard College feature", Cleric → "Divine Domain feature",
  // etc.). The match is case-insensitive and ignores trailing-space
  // variations.
  const titlePattern = subclassTitle
    ? new RegExp(`^${escapeRegex(subclassTitle)}\\s+features?$`, 'i')
    : null;
  const matchesName =
    /^(?:path|subclass)\s+features?$/i.test(trimmed)
    || (titlePattern?.test(trimmed) ?? false);
  if (!matchesName) return false;
  const text = entriesToText(f.entries ?? []).trim().toLowerCase();
  // Only filter the bare-stub form. A custom homebrew might author a
  // longer "Druid Circle feature" with real content; that should pass
  // through. The 5.1 stub is "At Nth level, you gain a feature from
  // your <subclass title>." — match the "you gain a feature from your"
  // phrase so any class's stub is recognized.
  return text.length === 0 || /you gain a feature from your /i.test(text);
}

/** Escape regex metacharacters so a plain-string subclass title can be
 *  used inside a RegExp constructor. */
function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Drop 5e.tools' editorial "Nth-level CLASSNAME optional class features"
 * lead line that prefixes Tasha's-style optional features. The line is
 * an italicized variantrule reference in the source — useful as a tag
 * for the renderer, but redundant noise above the actual rule text.
 * Format: "3rd-level barbarian optional class features\n\nWhen you...".
 */
function stripVariantPrefix(desc: string): string {
  return desc.replace(
    /^\d+(?:st|nd|rd|th)-level\s+\w+\s+optional class features?\s*\n+/i,
    '',
  );
}

function splitSubOptions(desc: string): {
  parentDesc: string;
  children: Array<{ name: string; desc: string }>;
} {
  if (!desc) return { parentDesc: desc, children: [] };
  const splitMatch = desc.match(/\n\n(?=\*\*[^*\n]+?\.\*\*\s)/);
  if (!splitMatch || typeof splitMatch.index !== 'number') {
    return { parentDesc: desc, children: [] };
  }
  const head = desc.slice(0, splitMatch.index).trim();
  const tail = desc.slice(splitMatch.index + 2);
  const subRe = /\*\*([^*\n]+?)\.\*\*\s+([\s\S]+?)(?=\n\n\*\*[^*\n]+?\.\*\*\s|$)/g;
  const children: Array<{ name: string; desc: string }> = [];
  let m: RegExpExecArray | null;
  while ((m = subRe.exec(tail)) !== null) {
    const name = m[1].trim();
    const body = m[2].trim();
    if (name && body) children.push({ name, desc: body });
  }
  if (children.length < 2) return { parentDesc: desc, children: [] };
  return { parentDesc: head, children };
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

function titleCase(s: unknown): string {
  if (typeof s !== 'string' || !s) return '';
  return s
    .split(/[\s_-]+/)
    .map((part) => (part.length > 0 ? part.charAt(0).toUpperCase() + part.slice(1).toLowerCase() : part))
    .join(' ');
}
