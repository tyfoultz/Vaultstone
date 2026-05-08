import { type ReactNode, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Icon, MetaLabel, Text, colors, spacing } from '@vaultstone/ui';
import { useBreakpoint } from '@vaultstone/ui';

export type Crumb = {
  key: string;
  label: string;
};

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

type Props = {
  crumbs: Crumb[];
  saveState?: SaveState;
  actions?: ReactNode;
  isDetail?: boolean;
  title?: string;
  onSearchPress?: () => void;
};

export function WorldTopBar({ crumbs, saveState = 'idle', actions, isDetail, title, onSearchPress }: Props) {
  const { isMobile } = useBreakpoint();

  if (isMobile) {
    return (
      <MobileWorldTopBar
        crumbs={crumbs}
        actions={actions}
        isDetail={isDetail}
        title={title}
        onSearchPress={onSearchPress}
      />
    );
  }

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

// ── Mobile top bar ──────────────────────────────────────────────────────

function MobileWorldTopBar({
  crumbs,
  actions,
  isDetail,
  title,
  onSearchPress,
}: Pick<Props, 'crumbs' | 'actions' | 'isDetail' | 'title' | 'onSearchPress'>) {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);

  const breadcrumbText = crumbs
    .slice(0, -1)
    .map((c) => c.label)
    .join(' › ');
  const displayTitle = title ?? crumbs[crumbs.length - 1]?.label ?? '';

  return (
    <>
      <View style={mobileStyles.root}>
        {/* Left: hamburger or back */}
        <Pressable
          style={mobileStyles.iconBtn}
          onPress={() => {
            if (isDetail) {
              router.back();
            } else {
              router.push('/(drawer)/worlds');
            }
          }}
          hitSlop={8}
        >
          <Icon
            name={isDetail ? 'arrow-back' : 'menu'}
            size={24}
            color={colors.onSurface}
          />
        </Pressable>

        {/* Center: breadcrumb + title */}
        <View style={mobileStyles.center}>
          {breadcrumbText ? (
            <MetaLabel size="sm" tone="muted" numberOfLines={1}>
              {breadcrumbText}
            </MetaLabel>
          ) : null}
          <Text variant="title-sm" numberOfLines={1} style={{ color: colors.onSurface }}>
            {displayTitle}
          </Text>
        </View>

        {/* Right: search + overflow */}
        <View style={mobileStyles.rightActions}>
          {onSearchPress ? (
            <Pressable style={mobileStyles.iconBtn} onPress={onSearchPress} hitSlop={8}>
              <Icon name="search" size={22} color={colors.onSurface} />
            </Pressable>
          ) : null}
          {actions ? (
            <Pressable style={mobileStyles.iconBtn} onPress={() => setMenuOpen(true)} hitSlop={8}>
              <Icon name="more-vert" size={22} color={colors.onSurface} />
            </Pressable>
          ) : null}
        </View>
      </View>

      {/* Overflow menu */}
      {actions ? (
        <Modal visible={menuOpen} transparent animationType="fade" onRequestClose={() => setMenuOpen(false)}>
          <Pressable style={mobileStyles.menuBackdrop} onPress={() => setMenuOpen(false)}>
            <Pressable style={mobileStyles.menuCard} onPress={() => {}}>
              <ScrollView>{actions}</ScrollView>
            </Pressable>
          </Pressable>
        </Modal>
      ) : null}
    </>
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

const mobileStyles = StyleSheet.create({
  root: {
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.outlineVariant + '22',
    backgroundColor: colors.surfaceContainerLowest,
    gap: spacing.xs,
  },
  iconBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.xs,
  },
  rightActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  menuBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-start',
    alignItems: 'flex-end',
    paddingTop: 56,
    paddingRight: spacing.sm,
  },
  menuCard: {
    backgroundColor: colors.surfaceContainerHigh,
    borderRadius: 12,
    padding: spacing.sm,
    minWidth: 180,
    maxHeight: 400,
  },
});
