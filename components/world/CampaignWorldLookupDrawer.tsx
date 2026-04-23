import { useCallback, useEffect, useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { searchCampaignWorlds, type CampaignSearchResult } from '@vaultstone/api';
import type { PageKind } from '@vaultstone/types';
import {
  Card,
  GhostButton,
  Icon,
  Input,
  MetaLabel,
  Text,
  VisibilityBadge,
  colors,
  fonts,
  radius,
  spacing,
} from '@vaultstone/ui';

import { PAGE_KIND_LABEL } from './helpers';
import { worldPageHref } from './worldHref';

const PAGE_SIZE_FIRST = 10;
const PAGE_SIZE_MORE = 20;

type Props = {
  campaignId: string;
  onClose: () => void;
};

export function CampaignWorldLookupDrawer({ campaignId, onClose }: Props) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<CampaignSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const doSearch = useCallback(
    async (q: string, offset = 0) => {
      const limit = offset === 0 ? PAGE_SIZE_FIRST : PAGE_SIZE_MORE;
      setLoading(true);
      const { data } = await searchCampaignWorlds(campaignId, q, limit, offset);
      if (data) {
        if (offset === 0) {
          setResults(data);
        } else {
          setResults((prev) => [...prev, ...data]);
        }
        setHasMore(data.length === limit);
      }
      setLoading(false);
    },
    [campaignId],
  );

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      setHasMore(false);
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      doSearch(query.trim());
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, doSearch]);

  function handleLoadMore() {
    if (loading || !hasMore) return;
    doSearch(query.trim(), results.length);
  }

  function handleSelect(result: CampaignSearchResult) {
    if (result.result_type === 'page') {
      router.push(worldPageHref(result.world_id, result.id));
    }
    onClose();
  }

  return (
    <Modal transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.drawerWrap} onPress={(e) => e.stopPropagation()}>
          <Card tier="highest" padding="lg" style={styles.card}>
            <View style={styles.header}>
              <Icon name="search" size={20} color={colors.primary} />
              <Text variant="title-md" family="serif-display" weight="semibold" style={{ flex: 1 }}>
                Search Worlds
              </Text>
              <Pressable onPress={onClose} hitSlop={8}>
                <Icon name="close" size={20} color={colors.onSurfaceVariant} />
              </Pressable>
            </View>

            <Input
              value={query}
              onChangeText={setQuery}
              placeholder="Search across all linked worlds…"
              autoFocus
            />

            <ScrollView style={styles.list} keyboardShouldPersistTaps="handled">
              {results.map((r) => (
                <Pressable
                  key={`${r.result_type}-${r.id}`}
                  onPress={() => handleSelect(r)}
                  style={styles.row}
                >
                  <Icon
                    name={RESULT_TYPE_ICON[r.result_type] as React.ComponentProps<typeof Icon>['name']}
                    size={16}
                    color={colors.onSurfaceVariant}
                  />
                  <View style={styles.rowBody}>
                    <Text variant="body-sm" weight="semibold" numberOfLines={1}>
                      {r.title}
                    </Text>
                    <View style={styles.rowMeta}>
                      <Text style={styles.rowWorldName}>{r.world_name}</Text>
                      {r.section_name ? (
                        <Text style={styles.rowSection}>· {r.section_name}</Text>
                      ) : null}
                      <Text style={styles.rowKind}>
                        · {PAGE_KIND_LABEL[r.page_kind as PageKind] ?? r.result_type}
                      </Text>
                    </View>
                    {r.preview ? (
                      <Text variant="label-sm" tone="secondary" numberOfLines={1} style={{ marginTop: 1 }}>
                        {r.preview}
                      </Text>
                    ) : null}
                  </View>
                  <View style={styles.rowTrailing}>
                    {r.is_orphaned ? (
                      <View style={styles.orphanBadge}>
                        <Text style={styles.orphanText}>Orphaned</Text>
                      </View>
                    ) : null}
                    <VisibilityBadge visibility={r.visible_to_players ? 'player' : 'gm'} />
                  </View>
                </Pressable>
              ))}

              {results.length === 0 && query.trim() && !loading ? (
                <Text variant="body-sm" tone="secondary" style={{ textAlign: 'center', paddingVertical: spacing.lg }}>
                  No results for "{query.trim()}"
                </Text>
              ) : null}

              {hasMore ? (
                <Pressable onPress={handleLoadMore} style={styles.loadMore}>
                  <Text variant="label-sm" style={{ color: colors.primary }}>
                    {loading ? 'Loading…' : 'Load more'}
                  </Text>
                </Pressable>
              ) : null}
            </ScrollView>
          </Card>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const RESULT_TYPE_ICON: Record<string, string> = {
  page: 'article',
  pin: 'place',
  event: 'event',
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  drawerWrap: {
    width: '100%',
    maxWidth: 560,
    maxHeight: '80%',
    paddingHorizontal: spacing.lg,
  },
  card: {
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    borderRadius: radius.xl,
    gap: spacing.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  list: {
    maxHeight: 400,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.lg,
  },
  rowBody: {
    flex: 1,
    gap: 1,
  },
  rowMeta: {
    flexDirection: 'row',
    gap: 4,
    flexWrap: 'wrap',
  },
  rowWorldName: {
    fontFamily: fonts.label,
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.8,
    color: colors.primary,
    textTransform: 'uppercase',
  },
  rowSection: {
    fontFamily: fonts.label,
    fontSize: 10,
    color: colors.outline,
  },
  rowKind: {
    fontFamily: fonts.label,
    fontSize: 10,
    color: colors.outline,
  },
  rowTrailing: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  orphanBadge: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.hpWarning + '55',
    backgroundColor: colors.gmContainer + '44',
  },
  orphanText: {
    fontFamily: fonts.label,
    fontSize: 9,
    letterSpacing: 0.8,
    color: colors.hpWarning,
    textTransform: 'uppercase',
  },
  loadMore: {
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
});
