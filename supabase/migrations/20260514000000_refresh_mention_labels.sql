-- One-time migration: refresh all @mention labels in page bodies to match
-- current page titles. Handles both LoreCanvas (HTML blocks) and Tiptap
-- (JSON doc) body formats.
--
-- LoreCanvas format: body->'blocks'->[]->html contains
--   <span class="vaultstone-mention" data-id="UUID">@ Old Title</span>
--
-- Tiptap format: body->'content'->[] recursive nodes with
--   { type: "vaultstoneMention", attrs: { id: "UUID", label: "Old Title" } }

-- Refresh LoreCanvas HTML mention labels
WITH canvas_pages AS (
  SELECT p.id AS page_id, b.idx, b.block, ref_page.id AS ref_id, ref_page.title
  FROM world_pages p,
       jsonb_array_elements(p.body->'blocks') WITH ORDINALITY AS b(block, idx),
       world_pages ref_page
  WHERE p.body ? 'blocks'
    AND b.block->>'html' LIKE '%vaultstone-mention%'
    AND ref_page.deleted_at IS NULL
    AND b.block->>'html' LIKE '%' || ref_page.id || '%'
),
updated_blocks AS (
  SELECT page_id,
         idx,
         jsonb_set(
           block,
           '{html}',
           to_jsonb(
             regexp_replace(
               block->>'html',
               '(<span[^>]*data-id="' || ref_id || '"[^>]*>)@\s*[^<]*(</span>)',
               '\1@ ' || replace(replace(title, '\', '\\'), '&', '&amp;') || '\2',
               'g'
             )
           )
         ) AS new_block,
         ref_id
  FROM canvas_pages
)
UPDATE world_pages p
SET body = jsonb_set(
  p.body,
  '{blocks}',
  (
    SELECT jsonb_agg(
      COALESCE(ub.new_block, elem.block)
      ORDER BY elem.idx
    )
    FROM jsonb_array_elements(p.body->'blocks') WITH ORDINALITY AS elem(block, idx)
    LEFT JOIN updated_blocks ub ON ub.page_id = p.id AND ub.idx = elem.idx
  )
)
FROM (SELECT DISTINCT page_id FROM updated_blocks) ub_pages
WHERE p.id = ub_pages.page_id;

-- Refresh Tiptap JSON mention labels via a plpgsql function
CREATE OR REPLACE FUNCTION _refresh_tiptap_mentions(doc jsonb)
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE
  i int;
  child jsonb;
  new_label text;
BEGIN
  IF doc IS NULL THEN RETURN NULL; END IF;

  IF doc->>'type' = 'vaultstoneMention' AND doc->'attrs'->>'id' IS NOT NULL THEN
    SELECT title INTO new_label
    FROM world_pages
    WHERE id = (doc->'attrs'->>'id')::uuid AND deleted_at IS NULL;
    IF new_label IS NOT NULL THEN
      doc := jsonb_set(doc, '{attrs,label}', to_jsonb(new_label));
    END IF;
  END IF;

  IF doc->'content' IS NOT NULL AND jsonb_typeof(doc->'content') = 'array' THEN
    FOR i IN 0..jsonb_array_length(doc->'content') - 1 LOOP
      child := _refresh_tiptap_mentions(doc->'content'->i);
      doc := jsonb_set(doc, ARRAY['content', i::text], child);
    END LOOP;
  END IF;

  RETURN doc;
END;
$$;

UPDATE world_pages
SET body = _refresh_tiptap_mentions(body)
WHERE body->>'type' = 'doc'
  AND body_refs IS NOT NULL
  AND array_length(body_refs, 1) > 0;

DROP FUNCTION _refresh_tiptap_mentions(jsonb);
