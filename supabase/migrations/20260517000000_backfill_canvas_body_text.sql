-- Backfill body_text for canvas pages that have __canvas_blocks but
-- empty body_text. The BEFORE trigger handles new writes, but pages
-- created before the trigger was added may have stale/empty body_text.

UPDATE world_pages
SET body_text = _extract_canvas_text(body),
    body_refs = _extract_canvas_refs(body)
WHERE body ? '__canvas_blocks'
  AND (body_text IS NULL OR body_text = '')
  AND deleted_at IS NULL;
