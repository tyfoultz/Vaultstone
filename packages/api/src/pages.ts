import type { PageKind, TemplateKey, WorldPage } from '@vaultstone/types';

import { supabase } from './client';

const PAGE_LIST_COLUMNS = [
  'id', 'world_id', 'section_id', 'parent_page_id', 'campaign_id',
  'title', 'page_kind', 'template_key', 'template_version',
  'visible_to_players', 'sort_order', 'structured_fields',
  'body_text', 'body_refs', 'character_id',
  'editing_user_id', 'editing_since', 'title_overridden',
  'created_at', 'updated_at', 'deleted_at',
].join(',');

export async function getPagesForWorld(worldId: string) {
  return supabase
    .from('world_pages')
    .select(PAGE_LIST_COLUMNS)
    .eq('world_id', worldId)
    .is('deleted_at', null)
    .order('sort_order', { ascending: true });
}

export async function getPage(pageId: string) {
  return supabase
    .from('world_pages')
    .select('*')
    .eq('id', pageId)
    .is('deleted_at', null)
    .single();
}

export async function createPage(input: {
  worldId: string;
  sectionId: string;
  parentPageId?: string | null;
  title: string;
  pageKind: PageKind;
  templateKey: TemplateKey;
  templateVersion: number;
  visibleToPlayers?: boolean;
  sortOrder?: number;
}) {
  return supabase
    .from('world_pages')
    .insert({
      world_id: input.worldId,
      section_id: input.sectionId,
      parent_page_id: input.parentPageId ?? null,
      title: input.title.trim(),
      page_kind: input.pageKind,
      template_key: input.templateKey,
      template_version: input.templateVersion,
      visible_to_players: input.visibleToPlayers ?? true,
      sort_order: input.sortOrder ?? 0,
    })
    .select()
    .single();
}

export async function updatePage(
  pageId: string,
  patch: Partial<
    Pick<
      WorldPage,
      | 'title'
      | 'page_kind'
      | 'visible_to_players'
      | 'sort_order'
      | 'structured_fields'
      | 'body'
      | 'body_text'
      | 'body_refs'
      | 'title_overridden'
    >
  >,
) {
  return supabase.from('world_pages').update(patch).eq('id', pageId).select().single();
}

export async function cascadeMentionLabel(worldId: string, pageId: string, newLabel: string) {
  const { data: linking } = await supabase
    .from('world_pages')
    .select('id, body')
    .eq('world_id', worldId)
    .is('deleted_at', null)
    .contains('body_refs', [pageId]);
  if (!linking || linking.length === 0) return;

  const mentionRe = new RegExp(
    `(<span[^>]*class="vaultstone-mention"[^>]*data-id="${pageId}"[^>]*>)@\\s*[^<]*(</span>)`,
    'g',
  );

  function walkTiptap(node: any) {
    if (!node) return;
    if (node.type === 'vaultstoneMention' && node.attrs?.id === pageId) {
      node.attrs.label = newLabel;
    }
    if (Array.isArray(node.content)) node.content.forEach(walkTiptap);
  }

  for (const page of linking) {
    const body = page.body as any;
    if (!body) continue;
    let updated = false;
    if (Array.isArray(body.blocks)) {
      for (const block of body.blocks) {
        if (typeof block.html === 'string' && block.html.includes(pageId)) {
          block.html = block.html.replace(mentionRe, `$1@ ${newLabel}$2`);
          updated = true;
        }
      }
    } else if (body.type === 'doc') {
      walkTiptap(body);
      updated = true;
    }
    if (updated) {
      await supabase.from('world_pages').update({ body }).eq('id', page.id);
    }
  }
}

export async function trashPage(pageId: string) {
  return supabase.rpc('trash_world_page', { p_page_id: pageId });
}

export async function movePage(input: {
  pageId: string;
  newSectionId: string;
  newParentId: string | null;
  newSortOrder: number;
}) {
  return supabase.rpc('move_world_page', {
    p_page_id: input.pageId,
    p_new_section_id: input.newSectionId,
    p_new_parent_id: input.newParentId,
    p_new_sort_order: input.newSortOrder,
  });
}

// Pages whose body_refs[] contains the given pageId — used to render the
// "Linked from" panel under any page. Fast because world_pages_body_refs_gin
// indexes the column with `using gin`.
export async function getPagesLinkingTo(worldId: string, pageId: string) {
  return supabase
    .from('world_pages')
    .select('*')
    .eq('world_id', worldId)
    .is('deleted_at', null)
    .contains('body_refs', [pageId])
    .order('updated_at', { ascending: false });
}

// Phase 3c edit lock. claimPageEdit returns the refreshed row (so the caller
// sees editing_user_id/editing_since as the server wrote them); throws if
// another editor currently holds a fresh lock. releasePageEdit silently
// no-ops when the lock isn't ours.
export async function claimPageEdit(pageId: string) {
  return supabase.rpc('claim_world_page_edit', { p_page_id: pageId });
}

export async function releasePageEdit(pageId: string) {
  return supabase.rpc('release_world_page_edit', { p_page_id: pageId });
}

export async function forceReleasePageEdit(pageId: string) {
  return supabase.rpc('force_release_world_page_edit', { p_page_id: pageId });
}
