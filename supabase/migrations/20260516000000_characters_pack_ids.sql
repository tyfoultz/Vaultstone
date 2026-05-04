-- Standalone characters can opt into homebrew packs at creation time.
-- Campaign-linked characters inherit their pack set from
-- campaign_packs (via the campaign), so the pack_ids array on those
-- rows stays empty — the canonical source for those is the join table.
--
-- Stored as text[] (not uuid[]) for consistency with characters.system
-- which is also a string FK. Empty array = no homebrew, content
-- resolution falls back to SRD only. NULL is treated the same as
-- empty by the resolver, but we default to '{}' to keep the type
-- non-nullable and avoid the null/empty fork in callers.

alter table characters
  add column pack_ids text[] not null default '{}'::text[];

-- Reverse-lookup index: "which characters reference this pack?" Useful
-- when the user deletes a pack — we can offer to either unlink the
-- characters or warn before cascade. Postgres GIN handles array
-- overlap efficiently.
create index characters_pack_ids_idx on characters using gin (pack_ids);
