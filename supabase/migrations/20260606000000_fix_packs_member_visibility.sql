-- Fix: players without a character can't see campaign content packs.
--
-- The SELECT policies on homebrew_packs, homebrew_content, and
-- imported_content required the caller to either own the pack OR
-- have a character in a linked campaign. Players who have joined
-- a campaign (campaign_members row exists) but haven't created a
-- character yet were locked out — they couldn't see the DM's
-- enabled packs during character creation.
--
-- Fix: replace the inline membership check with the existing
-- is_campaign_member() security-definer helper, which checks
-- campaign_members (not just characters). This mirrors what
-- campaign_packs already uses (see 20260605 migration) and
-- avoids infinite-recursion because the helper is security-definer
-- and bypasses RLS internally.

-- homebrew_packs
drop policy if exists "homebrew_packs: owner or campaign-pack member can read" on homebrew_packs;

create policy "homebrew_packs: owner or campaign-pack member can read"
  on homebrew_packs for select
  using (
    auth.uid() = owner_user_id
    or exists (
      select 1 from campaign_packs
      where campaign_packs.pack_id = homebrew_packs.id
        and campaign_packs.enabled = true
        and is_campaign_member(campaign_packs.campaign_id)
    )
  );

-- homebrew_content
drop policy if exists "homebrew_content: owner or pack-enabled-campaign-member can read" on homebrew_content;

create policy "homebrew_content: owner or pack-enabled-campaign-member can read"
  on homebrew_content for select
  using (
    auth.uid() = user_id
    or exists (
      select 1 from campaign_packs
      where campaign_packs.pack_id = homebrew_content.pack_id
        and campaign_packs.enabled = true
        and is_campaign_member(campaign_packs.campaign_id)
    )
  );

-- imported_content
drop policy if exists "imported_content: owner or pack-enabled-campaign-member can read" on imported_content;

create policy "imported_content: owner or pack-enabled-campaign-member can read"
  on imported_content for select
  using (
    auth.uid() = user_id
    or exists (
      select 1 from campaign_packs
      where campaign_packs.pack_id = imported_content.pack_id
        and campaign_packs.enabled = true
        and is_campaign_member(campaign_packs.campaign_id)
    )
  );
