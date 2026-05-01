import { supabase } from './client';

export async function listDeletedPages(worldId: string) {
  return supabase.rpc('list_deleted_world_pages', { p_world_id: worldId });
}

export async function listDeletedSections(worldId: string) {
  return supabase.rpc('list_deleted_world_sections', { p_world_id: worldId });
}

export async function listDeletedMaps(worldId: string) {
  return supabase.rpc('list_deleted_world_maps', { p_world_id: worldId });
}

export async function restorePage(pageId: string) {
  return supabase.rpc('restore_world_page', { p_page_id: pageId });
}

export async function restoreSection(sectionId: string) {
  return supabase.rpc('restore_world_section', { p_section_id: sectionId });
}

export async function restoreMap(mapId: string) {
  return supabase.rpc('restore_world_map', { p_map_id: mapId });
}
