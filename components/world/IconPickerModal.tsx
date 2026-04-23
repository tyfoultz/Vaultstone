import { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { GhostButton, Icon, Text, colors, radius, spacing } from '@vaultstone/ui';

type IconName = React.ComponentProps<typeof Icon>['name'];

type Category = {
  label: string;
  icons: IconName[];
};

const ICON_CATEGORIES: Category[] = [
  {
    label: 'People',
    icons: [
      'person', 'groups', 'person-pin', 'face', 'record-voice-over',
      'people', 'person-outline', 'person-add', 'emoji-people',
      'theater-comedy', 'psychology', 'self-improvement',
    ],
  },
  {
    label: 'Places',
    icons: [
      'place', 'location-city', 'terrain', 'public', 'landscape',
      'cottage', 'castle', 'church', 'temple-hindu', 'mosque',
      'home', 'store', 'apartment', 'business', 'foundation',
    ],
  },
  {
    label: 'Combat & Danger',
    icons: [
      'shield', 'dangerous', 'gavel', 'flash-on', 'whatshot',
      'local-fire-department', 'bolt', 'crisis-alert', 'warning',
      'sports-martial-arts', 'security', 'report',
    ],
  },
  {
    label: 'Nature & Animals',
    icons: [
      'pets', 'eco', 'forest', 'park', 'grass', 'water',
      'waves', 'air', 'wb-sunny', 'nightlight', 'ac-unit',
      'pest-control', 'spa',
    ],
  },
  {
    label: 'Objects & Items',
    icons: [
      'diamond', 'stars', 'auto-awesome', 'emoji-objects', 'key',
      'lock', 'lock-open', 'inventory', 'shopping-bag', 'workspaces',
      'token', 'toll', 'paid',
    ],
  },
  {
    label: 'Knowledge & Lore',
    icons: [
      'auto-stories', 'menu-book', 'article', 'description', 'history-edu',
      'school', 'science', 'biotech', 'explore', 'map',
      'travel-explore', 'language', 'translate',
    ],
  },
  {
    label: 'Magic & Cosmic',
    icons: [
      'auto-fix-high', 'flare', 'all-inclusive', 'brightness-7',
      'blur-on', 'bubble-chart', 'category', 'change-history',
      'grain', 'lens', 'panorama-fish-eye', 'hexagon',
    ],
  },
  {
    label: 'Time & Events',
    icons: [
      'event', 'schedule', 'hourglass-empty', 'timelapse', 'update',
      'calendar-today', 'date-range', 'alarm', 'access-time',
      'history', 'timeline',
    ],
  },
  {
    label: 'Communication',
    icons: [
      'forum', 'chat', 'mail', 'campaign', 'notifications',
      'announcement', 'flag', 'bookmark', 'label',
      'new-releases', 'push-pin',
    ],
  },
  {
    label: 'Symbols',
    icons: [
      'star', 'favorite', 'circle', 'square', 'change-history',
      'pentagon', 'hexagon', 'brightness-1', 'trip-origin',
      'radio-button-unchecked', 'adjust', 'contrast',
    ],
  },
];

const ALL_ICONS = ICON_CATEGORIES.flatMap((c) => c.icons);

type Props = {
  visible: boolean;
  currentIcon?: string;
  onSelect: (icon: string) => void;
  onClose: () => void;
};

export function IconPickerModal({ visible, currentIcon, onSelect, onClose }: Props) {
  const [search, setSearch] = useState('');

  const filteredCategories = useMemo(() => {
    if (!search.trim()) return ICON_CATEGORIES;
    const q = search.toLowerCase().replace(/[_-]/g, '');
    return ICON_CATEGORIES.map((cat) => ({
      ...cat,
      icons: cat.icons.filter((icon) =>
        icon.toLowerCase().replace(/[_-]/g, '').includes(q)
        || cat.label.toLowerCase().includes(q)
      ),
    })).filter((cat) => cat.icons.length > 0);
  }, [search]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.modal}>
          <View style={styles.header}>
            <Text variant="title-md" family="serif-display" weight="bold">
              Choose an icon
            </Text>
            <GhostButton label="Close" onPress={onClose} />
          </View>

          <TextInput
            style={styles.search}
            value={search}
            onChangeText={setSearch}
            placeholder="Search icons…"
            placeholderTextColor={colors.outline}
            autoFocus
          />

          <ScrollView style={styles.scrollArea} contentContainerStyle={styles.scrollContent}>
            {filteredCategories.map((cat) => (
              <View key={cat.label} style={styles.category}>
                <Text variant="label-sm" weight="semibold" uppercase style={styles.catLabel}>
                  {cat.label}
                </Text>
                <View style={styles.grid}>
                  {cat.icons.map((iconName) => {
                    const isActive = iconName === currentIcon;
                    return (
                      <Pressable
                        key={iconName}
                        onPress={() => {
                          onSelect(iconName);
                          onClose();
                        }}
                        style={[styles.iconCell, isActive && styles.iconCellActive]}
                      >
                        <Icon
                          name={iconName}
                          size={22}
                          color={isActive ? colors.primary : colors.onSurfaceVariant}
                        />
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            ))}
            {filteredCategories.length === 0 ? (
              <Text variant="body-sm" style={{ color: colors.outline, textAlign: 'center', marginTop: spacing.xl }}>
                No icons match "{search}"
              </Text>
            ) : null}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
  },
  modal: {
    width: '100%',
    maxWidth: 520,
    maxHeight: '80%',
    backgroundColor: colors.surfaceContainerHigh,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.outlineVariant + '33',
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing.lg,
    paddingBottom: spacing.sm,
  },
  search: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.outlineVariant + '44',
    backgroundColor: colors.surfaceContainer,
    color: colors.onSurface,
    fontSize: 14,
  },
  scrollArea: {
    flex: 1,
  },
  scrollContent: {
    padding: spacing.lg,
    paddingTop: spacing.sm,
    gap: spacing.lg,
  },
  category: {
    gap: spacing.sm,
  },
  catLabel: {
    color: colors.onSurfaceVariant,
    letterSpacing: 1,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  iconCell: {
    width: 44,
    height: 44,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceContainer,
  },
  iconCellActive: {
    backgroundColor: colors.primaryContainer,
    borderWidth: 1,
    borderColor: colors.primary + '66',
  },
});
