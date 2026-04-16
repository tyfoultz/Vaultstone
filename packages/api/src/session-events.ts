import { supabase } from './client';
import type { Database } from '@vaultstone/types';

type SessionEventRow = Database['public']['Tables']['session_events']['Row'];
type SessionRow = Database['public']['Tables']['sessions']['Row'];

export async function getSessionEvents(
  sessionId: string,
  opts: { limit?: number; since?: string } = {},
): Promise<SessionEventRow[]> {
  let q = supabase
    .from('session_events')
    .select('*')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: true })
    .order('id', { ascending: true });
  if (opts.since) q = q.gt('created_at', opts.since);
  if (opts.limit) q = q.limit(opts.limit);
  const { data } = await q;
  return data ?? [];
}

// Resolves what session the campaign pages should show in the log card:
//   - the active (ended_at IS NULL) session if one exists; else
//   - the most recently ended session; else null.
// Returns both the row and an `isLive` flag so the caller can decide
// whether to subscribe to Realtime.
export async function getMostRecentSessionForCampaign(
  campaignId: string,
): Promise<{ session: SessionRow; isLive: boolean } | null> {
  const { data: active } = await supabase
    .from('sessions')
    .select('*')
    .eq('campaign_id', campaignId)
    .is('ended_at', null)
    .maybeSingle();
  if (active) return { session: active, isLive: true };
  const { data: ended } = await supabase
    .from('sessions')
    .select('*')
    .eq('campaign_id', campaignId)
    .not('ended_at', 'is', null)
    .order('ended_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (ended) return { session: ended, isLive: false };
  return null;
}
