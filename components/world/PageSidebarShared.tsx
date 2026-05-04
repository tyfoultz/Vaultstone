import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Icon, Text, colors, fonts, radius, spacing } from '@vaultstone/ui';

// ── Shared right-sidebar building blocks for Location, NPC, etc. page views ──

export type PillDef = {
  key: string;
  label: string;
  value: string;
  color?: string;
  icon?: string;
  fieldType: 'select' | 'text';
  options?: string[];
};

export function SideSectionHeader({ icon, title, count, collapsible, collapsed, onToggle }: {
  icon: string;
  title: string;
  count?: number;
  collapsible?: boolean;
  collapsed?: boolean;
  onToggle?: () => void;
}) {
  if (collapsible) {
    return (
      <Pressable onPress={onToggle} style={styles.sideSectionHeader}>
        <Icon name={icon as React.ComponentProps<typeof Icon>['name']} size={13} color={colors.outline} />
        <Text style={[styles.sideSectionTitle, { flex: 1 }]}>{title}</Text>
        {count != null ? <Text style={styles.sideSectionCount}>{count}</Text> : null}
        <Icon name={collapsed ? 'chevron-right' : 'expand-more'} size={14} color={colors.outline} />
      </Pressable>
    );
  }
  return (
    <View style={styles.sideSectionHeader}>
      <Icon name={icon as React.ComponentProps<typeof Icon>['name']} size={13} color={colors.outline} />
      <Text style={styles.sideSectionTitle}>{title}</Text>
      {count != null ? <Text style={styles.sideSectionCount}>{count}</Text> : null}
    </View>
  );
}

export function CollapsibleSideSection({ icon, title, count, children, defaultCollapsed = false }: {
  icon: string;
  title: string;
  count?: number;
  children: React.ReactNode;
  defaultCollapsed?: boolean;
}) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  return (
    <View style={{ gap: spacing.xs }}>
      <SideSectionHeader
        icon={icon}
        title={title}
        count={count}
        collapsible
        collapsed={collapsed}
        onToggle={() => setCollapsed((c) => !c)}
      />
      {collapsed ? null : children}
    </View>
  );
}

export function RightTabBtn({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.rightTab, active && styles.rightTabActive]}>
      <Text variant="label-sm" uppercase weight="semibold" style={[styles.rightTabLabel, active && styles.rightTabLabelActive]}>
        {label}
      </Text>
    </Pressable>
  );
}

export function HookInput({ onAdd, placeholder }: { onAdd: (text: string) => void; placeholder?: string }) {
  const [draft, setDraft] = useState('');
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <Pressable onPress={() => setOpen(true)} style={styles.hookAddBtn}>
        <Icon name="add" size={14} color={colors.outline} />
        <Text style={{ color: colors.outline, fontSize: 11, fontFamily: 'Manrope' }}>
          {placeholder ?? 'Add hook or rumor'}
        </Text>
      </Pressable>
    );
  }

  return (
    <View style={styles.hookInputWrap}>
      <input
        type="text"
        value={draft}
        onChange={(e: any) => setDraft(e.target.value)}
        onKeyDown={(e: any) => {
          if (e.key === 'Enter' && draft.trim()) { onAdd(draft.trim()); setDraft(''); }
          if (e.key === 'Escape') { setOpen(false); setDraft(''); }
        }}
        autoFocus
        placeholder={placeholder ?? 'A rumor, plot hook, or encounter idea…'}
        style={{
          background: colors.surfaceContainerHigh,
          border: `1px solid ${colors.outlineVariant}44`,
          borderRadius: 6,
          padding: '6px 8px',
          color: colors.onSurface,
          fontSize: 12,
          fontFamily: "'Manrope', system-ui, sans-serif",
          outline: 'none',
          width: '100%',
        }}
      />
    </View>
  );
}

