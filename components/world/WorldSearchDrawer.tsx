import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { searchWorld, type SearchResult } from '@vaultstone/api';
import {
  Card,
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
import type { PageKind } from '@vaultstone/types';

const PAGE_SIZE_FIRST = 10;
const PAGE_SIZE_MORE = 20;

type Props = {
  worldId: string;
};

export function WorldSearchDrawer({ worldId }: Props) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [open, setOpen] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const doSearch = useCallback(
    async (q: string, offset = 0) => {
      const limit = offset === 0 ? PAGE_SIZE_FIRST : PAGE_SIZE_MORE;
      setLoading(true);
      const { data } = await searchWorld(worldId, q, limit, offset);
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
    [worldId],
  );

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      setHasMore(false);
      setOpen(false);
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setOpen(true);
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

  function handleSelect(result: SearchResult) {
    if (result.result_type === 'page') {
      router.push(worldPageHref(worldId, result.id));
    }
    setOpen(false);
    setQuery('');
  }

  return (
    <View style={styles.root}>
      <Input
        value={query}
        onChangeText={setQuery}
        placeholder="Search…  ⌘K"
        onFocus={() => { if (query.trim()) setOpen(true); }}
      />

      {open && results.length > 0 ? (
        <Card tier="highest" padding="sm" style={styles.drawer}>
          <ScrollView style={styles.list} keyboardShouldPersistTaps="handled">
            {results.map((r) => (
              <SearchResultRow key={`${r.result_type}-${r.id}`} result={r} onPress={() => handleSelect(r)} />
            ))}
            {hasMore ? (
              <Pressable onPress={handleLoadMore} style={styles.loadMore}>
                <Text variant="label-sm" style={{ color: colors.primary }}>
                  {loading ? 'Loading…' : 'Load more'}
                </Text>
              </Pressable>
            ) : null}
          </ScrollView>
        </Card>
      ) : open && !loading && query.trim() ? (
        <Card tier="highest" padding="md" style={styles.drawer}>
          <Text variant="body-sm" tone="secondary" style={{ textAlign: 'center' }}>
            No results for "{query.trim()}"
          </Text>
        </Card>
      ) : null}
    </View>
  );
}

function SearchResultRow({ result, onPress }: { result: SearchResult; onPress: () => void }) {
  const typeIcon = RESULT_TYPE_ICON[result.result_type] ?? 'article';
  const kindLabel = PAGE_KIND_LABEL[result.page_kind as PageKind] ?? result.result_type;

  return (
    <Pressable onPress={onPress} style={styles.row}>
      <Icon name={typeIcon as React.ComponentProps<typeof Icon>['name']} size={16} color={colors.onSurfaceVariant} />
      <View style={styles.rowBody}>
        <Text variant="body-sm" weight="semibold" numberOfLines={1}>
          {result.title}
        </Text>
        <View style={styles.rowMeta}>
          <Text style={styles.rowKind}>{kindLabel}</Text>
          {result.section_name ? (
            <Text style={styles.rowSection}>· {result.section_name}</Text>
          ) : null}
        </View>
        {result.preview ? (
          <Text variant="label-sm" tone="secondary" numberOfLines={1} style={{ marginTop: 1 }}>
            {result.preview}
          </Text>
        ) : null}
      </View>
      <View style={styles.rowTrailing}>
        {result.is_orphaned ? (
          <View style={styles.orphanBadge}>
            <Text style={styles.orphanText}>Orphaned</Text>
          </View>
        ) : null}
        <VisibilityBadge visibility={result.visible_to_players ? 'player' : 'gm'} />
      </View>
    </Pressable>
  );
}

const RESULT_TYPE_ICON: Record<string, string> = {
  page: 'article',
  pin: 'place',
  event: 'event',
};

const styles = StyleSheet.create({
  root: {
    position: 'relative',
    zIndex: 10,
  },
  drawer: {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    marginTop: spacing.xs,
    maxHeight: 400,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    borderRadius: radius.xl,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.45,
    shadowRadius: 32,
    elevation: 20,
    overflow: 'hidden',
  },
  list: {
    maxHeight: 380,
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
  },
  rowKind: {
    fontFamily: fonts.label,
    fontSize: 10,
    letterSpacing: 1,
    color: colors.outline,
    textTransform: 'uppercase',
  },
  rowSection: {
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
