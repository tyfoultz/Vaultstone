import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRecapLayoutStore } from '@vaultstone/store';
import { colors, spacing } from '@vaultstone/ui';

export interface SessionSidebarItem {
  id: string;
  startedAt: string;
  isLive: boolean;
}

interface Props {
  sessions: SessionSidebarItem[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function fmtShort(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function SessionSidebar({ sessions, selectedId, onSelect }: Props) {
  const collapsed = useRecapLayoutStore((s) => s.sidebarCollapsed);
  const toggle = useRecapLayoutStore((s) => s.toggleSidebar);

  // On native we ignore the collapse state and render the existing horizontal
  // chip strip (no room for a sidebar on phones).
  if (Platform.OS !== 'web') {
    return (
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipRow}
      >
        {sessions.map((s) => {
          const isSelected = s.id === selectedId;
          return (
            <TouchableOpacity
              key={s.id}
              onPress={() => onSelect(s.id)}
              style={[styles.chip, isSelected && styles.chipSelected]}
            >
              {s.isLive && (
                <View style={styles.livePill}>
                  <Text style={styles.livePillText}>LIVE</Text>
                </View>
              )}
              <Text style={[styles.chipLabel, isSelected && styles.chipLabelSelected]}>
                {fmtDate(s.startedAt)}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    );
  }

  return (
    <View style={[styles.sidebar, collapsed && styles.sidebarCollapsed]}>
      <View style={styles.headerRow}>
        {!collapsed && <Text style={styles.headerLabel}>Sessions</Text>}
        <TouchableOpacity
          onPress={toggle}
          style={styles.collapseBtn}
          accessibilityLabel={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          <MaterialCommunityIcons
            name={collapsed ? 'chevron-right' : 'chevron-left'}
            size={18}
            color={colors.textSecondary}
          />
        </TouchableOpacity>
      </View>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator
      >
        {sessions.map((s) => {
          const isSelected = s.id === selectedId;
          return (
            <TouchableOpacity
              key={s.id}
              onPress={() => onSelect(s.id)}
              style={[
                styles.row,
                isSelected && styles.rowSelected,
                collapsed && styles.rowCollapsed,
              ]}
              accessibilityLabel={`Session ${fmtDate(s.startedAt)}${s.isLive ? ' (live)' : ''}`}
            >
              {collapsed ? (
                <View style={styles.collapsedDot}>
                  {s.isLive ? (
                    <View style={styles.collapsedLiveDot} />
                  ) : (
                    <Text style={styles.collapsedLetter}>
                      {fmtShort(s.startedAt).split(' ')[1] ?? ''}
                    </Text>
                  )}
                </View>
              ) : (
                <>
                  {s.isLive && (
                    <View style={styles.livePillSmall}>
                      <Text style={styles.livePillText}>LIVE</Text>
                    </View>
                  )}
                  <Text style={[styles.rowLabel, isSelected && styles.rowLabelSelected]}>
                    {fmtDate(s.startedAt)}
                  </Text>
                </>
              )}
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  sidebar: {
    width: 220,
    backgroundColor: colors.surface,
    borderRightColor: colors.border, borderRightWidth: 1,
  },
  sidebarCollapsed: { width: 48 },
  headerRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.sm, paddingVertical: spacing.sm,
    borderBottomColor: colors.border, borderBottomWidth: 1,
  },
  headerLabel: {
    fontSize: 11, color: colors.textSecondary, fontWeight: '700',
    textTransform: 'uppercase', letterSpacing: 1,
  },
  collapseBtn: { padding: 4 },
  scroll: { flex: 1 },
  scrollContent: { padding: spacing.xs, gap: 2 },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingHorizontal: spacing.sm, paddingVertical: 8, borderRadius: 6,
  },
  rowCollapsed: { justifyContent: 'center', paddingHorizontal: 0 },
  rowSelected: { backgroundColor: colors.brand + '22' },
  rowLabel: { fontSize: 13, color: colors.textSecondary, fontWeight: '600' },
  rowLabelSelected: { color: colors.textPrimary },
  collapsedDot: {
    width: 32, height: 32, borderRadius: 16,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.background,
  },
  collapsedLiveDot: {
    width: 8, height: 8, borderRadius: 4, backgroundColor: colors.brand,
  },
  collapsedLetter: {
    fontSize: 11, color: colors.textSecondary, fontWeight: '700',
  },

  livePill: {
    backgroundColor: colors.brand,
    paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4,
  },
  livePillSmall: {
    backgroundColor: colors.brand,
    paddingHorizontal: 5, paddingVertical: 1, borderRadius: 3,
  },
  livePillText: {
    color: colors.textPrimary, fontSize: 9, fontWeight: '800', letterSpacing: 0.8,
  },

  chipRow: { gap: spacing.sm, paddingVertical: 4, paddingHorizontal: spacing.md },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: 20,
    borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface,
  },
  chipSelected: { borderColor: colors.brand, backgroundColor: colors.brand + '22' },
  chipLabel: { fontSize: 13, color: colors.textSecondary, fontWeight: '600' },
  chipLabelSelected: { color: colors.textPrimary },
});