export function PillEditor({ pill, onSelect, onClose }: {
  pill: PillDef;
  onSelect: (value: string) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(pill.value);

  if (pill.fieldType === 'select' && pill.options) {
    return (
      <>
        <div style={{ position: 'fixed', inset: 0, zIndex: 100 }} onClick={onClose} />
        <div style={{
          position: 'absolute',
          top: '100%',
          left: 0,
          marginTop: 4,
          background: colors.surfaceContainerHigh,
          border: `1px solid ${colors.outlineVariant}55`,
          borderRadius: 8,
          padding: 4,
          minWidth: 140,
          maxHeight: 240,
          overflowY: 'auto',
          zIndex: 101,
          boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
        }}>
          {pill.options.map((opt) => (
            <Pressable
              key={opt}
              onPress={() => onSelect(opt)}
              style={[styles.pillDropdownItem, pill.value === opt && styles.pillDropdownItemActive]}
            >
              <Text style={[styles.pillDropdownText, pill.value === opt && { color: colors.primary }]}>
                {opt.charAt(0).toUpperCase() + opt.slice(1)}
              </Text>
            </Pressable>
          ))}
          {pill.value ? (
            <Pressable onPress={() => onSelect('')} style={styles.pillDropdownItem}>
              <Text style={[styles.pillDropdownText, { color: colors.outline, fontStyle: 'italic' }]}>Clear</Text>
            </Pressable>
          ) : null}
        </div>
      </>
    );
  }

  return (
    <>
      <div style={{ position: 'fixed', inset: 0, zIndex: 100 }} onClick={onClose} />
      <div style={{
        position: 'absolute',
        top: '100%',
        left: 0,
        marginTop: 4,
        zIndex: 101,
        minWidth: 160,
      }}>
        <input
          type="text"
          value={draft}
          onChange={(e: any) => setDraft(e.target.value)}
          onKeyDown={(e: any) => {
            if (e.key === 'Enter') onSelect(draft);
            if (e.key === 'Escape') onClose();
          }}
          autoFocus
          placeholder={pill.label}
          style={{
            background: colors.surfaceContainerHigh,
            border: `1px solid ${colors.outlineVariant}55`,
            borderRadius: 6,
            padding: '6px 10px',
            color: colors.onSurface,
            fontSize: 13,
            fontFamily: "'Manrope', system-ui, sans-serif",
            outline: 'none',
            width: '100%',
            boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
          }}
        />
      </div>
    </>
  );
}

export function formatRelativeTime(iso: string): string {
  const diff = Date.now() - Date.parse(iso);
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks}w ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

export const MENTION_ICON: Record<string, { icon: string; color: string }> = {
  npc: { icon: 'person', color: colors.hpDanger },
  location: { icon: 'place', color: colors.primary },
  faction: { icon: 'shield', color: colors.hpWarning },
  lore: { icon: 'auto-stories', color: colors.cosmic },
  timeline: { icon: 'timeline', color: colors.secondary },
  custom: { icon: 'article', color: colors.onSurfaceVariant },
  item: { icon: 'diamond', color: colors.hpWarning },
};

export const PAGE_SIDEBAR_STYLES = StyleSheet.create({
  rightPanel: {
    width: 300,
    backgroundColor: colors.surfaceContainer,
    borderLeftWidth: 1,
    borderLeftColor: colors.outlineVariant + '33',
    flexDirection: 'column',
  },
  rightPanelCollapsed: {
    width: 32,
    backgroundColor: colors.surfaceContainer,
    borderLeftWidth: 1,
    borderLeftColor: colors.outlineVariant + '33',
    alignItems: 'center',
    paddingTop: spacing.sm,
  },
  rightPanelTopRow: {
    alignItems: 'flex-start',
    paddingLeft: spacing.xs,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs,
  },
  rightPanelToggleBtn: {
    width: 28,
    height: 28,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.outlineVariant + '44',
  },
  rightTabs: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: colors.outlineVariant + '33',
    paddingHorizontal: spacing.xs,
  },
  rightBody: {
    padding: spacing.md,
    gap: spacing.lg,
  },
  sideSection: { gap: spacing.xs },
  mentionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 6,
    borderRadius: radius.lg,
  },
  mentionDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  mentionMeta: {
    fontFamily: fonts.label,
    fontSize: 10,
    letterSpacing: 0.8,
    color: colors.outline,
    marginTop: 1,
  },
  emptyText: {
    color: colors.onSurfaceVariant,
    fontStyle: 'italic',
    fontSize: 12,
    paddingVertical: spacing.xs,
  },
  hookRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    paddingVertical: 4,
    paddingHorizontal: 4,
  },
  hookBullet: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.hpWarning,
    marginTop: -1,
  },
  seenRow: {
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderRadius: radius.lg,
    borderLeftWidth: 2,
    borderLeftColor: colors.hpWarning,
    backgroundColor: colors.surfaceContainerHigh + '44',
    marginBottom: 6,
  },
  seenHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 3,
  },
  seenBadge: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.hpWarning + '33',
    alignItems: 'center',
    justifyContent: 'center',
  },
  seenBadgeText: {
    fontFamily: fonts.label,
    fontSize: 9,
    fontWeight: '700',
    color: colors.hpWarning,
  },
  seenAgo: {
    fontFamily: fonts.label,
    fontSize: 10,
    letterSpacing: 0.5,
    color: colors.outline,
  },
});

const styles = StyleSheet.create({
  sideSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  sideSectionTitle: {
    fontFamily: fonts.label,
    fontSize: 10,
    letterSpacing: 1.2,
    color: colors.outline,
    flex: 1,
  },
  sideSectionCount: {
    fontFamily: fonts.label,
    fontSize: 10,
    letterSpacing: 0.5,
    color: colors.primary,
    fontWeight: '700',
  },
  rightTab: {
    flex: 1,
    paddingVertical: spacing.md,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  rightTabActive: {
    borderBottomColor: colors.primary,
  },
  rightTabLabel: {
    color: colors.outline,
    fontSize: 10,
    letterSpacing: 1,
  },
  rightTabLabelActive: {
    color: colors.onSurface,
  },
  hookAddBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: 4,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.outlineVariant + '33',
    borderStyle: 'dashed',
  },
  hookInputWrap: {
    marginTop: 2,
  },
  pillDropdownItem: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 5,
    borderRadius: radius.lg,
  },
  pillDropdownItemActive: {
    backgroundColor: colors.primaryContainer + '33',
  },
  pillDropdownText: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.onSurface,
    textTransform: 'capitalize',
  },
});
