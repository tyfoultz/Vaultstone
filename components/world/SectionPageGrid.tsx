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

// CSS grid styles live inline (not in StyleSheet.create) because grid
// props widen StyleSheet's inferred types to include TextStyle/ImageStyle,
// which breaks View style assignments. RN ignores these on native, the web
// renderer honors them for the hero-spanning Locations layout.
const GRID_STYLE = {
  display: 'grid',
  gridTemplateColumns: '2fr 1fr 1fr 1fr',
  gridAutoRows: 'minmax(200px, auto)',
  gap: 14,
} as const;

const CARD_SLOT_STYLE = {
  gridColumn: 'span 1 / span 1',
  gridRow: 'span 1 / span 1',
} as const;

const HERO_SLOT_STYLE = {
  gridColumn: 'span 2 / span 2',
  gridRow: 'span 2 / span 2',
} as const;

export function SectionPageGrid({ pages, template, onPagePress }: Props) {
  return (
    <View style={GRID_STYLE as object}>
      {pages.map((page, index) => (
        <PageGridCard
          key={page.id}
          page={page}
          template={template}
          hero={index === 0}
          onPress={() => onPagePress(page)}
        />
      ))}
    </View>
  );
}

type CardProps = {
  page: WorldPage;
  template: SectionTemplate;
  hero: boolean;
  onPress: () => void;
};

function PageGridCard({ page, template, hero, onPress }: CardProps) {
  const swatch = ACCENT_SWATCH[template.accentToken];
  const iconName = toMaterialIcon(template.icon);
  const kindLabel = PAGE_KIND_LABEL[page.page_kind] ?? 'Page';
  const preview = getPreview(page);
  const toggleVisibility = usePageVisibilityToggle(page);

  return (
    <Pressable onPress={onPress} style={(hero ? HERO_SLOT_STYLE : CARD_SLOT_STYLE) as object}>
      <Card tier={hero ? 'hero' : 'container'} padding="lg" style={styles.card}>
        <LinearGradient
          colors={[swatch.container, colors.surfaceContainerLowest]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.cover, hero ? styles.coverHero : null]}
        >
          <Icon
            name={iconName as React.ComponentProps<typeof Icon>['name']}
            size={hero ? 44 : 28}
            color={swatch.fg}
          />
          <View style={styles.visibility}>
            <VisibilityBadge
              visibility={page.visible_to_players ? 'player' : 'gm'}
              interactive={!!toggleVisibility}
              onPress={toggleVisibility ?? undefined}
            />
          </View>
        </LinearGradient>

        <View style={styles.meta}>
          <MetaLabel size="sm" tone="accent">
            {kindLabel}
          </MetaLabel>
          <Text
            variant={hero ? 'display-sm' : 'title-md'}
            family="serif-display"
            weight="bold"
            style={styles.title}
            numberOfLines={2}
          >
            {page.title}
          </Text>
          {preview ? (
            <Text
              variant="body-sm"
              family="serif-body"
              tone="secondary"
              style={styles.preview}
              numberOfLines={hero ? 3 : 2}
            >
              {preview}
            </Text>
          ) : null}
        </View>
      </Card>
    </Pressable>
  );
}

function getPreview(page: WorldPage): string | null {
  const fields = (page.structured_fields as Record<string, unknown> | null) ?? {};
  const description = fields.description ?? fields.tagline ?? fields.summary;
  if (typeof description === 'string' && description.trim()) return description;
  if (page.body_text && page.body_text.trim()) {
    return page.body_text.slice(0, 160);
  }
  return null;
}

const styles = StyleSheet.create({
  card: {
    gap: spacing.md,
    minHeight: 220,
  },
  cover: {
    height: 120,
    borderRadius: radius.xl,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    overflow: 'hidden',
  },
  coverHero: {
    height: 220,
  },
  visibility: {
    position: 'absolute',
    top: spacing.sm,
    right: spacing.sm,
  },
  meta: {
    gap: 4,
  },
  title: {
    color: colors.onSurface,
    letterSpacing: -0.3,
  },
  preview: {
    color: colors.onSurfaceVariant,
    fontStyle: 'italic',
    marginTop: 4,
  },
});
