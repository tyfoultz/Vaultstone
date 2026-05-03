-- Unified content packs — sharing model rewrite.
--
-- Before: a homebrew pack chose at creation time whether it was a
-- "personal library" pack (campaign_id null) or a "campaign-scoped"
-- pack (campaign_id = X). is_published flipped a campaign-scoped pack
-- visible to that campaign's other members. RLS on homebrew_packs and
-- its child entry tables (homebrew_content, imported_content) read
-- those columns to gate access.
--
-- After: every pack lives in the owner's library, no upfront scope
-- choice. A pack becomes visible to a campaign's other members iff
-- the pack is enabled on that campaign via campaign_packs. Pack owner
-- still controls which of their packs are enabled where (only owners
-- can insert their packs into campaign_packs; only campaign DMs can
-- enable/disable existing rows).
--
-- This migration:
--   1. Drops homebrew_packs.campaign_id and is_published
--   2. Rewrites the SELECT policies on homebrew_packs, homebrew_content,
--      and imported_content to read from campaign_packs instead
--   3. Tightens campaign_packs INSERT to require the inserter to own
--      the pack (the strict-scope #3 from the design discussion)
--
-- Pre-prod assumption: nothing is in production yet, so no data
-- migration needed for existing rows. New columns just disappear.

-- ---------------------------------------------------------------------------
-- 1. Drop old columns + their indexes
-- ---------------------------------------------------------------------------

-- The published-cascade SELECT policy referenced both columns; tear it
-- down before dropping its dependencies.
drop policy if exists "homebrew_packs: owner or campaign member can read" on homebrew_packs;
drop policy if exists "homebrew_content: owner can read own" on homebrew_content;
drop policy if exists "imported_content: owner or pack-published-campaign-member can read" on imported_content;

drop index if exists homebrew_packs_campaign_id_idx;

alter table homebrew_packs drop column if exists campaign_id;
alter table homebrew_packs drop column if exists is_published;

-- homebrew_content also carried a (now meaningless) campaign_id and
-- is_published. Drop them too — they were holdovers from the original
-- pre-pack schema and aren't read by any current code path.
alter table homebrew_content drop column if exists campaign_id;
alter table homebrew_content drop column if exists is_published;
drop index if exists homebrew_content_campaign_id_idx;

-- ---------------------------------------------------------------------------
-- 2. New SELECT policies — read access cascades from campaign_packs
-- ---------------------------------------------------------------------------

-- A pack is readable if:
--   a) you own it, OR
--   b) the pack is enabled on a campaign you're a member of (DM or
--      character owner) via campaign_packs.enabled = true
create policy "homebrew_packs: owner or campaign-pack member can read"
  on homebrew_packs for select
  using (
    auth.uid() = owner_user_id
    or exists (
      select 1 from campaign_packs
      where campaign_packs.pack_id = homebrew_packs.id
        and campaign_packs.enabled = true
        and exists (
          select 1 from campaigns
          where campaigns.id = campaign_packs.campaign_id
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

-- Child-entry SELECT policies mirror the parent: owner always; campaign
-- members iff the parent pack is enabled on a campaign they're in.
create policy "homebrew_content: owner or pack-enabled-campaign-member can read"
  on homebrew_content for select
  using (
    auth.uid() = user_id
    or exists (
      select 1 from campaign_packs
      where campaign_packs.pack_id = homebrew_content.pack_id
        and campaign_packs.enabled = true
        and exists (
          select 1 from campaigns
          where campaigns.id = campaign_packs.campaign_id
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

create policy "imported_content: owner or pack-enabled-campaign-member can read"
  on imported_content for select
  using (
    auth.uid() = user_id
    or exists (
      select 1 from campaign_packs
      where campaign_packs.pack_id = imported_content.pack_id
        and campaign_packs.enabled = true
        and exists (
          select 1 from campaigns
          where campaigns.id = campaign_packs.campaign_id
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

-- ---------------------------------------------------------------------------
-- 3. Tighten campaign_packs INSERT — the inserter must own the pack
--    AND DM the campaign. Today's policy only checked the DM half;
--    that let a DM attach a pack they could merely *read* (someone
--    else's published pack) to their campaign. The strict-scope rule
--    from the design discussion is that only the pack owner controls
--    where their pack lands. UPDATE/DELETE stay DM-only — once the
--    owner has opted in, the campaign DM controls the on/off toggle.
-- ---------------------------------------------------------------------------
drop policy if exists "campaign_packs: dm can insert" on campaign_packs;

create policy "campaign_packs: dm-owner can insert"
  on campaign_packs for insert
  with check (
    exists (
      select 1 from campaigns
      where campaigns.id = campaign_packs.campaign_id
        and campaigns.dm_user_id = auth.uid()
    )
    and exists (
      select 1 from homebrew_packs
      where homebrew_packs.id = campaign_packs.pack_id
        and homebrew_packs.owner_user_id = auth.uid()
    )
  );
