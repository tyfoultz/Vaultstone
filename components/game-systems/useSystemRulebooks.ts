// Aggregates the user's PDF rulebooks across every campaign that uses a
// given game system. Phase A surface for the new Game-Systems-side rulebooks
// view — see docs/features/08-pdf-rulebook.md (Phase A revision).
//
// Storage today is still campaign-keyed (see packages/content/src/local/db.*),
// so this hook spans every campaign on the system and merges. Phase C will
// re-key local storage on (user_id, system_id, source_key) and most of the
// joining logic in here goes away. Until then we group by source_key + file_name
// to dedupe the common case (same physical PDF uploaded for multiple campaigns).

import { useEffect, useMemo, useState } from 'react';
import {
  getSourcesByCampaign,
  getIndexStatus,
  type LocalSource,
  type IndexMeta,
} from '@vaultstone/content';
import { supabase } from '@vaultstone/api';

/**
 * `srd_5_1` and `srd_2_0` are CC-BY content already bundled in the app.
 * If a campaign declares one of these, the user does NOT need to upload
 * a PDF — the bundled SRD covers it. We exclude these declarations from
 * the "declared but missing" prompt so we don't nag users to upload
 * something they don't need.
 */
const BUNDLED_SOURCE_KEYS = new Set(['srd_5_1', 'srd_2_0']);

/** Server-side declaration written to `campaigns.content_sources` JSONB. */
type ContentSourceDecl = { key: string; label: string };

type CampaignRow = {
  id: string;
  name: string;
  system: string | null;
  content_sources: unknown;
  dm_user_id: string;
};

/**
 * One declared source (e.g. "PHB 2024") plus everything the user has
 * uploaded against it across all their campaigns on this system.
 *
 * `presetKey` is the `source_key` written by the campaign declaration; for
 * the special "Unmatched" bucket it's `null` (uploads with no matching
 * declaration — usually because the campaign was created before the user
 * uploaded, or the declaration was changed).
 */
export type RulebookGroup = {
  presetKey: string | null;
  label: string;
  /** Campaigns on this system that declared this source_key. */
  declaredBy: { campaignId: string; campaignName: string; isDM: boolean }[];
  /** Local PDF uploads matching this source_key (deduped by file name). */
  uploads: RulebookUpload[];
};

export type RulebookUpload = {
  /** First LocalSource row for this file — used as the canonical id for
   *  index lookups and viewer routing. */
  primary: LocalSource;
  /** Every LocalSource row pointing at the same logical file, across all
   *  campaigns. Phase C will collapse these. */
  copies: LocalSource[];
  /** Campaigns this upload is currently attached to. */
  attachedTo: { campaignId: string; campaignName: string }[];
  status: IndexMeta | undefined;
};

export type SystemRulebooksState = {
  loading: boolean;
  /** Campaigns on this system the user is a member of. Used by the
   *  upload flow to attach the new LocalSource somewhere (Phase A
   *  storage is still campaign-keyed) and for the "Used by" lines. */
  campaigns: CampaignRow[];
  /** One entry per declared-source-key + one trailing "Unmatched" entry
   *  if there are uploads with no matching declaration. */
  groups: RulebookGroup[];
  /** Manual refresh — call after upload/delete to re-pull local sources. */
  refresh: () => void;
};

