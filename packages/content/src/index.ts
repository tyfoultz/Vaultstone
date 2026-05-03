export { ContentResolver } from './resolver';
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

// Imported-tier content packs — user-imported JSON content (e.g. from
// 5e.tools), stored on-device only. The resolver consumes this via the
// 'imported' tier; callers manage batches through the listBatches /
// saveBatch / removeBatch API.
export {
  listBatches,
  saveBatch,
  removeBatch,
  loadEntriesByBatch,
  getSourceBreakdown,
  loadEntriesBySource,
  transformSubclasses,
  stripMarkup,
} from './imported/index';
export type {
  ImportBatch,
  SourceBreakdown,
  RawClassFile,
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
