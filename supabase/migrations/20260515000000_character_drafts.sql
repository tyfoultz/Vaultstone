-- Save-as-draft for the character creation wizard. Drafts let players
-- park work in progress (e.g. picked a class but haven't named the
-- character yet) and resume later from any device. They live alongside
-- completed characters but in their own table because the schema needs
-- to allow null/missing fields throughout the wizard's lifecycle —
-- forcing them into `characters` would mean loosening NOT NULL
-- constraints there.
--
-- Lifecycle: created when the user taps "Save draft" → updated on
-- subsequent saves of the same draft → deleted when the draft is
-- promoted to a real `characters` row at completion. RLS scopes drafts
-- to their owner; campaign membership doesn't grant draft access (a
-- draft is in-progress and private until the player ships it).

create table character_drafts (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references profiles(id) on delete cascade,
  -- Display name shown in the drafts list. Falls back client-side to
  -- "Untitled draft" / class + species when the user hasn't set
  -- characterName yet.
  name        text,
  -- The full CharacterDraft shape (see packages/store/src/character-draft.store.ts).
  -- Stored as jsonb so the schema doesn't need to track the wizard's
  -- internal fields — same pattern as characters.base_stats.
  data        jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index character_drafts_user_id_idx    on character_drafts(user_id);
create index character_drafts_updated_at_idx on character_drafts(updated_at desc);

create trigger character_drafts_updated_at
  before update on character_drafts
  for each row execute function handle_updated_at();

alter table character_drafts enable row level security;

create policy "character_drafts: owner can read"
  on character_drafts for select
  using (auth.uid() = user_id);

create policy "character_drafts: owner can insert"
  on character_drafts for insert
  with check (auth.uid() = user_id);

create policy "character_drafts: owner can update"
  on character_drafts for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "character_drafts: owner can delete"
  on character_drafts for delete
  using (auth.uid() = user_id);
