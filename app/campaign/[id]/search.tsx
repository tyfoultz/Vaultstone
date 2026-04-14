// Campaign content search scaffold.
//
// Wires the on-device content index into a player/DM-facing search UI. Text
// extraction is plugged in separately; this screen just calls `searchCampaign`
// and renders hits. Results are grouped by source (filename) and link to the
// PDF viewer at the matching page.

import { useEffect, useMemo, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  ActivityIndicator, StyleSheet,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import {
  getSourcesByCampaign,
  getCampaignIndexStatuses,
  searchCampaign,
} from '@vaultstone/content';
import type {
  CampaignHit, IndexMeta, LocalSource,
} from '@vaultstone/content';
import { colors, spacing } from '@vaultstone/ui';

type StatusRow = IndexMeta & { fileName: string };

export default function CampaignSearchScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const [sources, setSources] = useState<LocalSource[]>([]);
  const [statuses, setStatuses] = useState<StatusRow[]>([]);
  const [loadingMeta, setLoadingMeta] = useState(true);

  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<CampaignHit[]>([]);
  const [searching, setSearching] = useState(false);
  // null = "no selection stored yet, fall back to all indexed"; once the
  // user toggles anything we switch to an explicit set.
  const [selectedIds, setSelectedIds] = useState<Set<string> | null>(null);

  useEffect(() => {
    if (!id) return;
    Promise.all([getSourcesByCampaign(id), getCampaignIndexStatuses(id)])
      .then(([srcs, metas]) => {
        setSources(srcs);
        setStatuses(metas);
      })
      .catch(() => {
        setSources([]);
        setStatuses([]);
      })
      .finally(() => setLoadingMeta(false));
  }, [id]);

  // Only indexed sources are searchable — others would return nothing anyway.
  const indexedSources = useMemo(() => {
    const indexedIds = new Set(
      statuses.filter((st) => st.status === 'indexed').map((st) => st.source_id),
    );
    return sources.filter((s) => indexedIds.has(s.id));
  }, [sources, statuses]);

  // Which sources are currently active in the search.
  const activeIds = useMemo(() => {
    if (selectedIds === null) return indexedSources.map((s) => s.id);
    // Intersect with currently-indexed set so stale selections don't leak.
    const indexedIdSet = new Set(indexedSources.map((s) => s.id));
    return Array.from(selectedIds).filter((sid) => indexedIdSet.has(sid));
  }, [selectedIds, indexedSources]);

  function toggleSource(sourceId: string) {
    setSelectedIds((prev) => {
      const base = prev ?? new Set(indexedSources.map((s) => s.id));
      const next = new Set(base);
      if (next.has(sourceId)) next.delete(sourceId);
      else next.add(sourceId);
      return next;
    });
  }

  function selectAll() {
    setSelectedIds(new Set(indexedSources.map((s) => s.id)));
  }

  function selectNone() {
    setSelectedIds(new Set());
  }

  // Debounce queries a bit so we don't run a scan on every keystroke. Also
  // re-runs when the user toggles which PDFs to search.
  useEffect(() => {
    if (!id) return;
    const trimmed = query.trim();
    if (!trimmed || activeIds.length === 0) {
      setHits([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    const idsSnapshot = activeIds.slice();
    const t = setTimeout(() => {
      searchCampaign(id, trimmed, { sourceIds: idsSnapshot })
        .then(setHits)
        .catch(() => setHits([]))
        .finally(() => setSearching(false));
    }, 200);
    return () => clearTimeout(t);
  }, [id, query, activeIds]);

  const indexedCount = useMemo(
    () => statuses.filter((s) => s.status === 'indexed').length,
    [statuses],
  );

  // Group hits by source for easier scanning.
  const grouped = useMemo(() => {
    const map = new Map<string, { fileName: string; items: CampaignHit[] }>();
    for (const h of hits) {
      const entry = map.get(h.sourceId) ?? { fileName: h.fileName, items: [] };
      entry.items.push(h);
      map.set(h.sourceId, entry);
    }
    return Array.from(map.entries());
  }, [hits]);

  const showIndexingNotice =
    !loadingMeta && sources.length > 0 && indexedCount === 0;

  return (
    <ScrollView style={s.scroll} contentContainerStyle={s.container}>
      <TouchableOpacity onPress={() => router.back()} style={s.back}>
        <Text style={s.backText}>← Campaign</Text>
      </TouchableOpacity>

      <View style={s.header}>
        <MaterialCommunityIcons name="magnify" size={28} color={colors.brand} />
        <Text style={s.title}>Search Rulebooks</Text>
      </View>

      {/* Search input */}
      <View style={s.searchCard}>
        <MaterialCommunityIcons name="magnify" size={18} color={colors.textSecondary} />
        <TextInput
          style={s.searchInput}
          placeholder="Search your uploaded PDFs"
          placeholderTextColor={colors.textSecondary}
          value={query}
          onChangeText={setQuery}
          autoCorrect={false}
          autoCapitalize="none"
        />
        {searching && <ActivityIndicator color={colors.brand} size="small" />}
        {!!query && !searching && (
          <TouchableOpacity onPress={() => setQuery('')}>
            <MaterialCommunityIcons name="close-circle" size={18} color={colors.textSecondary} />
          </TouchableOpacity>
        )}
      </View>

      {/* Source filter — only shown when there's more than one indexed PDF,
          so users don't see a pointless single chip. */}
      {indexedSources.length > 1 && (
        <View style={s.filterCard}>
          <View style={s.filterHeader}>
            <Text style={s.filterTitle}>Search in</Text>
            <TouchableOpacity onPress={selectAll} style={s.filterBulkBtn}>
              <Text style={s.filterBulkText}>All</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={selectNone} style={s.filterBulkBtn}>
              <Text style={s.filterBulkText}>None</Text>
            </TouchableOpacity>
          </View>
          <View style={s.chipRow}>
            {indexedSources.map((src) => {
              const isActive = activeIds.includes(src.id);
              return (
                <TouchableOpacity
                  key={src.id}
                  onPress={() => toggleSource(src.id)}
                  style={isActive ? s.chipActive : s.chip}
                >
                  <MaterialCommunityIcons
                    name={isActive ? 'check' : 'file-pdf-box'}
                    size={13}
                    color={isActive ? '#fff' : colors.textSecondary}
                  />
                  <Text
                    style={isActive ? s.chipActiveText : s.chipText}
                    numberOfLines={1}
                  >
                    {src.file_name}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      )}

      {/* State messages */}
      {loadingMeta && (
        <View style={s.stateCard}>
          <ActivityIndicator color={colors.brand} />
        </View>
      )}

      {!loadingMeta && sources.length === 0 && (
        <View style={s.stateCard}>
          <MaterialCommunityIcons name="tray-arrow-up" size={28} color={colors.textSecondary} />
          <Text style={s.stateTitle}>No PDFs uploaded</Text>
          <Text style={s.stateBody}>
            Upload a rulebook from the Rulebook screen to search its contents here.
          </Text>
          <TouchableOpacity
            style={s.cta}
            onPress={() => router.push(`/campaign/${id}/rulebook` as never)}
          >
            <Text style={s.ctaText}>Go to Rulebook</Text>
          </TouchableOpacity>
        </View>
      )}

      {showIndexingNotice && (
        <View style={s.stateCard}>
          <MaterialCommunityIcons name="progress-clock" size={28} color={colors.hpWarning} />
          <Text style={s.stateTitle}>Content not yet indexed</Text>
          <Text style={s.stateBody}>
            PDFs are uploaded, but their text hasn't been parsed yet. Content
            indexing will process your files on-device so nothing is
            transmitted to Vaultstone's servers.
          </Text>
          {statuses.map((st) => (
            <View key={st.source_id} style={s.statusRow}>
              <MaterialCommunityIcons
                name={iconForStatus(st.status)}
                size={16}
                color={colorForStatus(st.status)}
              />
              <Text style={s.statusName} numberOfLines={1}>{st.fileName}</Text>
              <Text style={s.statusLabel}>{labelForStatus(st)}</Text>
            </View>
          ))}
        </View>
      )}

      {!loadingMeta && !showIndexingNotice && indexedSources.length > 0 &&
        activeIds.length === 0 && query.trim() !== '' && (
          <View style={s.stateCard}>
            <MaterialCommunityIcons name="filter-off-outline" size={28} color={colors.textSecondary} />
            <Text style={s.stateTitle}>No PDFs selected</Text>
            <Text style={s.stateBody}>
              Pick at least one PDF above to search in.
            </Text>
          </View>
        )}

      {!loadingMeta && !showIndexingNotice && activeIds.length > 0 &&
        query.trim() !== '' && !searching && hits.length === 0 && (
          <View style={s.stateCard}>
            <MaterialCommunityIcons name="file-search-outline" size={28} color={colors.textSecondary} />
            <Text style={s.stateTitle}>No matches</Text>
            <Text style={s.stateBody}>
              Nothing found for &ldquo;{query.trim()}&rdquo; in the selected
              {activeIds.length === 1 ? ' PDF' : ` ${activeIds.length} PDFs`}.
            </Text>
          </View>
        )}

      {/* Results */}
      {grouped.length > 0 && (
        <View style={{ gap: spacing.md }}>
          {grouped.map(([sourceId, group]) => (
            <View key={sourceId} style={s.groupCard}>
              <View style={s.groupHeader}>
                <MaterialCommunityIcons name="file-pdf-box" size={18} color={colors.brand} />
                <Text style={s.groupName} numberOfLines={1}>{group.fileName}</Text>
                <View style={s.countBadge}>
                  <Text style={s.countBadgeText}>{group.items.length}</Text>
                </View>
              </View>
              {group.items.map((hit, i) => (
                <TouchableOpacity
                  key={`${hit.sourceId}:${hit.pageNumber}:${i}`}
                  style={s.hitRow}
                  onPress={() =>
                    router.push(
                      `/campaign/${id}/pdf-viewer?sourceId=${hit.sourceId}&page=${hit.pageNumber}` as never,
                    )
                  }
                >
                  <Text style={s.hitPage}>Page {hit.pageNumber}</Text>
                  <Text style={s.hitSnippet} numberOfLines={3}>{hit.snippet}</Text>
                </TouchableOpacity>
              ))}
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

// ---- small helpers ----

function iconForStatus(status: IndexMeta['status']):
  'check-circle-outline' | 'progress-clock' | 'alert-circle-outline' | 'circle-outline' {
  switch (status) {
    case 'indexed': return 'check-circle-outline';
    case 'indexing': return 'progress-clock';
    case 'failed': return 'alert-circle-outline';
    default: return 'circle-outline';
  }
}

function colorForStatus(status: IndexMeta['status']): string {
  switch (status) {
    case 'indexed': return colors.hpHealthy;
    case 'indexing': return colors.hpWarning;
    case 'failed': return colors.hpDanger;
    default: return colors.textSecondary;
  }
}

function labelForStatus(st: IndexMeta): string {
  switch (st.status) {
    case 'indexed': return `${st.pages_indexed} pages`;
    case 'indexing': return 'Indexing…';
    case 'failed': return 'Failed';
    default: return 'Not indexed';
  }
}

const s = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: colors.background },
  container: { padding: spacing.lg, paddingBottom: 48, gap: spacing.md },

  back: { marginBottom: spacing.sm },
  backText: { color: colors.brand, fontSize: 14 },

  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.sm },
  title: { fontSize: 22, fontWeight: '700', color: colors.textPrimary },

  searchCard: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1,
    borderRadius: 10, paddingHorizontal: spacing.md, paddingVertical: 10,
  },
  searchInput: {
    flex: 1, color: colors.textPrimary, fontSize: 14,
    paddingVertical: 2,
  },

  filterCard: {
    backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1,
    borderRadius: 12, padding: spacing.md, gap: spacing.sm,
  },
  filterHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  filterTitle: { flex: 1, fontSize: 12, fontWeight: '700', color: colors.textSecondary, letterSpacing: 0.5 },
  filterBulkBtn: {
    paddingHorizontal: 10, paddingVertical: 4,
    borderColor: colors.border, borderWidth: 1, borderRadius: 12,
  },
  filterBulkText: { fontSize: 11, color: colors.textSecondary, fontWeight: '600' },

  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    maxWidth: '100%',
    paddingHorizontal: 10, paddingVertical: 6,
    borderColor: colors.border, borderWidth: 1, borderRadius: 999,
    backgroundColor: colors.background,
  },
  chipActive: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    maxWidth: '100%',
    paddingHorizontal: 10, paddingVertical: 6,
    borderColor: colors.brand, borderWidth: 1, borderRadius: 999,
    backgroundColor: colors.brand,
  },
  chipText: { fontSize: 12, color: colors.textSecondary, flexShrink: 1 },
  chipActiveText: { fontSize: 12, color: '#fff', fontWeight: '600', flexShrink: 1 },

  stateCard: {
    backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1,
    borderRadius: 14, padding: spacing.lg, gap: spacing.sm, alignItems: 'center',
  },
  stateTitle: { fontSize: 15, fontWeight: '700', color: colors.textPrimary },
  stateBody: { fontSize: 13, color: colors.textSecondary, textAlign: 'center', lineHeight: 19 },

  cta: {
    marginTop: spacing.sm, borderColor: colors.brand, borderWidth: 1,
    borderRadius: 8, paddingHorizontal: spacing.lg, paddingVertical: 8,
  },
  ctaText: { color: colors.brand, fontSize: 13, fontWeight: '600' },

  statusRow: {
    width: '100%', flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingVertical: 6, borderTopColor: colors.border, borderTopWidth: 1,
  },
  statusName: { flex: 1, fontSize: 13, color: colors.textPrimary },
  statusLabel: { fontSize: 12, color: colors.textSecondary },

  groupCard: {
    backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1,
    borderRadius: 14, padding: spacing.md, gap: spacing.sm,
  },
  groupHeader: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingBottom: spacing.sm,
    borderBottomColor: colors.border, borderBottomWidth: 1,
  },
  groupName: { flex: 1, fontSize: 14, fontWeight: '700', color: colors.textPrimary },

  countBadge: {
    backgroundColor: colors.brand, borderRadius: 10,
    paddingHorizontal: 7, paddingVertical: 2,
  },
  countBadgeText: { fontSize: 11, color: '#fff', fontWeight: '700' },

  hitRow: {
    backgroundColor: colors.background, borderRadius: 8,
    paddingHorizontal: spacing.sm, paddingVertical: 8, gap: 4,
  },
  hitPage: { fontSize: 11, fontWeight: '700', color: colors.brand, letterSpacing: 0.5 },
  hitSnippet: { fontSize: 13, color: colors.textPrimary, lineHeight: 19 },
});
