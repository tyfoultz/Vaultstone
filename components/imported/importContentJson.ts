// Helpers for picking and parsing a JSON content file (e.g. a 5e.tools
// per-content-type export). Mirrors the shape of components/rulebook/uploadPdf.ts
// but reads the file contents into memory rather than persisting the file
// itself — imported entries are extracted at parse time and stored in the
// imported tier; the source file is then discarded.

import { Platform } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';

export type PickedJson = {
  fileName: string;
  /** Parsed JSON payload. Caller is responsible for shape validation. */
  payload: unknown;
  /** Approximate size in bytes — useful for the progress UI. */
  sizeBytes: number;
};

/**
 * Open the OS file picker for a JSON file, read it, and parse the contents.
 * Returns null if the user cancelled. Throws if the file isn't valid JSON
 * or the picker returns an asset we can't read.
 */
export async function pickContentJson(): Promise<PickedJson | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: 'application/json',
    copyToCacheDirectory: true,
  });

  if (result.canceled || !result.assets?.[0]) return null;
  const asset = result.assets[0];

  let text: string;
  if (Platform.OS === 'web') {
    // On web, expo-document-picker returns a File object on the asset.
    const file = (asset as unknown as { file?: File }).file;
    if (!file) throw new Error('Picked file is not readable on this platform');
    text = await file.text();
  } else {
    text = await FileSystem.readAsStringAsync(asset.uri);
  }

  let payload: unknown;
  try {
    payload = JSON.parse(text);
  } catch (err) {
    throw new Error(
      `Selected file is not valid JSON: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  return {
    fileName: asset.name,
    payload,
    sizeBytes: text.length,
  };
}

/**
 * Probe a parsed JSON payload for known content shapes and report what we
 * found. Used by the import modal to show a "Found N subclasses, M feats…"
 * preview before the user commits.
 *
 * Also reports a `diagnostic` describing what the payload looked like at
 * the top level — surfaced in the modal when nothing importable was
 * recognized so the user can tell whether they picked the wrong file or
 * a file in an unsupported shape. New transforms add their per-key counts
 * here and append to SUPPORTED_TOP_LEVEL_KEYS so the diagnostic copy
 * stays accurate.
 */
export type ImportableContent = {
  subclasses: number;
  feats: number;
  spells: number;
  backgrounds: number;
  /** Sum of `baseitem` + `item` arrays — 5e.tools splits mundane and
   *  magic items across two top-level keys, both of which our items
   *  transform handles. */
  items: number;
  /** Sum of `race` + `subrace` arrays. Subraces are surfaced as
   *  standalone species (named "<Race> (<Subrace>)") to match how the
   *  SRD bundle ships High Elf / Hill Dwarf etc. */
  species: number;
  /** Length of the `monster` array (5e.tools bestiary files). */
  monsters: number;
  /** Length of the `class` array (5e.tools class files). The same file
   *  also carries `subclass`/`subclassFeature`/`classFeature` arrays —
   *  the subclass transform handles its share, the class transform
   *  handles this one. */
  classes: number;
  /** Length of the `optionalfeature` array (5e.tools
   *  `optionalfeatures-*.json`). Eldritch Invocations, Metamagic
   *  Options, Battle Master Maneuvers, Fighting Styles, etc. */
  optionalFeatures: number;
  /** Length of the `deity` array (5e.tools `deities.json`). Cleric /
   *  Paladin patron choices for character creation. The 2024 SRD
   *  ships 27 Greyhawk deities under XDMG; older entries from PHB,
   *  SCAG, MTF, etc. carry the legacy 2014 alignment + domains
   *  fields. */
  deities: number;
  /** Length of the `variantrule` array (5e.tools
   *  `variantrules.json`). Conflates two concepts: the XPHB Compendium
   *  glossary (`ruleType: 'C'`, 114 entries — Ability Check, Cover,
   *  etc.) and DM-side variant/optional rules (`V`/`O`/`VO` —
   *  Flanking, Hero Points, Cleaving, Firearms). The transform
   *  produces a single content type with a `kind` discriminator;
   *  the system page splits the presentation. */
  variantRules: number;
  /** Length of the `magicvariant` array (5e.tools
   *  `magicvariants.json`). Each variant is a *template* (e.g. "+1
   *  Weapon", "Adamantine Armor") that expands at transform time
   *  against a bundled XPHB base-item registry to produce many
   *  derived magic items. The probe count is the number of templates;
   *  the actual upserted-row count is much higher (one variant
   *  template typically produces 30+ rows after expansion). */
  magicVariants: number;
  /** Combined `classFluff` + `subclassFluff` array length. 5e.tools
   *  splits class flavor prose into a separate `fluff-class-*.json`
   *  file. These entries don't carry structured data — they patch
   *  descriptions onto already-imported class/subclass rows. */
  classFluff: number;
  /** `backgroundFluff` array length — patches imported_content
   *  background rows with flavor prose from `fluff-backgrounds.json`. */
  backgroundFluff: number;
  /** `featFluff` array length — patches feat rows from
   *  `fluff-feats.json`. */
  featFluff: number;
  /** `itemFluff` array length — patches item rows from
   *  `fluff-items.json`. */
  itemFluff: number;
  /** Combined `raceFluff` + `subraceFluff` length — patches species
   *  rows (including `<Race> (<Subrace>)` keyed entries) from
   *  `fluff-races.json`. */
  speciesFluff: number;
  /** `monsterFluff` array length — patches creature rows from
   *  bestiary fluff files. */
  creatureFluff: number;
  /** Total spell entries inside a 5e.tools `gendata-spell-source-lookup.json`
   *  file (sum across every spell-source bucket). Detected by shape, not
   *  by top-level key — the file has no fixed wrapper key, just lowercase
   *  source codes at the root with `class`/`classVariant`/`subclass`
   *  bodies under each spell. Patches the `classes` array on existing
   *  imported spell rows so class-detail spell lists surface them. */
  spellClasses: number;
  /**
   * Per-source breakdown of every entry the probe found, keyed by the
   * top-level array name (subclass / feat / spell / etc.). Each map's
   * value is `{ source: count }` over distinct `source` codes that
   * appeared on those entries. Entries missing a `source` field bucket
   * under '__unknown__'. Powers the source-filter picker — when only
   * one source code appears across the whole payload, the picker is
   * hidden (the file is single-source like `spells-xphb.json`).
   */
  sourcesByKind: Record<string, Record<string, number>>;
  /** Flat union of every distinct source code seen across the payload. */
  allSources: string[];
  diagnostic: ImportDiagnostic;
};

/** Sentinel for entries with no `source` field. */
export const UNKNOWN_SOURCE = '__unknown__';

/**
 * Per-shape outcome of looking at the payload's top level. Powers the
 * "Nothing to import — here's why" copy in the Confirm step.
 */
export type ImportDiagnostic =
  | { kind: 'ok' }
  | { kind: 'not-object'; actualType: string }
  | { kind: 'no-recognized-keys'; foundKeys: string[] };

/** Keys the importer currently recognizes. Update as transforms land. */
export const SUPPORTED_TOP_LEVEL_KEYS = [
  'subclass', 'feat', 'spell', 'background',
  'baseitem', 'item', 'race', 'subrace', 'monster', 'class',
  'optionalfeature', 'deity', 'variantrule', 'magicvariant',
  'classFluff', 'subclassFluff',
  'backgroundFluff', 'featFluff', 'itemFluff',
  'raceFluff', 'subraceFluff', 'monsterFluff',
] as const;

/** Sentinel source code surfaced for the spell-source-lookup file in
 *  the source picker — the file is single-purpose and the per-source
 *  picker isn't meaningful for it. */
const SPELL_CLASSES_SOURCE = '__spell_classes__';

function emptyProbe(): ImportableContent {
  return {
    subclasses: 0,
    feats: 0,
    spells: 0,
    backgrounds: 0,
    items: 0,
    species: 0,
    monsters: 0,
    classes: 0,
    optionalFeatures: 0,
    deities: 0,
    variantRules: 0,
    magicVariants: 0,
    classFluff: 0,
    backgroundFluff: 0,
    featFluff: 0,
    itemFluff: 0,
    speciesFluff: 0,
    creatureFluff: 0,
    spellClasses: 0,
    sourcesByKind: {},
    allSources: [],
    diagnostic: { kind: 'ok' },
  };
}

/** Source resolution for probe + filter. Most arrays carry a top-level
 *  `source` field; `magicvariant` is the exception — its source lives
 *  inside `inherits.source` since each entry is a template that
 *  inherits metadata from a publication's variant chapter. Falling
 *  back to `UNKNOWN_SOURCE` keeps single-source files invisible to
 *  the picker (correct behavior — picker only renders for multi-source
 *  payloads). */
function readEntrySource(entry: unknown, key: string): string {
  if (!entry || typeof entry !== 'object') return UNKNOWN_SOURCE;
  const e = entry as { source?: unknown; inherits?: { source?: unknown } };
  const direct = typeof e.source === 'string' ? e.source : '';
  if (direct) return direct;
  if (key === 'magicvariant' && typeof e.inherits?.source === 'string') {
    return e.inherits.source;
  }
  return UNKNOWN_SOURCE;
}

/**
 * Tally per-source counts on a top-level array and stash them under
 * `key` in `sourcesByKind`. Returns the array length so the caller can
 * roll it into the per-kind aggregate count.
 */
function tallyArray(
  obj: Record<string, unknown>,
  key: string,
  sourcesByKind: Record<string, Record<string, number>>,
): number {
  const arr = obj[key];
  if (!Array.isArray(arr)) return 0;
  const counts: Record<string, number> = {};
  for (const entry of arr) {
    const source = readEntrySource(entry, key);
    counts[source] = (counts[source] ?? 0) + 1;
  }
  sourcesByKind[key] = counts;
  return arr.length;
}

export function probeContent(payload: unknown): ImportableContent {
  // Non-object payloads (arrays, primitives, null) can't carry our
  // expected shape. Report what we did see so the user can correct.
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    const probe = emptyProbe();
    probe.diagnostic = {
      kind: 'not-object',
      actualType: Array.isArray(payload) ? 'array' : payload === null ? 'null' : typeof payload,
    };
    return probe;
  }
  const obj = payload as Record<string, unknown>;
  const probe = emptyProbe();
  const sourcesByKind = probe.sourcesByKind;

  probe.subclasses  = tallyArray(obj, 'subclass',   sourcesByKind);
  probe.feats       = tallyArray(obj, 'feat',       sourcesByKind);
  probe.spells      = tallyArray(obj, 'spell',      sourcesByKind);
  probe.backgrounds = tallyArray(obj, 'background', sourcesByKind);
  // Items live in two parallel arrays — `baseitem` (mundane) and `item`
  // (magic + variants). Sum them so the probe count matches what the
  // transform will actually emit.
  probe.items       = tallyArray(obj, 'baseitem',   sourcesByKind)
                    + tallyArray(obj, 'item',       sourcesByKind);
  // Species: same parallel-array story — `race` + `subrace` both feed
  // the species transform, with subraces surfaced as standalone entries.
  probe.species     = tallyArray(obj, 'race',       sourcesByKind)
                    + tallyArray(obj, 'subrace',    sourcesByKind);
  probe.monsters    = tallyArray(obj, 'monster',    sourcesByKind);
  probe.classes     = tallyArray(obj, 'class',      sourcesByKind);
  probe.optionalFeatures = tallyArray(obj, 'optionalfeature', sourcesByKind);
  probe.deities          = tallyArray(obj, 'deity',           sourcesByKind);
  probe.variantRules     = tallyArray(obj, 'variantrule',     sourcesByKind);
  probe.magicVariants    = tallyArray(obj, 'magicvariant',    sourcesByKind);
  // Class flavor: a separate `fluff-class-*.json` file carries prose
  // for already-imported class/subclass rows. Counted together so the
  // disclosure list shows a single "Class flavor" row.
  probe.classFluff  = tallyArray(obj, 'classFluff',    sourcesByKind)
                    + tallyArray(obj, 'subclassFluff', sourcesByKind);
  // Background / feat / item / species / creature flavor — same shape
  // as class flavor but for their respective rows. 5e.tools ships each
  // in its own fluff file (`fluff-backgrounds.json`, `fluff-feats.json`,
  // `fluff-items.json`, `fluff-races.json`, `fluff-bestiary-*.json`).
  probe.backgroundFluff = tallyArray(obj, 'backgroundFluff', sourcesByKind);
  probe.featFluff       = tallyArray(obj, 'featFluff',       sourcesByKind);
  probe.itemFluff       = tallyArray(obj, 'itemFluff',       sourcesByKind);
  probe.speciesFluff    = tallyArray(obj, 'raceFluff',    sourcesByKind)
                        + tallyArray(obj, 'subraceFluff', sourcesByKind);
  probe.creatureFluff   = tallyArray(obj, 'monsterFluff', sourcesByKind);

  // Spell-source-lookup file: only probe-detected when none of the
  // array-based shapes matched, since this file's signature is a top-
  // level object whose values are themselves objects (no `spell` array,
  // etc.). Counts the total spell entries across every source bucket so
  // the user sees "Spell class lists: 341" before committing.
  if (!hasArrayBackedContent(probe)) {
    probe.spellClasses = countSpellSourceLookup(obj);
    if (probe.spellClasses > 0) {
      sourcesByKind[SPELL_CLASSES_SOURCE] = { [SPELL_CLASSES_SOURCE]: probe.spellClasses };
    }
  }

  // Flat union for the picker — distinct source codes across every
  // recognized array, sorted alphabetically (UNKNOWN_SOURCE last). The
  // spell-source-lookup sentinel is excluded from the picker since the
  // file is single-purpose; its count flows through unfiltered.
  const all = new Set<string>();
  for (const counts of Object.values(sourcesByKind)) {
    for (const src of Object.keys(counts)) {
      if (src === SPELL_CLASSES_SOURCE) continue;
      all.add(src);
    }
  }
  probe.allSources = [...all].sort((a, b) => {
    if (a === UNKNOWN_SOURCE) return 1;
    if (b === UNKNOWN_SOURCE) return -1;
    return a.localeCompare(b);
  });

  // If we recognized nothing, surface the top-level keys so the user
  // can compare against what we expect. Cap the list so a wildly wrong
  // file doesn't dump 100 keys into the modal.
  if (!hasImportableContent(probe)) {
    const foundKeys = Object.keys(obj).slice(0, 10);
    probe.diagnostic = { kind: 'no-recognized-keys', foundKeys };
  }
  return probe;
}

export function hasImportableContent(probe: ImportableContent): boolean {
  return hasArrayBackedContent(probe) || probe.spellClasses > 0;
}

/** Whether any array-shaped (entries or fluff) content was found.
 *  Used by the lookup-file probe to gate detection — if we already
 *  matched a regular shape we don't try the lookup heuristic. */
function hasArrayBackedContent(probe: ImportableContent): boolean {
  return (
    probe.subclasses > 0 ||
    probe.feats > 0 ||
    probe.spells > 0 ||
    probe.backgrounds > 0 ||
    probe.items > 0 ||
    probe.species > 0 ||
    probe.monsters > 0 ||
    probe.classes > 0 ||
    probe.optionalFeatures > 0 ||
    probe.deities > 0 ||
    probe.variantRules > 0 ||
    probe.magicVariants > 0 ||
    probe.classFluff > 0 ||
    probe.backgroundFluff > 0 ||
    probe.featFluff > 0 ||
    probe.itemFluff > 0 ||
    probe.speciesFluff > 0 ||
    probe.creatureFluff > 0
  );
}

/**
 * Count spells in a 5e.tools `gendata-spell-source-lookup.json`-shaped
 * object. The file's signature: every top-level key (excluding `_meta`
 * and similar underscore-prefixed metadata) maps to a non-array object
 * whose values are themselves objects with at least one of `class` /
 * `classVariant` / `subclass` (we accept any of these as confirming
 * the spell-entry shape). Returns 0 if nothing matches the pattern, so
 * it's safe to call on arbitrary payloads.
 */
function countSpellSourceLookup(obj: Record<string, unknown>): number {
  const keys = Object.keys(obj).filter((k) => !k.startsWith('_'));
  if (keys.length === 0) return 0;
  let total = 0;
  let matchedSpellShape = false;
  for (const key of keys) {
    const bucket = obj[key];
    if (!bucket || typeof bucket !== 'object' || Array.isArray(bucket)) return 0;
    const spells = bucket as Record<string, unknown>;
    for (const body of Object.values(spells)) {
      if (!body || typeof body !== 'object' || Array.isArray(body)) return 0;
      const spell = body as Record<string, unknown>;
      if ('class' in spell || 'classVariant' in spell || 'subclass' in spell) {
        matchedSpellShape = true;
      }
      total++;
    }
  }
  return matchedSpellShape ? total : 0;
}

/**
 * Recompute per-kind counts assuming only entries whose `source` is in
 * `selectedSources` will be imported. Used by the modal to show live
 * counts as the user toggles source chips. When `selectedSources` is
 * null (the default = "import everything") this returns the original
 * probe counts unchanged.
 */
export function applySourceFilter(
  probe: ImportableContent,
  selectedSources: Set<string> | null,
): Pick<ImportableContent,
  | 'subclasses' | 'feats' | 'spells' | 'backgrounds' | 'items'
  | 'species' | 'monsters' | 'classes' | 'optionalFeatures'
  | 'deities' | 'variantRules' | 'magicVariants'
  | 'classFluff' | 'backgroundFluff' | 'featFluff' | 'itemFluff'
  | 'speciesFluff' | 'creatureFluff'
  | 'spellClasses'
> {
  if (!selectedSources) {
    return {
      subclasses:       probe.subclasses,
      feats:            probe.feats,
      spells:           probe.spells,
      backgrounds:      probe.backgrounds,
      items:            probe.items,
      species:          probe.species,
      monsters:         probe.monsters,
      classes:          probe.classes,
      optionalFeatures: probe.optionalFeatures,
      deities:          probe.deities,
      variantRules:     probe.variantRules,
      magicVariants:    probe.magicVariants,
      classFluff:       probe.classFluff,
      backgroundFluff:  probe.backgroundFluff,
      featFluff:        probe.featFluff,
      itemFluff:        probe.itemFluff,
      speciesFluff:     probe.speciesFluff,
      creatureFluff:    probe.creatureFluff,
      spellClasses:     probe.spellClasses,
    };
  }
  const sumKind = (...keys: string[]) => keys.reduce((n, key) => {
    const counts = probe.sourcesByKind[key] ?? {};
    let s = 0;
    for (const [src, c] of Object.entries(counts)) {
      if (selectedSources.has(src)) s += c;
    }
    return n + s;
  }, 0);
  return {
    subclasses:       sumKind('subclass'),
    feats:            sumKind('feat'),
    spells:           sumKind('spell'),
    backgrounds:      sumKind('background'),
    items:            sumKind('baseitem', 'item'),
    species:          sumKind('race', 'subrace'),
    monsters:         sumKind('monster'),
    classes:          sumKind('class'),
    optionalFeatures: sumKind('optionalfeature'),
    deities:          sumKind('deity'),
    variantRules:     sumKind('variantrule'),
    magicVariants:    sumKind('magicvariant'),
    classFluff:       sumKind('classFluff', 'subclassFluff'),
    backgroundFluff:  sumKind('backgroundFluff'),
    featFluff:        sumKind('featFluff'),
    itemFluff:        sumKind('itemFluff'),
    speciesFluff:     sumKind('raceFluff', 'subraceFluff'),
    creatureFluff:    sumKind('monsterFluff'),
    // Lookup-file content isn't bucketed by spell source for filter
    // purposes — its sentinel source lives outside the picker (see
    // probeContent). Pass the full count through unchanged.
    spellClasses:     probe.spellClasses,
  };
}
