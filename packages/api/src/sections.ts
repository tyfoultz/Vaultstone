import type { TemplateKey, WorldSection } from '@vaultstone/types';

import { supabase } from './client';

export async function getSectionsForWorld(worldId: string) {
  return supabase
    .from('world_sections')
    .select('*')
    .eq('world_id', worldId)
    .is('deleted_at', null)
    .order('sort_order', { ascending: true });
}

export async function createSection(input: {
  worldId: string;
  name: string;
  templateKey: TemplateKey;
  sectionView: 'grid' | 'list';
  sortOrder?: number;
}) {
  return supabase
    .from('world_sections')
    .insert({
      world_id: input.worldId,
      name: input.name.trim(),
      template_key: input.templateKey,
      section_view: input.sectionView,
      sort_order: input.sortOrder ?? 0,
    })
    .select()
    .single();
}

export async function updateSection(
  sectionId: string,
  patch: Partial<Pick<WorldSection, 'name' | 'section_view' | 'force_hidden_from_players' | 'default_pages_visible' | 'sort_order'>>,
) {
  return supabase
    .from('world_sections')
    .update(patch)
    .eq('id', sectionId)
    .select()
    .single();
}

export async function trashSection(sectionId: string) {
  return supabase.rpc('trash_world_section', { p_section_id: sectionId });
}

export async function reorderSections(sections: Array<{ id: string; sort_order: number }>) {
  const updates = sections.map((s) =>
    supabase.from('world_sections').update({ sort_order: s.sort_order }).eq('id', s.id),
  );
  const results = await Promise.all(updates);
  const firstError = results.find((r) => r.error);
  return { error: firstError?.error ?? null };
}
