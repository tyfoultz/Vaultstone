-- Homebrew packs: named, user-curated bundles of homebrew content.
--
-- The original `homebrew_content` table treated each entry as a standalone
-- row (one spell, one creature). DMs in practice author *collections* —
-- "House Rules", "My Greyhawk Pack", "Critical Role Inspirations". This
-- migration adds a parent table so entries can be grouped, named, and later
-- toggled on/off per campaign as a unit.
--
-- Phase 1 scope (this migration):
--   * homebrew_packs table — owner_user_id, name, description, is_published
--   * homebrew_content gains a pack_id FK (nullable for back-compat with
--     existing rows; future entries should always belong to a pack)
--   * RLS policies mirror homebrew_content's: owners can CRUD their own
--     packs; published packs scoped to a campaign are readable by campaign
--     members.
--
-- Phase 2+ (future migrations):
--   * Sharing scopes (per-campaign vs global vs personal)
--   * Pack import/export tracking
--   * Campaign-level enable/disable join table

create table homebrew_packs (
  id              uuid primary key default gen_random_uuid(),
  owner_user_id   uuid not null references profiles(id) on delete cascade,
  -- A pack scoped to a campaign is private to that campaign's GM/players.
  -- A pack with campaign_id = null is the user's personal library, usable
  -- across any of their campaigns when toggled in Content Settings.
  campaign_id     uuid references campaigns(id) on delete cascade,
  name            text not null,
  description     text,
  -- is_published flips a pack visible to other members of its campaign.
  -- Without this, only the owner can see / use the pack.
  is_published    boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index homebrew_packs_owner_user_id_idx on homebrew_packs(owner_user_id);
create index homebrew_packs_campaign_id_idx   on homebrew_packs(campaign_id);

create trigger homebrew_packs_updated_at
  before update on homebrew_packs
  for each row execute function handle_updated_at();

-- Add the FK from content → pack. Nullable for existing rows; new entries
-- created via the homebrew-packs UI will always set it.
alter table homebrew_content
  add column pack_id uuid references homebrew_packs(id) on delete cascade;

create index homebrew_content_pack_id_idx on homebrew_content(pack_id);

-- ---------------------------------------------------------------------------
-- RLS — homebrew_packs
-- ---------------------------------------------------------------------------
alter table homebrew_packs enable row level security;

-- Read: owner always; published+campaign-scoped packs visible to campaign
-- members (DM or any character owner). Personal published packs (campaign
-- null) stay owner-only — sharing personal libraries is a future feature.
create policy "homebrew_packs: owner or campaign member can read"
  on homebrew_packs for select
  using (
    auth.uid() = owner_user_id
    or (
      is_published = true
      and campaign_id is not null
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

create policy "homebrew_packs: owner can insert"
  on homebrew_packs for insert
  with check (auth.uid() = owner_user_id);

create policy "homebrew_packs: owner can update"
  on homebrew_packs for update
  using (auth.uid() = owner_user_id)
  with check (auth.uid() = owner_user_id);

create policy "homebrew_packs: owner can delete"
  on homebrew_packs for delete
  using (auth.uid() = owner_user_id);
