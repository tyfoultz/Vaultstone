-- Fix infinite-recursion error on campaign_packs.
--
-- Symptom: attaching a pack to a campaign from the manage-content
-- modal failed with "infinite recursion detected in policy for
-- relation campaign_packs".
--
-- Root cause: campaign_packs SELECT policy inlined a chain of
-- `exists (select 1 from campaigns ... exists (select 1 from
-- characters ...))`. When INSERT...RETURNING re-evaluated the
-- SELECT policy on campaign_packs, the planner couldn't prove the
-- short-circuit and traversed the chain through homebrew_packs's
-- SELECT policy (which references campaign_packs back), tripping
-- Postgres's recursion guard.
--
-- Fix: replace the inlined membership check with the existing
-- `is_campaign_member(campaign_id)` security-definer helper. The
-- helper bypasses RLS internally, so the planner sees a single
-- function call instead of a recursive policy walk. The other
-- policies on campaign_packs (insert / update / delete) already use
-- direct `auth.uid() = dm_user_id` checks against `campaigns` and
-- don't recurse; only the SELECT policy needed rewriting.

drop policy if exists "campaign_packs: members can read" on campaign_packs;

create policy "campaign_packs: members can read"
  on campaign_packs for select
  using (is_campaign_member(campaign_id));
