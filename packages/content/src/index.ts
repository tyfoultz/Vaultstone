export { ContentResolver } from './resolver';
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
