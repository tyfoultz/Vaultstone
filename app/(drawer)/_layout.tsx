import { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Pressable,
  StyleSheet,
  useWindowDimensions,
} from 'react-native';
import { Redirect, Slot, usePathname, useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useAuthStore, useProfileStore } from '@vaultstone/store';
import { colors, spacing } from '@vaultstone/ui';

type IconName = React.ComponentProps<typeof MaterialCommunityIcons>['name'];

const NAV_ITEMS: { label: string; href: string; icon: IconName }[] = [
  { label: 'Home', href: '/(drawer)/home', icon: 'home-outline' },
  { label: 'Campaigns', href: '/(drawer)/campaigns', icon: 'map-outline' },
  { label: 'Characters', href: '/(drawer)/characters', icon: 'account-outline' },
  { label: 'Settings', href: '/(drawer)/settings', icon: 'cog-outline' },
];

const SIDEBAR_EXPANDED = 220;
const SIDEBAR_COLLAPSED = 56;
const MOBILE_BREAKPOINT = 768;

export default function DrawerLayout() {
  const session = useAuthStore((state) => state.session);
  const profile = useProfileStore((state) => state.profile);
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const { width } = useWindowDimensions();
  const pathname = usePathname();
  const router = useRouter();

  if (!session) {
    return <Redirect href="/(auth)/login" />;
  }

  const isMobile = width < MOBILE_BREAKPOINT;

  function handleNav(href: string) {
    router.push(href);
    if (isMobile) setMobileOpen(false);
  }

  function renderNavItems() {
    const showLabels = isMobile || !collapsed;
    return NAV_ITEMS.map((item) => {
      const isActive = pathname === item.href.replace('/(drawer)', '') || pathname === item.href;
      return (
        <TouchableOpacity
          key={item.href}
          style={[
            styles.navItem,
            isActive && styles.navItemActive,
            !showLabels && styles.navItemCollapsed,
          ]}
          onPress={() => handleNav(item.href)}
        >
          <MaterialCommunityIcons
            name={item.icon}
            size={22}
            color={isActive ? colors.brand : colors.textSecondary}
          />
          {showLabels && (
            <Text style={[styles.navLabel, isActive && styles.navLabelActive]}>
              {item.label}
            </Text>
          )}
        </TouchableOpacity>
      );
    });
  }

  const displayName = profile?.display_name;

  function renderProfileBadge(showLabel: boolean) {
    return (
      <TouchableOpacity
        style={styles.profileBadge}
        onPress={() => handleNav('/(drawer)/settings')}
      >
        <MaterialCommunityIcons name="account-circle" size={22} color={colors.brand} />
        {showLabel && (
          <Text style={styles.profileName} numberOfLines={1}>
            {displayName || 'Set up profile'}
          </Text>
        )}
      </TouchableOpacity>
    );
  }

  // Mobile: hamburger button + slide-over menu
  if (isMobile) {
    return (
      <View style={styles.root}>
        {mobileOpen && (
          <>
            <Pressable style={styles.overlay} onPress={() => setMobileOpen(false)} />
            <View style={styles.mobileMenu}>
              <View style={styles.nav}>{renderNavItems()}</View>
              <View style={styles.sidebarFooter}>
                {renderProfileBadge(true)}
              </View>
            </View>
          </>
        )}

        <View style={styles.content}>
          <View style={styles.mobileHeader}>
            <TouchableOpacity
              style={styles.hamburger}
              onPress={() => setMobileOpen(!mobileOpen)}
            >
              <MaterialCommunityIcons name="menu" size={26} color={colors.textPrimary} />
            </TouchableOpacity>
          </View>
          <Slot />
        </View>
      </View>
    );
  }

  // Desktop: persistent collapsible sidebar
  const sidebarWidth = collapsed ? SIDEBAR_COLLAPSED : SIDEBAR_EXPANDED;

  return (
    <View style={styles.root}>
      <View style={[styles.sidebar, { width: sidebarWidth }]}>
        <TouchableOpacity
          style={styles.toggleBtn}
          onPress={() => setCollapsed(!collapsed)}
        >
          <MaterialCommunityIcons
            name={collapsed ? 'chevron-right' : 'chevron-left'}
            size={20}
            color={colors.textSecondary}
          />
        </TouchableOpacity>

        <View style={styles.nav}>{renderNavItems()}</View>

        <View style={styles.sidebarFooter}>
          {renderProfileBadge(!collapsed)}
        </View>
      </View>

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
    backgroundColor: colors.background,
  },
  sidebar: {
    backgroundColor: colors.surface,
    borderRightColor: colors.border,
    borderRightWidth: 1,
    paddingTop: spacing.lg,
  },
  toggleBtn: {
    alignItems: 'center',
    paddingVertical: spacing.sm,
    marginBottom: spacing.md,
  },
  nav: {
    gap: 4,
    paddingHorizontal: spacing.sm,
  },
  navItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  navItemActive: {
    backgroundColor: colors.background,
  },
  navItemCollapsed: {
    justifyContent: 'center',
    paddingHorizontal: 0,
  },
  navLabel: {
    color: colors.textSecondary,
    fontSize: 15,
    fontWeight: '600',
  },
  navLabelActive: {
    color: colors.brand,
  },
  content: {
    flex: 1,
  },
  // Mobile styles
  mobileHeader: {
    backgroundColor: colors.surface,
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  hamburger: {
    padding: 2,
    alignSelf: 'flex-start',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
    zIndex: 10,
  },
  mobileMenu: {
    position: 'absolute',
    top: 0,
    left: 0,
    bottom: 0,
    width: 260,
    backgroundColor: colors.surface,
    borderRightColor: colors.border,
    borderRightWidth: 1,
    paddingTop: 60,
    zIndex: 20,
  },
  sidebarFooter: {
    marginTop: 'auto',
    borderTopColor: colors.border,
    borderTopWidth: 1,
    padding: spacing.sm,
  },
  profileBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: spacing.sm,
    borderRadius: 8,
  },
  profileName: {
    fontSize: 13,
    color: colors.textPrimary,
    fontWeight: '600',
    flex: 1,
  },
});
