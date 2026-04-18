import { Pressable, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import type { SectionTemplate, WorldPage } from '@vaultstone/types';
import {
  Card,
  Icon,
  MetaLabel,
  Text,
  VisibilityBadge,
  colors,
  radius,
  spacing,
} from '@vaultstone/ui';

import { ACCENT_SWATCH, PAGE_KIND_LABEL, toMaterialIcon } from './helpers';
import { usePageVisibilityToggle } from './usePageVisibilityToggle';

type Props = {
  pages: WorldPage[];
  template: SectionTemplate;
  onPagePress: (page: WorldPage) => void;
};

// Vertical list layout — default for NPCs / Players / Factions / Lore.
// Each row is a `Card tier="container"` with a small accent tile on the
// left, title + kicker + preview + tag row in the middle, and a
// VisibilityBadge aligned to the right.
export function SectionPageList({ pages, template, onPagePress }: Props) {
  return (
    <View style={styles.list}>
      {pages.map((page) => (
        <PageListRow
          key={page.id}
          page={page}
          template={template}
          onPress={() => onPagePress(page)}
        />
      ))}
    </View>
  );
}

type RowProps = {
  page: WorldPage;
  template: SectionTemplate;
  onPress: () => void;
};

function PageListRow({ page, template, onPress }: RowProps) {
  const swatch = ACCENT_SWATCH[template.accentToken];
  const iconName = toMaterialIcon(template.icon);
  const kindLabel = PAGE_KIND_LABEL[page.page_kind] ?? 'Page';
  const preview = getPreview(page);
  const tags = getTags(page);
  const toggleVisibility = usePageVisibilityToggle(page);

  return (
    <Pressable onPress={onPress}>
      <Card tier="container" padding="md" style={styles.row}>
        <LinearGradient
          colors={[swatch.container, swatch.glow]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.tile, { borderColor: swatch.border }]}
        >
          <Icon
            name={iconName as React.ComponentProps<typeof Icon>['name']}
            size={20}
            color={swatch.fg}
          />
        </LinearGradient>

        <View style={styles.body}>
          <MetaLabel size="sm" tone="muted">
            {kindLabel}
          </MetaLabel>
          <Text variant="title-sm" family="serif-display" weight="semibold">
            {page.title}
          </Text>
          {preview ? (
            <Text
              variant="body-sm"
              tone="secondary"
              style={styles.preview}
              numberOfLines={1}
            >
              {preview}
            </Text>
          ) : null}
          {tags.length > 0 ? (
            <View style={styles.tagRow}>
              {tags.slice(0, 4).map((tag) => (
                <View key={tag} style={styles.tag}>
                  <Text variant="label-sm" tone="secondary">
                    {tag}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}
        </View>

        <View style={styles.trailing}>
          <VisibilityBadge
            visibility={page.visible_to_players ? 'player' : 'gm'}
            interactive={!!toggleVisibility}
            onPress={toggleVisibility ?? undefined}
          />
        </View>
      </Card>
    </Pressable>
  );
}

function getPreview(page: WorldPage): string | null {
  const fields = (page.structured_fields as Record<string, unknown> | null) ?? {};
  const description =
    fields.tagline ?? fields.role ?? fields.summary ?? fields.description;
  if (typeof description === 'string' && description.trim()) return description;
  if (page.body_text && page.body_text.trim()) return page.body_text.slice(0, 120);
  return null;
}

function getTags(page: WorldPage): string[] {
  const fields = (page.structured_fields as Record<string, unknown> | null) ?? {};
  const raw = fields.tags;
  if (!Array.isArray(raw)) return [];
  return raw.filter((t): t is string => typeof t === 'string');
}

const styles = StyleSheet.create({
  list: {
    gap: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  tile: {
    width: 36,
    height: 36,
    borderRadius: radius.lg,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    flex: 1,
    gap: 2,
  },
  preview: {
    color: colors.onSurfaceVariant,
  },
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  tag: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.outlineVariant + '55',
    backgroundColor: colors.surfaceContainer,
  },
  trailing: {
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
});
