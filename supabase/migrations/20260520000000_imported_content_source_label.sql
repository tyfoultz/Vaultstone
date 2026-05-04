-- Per-import "source label" so a single homebrew pack can hold multiple
-- imports rendered as cards. Was: re-importing the same JSON file into a
-- pack merged via (pack_id, entry_key); the pack's display name was the
-- only human label, and the only way to dedupe a re-import was to keep
-- the same pack name. Now: the pack is user-named freely, each import
-- inside it gets its own user-given `source_label` (e.g. "PHB", "Tasha's"),
-- and the dedupe key broadens to (pack_id, source_label, entry_key).
--
-- Backfill: existing rows get source_label derived from source_url
-- (filename minus .json), or 'Imported' if source_url is null. After
-- backfill the column flips to NOT NULL.

alter table imported_content add column if not exists source_label text;

update imported_content
set source_label = coalesce(
  nullif(regexp_replace(source_url, '\.json$', '', 'i'), ''),
  'Imported'
)
where source_label is null;

alter table imported_content alter column source_label set not null;

-- Swap the unique constraint. The original index name from the
-- 20260517000000 migration is `imported_content_pack_key_idx`.
drop index if exists imported_content_pack_key_idx;

create unique index imported_content_pack_label_key_idx
  on imported_content(pack_id, source_label, entry_key);

-- Per-card listing index — speeds up the "show entries from this card"
-- view on the pack detail page and the per-card delete on Remove.
create index if not exists imported_content_pack_label_idx
  on imported_content(pack_id, source_label);
