import { supabase } from './client';
import type { Database } from '@vaultstone/types';

type SessionEventInsert = Database['public']['Tables']['session_events']['Insert'];
type InitiativeRow = Database['public']['Tables']['initiative_order']['Row'];
type InitiativeUpdate = Database['public']['Tables']['initiative_order']['Update'];

export async function startSession(campaignId: string) {
  return supabase
    .from('sessions')
    .insert({ campaign_id: campaignId, ended_at: null, round: 1 })
    .select()
    .single();
}

export async function endSession(sessionId: string) {
  return supabase
    .from('sessions')
    .update({ ended_at: new Date().toISOString() })
    .eq('id', sessionId);
}

// `.maybeSingle()` — we want `data: null` (not an error) when no active session exists.
export async function getActiveSession(campaignId: string) {
  return supabase
    .from('sessions')
    .select('*')
    .eq('campaign_id', campaignId)
    .is('ended_at', null)
    .maybeSingle();
}

export async function getSessionById(sessionId: string) {
  return supabase
    .from('sessions')
    .select('*')
    .eq('id', sessionId)
    .maybeSingle();
}

// Sort by init desc, then id for stable tiebreak. `sort_order` is reserved
// for manual reordering (deferred); for now we sort client-side by init.
export async function getInitiativeOrder(sessionId: string) {
  return supabase
    .from('initiative_order')
    .select('*')
    .eq('session_id', sessionId)
    .order('init_value', { ascending: false })
    .order('id');
}

export async function addCombatant(input: {
  sessionId: string;
  name: string;
  init: number;
  hpMax: number;
  ac: number;
  characterId?: string | null;
}) {
  return supabase
    .from('initiative_order')
    .insert({
      session_id: input.sessionId,
      display_name: input.name,
      init_value: input.init,
      hp_max: input.hpMax,
      hp_current: input.hpMax,
      ac: input.ac,
      character_id: input.characterId ?? null,
      sort_order: 0,
      is_active_turn: false,
    })
    .select()
    .single();
}

export async function updateCombatant(id: string, patch: InitiativeUpdate) {
  return supabase.from('initiative_order').update(patch).eq('id', id);
}

export async function removeCombatant(id: string) {
  return supabase.from('initiative_order').delete().eq('id', id);
}

// Advance turn cursor to the next combatant by init order. If we wrap back
// to the top, bump session.round. Safe to call with no active turn set —
// picks the highest-init combatant.
export async function advanceTurn(sessionId: string) {
  const { data, error } = await supabase
    .from('initiative_order')
    .select('*')
    .eq('session_id', sessionId)
    .order('init_value', { ascending: false })
    .order('id');
  if (error) return { error };
  const entries = (data ?? []) as InitiativeRow[];
  if (entries.length === 0) return { error: null };

  const currentIdx = entries.findIndex((e) => e.is_active_turn);
  const nextIdx = currentIdx === -1 ? 0 : (currentIdx + 1) % entries.length;
  const wrapped = currentIdx !== -1 && nextIdx === 0;

  if (currentIdx !== -1) {
    await supabase
      .from('initiative_order')
      .update({ is_active_turn: false })
      .eq('id', entries[currentIdx].id);
  }
  await supabase
    .from('initiative_order')
    .update({ is_active_turn: true })
    .eq('id', entries[nextIdx].id);

  if (wrapped) {
    const { data: s } = await supabase
      .from('sessions').select('round').eq('id', sessionId).single();
    if (s) {
      await supabase
        .from('sessions')
        .update({ round: (s.round ?? 1) + 1 })
        .eq('id', sessionId);
    }
  }
  return { error: null };
}

export async function appendSessionEvent(event: SessionEventInsert) {
  return supabase.from('session_events').insert(event);
}
