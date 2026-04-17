import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import type { AccentToken } from '@vaultstone/types';
import { Icon, MetaLabel, Text, colors, radius, spacing } from '@vaultstone/ui';

import { ACCENT_SWATCH, toMaterialIcon } from './helpers';

type Props = {
  icon: string;
  title: string;
  meta?: string;
  accentToken: AccentToken;
  actions?: ReactNode;
};

// Matches handoff `.page-head` + `.page-icon`: a 56×56 gradient tile tinted
// by the template accent, a display-font title, an uppercase kicker for
// section/kind context, and a trailing actions slot (kebab + CTAs).
export function PageHead({ icon, title, meta, accentToken, actions }: Props) {
  const swatch = ACCENT_SWATCH[accentToken];
  const materialName = toMaterialIcon(icon);

  return (
    <View style={styles.root}>
      <LinearGradient
        colors={[swatch.container, swatch.glow]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.tile, { borderColor: swatch.border }]}
      >
        <Icon
          name={materialName as React.ComponentProps<typeof Icon>['name']}
          size={28}
          color={swatch.fg}
        />
      </LinearGradient>

      <View style={styles.text}>
        {meta ? (
          <MetaLabel tone="accent" size="sm">
            {meta}
          </MetaLabel>
        ) : null}
        <Text
          variant="display-sm"
          family="serif-display"
          weight="bold"
          style={styles.title}
        >
          {title}
        </Text>
      </View>

      {actions ? <View style={styles.actions}>{actions}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  tile: {
    width: 56,
    height: 56,
    borderRadius: radius.xl,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    flex: 1,
    gap: 2,
  },
  title: {
    color: colors.onSurface,
    letterSpacing: -0.5,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
});
