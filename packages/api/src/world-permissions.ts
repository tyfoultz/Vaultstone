import type { WorldPagePermissionLevel } from '@vaultstone/types';

import { supabase } from './client';

// Grants visible to the current user (world owner sees all for their pages
// via RLS; grantees see only their own rows).
export async function listPagePermissions(pageId: string) {
  return supabase
    .from('world_page_permissions')
    .select('*')
    .eq('page_id', pageId);
}

// Fetch permission grants on a page and any ancestors so ShareModal can
// show "direct" vs "inherited from <ancestor>" source chips. We resolve the
// ancestor chain client-side off the local pages store, then query all at
// once — cheaper than round-tripping the recursive CTE for display.
export async function listPagePermissionsForAncestors(pageIds: string[]) {
  if (pageIds.length === 0) {
    return { data: [], error: null };
  }
  return supabase
    .from('world_page_permissions')
    .select('*')
    .in('page_id', pageIds);
}

export async function grantPagePermission(input: {
  pageId: string;
  userId: string;
  permission: WorldPagePermissionLevel;
  cascade: boolean;
  grantedBy: string;
}) {
  return supabase
    .from('world_page_permissions')
    .upsert({
      page_id: input.pageId,
      user_id: input.userId,
      permission: input.permission,
      cascade: input.cascade,
      granted_by: input.grantedBy,
    })
    .select()
    .single();
}

export async function updatePagePermission(input: {
  pageId: string;
  userId: string;
  permission?: WorldPagePermissionLevel;
  cascade?: boolean;
}) {
  const patch: { permission?: WorldPagePermissionLevel; cascade?: boolean } = {};
  if (input.permission !== undefined) patch.permission = input.permission;
  if (input.cascade !== undefined) patch.cascade = input.cascade;
  return supabase
    .from('world_page_permissions')
    .update(patch)
    .eq('page_id', input.pageId)
    .eq('user_id', input.userId)
    .select()
    .single();
}

export async function revokePagePermission(pageId: string, userId: string) {
  return supabase
    .from('world_page_permissions')
    .delete()
    .eq('page_id', pageId)
    .eq('user_id', userId);
}

// ShareModal's grantee search. Matches profile display_name case-insensitively.
// Capped at 10 for the search dropdown; callers can narrow by typing more.
export async function searchProfilesByDisplayName(query: string) {
  const q = query.trim();
  if (q.length < 2) {
    return { data: [], error: null };
  }
  return supabase
    .from('profiles')
    .select('id, display_name, avatar_url')
    .ilike('display_name', `%${q}%`)
    .limit(10);
}

// Batch-load profile records for a set of user ids — used to hydrate the
// "already shared with" list once ShareModal has fetched the grant rows.
export async function getProfilesByIds(userIds: string[]) {
  if (userIds.length === 0) {
    return { data: [], error: null };
  }
  return supabase
    .from('profiles')
    .select('id, display_name, avatar_url')
    .in('id', userIds);
}
