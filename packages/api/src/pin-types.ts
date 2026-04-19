import { supabase } from './client';
import type { Database } from '@vaultstone/types';

export type PinType = Database['public']['Tables']['pin_types']['Row'];

let cache: PinType[] | null = null;

// pin_types is a small seeded reference table that never changes at runtime.
// Cache for the lifetime of the app session.
export async function listPinTypes(): Promise<{ data: PinType[] | null; error: unknown }> {
  if (cache) return { data: cache, error: null };
  const { data, error } = await supabase
    .from('pin_types')
    .select('*')
    .order('sort_order', { ascending: true });
  if (!error && data) cache = data;
  return { data, error };
}

export function clearPinTypeCache() {
  cache = null;
}
