-- =============================================================================
-- Egress reduction: trimmed-resources RPCs for party / member surfaces.
--
-- The party card, members card, and world-home party strip fetch every
-- campaign character's full `resources` JSONB. That blob carries large
-- sub-objects these views never read — journal entries, backstory prose,
-- the full spellbook/prepared-spell payloads, feat/feature descriptions,
-- etc. For a 5-person party refetched on every navigation/focus, that's
-- hundreds of KB of dead weight per load.
--
-- These functions return the SAME nested shape the PostgREST embedding
-- produced, but with the heavy keys stripped from `resources` via the
-- jsonb `-` operator. Using subtraction (denylist) instead of an
-- allowlist preserves every other key exactly — runtime vitals stay
-- present-or-absent as before, so consumers see no shape change. New
-- runtime-vital fields pass through automatically; a NEW heavy field
-- would need adding to the strip list below.
--
-- security invoker (the default) — RLS on campaign_members / profiles /
-- characters applies with the caller's auth.uid(), identical to the
-- direct queries these replace. No access widening.
-- =============================================================================

-- Keys dropped from `resources` — large sub-blobs no party/member view reads.
-- Keep in sync with packages/api/src/campaigns.ts if a heavy field is added.
create or replace function _strip_heavy_resources(p_resources jsonb)
returns jsonb
language sql
immutable
as $$
  select coalesce(p_resources, '{}'::jsonb)
    - 'journal'
    - 'personality'
    - 'appearance'
    - 'feats'
    - 'classFeatures'
    - 'speciesTraits'
    - 'spellbook'
    - 'preparedSpells'
    - 'notes'
    - 'treasure'
    - 'hiddenFeatures'
    - 'featPicks';
$$;

-- Mirrors getCampaignMembers(): one row per membership, with embedded
-- profile + character (trimmed resources).
create or replace function get_campaign_members_trimmed(p_campaign_id uuid)
returns setof jsonb
language sql
stable
as $$
  select jsonb_build_object(
    'campaign_id', cm.campaign_id,
    'user_id', cm.user_id,
    'role', cm.role,
    'character_id', cm.character_id,
    'joined_at', cm.joined_at,
    'profiles', case when p.id is not null
      then jsonb_build_object('id', p.id, 'display_name', p.display_name)
      else null end,
    'characters', case when c.id is not null
      then jsonb_build_object(
        'id', c.id,
        'name', c.name,
        'system', c.system,
        'base_stats', c.base_stats,
        'resources', _strip_heavy_resources(c.resources),
        'conditions', c.conditions,
        'avatar_url', c.avatar_url,
        'avatar_card_url', c.avatar_card_url
      )
      else null end
  )
  from campaign_members cm
  left join profiles p on p.id = cm.user_id
  left join characters c on c.id = cm.character_id
  where cm.campaign_id = p_campaign_id
  order by cm.joined_at asc;
$$;
grant execute on function get_campaign_members_trimmed(uuid) to authenticated;

-- Mirrors getCharactersForCampaign(): characters pinned to the campaign,
-- trimmed resources.
create or replace function get_characters_for_campaign_trimmed(p_campaign_id uuid)
returns setof jsonb
language sql
stable
as $$
  select jsonb_build_object(
    'id', c.id,
    'user_id', c.user_id,
    'name', c.name,
    'base_stats', c.base_stats,
    'resources', _strip_heavy_resources(c.resources),
    'conditions', c.conditions,
    'avatar_url', c.avatar_url,
    'avatar_card_url', c.avatar_card_url
  )
  from characters c
  where c.campaign_id = p_campaign_id
  order by c.created_at asc;
$$;
grant execute on function get_characters_for_campaign_trimmed(uuid) to authenticated;

-- Mirrors getCampaignPartyState(): membership + embedded profile +
-- character (trimmed resources), slimmer column set than the members RPC.
create or replace function get_campaign_party_state_trimmed(p_campaign_id uuid)
returns setof jsonb
language sql
stable
as $$
  select jsonb_build_object(
    'user_id', cm.user_id,
    'role', cm.role,
    'character_id', cm.character_id,
    'joined_at', cm.joined_at,
    'profiles', case when p.id is not null
      then jsonb_build_object('id', p.id, 'display_name', p.display_name)
      else null end,
    'characters', case when c.id is not null
      then jsonb_build_object(
        'id', c.id,
        'name', c.name,
        'base_stats', c.base_stats,
        'resources', _strip_heavy_resources(c.resources),
        'conditions', c.conditions
      )
      else null end
  )
  from campaign_members cm
  left join profiles p on p.id = cm.user_id
  left join characters c on c.id = cm.character_id
  where cm.campaign_id = p_campaign_id
  order by cm.joined_at asc;
$$;
grant execute on function get_campaign_party_state_trimmed(uuid) to authenticated;
