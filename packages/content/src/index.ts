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