export function useSystemRulebooks(systemId: string | null): SystemRulebooksState {
  const [campaigns, setCampaigns] = useState<CampaignRow[]>([]);
  const [allSources, setAllSources] = useState<LocalSource[]>([]);
  const [statuses, setStatuses] = useState<Record<string, IndexMeta>>({});
  const [loading, setLoading] = useState(true);
  const [refreshTick, setRefreshTick] = useState(0);

  // Step 1: pull campaigns the user is a member of, restricted to this
  // system. RLS already scopes to the current user, so we only need the
  // system filter here.
  useEffect(() => {
    if (!systemId) {
      setCampaigns([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);

    supabase
      .from('campaigns')
      .select('id, name, system, content_sources, dm_user_id')
      .eq('system', systemId)
      .then(({ data }) => {
        if (cancelled) return;
        setCampaigns((data ?? []) as CampaignRow[]);
      });

    return () => { cancelled = true; };
  }, [systemId, refreshTick]);

  // Step 2: for every campaign, pull its local sources and merge.
  useEffect(() => {
    let cancelled = false;
    if (campaigns.length === 0) {
      setAllSources([]);
      setLoading(false);
      return;
    }
    Promise.all(campaigns.map((c) => getSourcesByCampaign(c.id).catch(() => [])))
      .then((lists) => {
        if (cancelled) return;
        setAllSources(lists.flat());
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, [campaigns, refreshTick]);

  // Step 3: pull index status for each unique source.id once, then poll
  // every 500ms while any source is actively indexing.
  useEffect(() => {
    if (allSources.length === 0) {
      setStatuses({});
      return;
    }
    let cancelled = false;

    const fetchAll = () =>
      Promise.all(allSources.map((s) => getIndexStatus(s.id))).then((metas) => {
        if (cancelled) return;
        const next: Record<string, IndexMeta> = {};
        for (const m of metas) next[m.source_id] = m;
        setStatuses(next);
      }).catch(() => {});

    fetchAll();
    return () => { cancelled = true; };
  }, [allSources]);

  useEffect(() => {
    const anyIndexing = Object.values(statuses).some((s) => s.status === 'indexing');
    if (!anyIndexing || allSources.length === 0) return;
    const interval = setInterval(() => {
      Promise.all(allSources.map((s) => getIndexStatus(s.id))).then((metas) => {
        const next: Record<string, IndexMeta> = {};
        for (const m of metas) next[m.source_id] = m;
        setStatuses(next);
      }).catch(() => {});
    }, 500);
    return () => clearInterval(interval);
  }, [statuses, allSources]);

  const groups = useMemo(
    () => buildGroups(campaigns, allSources, statuses),
    [campaigns, allSources, statuses],
  );

  return {
    loading,
    campaigns,
    groups,
    refresh: () => setRefreshTick((n) => n + 1),
  };
}

// ── Group building ───────────────────────────────────────────────────────────

function buildGroups(
  campaigns: CampaignRow[],
  sources: LocalSource[],
  statuses: Record<string, IndexMeta>,
): RulebookGroup[] {
  const userId = getCurrentUserId();
  const campaignsById = new Map(campaigns.map((c) => [c.id, c]));

  // Collect declarations: source_key → { label, declaring campaigns }.
  // Skip the bundled SRD keys — those don't need user uploads.
  const declarationsByKey = new Map<string, { label: string; declaredBy: RulebookGroup['declaredBy'] }>();
  for (const c of campaigns) {
    const decl = c.content_sources as ContentSourceDecl | null;
    if (!decl?.key || BUNDLED_SOURCE_KEYS.has(decl.key)) continue;
    const entry = declarationsByKey.get(decl.key) ?? { label: decl.label, declaredBy: [] };
    entry.declaredBy.push({
      campaignId: c.id,
      campaignName: c.name,
      isDM: !!userId && c.dm_user_id === userId,
    });
    declarationsByKey.set(decl.key, entry);
  }

  // Collect uploads, deduped by (source_key, file_name) so the same
  // physical PDF uploaded against two campaigns shows as one row.
  const uploadsByKey = new Map<string, Map<string, RulebookUpload>>();
  for (const src of sources) {
    const presetMap = uploadsByKey.get(src.source_key) ?? new Map<string, RulebookUpload>();
    const existing = presetMap.get(src.file_name);
    const campaign = campaignsById.get(src.campaign_id);
    const attached = campaign
      ? { campaignId: campaign.id, campaignName: campaign.name }
      : null;
    if (existing) {
      existing.copies.push(src);
      if (attached && !existing.attachedTo.find((a) => a.campaignId === attached.campaignId)) {
        existing.attachedTo.push(attached);
      }
    } else {
      presetMap.set(src.file_name, {
        primary: src,
        copies: [src],
        attachedTo: attached ? [attached] : [],
        status: statuses[src.id],
      });
    }
    uploadsByKey.set(src.source_key, presetMap);
  }

  // Build the final group list — one per declaration (even if no uploads
  // yet, so the empty-state CTA renders), plus a trailing "Unmatched"
  // group for uploads whose source_key isn't declared by any campaign.
  const groups: RulebookGroup[] = [];
  const seenKeys = new Set<string>();

  for (const [key, decl] of declarationsByKey) {
    const uploads = [...(uploadsByKey.get(key)?.values() ?? [])];
    groups.push({
      presetKey: key,
      label: decl.label,
      declaredBy: decl.declaredBy,
      uploads,
    });
    seenKeys.add(key);
  }

  // Uploads with a source_key that no current campaign declares — could
  // be from a deleted campaign or a campaign whose declaration changed.
  // Group them under their source_key with a fallback label.
  for (const [key, presetMap] of uploadsByKey) {
    if (seenKeys.has(key)) continue;
    groups.push({
      presetKey: key,
      label: prettifySourceKey(key),
      declaredBy: [],
      uploads: [...presetMap.values()],
    });
  }

  // Sort: declared-with-uploads, then declared-without, then unmatched.
  groups.sort((a, b) => {
    const aRank = rankGroup(a);
    const bRank = rankGroup(b);
    if (aRank !== bRank) return aRank - bRank;
    return a.label.localeCompare(b.label);
  });

  return groups;
}

function rankGroup(g: RulebookGroup): number {
  if (g.declaredBy.length > 0 && g.uploads.length > 0) return 0;
  if (g.declaredBy.length > 0) return 1;
  return 2;
}

function prettifySourceKey(key: string): string {
  if (key === 'custom') return 'Custom rulebook';
  return key
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function getCurrentUserId(): string | null {
  // Avoid coupling the hook to useAuthStore subscription — we just need the
  // current id once per render. The store reads through getState() without
  // triggering re-renders.
  try {
    // Lazy require to avoid a circular import at module load.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { useAuthStore } = require('@vaultstone/store');
    return useAuthStore.getState().session?.user?.id ?? null;
  } catch {
    return null;
  }
}
