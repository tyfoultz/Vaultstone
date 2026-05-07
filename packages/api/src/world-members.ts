import { supabase } from './client';

export async function listWorldMembers(worldId: string) {
  return supabase
    .from('world_members')
    .select('*')
    .eq('world_id', worldId)
    .order('created_at', { ascending: true });
}

export async function addWorldMember(input: {
  worldId: string;
  userId: string;
  role?: 'viewer' | 'editor';
  invitedBy: string;
}) {
  return supabase
    .from('world_members')
    .upsert({
      world_id: input.worldId,
      user_id: input.userId,
      role: input.role ?? 'viewer',
      invited_by: input.invitedBy,
    })
    .select()
    .single();
}

export async function updateWorldMemberRole(worldId: string, userId: string, role: 'viewer' | 'editor') {
  return supabase
    .from('world_members')
    .update({ role })
    .eq('world_id', worldId)
    .eq('user_id', userId)
    .select()
    .single();
}

export async function removeWorldMember(worldId: string, userId: string) {
  return supabase
    .from('world_members')
    .delete()
    .eq('world_id', worldId)
    .eq('user_id', userId);
}
