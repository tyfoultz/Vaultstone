import { useEffect, useState } from 'react';
import { getPagesLinkingTo, getEventsReferencingPage, type BacklinkRow, type EventSummaryRow } from '@vaultstone/api';

export type DossierData = {
  backlinks: BacklinkRow[];
  timelineEvents: EventSummaryRow[];
  loading: boolean;
};

export function useNodeDossier(worldId: string, pageId: string | null): DossierData {
  const [backlinks, setBacklinks] = useState<BacklinkRow[]>([]);
  const [timelineEvents, setTimelineEvents] = useState<EventSummaryRow[]>([]);
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
      setBacklinks((blRes.data ?? []) as BacklinkRow[]);
      setTimelineEvents((evRes.data ?? []) as EventSummaryRow[]);
      setLoading(false);
    })();

    return () => { cancelled = true; };
  }, [worldId, pageId]);

  return { backlinks, timelineEvents, loading };
}
