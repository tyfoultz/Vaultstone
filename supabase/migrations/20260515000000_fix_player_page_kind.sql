-- Fix existing player pages that were created with page_kind='custom'
-- due to players.v1 template having defaultPageKind='custom' instead of 'pc_stub'.
-- The v2 template corrects this for new pages; this migration fixes existing ones.

UPDATE world_pages
SET page_kind = 'pc_stub',
    template_version = 2
WHERE template_key = 'players'
  AND page_kind = 'custom'
  AND deleted_at IS NULL;
