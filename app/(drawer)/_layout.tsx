import { useState } from 'react';
import {
  View,
  Pressable,
  StyleSheet,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Redirect, Slot, usePathname, useRouter, type Href } from 'expo-router';
import { useAuthStore, useProfileStore } from '@vaultstone/store';
import {
  colors,
  spacing,
  radius,
  useBreakpoint,
  Icon,
  Text,
  MetaLabel,
  GlassOverlay,
} from '@vaultstone/ui';

type IconName = React.ComponentProps<typeof Icon>['name'];

const NAV_ITEMS: { label: string; href: Href; icon: IconName }[] = [
  { label: 'Home', href: '/home', icon: 'home' },
  { label: 'Campaigns', href: '/campaigns', icon: 'map' },
  { label: 'Characters', href: '/characters', icon: 'person' },
  { label: 'Settings', href: '/settings', icon: 'settings' },
];

const SIDEBAR_EXPANDED = 256;
const SIDEBAR_COLLAPSED = 64;

export default function DrawerLayout() {
  const session = useAuthStore((state) => state.session);
  const profile = useProfileStore((state) => state.profile);
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const { isMobile } = useBreakpoint();
  const pathname = usePathname();
  const router = useRouter();

  if (!session) {
    return <Redirect href="/(auth)/login" />;
  }

  function handleNav(href: Href) {
    router.push(href);
    if (isMobile) setMobileOpen(false);
  }

  function renderWordmark(collapsedForm: boolean) {
    if (collapsedForm) {
      return (
        <View style={styles.markSquareWrapper}>
          <LinearGradient
            colors={[colors.primary, colors.primaryContainer]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.markSquare}
          >
            <Icon name="auto-awesome" size={22} color={colors.onPrimary} />
          </LinearGradient>
        </View>
      );
    }
    return (
      <View style={styles.wordmark}>
        <LinearGradient
          colors={[colors.primary, colors.primaryContainer]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.markSquare}
        >
          <Icon name="auto-awesome" size={22} color={colors.onPrimary} />
        </LinearGradient>
        <View style={{ flex: 1 }}>
          <Text
            variant="title-md"
            family="headline"
            weight="bold"
            style={{ color: colors.primary, letterSpacing: -0.5 }}
          >
            Vaultstone
          </Text>
          <MetaLabel size="sm">Celestial Record</MetaLabel>
        </View>
      </View>
    );
  }

  function renderNavItems(showLabels: boolean) {
    return NAV_ITEMS.map((item) => {
      const isActive = pathname === item.href;

      if (isActive) {
        return (
          <LinearGradient
            key={item.label}
            colors={[colors.primary, colors.primaryContainer]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[styles.navItemBase, !showLabels && styles.navItemCollapsed]}
          >
            <Pressable
              onPress={() => handleNav(item.href)}
              style={styles.navItemInnerPressable}
            >
              <Icon name={item.icon} size={20} color={colors.onPrimary} />
              {showLabels ? (
                <Text
                  variant="body-sm"
                  family="body"
                  weight="bold"
                  style={{ color: colors.onPrimary, letterSpacing: 0.25 }}
                >
                  {item.label}
                </Text>
              ) : null}
            </Pressable>
          </LinearGradient>
        );
      }

      return (
        <Pressable
          key={item.label}
          onPress={() => handleNav(item.href)}
          style={({ pressed }) => [
            styles.navItemBase,
            !showLabels && styles.navItemCollapsed,
            { backgroundColor: pressed ? colors.surfaceContainerHigh : 'transparent' },
          ]}
        >
          <Icon name={item.icon} size={20} color={colors.onSurfaceVariant} />
          {showLabels ? (
            <Text
              variant="body-sm"
              family="body"
              weight="medium"
              style={{ color: colors.onSurfaceVariant, letterSpacing: 0.25 }}
            >
              {item.label}
            </Text>
          ) : null}
        </Pressable>
      );
    });
  }

  const displayName = profile?.display_name;

  function renderProfileBadge(showLabel: boolean) {
    return (
      <Pressable
        onPress={() => handleNav('/settings')}
        style={({ pressed }) => [
          styles.profileBadge,
          { backgroundColor: pressed ? colors.surfaceContainerHigh : 'transparent' },
        ]}
      >
        <Icon name="account-circle" size={24} color={colors.primary} />
        {showLabel ? (
          <Text
            variant="body-sm"
            family="body"
            weight="semibold"
            style={{ color: colors.onSurface, flex: 1 }}
            numberOfLines={1}
          >
            {displayName || 'Set up profile'}
          </Text>
        ) : null}
      </Pressable>
    );
  }

  // Mobile: hamburger + slide-over menu.
  if (isMobile) {
    return (
      <View style={styles.root}>
        {mobileOpen ? (
          <>
            <Pressable style={styles.overlay} onPress={() => setMobileOpen(false)} />
            <GlassOverlay style={styles.mobileMenu} opacity={0.88}>
              <View style={styles.sidebarHeader}>{renderWordmark(false)}</View>
              <View style={styles.nav}>{renderNavItems(true)}</View>
              <View style={styles.sidebarFooter}>{renderProfileBadge(true)}</View>
            </GlassOverlay>
          </>
        ) : null}

        <View style={styles.content}>
          <View style={styles.mobileHeader}>
            <Pressable
              style={styles.hamburger}
              onPress={() => setMobileOpen(!mobileOpen)}
            >
              <Icon name="menu" size={26} color={colors.onSurface} />
            </Pressable>
          </View>
          <Slot />
        </View>
      </View>
    );
  }

  // Desktop: persistent glass sidebar.
  const sidebarWidth = collapsed ? SIDEBAR_COLLAPSED : SIDEBAR_EXPANDED;

  return (
    <View style={styles.root}>
      <GlassOverlay style={[styles.sidebar, { width: sidebarWidth }]} opacity={0.82}>
        <View style={styles.sidebarHeader}>
          {renderWordmark(collapsed)}
        </View>

        <Pressable
          style={({ pressed }) => [
            styles.toggleBtn,
            { backgroundColor: pressed ? colors.surfaceContainerHigh : 'transparent' },
          ]}
          onPress={() => setCollapsed(!collapsed)}
        >
          <Icon
            name={collapsed ? 'chevron-right' : 'chevron-left'}
            size={18}
            color={colors.outline}
          />
        </Pressable>

        <View style={styles.nav}>{renderNavItems(!collapsed)}</View>

        <View style={styles.sidebarFooter}>{renderProfileBadge(!collapsed)}</View>
      </GlassOverlay>

      <View style={styles.content}>
        <Slot />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: colors.surface,
  },
  sidebar: {
    paddingTop: spacing.lg,
    paddingHorizontal: spacing.sm + 4,
    paddingBottom: spacing.lg,
  },
  sidebarHeader: {
    marginBottom: spacing.lg,
    paddingHorizontal: spacing.xs,
  },
  wordmark: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + 4,
  },
  markSquareWrapper: {
    alignItems: 'center',
  },
  markSquare: {
    width: 40,
    height: 40,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toggleBtn: {
    alignItems: 'center',
    paddingVertical: spacing.xs + 2,
    borderRadius: radius.lg,
    marginBottom: spacing.md,
  },
  nav: {
    gap: 2,
  },
  navItemBase: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + 4,
    paddingVertical: 10,
    paddingHorizontal: spacing.sm + 4,
    borderRadius: radius.lg,
  },
  navItemInnerPressable: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + 4,
    flex: 1,
  },
  navItemCollapsed: {
    justifyContent: 'center',
    paddingHorizontal: 0,
  },
  content: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  // Mobile.
  mobileHeader: {
    backgroundColor: colors.surfaceContainerLowest,
    paddingHorizontal: spacing.sm + 4,
    paddingVertical: spacing.xs + 2,
    borderBottomWidth: 1,
    borderBottomColor: colors.outlineVariant + '33',
  },
  hamburger: {
    padding: 4,
    alignSelf: 'flex-start',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(12, 14, 16, 0.6)',
    zIndex: 10,
  },
  mobileMenu: {
    position: 'absolute',
    top: 0,
    left: 0,
    bottom: 0,
    width: 280,
    paddingTop: spacing['2xl'],
    paddingHorizontal: spacing.sm + 4,
    paddingBottom: spacing.lg,
    zIndex: 20,
  },
  sidebarFooter: {
    marginTop: 'auto',
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.outlineVariant + '33',
  },
  profileBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + 4,
    padding: spacing.sm,
    borderRadius: radius.lg,
  },
});
