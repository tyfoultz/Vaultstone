import type { TimelineEvent } from '@vaultstone/types';
import { create } from 'zustand';

interface TimelineEventsState {
  byTimelinePageId: Record<string, TimelineEvent[]>;
  setEventsForPage: (pageId: string, events: TimelineEvent[]) => void;
  addEvent: (event: TimelineEvent) => void;
  updateEvent: (eventId: string, patch: Partial<TimelineEvent>) => void;
  removeEvent: (eventId: string) => void;
  clearPage: (pageId: string) => void;
}

function sortEvents(events: TimelineEvent[]): TimelineEvent[] {
  return [...events].sort((a, b) => {
    const sk = a.sort_key - b.sort_key;
    if (sk !== 0) return sk;
    const tb = a.tie_breaker - b.tie_breaker;
    if (tb !== 0) return tb;
    return a.id < b.id ? -1 : 1;
  });
}

export const useTimelineEventsStore = create<TimelineEventsState>((set) => ({
  byTimelinePageId: {},

  setEventsForPage: (pageId, events) =>
    set((state) => ({
      byTimelinePageId: {
        ...state.byTimelinePageId,
        [pageId]: sortEvents(events),
      },
    })),

  addEvent: (event) =>
    set((state) => {
      const existing = state.byTimelinePageId[event.timeline_page_id] ?? [];
      return {
        byTimelinePageId: {
          ...state.byTimelinePageId,
          [event.timeline_page_id]: sortEvents([...existing, event]),
        },
      };
    }),

  updateEvent: (eventId, patch) =>
    set((state) => {
      const updated: Record<string, TimelineEvent[]> = {};
      for (const [pageId, events] of Object.entries(state.byTimelinePageId)) {
        const idx = events.findIndex((e) => e.id === eventId);
        if (idx >= 0) {
          const copy = [...events];
          copy[idx] = { ...copy[idx], ...patch } as TimelineEvent;
          updated[pageId] = sortEvents(copy);
        } else {
          updated[pageId] = events;
        }
      }
      return { byTimelinePageId: updated };
    }),

  removeEvent: (eventId) =>
    set((state) => {
      const updated: Record<string, TimelineEvent[]> = {};
      for (const [pageId, events] of Object.entries(state.byTimelinePageId)) {
        updated[pageId] = events.filter((e) => e.id !== eventId);
      }
      return { byTimelinePageId: updated };
    }),

  clearPage: (pageId) =>
    set((state) => {
      const { [pageId]: _, ...rest } = state.byTimelinePageId;
      return { byTimelinePageId: rest };
    }),
}));

export function selectEventsForPage(
  state: TimelineEventsState,
  pageId: string | undefined,
): TimelineEvent[] {
  if (!pageId) return [];
  return state.byTimelinePageId[pageId] ?? [];
}
