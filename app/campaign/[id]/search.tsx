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

  // Debounce queries a bit so we don't run a scan on every keystroke.
  useEffect(() => {
    if (!id) return;
    const trimmed = query.trim();
    if (!trimmed) {
      setHits([]);
      return;
    }
    setSearching(true);
    const t = setTimeout(() => {
      searchCampaign(id, trimmed)
        .then(setHits)
        .catch(() => setHits([]))
        .finally(() => setSearching(false));
    }, 200);
    return () => clearTimeout(t);
  }, [id, query]);

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

      {!loadingMeta && !showIndexingNotice && query.trim() !== '' && !searching && hits.length === 0 && (
        <View style={s.stateCard}>
          <MaterialCommunityIcons name="file-search-outline" size={28} color={colors.textSecondary} />
          <Text style={s.stateTitle}>No matches</Text>
          <Text style={s.stateBody}>
            Nothing found for &ldquo;{query.trim()}&rdquo; in your uploaded PDFs.
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
