import { supabase } from './client';
import type { SessionEvent } from '@vaultstone/types';

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

export async function getActiveSession(campaignId: string) {
  return supabase
    .from('sessions')
    .select('*')
    .eq('campaign_id', campaignId)
    .is('ended_at', null)
    .single();
}

export async function getInitiativeOrder(sessionId: string) {
  return supabase
    .from('initiative_order')
    .select('*')
    .eq('session_id', sessionId)
    .order('sort_order');
}

export async function appendSessionEvent(
  event: Omit<SessionEvent, 'id' | 'created_at'>
) {
  return supabase.from('session_events').insert(event);
}
