import { type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { MetaLabel, colors, spacing } from '@vaultstone/ui';

export type Crumb = {
  key: string;
  label: string;
};

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

type Props = {
  crumbs: Crumb[];
  saveState?: SaveState;
  actions?: ReactNode;
};

// Matches handoff `.topbar`. 48px high, uppercase kicker-row breadcrumbs,
// save-state dot, right-aligned slot for page-specific CTAs. Presence
// avatars are reserved space until Phase 3 wires Realtime.
export function WorldTopBar({ crumbs, saveState = 'idle', actions }: Props) {
  const dotColor =
    saveState === 'saving'
      ? colors.hpWarning
      : saveState === 'saved'
        ? colors.hpHealthy
        : saveState === 'error'
          ? colors.hpDanger
          : colors.outline;

  return (
    <View style={styles.root}>
      <View style={styles.crumbs}>
        {crumbs.map((c, i) => (
          <View key={c.key} style={styles.crumbItem}>
            <MetaLabel size="sm" tone={i === crumbs.length - 1 ? 'accent' : 'muted'}>
              {c.label}
            </MetaLabel>
            {i < crumbs.length - 1 ? (
              <MetaLabel size="sm" tone="muted" style={{ opacity: 0.5 }}>
                {'  ›  '}
              </MetaLabel>
            ) : null}
          </View>
        ))}
      </View>

      <View style={styles.saveState}>
        <View style={[styles.dot, { backgroundColor: dotColor }]} />
        <MetaLabel size="sm" tone="muted">
          {saveState === 'saving'
            ? 'Saving'
            : saveState === 'saved'
              ? 'Saved'
              : saveState === 'error'
                ? 'Save error'
                : 'Ready'}
        </MetaLabel>
      </View>

      <View style={{ flex: 1 }} />

      {actions ? <View style={styles.actions}>{actions}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.outlineVariant + '22',
    backgroundColor: colors.surfaceCanvas,
    gap: spacing.md,
  },
  crumbs: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  crumbItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  saveState: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs + 2,
    marginLeft: spacing.md,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
});
