export { ContentResolver } from './resolver';
// Homebrew-row → *Result mappers. Used by the homebrew tier inside
// ContentResolver and re-used by the pack detail page to hydrate
// fetched rows into the shape the shared content-table list components
// expect.
export { mapEntryToResult, mapImportedEntryToResult, invalidateHomebrewCache } from './homebrew/index';
export {
  getSrdCounts, getSrdCountsByVersion, getSrdContent,
  SEED_ONLY_TYPES, REFERENCE_TYPES,
} from './srd';
export type { SrdCounts, SrdContent, ReferenceTypeKey } from './srd';
// Per-campaign PDF source storage. Backs the in-app PDF reader at
// app/campaign/[id]/rulebook.tsx — read/write the user's uploaded PDFs.
// Text extraction and FTS indexing were removed in favor of structured
// JSON imports (see imported/ below); the storage layer that records the
// uploaded file's location stays.
export {
  getSourcesByCampaign,
  getSourceById,
  saveSource,
  deleteSourceById,
} from './local/db';
export type { LocalSource } from './local/db';

// Imported-content transforms. Imports themselves are now Supabase-backed
// homebrew packs (see packages/api/src/imported-content.ts and the
// homebrew resolver in homebrew/index.ts) — the on-device store and
// 'imported' resolver tier were retired in M1 of the imports↔homebrew
// unification. Only the third-party-schema → *Result transforms remain
// here, used by the import modal to shape data before upserting.
export {
  transformSubclasses,
  transformFeats,
  transformSpells,
  transformBackgrounds,
  transformItems,
  transformSpecies,
  transformMonsters,
  transformClasses,
  transformClassFluff,
  transformFluff,
  transformSpellSourceLookup,
  transformOptionalFeatures,
  transformDeities,
  transformVariantRules,
  transformMagicVariants,
  stripMarkup,
} from './imported/index';
export type {
  RawClassFile,
  RawClassesFile,
  RawFeatsFile,
  RawSpellsFile,
  RawBackgroundsFile,
  RawItemsFile,
  RawRacesFile,
  RawBestiaryFile,
  RawFluffFile,
  FluffPatch,
  FluffContentType,
  RawSpellSourceLookupFile,
  SpellClassesPatch,
  RawOptionalFeaturesFile,
  RawDeitiesFile,
  RawVariantRulesFile,
  RawMagicVariantsFile,
  TransformOptions,
} from './imported/index';

// World-builder section templates (Feature 9 Phase 2).
export {
  getTemplate,
  getLatestVersion,
  listTemplates,
} from './world-templates';
export type { TemplateSummary } from './world-templates';

// World-builder page body helpers (Feature 9 Phase 3).
export { jsonToPlainText } from './body-text';
export { extractMentionedPageIds, MENTION_NODE_NAME } from './body-refs';

// World-builder timeline helpers (Feature 9 Phase 6).
export { markdownToTiptap, markdownToPlainText } from './timeline/markdown-to-tiptap';
