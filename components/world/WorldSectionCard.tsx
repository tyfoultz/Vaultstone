import { Pressable, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import type { SectionTemplate, WorldSection } from '@vaultstone/types';
import { Card, Icon, MetaLabel, Text, colors, radius, spacing } from '@vaultstone/ui';

import { ACCENT_SWATCH, toMaterialIcon } from './helpers';

type Props = {
  section: WorldSection;
  template: SectionTemplate;
  pageCount: number;
  onPress: () => void;
};

// World-landing Atlas card — one per section. Mirrors the handoff
// `.world-card` (icon tile + label + count + "Open" link). Tapping the
// card takes the GM into the section.
export function WorldSectionCard({ section, template, pageCount, onPress }: Props) {
  const swatch = ACCENT_SWATCH[template.accentToken];
  const iconName = toMaterialIcon(template.icon);
  const visibilityLabel = section.force_hidden_from_players ? 'GM only' : 'Player visible';

  return (
    <Pressable onPress={onPress}>
      <Card tier="container" padding="lg" style={styles.root}>
        <LinearGradient
          colors={[swatch.container, swatch.glow]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.tile, { borderColor: swatch.border }]}
        >
          <Icon
            name={iconName as React.ComponentProps<typeof Icon>['name']}
            size={22}
            color={swatch.fg}
          />
        </LinearGradient>

        <View style={styles.titleBlock}>
          <Text variant="title-md" family="serif-display" weight="bold">
            {section.name}
          </Text>
          <MetaLabel tone="muted" size="sm">
            {visibilityLabel}
          </MetaLabel>
        </View>

        <View style={styles.footer}>
          <Text variant="body-sm" tone="secondary">
            {pageCount} {pageCount === 1 ? 'page' : 'pages'}
          </Text>
          <Text variant="label-md" weight="semibold" style={{ color: swatch.fg }}>
            Open →
          </Text>
        </View>
      </Card>
    </Pressable>
  );
}

type AddCardProps = { onPress: () => void };

// Dashed-border empty-state card paired with the section grid — handoff
// `.world-card.world-card-add`.
export function WorldSectionAddCard({ onPress }: AddCardProps) {
  return (
    <Pressable onPress={onPress} style={styles.addRoot}>
      <Icon name="add" size={22} color={colors.outline} />
      <Text variant="label-md" tone="secondary" style={{ marginTop: spacing.xs }}>
        New section
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: {
    gap: spacing.md,
    minHeight: 180,
  },
  tile: {
    width: 44,
    height: 44,
    borderRadius: radius.lg,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleBlock: {
    gap: 4,
  },
  footer: {
    marginTop: 'auto',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  addRoot: {
    minHeight: 180,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.outlineVariant,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
    backgroundColor: colors.surfaceContainerLowest,
  },
});
