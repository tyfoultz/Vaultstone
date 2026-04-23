import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import type { AccentToken } from '@vaultstone/types';
import { Icon, MetaLabel, Text, colors, spacing } from '@vaultstone/ui';

import { ACCENT_SWATCH, toMaterialIcon } from './helpers';

type MetaPill = {
  key: string;
  icon: React.ComponentProps<typeof Icon>['name'];
  label: string;
  tone?: 'default' | 'player' | 'gm' | 'danger';
};

type Props = {
  icon: string;
  title: string;
  accentToken: AccentToken;
  /**
   * Single-string accent kicker (legacy — used by the world landing and
   * section-detail screens where a simple "Chronicle" / "Category · N pages"
   * line is all we need).
   */
  meta?: string;
  /**
   * Rich meta row with icon+label pills — matches the handoff `.wiki-meta`
   * on page-detail screens. When provided, `meta` is ignored.
   */
  metaPills?: MetaPill[];
  actions?: ReactNode;
  onIconPress?: () => void;
};

// Matches handoff `.wiki-head`: a 76×76 gradient tile tinted by the template
// accent, a 42px display title, and a meta kicker row made up of small
// icon+label pills (one per pill — kind / scope / visibility / sub-page
// count). The old `meta` string prop was a single accent kicker; it's
// replaced by `metaPills` so the row can mirror the handoff exactly.
export function PageHead({ icon, title, accentToken, meta, metaPills, actions, onIconPress }: Props) {
  const swatch = ACCENT_SWATCH[accentToken];
  const materialName = toMaterialIcon(icon);

  const tileContent = (
    <LinearGradient
      colors={[swatch.container, swatch.glow]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[styles.tile, { borderColor: swatch.border }]}
    >
      <Icon
        name={materialName as React.ComponentProps<typeof Icon>['name']}
        size={36}
        color={swatch.fg}
      />
    </LinearGradient>
  );

  return (
    <View style={styles.root}>
      {onIconPress ? (
        <Pressable onPress={onIconPress} accessibilityLabel="Change section icon">
          {tileContent}
        </Pressable>
      ) : tileContent}

      <View style={styles.text}>
        <Text
          variant="display-md"
          family="serif-display"
          weight="medium"
          style={styles.title}
        >
          {title}
        </Text>
        {metaPills && metaPills.length > 0 ? (
          <View style={styles.metaRow}>
            {metaPills.map((p) => (
              <View key={p.key} style={styles.metaPill}>
                <Icon name={p.icon} size={11} color={TONE_COLOR[p.tone ?? 'default']} />
                <Text
                  variant="label-sm"
                  style={{ color: TONE_COLOR[p.tone ?? 'default'] }}
                >
                  {p.label}
                </Text>
              </View>
            ))}
          </View>
        ) : meta ? (
          <MetaLabel tone="accent" size="sm">
            {meta}
          </MetaLabel>
        ) : null}
      </View>

      {actions ? <View style={styles.actions}>{actions}</View> : null}
    </View>
  );
}

const TONE_COLOR: Record<NonNullable<MetaPill['tone']>, string> = {
  default: colors.outline,
  player: colors.player,
  gm: colors.gm,
  danger: colors.hpDanger,
};

const styles = StyleSheet.create({
  root: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.lg,
  },
  tile: {
    width: 76,
    height: 76,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    flex: 1,
    gap: spacing.xs + 2,
  },
  title: {
    color: colors.onSurface,
    fontSize: 42,
    lineHeight: 44,
    letterSpacing: -0.8,
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.md,
  },
  metaPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
});
