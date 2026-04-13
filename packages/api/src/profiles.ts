import { supabase } from './client';

export async function getProfile(userId: string) {
  return supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();
}

export async function upsertProfile(
  userId: string,
  updates: { display_name?: string | null; avatar_url?: string | null },
) {
  return supabase
    .from('profiles')
    .upsert({ id: userId, ...updates })
    .select()
    .single();
}
