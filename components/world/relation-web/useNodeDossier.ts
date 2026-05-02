import { useEffect, useState } from 'react';
import { getPagesLinkingTo, getEventsReferencingPage } from '@vaultstone/api';
import type { WorldPage } from '@vaultstone/types';

type TimelineEvent = {
  id: string;
  title: string;
  date_values: Record<string, string> | null;
  timeline_page_id: string;
};

export type DossierData = {
  backlinks: WorldPage[];
  timelineEvents: TimelineEvent[];
  loading: boolean;
};

export function useNodeDossier(worldId: string, pageId: string | null): DossierData {
  const [backlinks, setBacklinks] = useState<WorldPage[]>([]);
  const [timelineEvents, setTimelineEvents] = useState<TimelineEvent[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!pageId) {
      setBacklinks([]);
      setTimelineEvents([]);
      return;
    }

    let cancelled = false;
    setLoading(true);

    void (async () => {
      const [blRes, evRes] = await Promise.all([
        getPagesLinkingTo(worldId, pageId),
        getEventsReferencingPage(worldId, pageId),
      ]);
      if (cancelled) return;
      setBacklinks((blRes.data ?? []) as WorldPage[]);
      setTimelineEvents((evRes.data ?? []) as TimelineEvent[]);
      setLoading(false);
    })();

    return () => { cancelled = true; };
  }, [worldId, pageId]);

  return { backlinks, timelineEvents, loading };
}
