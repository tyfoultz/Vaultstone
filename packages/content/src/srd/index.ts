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
  SkillResult,
  DamageTypeResult,
  SchoolResult,
  SizeResult,
  LanguageResult,
  ActionTypeResult,
  WeaponPropertyResult,
  WeaponMasteryResult,
  SrdVersion,
} from '@vaultstone/types';

import speciesData         from './data/species.json';
import classesData         from './data/classes.json';
import backgroundsData     from './data/backgrounds.json';
import subclassesData      from './data/subclasses.json';
import conditionsData      from './data/conditions.json';
import spellsData          from './data/spells.json';
import itemsData           from './data/items.json';
import featsData           from './data/feats.json';
import creaturesData       from './data/creatures.json';
import skillsData          from './data/skills.json';
import damageTypesData     from './data/damage-types.json';
import schoolsData         from './data/schools.json';
import sizesData           from './data/sizes.json';
import languagesData       from './data/languages.json';
import actionTypesData     from './data/action-types.json';
import weaponPropsData     from './data/weapon-properties.json';
import weaponMasteriesData from './data/weapon-masteries.json';

// SRD content is CC-BY 4.0 — attribution must be displayed in the UI wherever this content is shown.
// Attribution text: "Content from the Systems Reference Document 5.1 / 2.0 is available under
// the Creative Commons Attribution 4.0 International License."
//
// NOTE: spells / items / creatures are currently *seed-only* — a small representative
// sample (~10 each) wired up so the content pipeline and UI render correctly. The full
// SRD bundle for those types will land in a follow-up data-import pass that vendors
// a CC-BY-4.0 SRD JSON dump.

const SPECIES           = speciesData         as unknown as SpeciesResult[];
const CLASSES           = classesData         as unknown as ClassResult[];
const BACKGROUNDS       = backgroundsData     as unknown as BackgroundResult[];
const SUBCLASSES        = subclassesData      as unknown as SubclassResult[];
const CONDITIONS        = conditionsData      as unknown as ConditionResult[];
const SPELLS            = spellsData          as unknown as SpellResult[];
const ITEMS             = itemsData           as unknown as ItemResult[];
const FEATS             = featsData           as unknown as FeatResult[];
const CREATURES         = creaturesData       as unknown as CreatureResult[];
const SKILLS            = skillsData          as unknown as SkillResult[];
const DAMAGE_TYPES      = damageTypesData     as unknown as DamageTypeResult[];
const SCHOOLS           = schoolsData         as unknown as SchoolResult[];
const SIZES             = sizesData           as unknown as SizeResult[];
const LANGUAGES         = languagesData       as unknown as LanguageResult[];
const ACTION_TYPES      = actionTypesData     as unknown as ActionTypeResult[];
const WEAPON_PROPERTIES = weaponPropsData     as unknown as WeaponPropertyResult[];
const WEAPON_MASTERIES  = weaponMasteriesData as unknown as WeaponMasteryResult[];

const ALL_SRD: ContentResult[] = [
  ...SPECIES, ...CLASSES, ...BACKGROUNDS, ...SUBCLASSES,
  ...CONDITIONS, ...SPELLS, ...ITEMS, ...FEATS, ...CREATURES,
  ...SKILLS, ...DAMAGE_TYPES, ...SCHOOLS, ...SIZES, ...LANGUAGES,
  ...ACTION_TYPES, ...WEAPON_PROPERTIES, ...WEAPON_MASTERIES,
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
  skills: number;
  damageTypes: number;
  schools: number;
  sizes: number;
  languages: number;
  actionTypes: number;
  weaponProperties: number;
  weaponMasteries: number;
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
  skills: SkillResult[];
  damageTypes: DamageTypeResult[];
  schools: SchoolResult[];
  sizes: SizeResult[];
  languages: LanguageResult[];
  actionTypes: ActionTypeResult[];
  weaponProperties: WeaponPropertyResult[];
  weaponMasteries: WeaponMasteryResult[];
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
      skills: SKILLS, damageTypes: DAMAGE_TYPES, schools: SCHOOLS,
      sizes: SIZES, languages: LANGUAGES, actionTypes: ACTION_TYPES,
      weaponProperties: WEAPON_PROPERTIES, weaponMasteries: WEAPON_MASTERIES,
    };
  }

  const matches = (r: ContentResult & { srdVersions?: string[] }) =>
    r.srdVersions?.includes(version) ?? false;

  return {
    species:          SPECIES.filter(matches),
    classes:          CLASSES.filter(matches),
    subclasses:       SUBCLASSES.filter(matches),
    backgrounds:      BACKGROUNDS.filter(matches),
    conditions:       CONDITIONS.filter(matches),
    spells:           SPELLS.filter(matches),
    items:            ITEMS.filter(matches),
    feats:            FEATS.filter(matches),
    creatures:        CREATURES.filter(matches),
    skills:           SKILLS.filter(matches),
    damageTypes:      DAMAGE_TYPES.filter(matches),
    schools:          SCHOOLS.filter(matches),
    sizes:            SIZES.filter(matches),
    languages:        LANGUAGES.filter(matches),
    actionTypes:      ACTION_TYPES.filter(matches),
    weaponProperties: WEAPON_PROPERTIES.filter(matches),
    weaponMasteries:  WEAPON_MASTERIES.filter(matches),
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
  const counts = {
    species:          c.species.length,
    classes:          c.classes.length,
    subclasses:       c.subclasses.length,
    backgrounds:      c.backgrounds.length,
    conditions:       c.conditions.length,
    spells:           c.spells.length,
    items:            c.items.length,
    feats:            c.feats.length,
    creatures:        c.creatures.length,
    skills:           c.skills.length,
    damageTypes:      c.damageTypes.length,
    schools:          c.schools.length,
    sizes:            c.sizes.length,
    languages:        c.languages.length,
    actionTypes:      c.actionTypes.length,
    weaponProperties: c.weaponProperties.length,
    weaponMasteries:  c.weaponMasteries.length,
  };
  const total = Object.values(counts).reduce((a, n) => a + n, 0);
  return { ...counts, total };
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

/**
 * Content types treated as small enumerated catalogs (skills, damage types,
 * schools, etc.). The detail-page UI groups these under a single "Reference"
 * tab rather than giving each its own top-level tab — they're short, mostly
 * fixed lists used as lookup tables.
 */
export const REFERENCE_TYPES = [
  'skills', 'damageTypes', 'schools', 'sizes', 'languages',
  'actionTypes', 'weaponProperties', 'weaponMasteries',
] as const satisfies ReadonlyArray<keyof SrdContent>;

export type ReferenceTypeKey = typeof REFERENCE_TYPES[number];
