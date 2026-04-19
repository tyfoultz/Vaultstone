import { supabase } from './client';
import type { Database } from '@vaultstone/types';

export type MapPin = Database['public']['Tables']['map_pins']['Row'];
export type MapPinInsert = Database['public']['Tables']['map_pins']['Insert'];

export async function listPins(mapId: string) {
  return supabase
    .from('map_pins')
    .select('*')
    .eq('map_id', mapId)
    .order('created_at', { ascending: true });
}

// Used by the @-mention popover: every pin in the active world, cheap enough
// to pull in one call since authored worlds will have dozens, not thousands.
export async function listPinsForWorld(worldId: string) {
  return supabase
    .from('map_pins')
    .select('*')
    .eq('world_id', worldId)
    .order('created_at', { ascending: true });
}

export async function getPin(pinId: string) {
  return supabase.from('map_pins').select('*').eq('id', pinId).single();
}

export async function createPin(insert: MapPinInsert) {
  return supabase.from('map_pins').insert(insert).select('*').single();
}

export async function updatePin(
  pinId: string,
  patch: Partial<
    Pick<
      MapPin,
      'pin_type' | 'x_pct' | 'y_pct' | 'label' | 'icon_key_override' | 'color_override' | 'linked_page_id'
    >
  >,
) {
  return supabase.from('map_pins').update(patch).eq('id', pinId).select('*').single();
}

export async function deletePin(pinId: string) {
  return supabase.from('map_pins').delete().eq('id', pinId);
}
