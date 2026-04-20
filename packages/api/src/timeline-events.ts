import type { Json, TimelineEvent } from '@vaultstone/types';

import { supabase } from './client';

export async function getEventsForTimeline(timelinePageId: string) {
  return supabase
    .from('timeline_events')
    .select('*')
    .eq('timeline_page_id', timelinePageId)
    .is('deleted_at', null)
    .order('sort_key', { ascending: true })
    .order('tie_breaker', { ascending: true });
}

export async function createTimelineEvent(input: {
  timelinePageId: string;
  worldId: string;
  title: string;
  dateValues?: Json;
  body?: Json;
  bodyText?: string;
  bodyRefs?: string[];
  sourceSessionId?: string | null;
  visibleToPlayers?: boolean;
  tieBreaker?: number;
}) {
  return supabase
    .from('timeline_events')
    .insert({
      timeline_page_id: input.timelinePageId,
      world_id: input.worldId,
      title: input.title.trim(),
      date_values: input.dateValues ?? {},
      body: input.body ?? {},
      body_text: input.bodyText ?? null,
      body_refs: input.bodyRefs ?? [],
      source_session_id: input.sourceSessionId ?? null,
      visible_to_players: input.visibleToPlayers ?? true,
      tie_breaker: input.tieBreaker ?? 0,
    })
    .select()
    .single();
}

export async function updateTimelineEvent(
  eventId: string,
  patch: Partial<
    Pick<
      TimelineEvent,
      | 'title'
      | 'date_values'
      | 'visible_to_players'
      | 'body'
      | 'body_text'
      | 'body_refs'
      | 'tie_breaker'
    >
  >,
) {
  return supabase
    .from('timeline_events')
    .update(patch)
    .eq('id', eventId)
    .select()
    .single();
}

export async function trashTimelineEvent(eventId: string) {
  return supabase.rpc('trash_timeline_event', { p_event_id: eventId });
}

export async function getEventBySourceSession(
  timelinePageId: string,
  sessionId: string,
) {
  return supabase
    .from('timeline_events')
    .select('id')
    .eq('timeline_page_id', timelinePageId)
    .eq('source_session_id', sessionId)
    .is('deleted_at', null)
    .maybeSingle();
}
