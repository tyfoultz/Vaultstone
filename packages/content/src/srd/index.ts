import type {
  ContentResult,
  ContentQuery,
  SpeciesResult,
  ClassResult,
  BackgroundResult,
  SubclassResult,
  ConditionResult,
  SpellResult,
  ItemResult,
  FeatResult,
  CreatureResult,
  SrdVersion,
} from '@vaultstone/types';

import speciesData from './data/species.json';
import classesData from './data/classes.json';
import backgroundsData from './data/backgrounds.json';
import subclassesData from './data/subclasses.json';
import conditionsData from './data/conditions.json';
import spellsData from './data/spells.json';
import itemsData from './data/items.json';
import featsData from './data/feats.json';
import creaturesData from './data/creatures.json';

// SRD content is CC-BY 4.0 — attribution must be displayed in the UI wherever this content is shown.
// Attribution text: "Content from the Systems Reference Document 5.1 / 2.0 is available under
// the Creative Commons Attribution 4.0 International License."
//
// NOTE: spells / items / creatures are currently *seed-only* — a small representative
// sample (~10 each) wired up so the content pipeline and UI render correctly. The full
// SRD bundle for those types will land in a follow-up data-import pass that vendors
// a CC-BY-4.0 SRD JSON dump.

const SPECIES     = speciesData     as unknown as SpeciesResult[];
const CLASSES     = classesData     as unknown as ClassResult[];
const BACKGROUNDS = backgroundsData as unknown as BackgroundResult[];
const SUBCLASSES  = subclassesData  as unknown as SubclassResult[];
const CONDITIONS  = conditionsData  as unknown as ConditionResult[];
const SPELLS      = spellsData      as unknown as SpellResult[];
const ITEMS       = itemsData       as unknown as ItemResult[];
const FEATS       = featsData       as unknown as FeatResult[];
const CREATURES   = creaturesData   as unknown as CreatureResult[];

const ALL_SRD: ContentResult[] = [
  ...SPECIES, ...CLASSES, ...BACKGROUNDS, ...SUBCLASSES,
  ...CONDITIONS, ...SPELLS, ...ITEMS, ...FEATS, ...CREATURES,
];

export function search(query: ContentQuery): ContentResult[] {
  let results = ALL_SRD;

  if (query.type) {
    results = results.filter((r) => r.type === query.type);
  }

  if (query.system) {
    results = results.filter((r) => r.system === query.system);
  }

  if (query.srdVersion) {
    const version = query.srdVersion;
    results = results.filter((r) => {
      const item = r as ContentResult & { srdVersions?: string[] };
      return item.srdVersions?.includes(version) ?? true;
    });
  }

  if (query.search) {
    const term = query.search.toLowerCase();
    results = results.filter(
      (r) => r.name.toLowerCase().includes(term) || r.key.includes(term)
    );
  }

  return results;
}

export interface SrdCounts {
  species: number;
  classes: number;
  subclasses: number;
  backgrounds: number;
  conditions: number;
  spells: number;
  items: number;
  feats: number;
  creatures: number;
  total: number;
}

export interface SrdContent {
  species: SpeciesResult[];
  classes: ClassResult[];
  subclasses: SubclassResult[];
  backgrounds: BackgroundResult[];
  conditions: ConditionResult[];
  spells: SpellResult[];
  items: ItemResult[];
  feats: FeatResult[];
  creatures: CreatureResult[];
}

/**
 * Synchronous accessor for the bundled SRD records grouped by type.
 * Pass a `version` to filter to records whose `srdVersions` array includes
 * that version. Omit `version` to get the unfiltered union.
 */
export function getSrdContent(version?: SrdVersion): SrdContent {
  if (!version) {
    return {
      species: SPECIES, classes: CLASSES, subclasses: SUBCLASSES,
      backgrounds: BACKGROUNDS, conditions: CONDITIONS, spells: SPELLS,
      items: ITEMS, feats: FEATS, creatures: CREATURES,
    };
  }

  const matches = (r: ContentResult & { srdVersions?: string[] }) =>
    r.srdVersions?.includes(version) ?? false;

  return {
    species:     SPECIES.filter(matches),
    classes:     CLASSES.filter(matches),
    subclasses:  SUBCLASSES.filter(matches),
    backgrounds: BACKGROUNDS.filter(matches),
    conditions:  CONDITIONS.filter(matches),
    spells:      SPELLS.filter(matches),
    items:       ITEMS.filter(matches),
    feats:       FEATS.filter(matches),
    creatures:   CREATURES.filter(matches),
  };
}

/** Synchronous count of bundled SRD records, by type. */
export function getSrdCounts(): SrdCounts {
  return countsFromContent(getSrdContent());
}

/**
 * Synchronous count of bundled SRD records by type, optionally filtered to
 * a specific SRD version.
 */
export function getSrdCountsByVersion(version?: SrdVersion): SrdCounts {
  return countsFromContent(getSrdContent(version));
}

function countsFromContent(c: SrdContent): SrdCounts {
  const total =
    c.species.length + c.classes.length + c.subclasses.length +
    c.backgrounds.length + c.conditions.length + c.spells.length +
    c.items.length + c.feats.length + c.creatures.length;
  return {
    species:     c.species.length,
    classes:     c.classes.length,
    subclasses:  c.subclasses.length,
    backgrounds: c.backgrounds.length,
    conditions:  c.conditions.length,
    spells:      c.spells.length,
    items:       c.items.length,
    feats:       c.feats.length,
    creatures:   c.creatures.length,
    total,
  };
}

/**
 * Content types whose SRD bundle is currently a small seed rather than the
 * full SRD release. The detail-page UI surfaces a banner when a tab is in
 * this set so users know more entries are coming.
 */
export const SEED_ONLY_TYPES = new Set<keyof SrdContent>([
  'spells',
  'items',
  'creatures',
]);
