// Browser-style tab strip at the top of the campaign route.
//
// Two tab groups sit side-by-side, anchored above their respective
// panes. Every tab — including the campaign itself — lives in the
// store's `leftTabs` or `rightTabs` list, so the user can drag any
// tab anywhere. Constraints:
//
//   • The campaign tab cannot be closed (no X). The store enforces
//     this at the data layer; we just suppress the close affordance.
//   • Dragging across sides moves the tab between panes; if the
//     source side becomes empty, its pane collapses and the other
//     pane goes full-width.
//   • Clicking a tab focuses it (its body renders in that pane); on
//     mobile, the click also flips the visible pane to that side.
//
// Labels are best-effort. Campaign name comes from the cached
// useCampaignStore; characters / pages / maps resolve via small
// targeted fetches on mount.

import { useEffect, useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import {
  getCharacterById,
  getCharactersForCampaign,
  getMap,
  getPage,
  getWorld,
  getWorldsForCampaign,
} from '@vaultstone/api';
import {
  useCampaignStore,
  useSplitPaneStore,
  type Side,
  type SplitTarget,
} from '@vaultstone/store';
import { colors, fonts, radius, spacing, Text } from '@vaultstone/ui';

import { useEmptySideDnd, useTabDnd, type TabDropInfo } from './useTabDnd';

type Props = {
  campaignId: string;
  /** Mobile-only: which side's pane is visible. */
  mobileActiveSide?: Side;
  onMobileActiveSideChange?: (side: Side) => void;
  /** True when the route is rendering the side-by-side split shell
   *  (web ≥768px with at least one tab on each side). When set, the
   *  right tab group + its "+" button anchor over the right pane. */
  splitMode?: boolean;
};

export function CampaignTabRow({ campaignId, mobileActiveSide, onMobileActiveSideChange, splitMode }: Props) {
  const router = useRouter();
  const leftTabs = useSplitPaneStore((s) => s.leftTabs);
  const rightTabs = useSplitPaneStore((s) => s.rightTabs);
  const leftActiveIndex = useSplitPaneStore((s) => s.leftActiveIndex);
  const rightActiveIndex = useSplitPaneStore((s) => s.rightActiveIndex);
  const splitRatio = useSplitPaneStore((s) => s.splitRatio);
  const closeSplitTab = useSplitPaneStore((s) => s.closeSplitTab);
  const openSplit = useSplitPaneStore((s) => s.openSplit);
  const setActiveSplitTab = useSplitPaneStore((s) => s.setActiveSplitTab);
  const moveSplitTab = useSplitPaneStore((s) => s.moveSplitTab);
  const [pickerOpen, setPickerOpen] = useState(false);

  // Drag-to-reorder. The DnD hook reports the source position, the
  // hovered tab's side+index, and whether the cursor is on the left
  // or right half of the hovered tab. Convert that into a concrete
  // target index, adjusting for the gap created when removing the
  // source from the same side.
  const handleTabDrop = (info: TabDropInfo) => {
    let toIndex = info.position === 'before' ? info.toIndex : info.toIndex + 1;
    if (info.fromSide === info.toSide && info.fromIndex < toIndex) toIndex -= 1;
    if (info.fromSide === info.toSide && info.fromIndex === toIndex) return;
    moveSplitTab(
      { side: info.fromSide, index: info.fromIndex },
      { side: info.toSide, index: toIndex },
    );
  };

  // Campaign name from the cached store list — if we deep-linked into
  // this campaign and the store hasn't been populated yet, fall back
  // to a generic label until the page hydrates the cache.
  const campaign = useCampaignStore((s) => s.campaigns.find((c) => c.id === campaignId));
  const campaignLabel = campaign?.name?.trim() || 'Campaign';

  const isMobileMode = !!onMobileActiveSideChange;

  function handleTabPress(side: Side, index: number) {
    setActiveSplitTab(side, index);
    if (isMobileMode) onMobileActiveSideChange!(side);
  }

  function renderTabsForSide(side: Side): React.ReactNode {
    const tabs = side === 'left' ? leftTabs : rightTabs;
    const active = side === 'left' ? leftActiveIndex : rightActiveIndex;
    const paneVisible = isMobileMode ? mobileActiveSide === side : true;
    return tabs.map((target, index) => (
      <TabItem
        key={`${target.kind}:${targetIdentity(target)}`}
        side={side}
        target={target}
        index={index}
        campaignLabel={campaignLabel}
        isActive={index === active && paneVisible}
        onPress={() => handleTabPress(side, index)}
        onClose={
          target.kind === 'campaign'
            ? undefined
            : () => closeSplitTab(side, index)
        }
        onDrop={handleTabDrop}
      />
    ));
  }

  // The "+" button + its popover. Lives in the right tab group when
  // split mode is on, otherwise it sits in the left group with the
  // rest of the tabs.
  const addButton = (
    <View style={s.addAnchor}>
      <Pressable
        onPress={() => setPickerOpen((v) => !v)}
        style={({ pressed }) => [s.addBtn, pressed && { opacity: 0.7 }, pickerOpen && s.addBtnActive]}
        accessibilityLabel="Open another tab"
      >
        <MaterialCommunityIcons
          name="plus"
          size={16}
          color={pickerOpen ? colors.primary : colors.outline}
        />
      </Pressable>
      {pickerOpen ? (
        <OpenTabPicker
          campaignId={campaignId}
          onPickCharacter={(characterId) => {
            // New tabs from the + picker open on the focused side so
            // the layout stays single-pane unless the user explicitly
            // drags a tab across to split.
            openSplit({ kind: 'character', characterId }, { preferSide: 'focused' });
            setPickerOpen(false);
          }}
          onPickWorldHome={(worldId) => {
            openSplit({ kind: 'world-home', worldId }, { preferSide: 'focused' });
            setPickerOpen(false);
          }}
          onClose={() => setPickerOpen(false)}
          anchor={splitMode ? 'right' : 'left'}
        />
      ) : null}
    </View>
  );

  // Trailing drop zone per side — always rendered so cross-side drops
  // have somewhere to land even when the destination already has
  // tabs. When empty, shows a dashed placeholder; when populated,
  // takes the remaining flex width as an invisible catch-all.
  const leftTrailingDrop = useEmptySideDnd('left', () => leftTabs.length, handleTabDrop);
  const rightTrailingDrop = useEmptySideDnd('right', () => rightTabs.length, handleTabDrop);

  // Layout depends on whether we're in side-by-side desktop split.
  if (splitMode) {
    return (
      <View style={s.row}>
        <View style={[s.tabGroup, { flexBasis: `${splitRatio * 100}%` }]}>
          <Pressable
            onPress={() => router.replace('/(drawer)/home' as Href)}
            style={({ pressed }) => [s.homeBtn, pressed && { opacity: 0.7 }]}
            accessibilityLabel="Home"
          >
            <MaterialCommunityIcons name="home-outline" size={18} color={colors.outline} />
          </Pressable>
          {renderTabsForSide('left')}
          <TrailingDropZone hook={leftTrailingDrop} fill />
        </View>
        <View style={[s.tabGroup, s.tabGroupRight, { flex: 1 }]}>
          {renderTabsForSide('right')}
          <TrailingDropZone hook={rightTrailingDrop} fill />
          {addButton}
        </View>
      </View>
    );
  }

  // Single-pane layout (one side empty, or mobile). Tabs flow
  // left-to-right from the home button, with the "+" packed right
  // up against the last tab. No trailing drop zones in this mode —
  // there's no cross-side drag to land in single-pane layout, and
  // existing tabs already accept reorder drops on their own halves.
  return (
    <View style={s.row}>
      <Pressable
        onPress={() => router.replace('/(drawer)/home' as Href)}
        style={({ pressed }) => [s.homeBtn, pressed && { opacity: 0.7 }]}
        accessibilityLabel="Home"
      >
        <MaterialCommunityIcons name="home-outline" size={18} color={colors.outline} />
      </Pressable>
      {renderTabsForSide('left')}
      {renderTabsForSide('right')}
      {addButton}
    </View>
  );
}

/**
 * Invisible drop landing rendered after the last tab on each side.
 * Lets cross-side drags land at end-of-list without a visual
 * placeholder. Pass `fill` to expand the zone to fill remaining
 * width inside a tab group (used by the split-mode groups so drops
 * anywhere in the dead space land at end-of-list).
 */
function TrailingDropZone({
  hook,
  fill,
}: {
  hook: { ref: React.RefObject<unknown>; isOver: boolean };
  fill?: boolean;
}) {
  return (
    <View
      ref={hook.ref as React.RefObject<View>}
      style={[
        s.trailingDrop,
        fill && s.trailingDropFill,
        hook.isOver && s.trailingDropHot,
      ]}
    />
  );
}

/**
 * One tab — draggable and a drop target. Resolves its label via
 * `useSplitTargetLabel` so the fetch happens once per tab. Renders
 * a 2px vertical accent on whichever edge the cursor is closer to.
 */
function TabItem({ side, target, index, campaignLabel, isActive, onPress, onClose, onDrop }: {
  side: Side;
  target: SplitTarget;
  index: number;
  campaignLabel: string;
  isActive: boolean;
  onPress: () => void;
  onClose?: () => void;
  onDrop: (info: TabDropInfo) => void;
}) {
  const resolvedLabel = useSplitTargetLabel(target);
  const label = target.kind === 'campaign' ? campaignLabel : resolvedLabel;
  const { ref, isDragging, dropPosition, isOver } = useTabDnd(side, index, onDrop);
  return (
    <View
      ref={ref as React.RefObject<View>}
      style={[s.tabDndWrapper, isDragging && { opacity: 0.4 }]}
    >
      {isOver && dropPosition === 'before' ? (
        <View style={[s.tabDropIndicator, s.tabDropIndicatorBefore]} />
      ) : null}
      <Tab
        label={label}
        icon={iconFor(target)}
        active={isActive}
        onPress={onPress}
        onClose={onClose}
      />
      {isOver && dropPosition === 'after' ? (
        <View style={[s.tabDropIndicator, s.tabDropIndicatorAfter]} />
      ) : null}
    </View>
  );
}

/** Stable identity for a target (used as a React key). */
function targetIdentity(t: SplitTarget): string {
  switch (t.kind) {
    case 'campaign': return t.campaignId;
    case 'character': return t.characterId;
    case 'world-page': return `${t.worldId}:${t.pageId}`;
    case 'world-map': return `${t.worldId}:${t.mapId}`;
    case 'world-home':
    case 'world-map-index':
    case 'world-relations':
      return t.worldId;
  }
}

/**
 * Dropdown popover anchored under the "+" button. Lists characters
 * and the campaign's linked worlds.
 */
function OpenTabPicker({
  campaignId,
  onPickCharacter,
  onPickWorldHome,
  onClose,
  anchor = 'left',
}: {
  campaignId: string;
  onPickCharacter: (characterId: string) => void;
  onPickWorldHome: (worldId: string) => void;
  onClose: () => void;
  anchor?: 'left' | 'right';
}) {
  const [characters, setCharacters] = useState<Array<{ id: string; name: string }>>([]);
  const [worldEntries, setWorldEntries] = useState<Array<{ worldId: string; worldName: string }>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([
      getCharactersForCampaign(campaignId),
      getWorldsForCampaign(campaignId),
    ]).then(([charRes, worldsRes]) => {
      if (cancelled) return;
      const chars = (charRes.data ?? []) as Array<{ id: string; name: string }>;
      setCharacters(chars);
      const worldRows = (worldsRes.data ?? []) as unknown as Array<{
        world_id: string;
        worlds: { id: string; name: string } | null;
      }>;
      setWorldEntries(worldRows.map((r) => ({
        worldId: r.world_id,
        worldName: r.worlds?.name ?? 'World',
      })));
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [campaignId]);

  return (
    <>
      {Platform.OS === 'web' ? (
        <Pressable style={s.pickerBackdrop} onPress={onClose} />
      ) : null}

      <View style={[s.picker, anchor === 'right' ? s.pickerAnchorRight : s.pickerAnchorLeft]}>
        <Text variant="label-sm" family="body" weight="semibold" style={s.pickerHeader}>
          CHARACTERS
        </Text>
        {loading ? (
          <Text style={s.pickerEmpty}>Loading…</Text>
        ) : characters.length === 0 ? (
          <Text style={s.pickerEmpty}>No characters yet.</Text>
        ) : (
          characters.map((c) => (
            <Pressable
              key={c.id}
              onPress={() => onPickCharacter(c.id)}
              style={({ pressed }) => [s.pickerItem, pressed && { backgroundColor: colors.surfaceContainerHigh }]}
            >
              <MaterialCommunityIcons name="account" size={14} color={colors.outline} />
              <Text
                variant="body-sm"
                family="body"
                style={[s.pickerItemLabel, !c.name && { color: colors.outline, fontStyle: 'italic' }]}
                numberOfLines={1}
              >
                {c.name?.trim() || 'Untitled character'}
              </Text>
            </Pressable>
          ))
        )}

        {!loading && worldEntries.length > 0 ? (
          <>
            <View style={s.pickerDivider} />
            <Text variant="label-sm" family="body" weight="semibold" style={s.pickerHeader}>
              WORLD
            </Text>
            {worldEntries.map((w) => (
              <Pressable
                key={w.worldId}
                onPress={() => onPickWorldHome(w.worldId)}
                style={({ pressed }) => [
                  s.pickerItem,
                  pressed ? { backgroundColor: colors.surfaceContainerHigh } : null,
                ]}
              >
                <MaterialCommunityIcons name="book-open-variant" size={14} color={colors.outline} />
                <Text
                  variant="body-sm"
                  family="body"
                  style={s.pickerItemLabel}
                  numberOfLines={1}
                >
                  {w.worldName}
                </Text>
              </Pressable>
            ))}
          </>
        ) : null}
      </View>
    </>
  );
}

function Tab({ label, icon, active, onPress, onClose }: {
  label: string;
  icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
  active: boolean;
  onPress?: () => void;
  onClose?: () => void;
}) {
  return (
    <View style={[s.tab, active && s.tabActive]}>
      <Pressable
        onPress={onPress}
        disabled={!onPress}
        style={({ pressed }) => [s.tabPressable, pressed && onPress ? { opacity: 0.85 } : null]}
      >
        <MaterialCommunityIcons
          name={icon}
          size={14}
          color={active ? colors.primary : colors.outline}
        />
        <Text
          variant="label-sm"
          family="body"
          weight="semibold"
          style={[s.tabLabel, active && s.tabLabelActive]}
          numberOfLines={1}
        >
          {label}
        </Text>
      </Pressable>
      {onClose ? (
        <Pressable
          onPress={onClose}
          hitSlop={6}
          style={s.tabClose}
          accessibilityLabel="Close tab"
        >
          <MaterialCommunityIcons name="close" size={12} color={colors.outline} />
        </Pressable>
      ) : null}
    </View>
  );
}

function iconFor(target: SplitTarget): React.ComponentProps<typeof MaterialCommunityIcons>['name'] {
  switch (target.kind) {
    case 'campaign': return 'book-open-variant';
    case 'character': return 'account';
    case 'world-page': return 'book-open-variant';
    case 'world-home': return 'book-open-variant';
    case 'world-map-index': return 'map';
    case 'world-map': return 'map';
    case 'world-relations': return 'graph';
  }
}

/**
 * Resolve a label for a split target. Lives as a hook so we can swap
 * in a store-driven cache later without touching callers. Campaign
 * tabs use the caller-supplied label since the campaign name is
 * already in a Zustand store.
 */
function useSplitTargetLabel(target: SplitTarget): string {
  const [label, setLabel] = useState<string>(() => fallbackLabel(target));

  useEffect(() => {
    setLabel(fallbackLabel(target));
    let cancelled = false;
    if (target.kind === 'character') {
      getCharacterById(target.characterId).then(({ data }) => {
        if (cancelled) return;
        if (data?.name) setLabel(data.name);
      });
    } else if (target.kind === 'world-page') {
      getPage(target.pageId).then(({ data }) => {
        if (cancelled) return;
        if (data?.title) setLabel(data.title);
      });
    } else if (target.kind === 'world-home') {
      getWorld(target.worldId).then(({ data }) => {
        if (cancelled) return;
        if (data?.name) setLabel(data.name);
      });
    } else if (target.kind === 'world-map') {
      getMap(target.mapId).then(({ data }) => {
        if (cancelled) return;
        const labelText = (data as { label?: string | null } | null)?.label;
        if (labelText) setLabel(labelText);
      });
    } else if (target.kind === 'world-map-index') {
      getWorld(target.worldId).then(({ data }) => {
        if (cancelled) return;
        if (data?.name) setLabel(`${data.name} · Maps`);
      });
    } else if (target.kind === 'world-relations') {
      getWorld(target.worldId).then(({ data }) => {
        if (cancelled) return;
        if (data?.name) setLabel(`${data.name} · Relations`);
      });
    }
    return () => { cancelled = true; };
  }, [target]);

  return label;
}

function fallbackLabel(target: SplitTarget): string {
  switch (target.kind) {
    case 'campaign': return 'Campaign';
    case 'character': return 'Character';
    case 'world-page': return 'Page';
    case 'world-home': return 'World';
    case 'world-map-index': return 'Maps';
    case 'world-map': return 'Map';
    case 'world-relations': return 'Relations';
  }
}

const s = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 6,
    paddingHorizontal: spacing.sm + 4,
    paddingTop: 6,
    backgroundColor: colors.surfaceCanvas,
    borderBottomWidth: 1,
    borderBottomColor: colors.outlineVariant,
    ...(Platform.OS === 'web' ? { zIndex: 10 } : {}),
  },
  homeBtn: {
    width: 30, height: 30,
    alignItems: 'center', justifyContent: 'center',
    borderRadius: 6,
    marginBottom: 4,
  },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingLeft: 10,
    paddingRight: 6,
    paddingVertical: 7,
    backgroundColor: colors.surfaceContainer,
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: colors.outlineVariant,
    maxWidth: 220,
    minWidth: 110,
    marginBottom: -1,
  },
  tabActive: {
    backgroundColor: colors.surfaceContainerHigh,
    borderColor: colors.outlineVariant,
  },
  tabPressable: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minWidth: 0,
  },
  tabLabel: {
    flex: 1,
    color: colors.onSurfaceVariant,
    letterSpacing: 0.2,
  },
  tabLabelActive: { color: colors.onSurface },
  tabClose: {
    width: 18, height: 18,
    alignItems: 'center', justifyContent: 'center',
    borderRadius: 4,
  },

  tabDndWrapper: {
    position: 'relative',
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  tabDropIndicator: {
    position: 'absolute',
    top: 4,
    bottom: 0,
    width: 2,
    backgroundColor: colors.primary,
    borderRadius: 1,
    ...(Platform.OS === 'web' ? { zIndex: 1 } : {}),
  },
  tabDropIndicatorBefore: { left: -3 },
  tabDropIndicatorAfter: { right: -3 },

  /** Invisible drop zone after the last tab on a populated side.
   *  Narrow by default — just enough to catch end-of-list drops —
   *  but expands to fill remaining row width inside a tab group
   *  (see `trailingDropFill`). */
  trailingDrop: {
    width: 40,
    height: 30,
    marginBottom: -1,
  },
  trailingDropFill: {
    flex: 1,
    minWidth: 40,
  },
  trailingDropHot: {
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
    borderTopWidth: 2,
    borderTopColor: colors.primary,
    backgroundColor: colors.primaryContainer + '11',
  },

  tabGroup: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 6,
    minWidth: 0,
  },
  tabGroupRight: { justifyContent: 'flex-start' },

  addAnchor: { position: 'relative', marginBottom: 4 },
  addBtn: {
    width: 30, height: 30,
    alignItems: 'center', justifyContent: 'center',
    borderRadius: 6,
  },
  addBtnActive: { backgroundColor: colors.surfaceContainerHigh },

  pickerBackdrop: {
    position: 'absolute',
    top: -2000, left: -2000, right: -2000, bottom: -2000,
    ...(Platform.OS === 'web' ? { zIndex: 50 } : {}),
  },
  picker: {
    position: 'absolute',
    top: 36,
    minWidth: 220,
    maxWidth: 280,
    backgroundColor: colors.surfaceContainerHigh,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    paddingVertical: 6,
    ...(Platform.OS === 'web' ? { zIndex: 51 } : {}),
  },
  pickerAnchorLeft: { left: 0 },
  pickerAnchorRight: { right: 0 },
  pickerHeader: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    color: colors.outline,
    letterSpacing: 1.2,
    fontFamily: fonts.label,
  },
  pickerEmpty: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 12,
    fontFamily: fonts.body,
    color: colors.outline,
    fontStyle: 'italic',
  },
  pickerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  pickerDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.outlineVariant,
    marginHorizontal: 8,
    marginVertical: 4,
  },
  pickerItemLabel: {
    flex: 1,
    color: colors.onSurface,
  },
});
