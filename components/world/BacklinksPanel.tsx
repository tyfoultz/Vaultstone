import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { getPagesLinkingTo } from '@vaultstone/api';
import { getTemplate } from '@vaultstone/content';
import { useSectionsStore } from '@vaultstone/store';
import { Card, Icon, MetaLabel, Text, colors, radius, spacing } from '@vaultstone/ui';
import type { TemplateKey, WorldPage } from '@vaultstone/types';

import { toMaterialIcon } from './helpers';
import { worldPageHref } from './worldHref';

type Props = {
  pageId: string;
  worldId: string;
};

// Pages that mention the current page via @-references in their body. Reads
// from world_pages.body_refs[] which the BodyEditor populates on each save.
// Refetches whenever pageId changes; not realtime — Phase 3c (presence) is
// where we'd add a Supabase Realtime subscription if it ends up being needed.
export function BacklinksPanel({ pageId, worldId }: Props) {
  const router = useRouter();
  const sections = useSectionsStore((s) => s.byWorldId[worldId]);
  const [links, setLinks] = useState<WorldPage[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoaded(false);
    void (async () => {
      const { data } = await getPagesLinkingTo(worldId, pageId);
      if (cancelled) return;
      setLinks(data ?? []);
      setLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [pageId, worldId]);

  if (!loaded || links.length === 0) return null;

  const sectionName = (id: string) =>
    sections?.find((s) => s.id === id)?.name ?? '';

  return (
    <View style={styles.root}>
      <MetaLabel size="sm" tone="muted" style={{ marginBottom: spacing.xs }}>
        Linked from
      </MetaLabel>
      <Card tier="container" padding="md">
        <View style={styles.list}>
          {links.map((p) => {
            let iconName = 'article';
            try {
              const tpl = getTemplate(p.template_key as TemplateKey, p.template_version);
              iconName = toMaterialIcon(tpl.icon);
            } catch {
              // ignore — keep fallback icon
            }
            return (
              <Pressable
                key={p.id}
                onPress={() => router.push(worldPageHref(worldId, p.id))}
                style={styles.row}
              >
                <View style={styles.iconTile}>
                  <Icon
                    name={iconName as React.ComponentProps<typeof Icon>['name']}
                    size={16}
                    color={colors.primary}
                  />
                </View>
                <View style={styles.text}>
                  <Text variant="label-md" weight="semibold">
                    {p.title}
                  </Text>
                  <MetaLabel tone="muted" size="sm">
                    {sectionName(p.section_id)}
                  </MetaLabel>
                </View>
                <Text variant="label-md" tone="accent">
                  Open →
                </Text>
              </Pressable>
            );
          })}
        </View>
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    marginTop: spacing.lg,
  },
  list: {
    gap: spacing.xs,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xs,
  },
  iconTile: {
    width: 32,
    height: 32,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceContainerHighest,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    flex: 1,
    gap: 2,
  },
});
