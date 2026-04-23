import { Pressable, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import type { SectionTemplate, WorldSection } from '@vaultstone/types';
import { Card, Icon, Text, colors, radius, spacing } from '@vaultstone/ui';

import { ACCENT_SWATCH, toMaterialIcon } from './helpers';

type Props = {
  section: WorldSection;
  template: SectionTemplate;
  pageCount: number;
  onPress: () => void;
  onMenuPress?: () => void;
};

export function WorldSectionCard({ section, template, pageCount, onPress, onMenuPress }: Props) {
  const swatch = ACCENT_SWATCH[template.accentToken];
  const iconName = toMaterialIcon(section.custom_icon ?? template.icon);
  const isHidden = section.force_hidden_from_players;

  return (
    <Pressable onPress={onPress}>
      <Card tier="container" padding="lg" style={styles.root}>
        <View style={styles.header}>
          <View style={styles.titleRow}>
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
            <Text variant="title-md" family="serif-display" weight="bold" style={{ flex: 1 }}>
              {section.name}
            </Text>
          </View>
          {onMenuPress ? (
            <Pressable onPress={onMenuPress} hitSlop={8}>
              <Icon name="more-horiz" size={18} color={colors.onSurfaceVariant} />
            </Pressable>
          ) : null}
        </View>

        <View style={[styles.visibilityBadge, isHidden ? styles.badgeGm : styles.badgePlayer]}>
          <Icon
            name={isHidden ? 'visibility-off' : 'visibility'}
            size={12}
            color={isHidden ? colors.hpWarning : colors.hpHealthy}
          />
          <Text
            variant="label-sm"
            weight="semibold"
            uppercase
            style={{ color: isHidden ? colors.hpWarning : colors.hpHealthy, letterSpacing: 0.6 }}
          >
            {isHidden ? 'GM Only' : 'Player-Visible'}
          </Text>
        </View>

        {section.description ? (
          <Text
            variant="body-sm"
            style={{ color: colors.onSurfaceVariant }}
            numberOfLines={3}
          >
            {section.description}
          </Text>
        ) : null}

        <View style={styles.footer}>
          <Text variant="label-sm" style={{ color: swatch.fg }}>
            OPEN →
          </Text>
        </View>
      </Card>
    </Pressable>
  );
}

type AddCardProps = {
  onPress: () => void;
  subtitle?: string;
};

export function WorldSectionAddCard({ onPress, subtitle }: AddCardProps) {
  return (
    <Pressable onPress={onPress} style={styles.addRoot}>
      <Icon name="add-circle-outline" size={28} color={colors.outline} />
      <Text variant="label-md" weight="semibold" tone="secondary" style={{ marginTop: spacing.xs }}>
        New Section
      </Text>
      {subtitle ? (
        <Text variant="body-sm" style={{ color: colors.outline, marginTop: 2 }}>
          {subtitle}
        </Text>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: {
    gap: spacing.sm,
    minHeight: 180,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flex: 1,
  },
  tile: {
    width: 40,
    height: 40,
    borderRadius: radius.lg,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  visibilityBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
  badgePlayer: {
    backgroundColor: colors.hpHealthy + '18',
  },
  badgeGm: {
    backgroundColor: colors.hpWarning + '18',
  },
  footer: {
    marginTop: 'auto',
    flexDirection: 'row',
    justifyContent: 'flex-start',
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
