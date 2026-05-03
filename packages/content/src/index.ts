export { ContentResolver } from './resolver';
export {
  getSrdCounts, getSrdCountsByVersion, getSrdContent,
  SEED_ONLY_TYPES, REFERENCE_TYPES,
} from './srd';
export type { SrdCounts, SrdContent, ReferenceTypeKey } from './srd';
export {
  getSourcesByCampaign,
  getSourceById,
  saveSource,
  deleteSourceById,
} from './local/db';
export type { LocalSource } from './local/db';

// Content index framework — on-device full-text search over user PDFs.
// Actual PDF parsing is plugged in separately; this module only indexes the
// page text it's handed. See packages/content/src/local/indexer.ts.
export {
  indexSource,
  reindexSource,
  removeSourceFromIndex,
  searchCampaign,
  getIndexStatus,
  getCampaignIndexStatuses,
} from './local/indexer';
export type {
  CampaignHit,
  IndexMeta,
  IndexStatus,
  LocalContentHit,
  PageText,
} from './local/indexer';

// PDF parsing — platform-split. Web is implemented; native throws until Phase 5c.
export { extractPages } from './local/pdf-parser';
export type { ExtractOptions, PageInput } from './local/pdf-parser.web';

// Imported-tier content packs — user-imported JSON content (e.g. from
// 5e.tools), stored on-device only. The resolver consumes this via the
// 'imported' tier; callers manage batches through the listBatches /
// saveBatch / removeBatch API.
export {
  listBatches,
  saveBatch,
  removeBatch,
  loadEntriesByBatch,
} from './imported/index';
export type { ImportBatch } from './imported/index';

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
