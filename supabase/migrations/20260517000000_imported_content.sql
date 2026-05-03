-- Imported content: structured entries derived from user-supplied JSON
-- imports (e.g. 5e.tools community packs). Stored separately from
-- `homebrew_content` because the data shapes differ — imported entries
-- carry the rich `*Result`-shaped payload from the on-device transforms
-- (full subclassFeatures arrays, structured class progression, source
-- provenance), while `homebrew_content` is the user-authored schema with
-- intentional gaps for free-form prose.
--
-- Imports share the `homebrew_packs` parent table so the user-facing
-- "content pack" concept is unified — one Supabase pack row backs both
-- authored and imported entries. Reading code joins both tables under
-- the homebrew tier in ContentResolver.
--
-- Why a separate table rather than a `source` discriminator on
-- homebrew_content: forcing imported entries through the homebrew
-- authoring data shape would be lossy (no subclass support, no typed
-- features, etc.). Conversely, expanding homebrew_content's schema to
-- accept rich data would force the authoring forms to either match it
-- or skip fields. Two tables keep both stories honest.

create table imported_content (
  id            uuid primary key default gen_random_uuid(),
  pack_id       uuid not null references homebrew_packs(id) on delete cascade,
  user_id       uuid not null references profiles(id) on delete cascade,
  -- Mirrors homebrew_content.content_type but accepts a wider set
  -- including 'subclass' (which the authoring forms don't yet support
  -- but importers regularly produce).
  content_type  text not null,
  name          text not null,
  -- Full *Result-shaped payload as produced by the import transforms
  -- (see packages/content/src/imported/transform/*). The reading layer
  -- consumes this directly without re-mapping.
  data          jsonb not null,
  -- Stable key derived at import time so re-imports of the same source
  -- file collapse instead of duplicating. Format mirrors what the
  -- transforms produce (e.g. `imported_<system>_subclass_phb_barbarian_berserker`).
  entry_key     text not null,
  -- Source-book provenance preserved separately so the resolver can
  -- attach it back to ContentResult.importSource without re-parsing data.
  source_code   text,
  source_name   text,
  source_page   int,
  -- Source filename the entry was extracted from. Lets the UI group
  -- entries by import file ("PHB.json: 36 subclasses, 12 feats") even
  -- when one pack contains multiple imports.
  source_url    text,
  imported_at   timestamptz not null default now()
);

-- One entry per (pack, key) — re-imports replace by upsert.
create unique index imported_content_pack_key_idx
  on imported_content(pack_id, entry_key);

create index imported_content_pack_id_idx      on imported_content(pack_id);
create index imported_content_user_id_idx      on imported_content(user_id);
create index imported_content_content_type_idx on imported_content(content_type);

-- ---------------------------------------------------------------------------
-- RLS — mirrors homebrew_content exactly. Owner can CRUD; published
-- campaign-scoped packs cascade read access to campaign members.
-- ---------------------------------------------------------------------------
alter table imported_content enable row level security;

create policy "imported_content: owner or pack-published-campaign-member can read"
  on imported_content for select
  using (
    auth.uid() = user_id
    or exists (
      select 1 from homebrew_packs
      where homebrew_packs.id = imported_content.pack_id
        and homebrew_packs.is_published = true
        and homebrew_packs.campaign_id is not null
        and exists (
          select 1 from campaigns
          where campaigns.id = homebrew_packs.campaign_id
            and (
              campaigns.dm_user_id = auth.uid()
              or exists (
                select 1 from characters
                where characters.campaign_id = campaigns.id
                  and characters.user_id = auth.uid()
              )
            )
        )
    )
  );

create policy "imported_content: owner can insert"
  on imported_content for insert
  with check (auth.uid() = user_id);

create policy "imported_content: owner can update"
  on imported_content for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "imported_content: owner can delete"
  on imported_content for delete
  using (auth.uid() = user_id);
