// Imported-content transforms.
//
// The on-device storage / resolver tier this module used to host was
// retired when imports were unified with homebrew packs. Imported entries
// now write to Supabase via the imported_content table (see
// packages/api/src/imported-content.ts) and surface through the homebrew
// resolver under their parent pack. The transforms remain — they take a
// raw third-party JSON payload (e.g. 5e.tools class.json) and produce
// our `*Result` shapes ready for upsert.

export { transformSubclasses } from './transform/subclasses';
export type { RawClassFile } from './transform/subclasses';
export { transformFeats } from './transform/feats';
export type { RawFeatsFile } from './transform/feats';
export { transformSpells } from './transform/spells';
export type { RawSpellsFile } from './transform/spells';
export { transformBackgrounds } from './transform/backgrounds';
export type { RawBackgroundsFile } from './transform/backgrounds';
export { transformItems } from './transform/items';
export type { RawItemsFile } from './transform/items';
export { transformSpecies } from './transform/species';
export type { RawRacesFile } from './transform/species';
export { transformMonsters } from './transform/monsters';
export type { RawBestiaryFile } from './transform/monsters';
export { transformClasses } from './transform/classes';
export type { RawClassesFile } from './transform/classes';
export { transformClassFluff, transformFluff } from './transform/fluff';
export type { RawFluffFile, FluffPatch, FluffContentType } from './transform/fluff';
export { transformSpellSourceLookup } from './transform/spellSourceLookup';
export type { RawSpellSourceLookupFile, SpellClassesPatch } from './transform/spellSourceLookup';
export { transformOptionalFeatures } from './transform/optionalFeatures';
export type { RawOptionalFeaturesFile } from './transform/optionalFeatures';
export { transformDeities } from './transform/deities';
export type { RawDeitiesFile } from './transform/deities';
export { transformVariantRules } from './transform/variantRules';
export type { RawVariantRulesFile } from './transform/variantRules';
export { transformMagicVariants } from './transform/magicVariants';
export type { RawMagicVariantsFile } from './transform/magicVariants';
// All transforms share TransformOptions; export one since they're
// structurally identical.
export type { TransformOptions } from './transform/feats';
export { stripMarkup } from './transform/markup';
