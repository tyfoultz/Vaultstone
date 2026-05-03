import type { ContentType } from '@vaultstone/types';

/** One import (system × content type × source URL) — metadata only. */
export type ImportBatch = {
  id: string;
  system_id: string;
  content_type: ContentType;
  source_url: string;
  /** Optional human label captured at import time (e.g. "5e.tools community library"). */
  source_label: string | null;
  /** ISO timestamp. */
  imported_at: string;
  entry_count: number;
};

/** Raw payload row — internal to the storage layer. */
export type ImportedEntryRow = {
  batch_id: string;
  entry_key: string;
  content_type: string;
  system_id: string;
  payload_json: string;
};
