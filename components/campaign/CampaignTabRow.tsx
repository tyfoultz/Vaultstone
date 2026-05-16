// Browser-style tab strip at the top of the campaign route. Three slots:
//   • Home button — leftmost, routes back to the drawer home.
//   • Campaign tab — always present, can't be closed; shows the
//     campaign name. Clicking it focuses the campaign pane (mobile)
//     or no-ops on desktop (both panes already visible).
//   • Split tab — present only when `splitTarget` is set. Renders the
//     target's label + an X to close. Clicking it focuses the split
//     pane (mobile).
//
// Labels are best-effort. Campaign name comes from the cached
// useCampaignStore; characters resolve via a small targeted fetch on
// mount. While a label is loading we show a placeholder. Replacing
// the resolver with a real cache lookup once the campaign character
// roster lifts to a store is a follow-up.

import { useEffect, useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import {
  getCharacterById,
  getCharactersForCampaign,
  getPage,
  getWorld,
  getWorldsForCampaign,
} from '@vaultstone/api';
import {
  useCampaignStore,
  useSplitPaneStore,
  type SplitTarget,
} from '@vaultstone/store';
import { colors, fonts, radius, spacing, Text } from '@vaultstone/ui';

type Props = {
  campaignId: string;
  /** Mobile-only: which pane is currently visible. The tab strip
   *  toggles between them; ignored on desktop where both render
   *  side-by-side. */
  mobileActivePane?: 'campaign' | 'split';
  onMobileActivePaneChange?: (pane: 'campaign' | 'split') => void;
  /** True when the route is rendering the side-by-side split shell
   *  (web ≥768px with an active split target). When set, the split
   *  tab + the "+" button shift to anchor over the split pane on
   *  the right; the campaign tab stays anchored over the primary
   *  pane on the left. Off → all tabs flow normally from the left. */
  splitMode?: boolean;
};

export function CampaignTabRow({ campaignId, mobileActivePane, onMobileActivePaneChange, splitMode }: Props) {
  const router = useRouter();
  const splitTarget = useSplitPaneStore((s) => s.splitTarget);
  const splitRatio = useSplitPaneStore((s) => s.splitRatio);
  const closeSplit = useSplitPaneStore((s) => s.closeSplit);
  const openSplit = useSplitPaneStore((s) => s.openSplit);
  const [pickerOpen, setPickerOpen] = useState(false);

  // Campaign name from the cached store list — if we deep-linked into
  // this campaign and the store hasn't been populated yet, fall back
  // to a generic label until the page hydrates the cache.
  const campaign = useCampaignStore((s) => s.campaigns.find((c) => c.id === campaignId));
  const campaignLabel = campaign?.name?.trim() || 'Campaign';

  // Split-target label resolver. Character names are looked up via a
  // single round-trip per `characterId`; world-page labels stay
  // generic until we add a pages-store lookup.
  const splitLabel = useSplitTargetLabel(splitTarget);

  // Desktop and mobile differ only in click semantics:
  //   - Desktop: click campaign tab does nothing useful (both panes
  //     visible); click split tab also no-op. The close X on the
  //     split tab is the only meaningful action.
  //   - Mobile: clicks swap which pane is visible.
  const isMobileMode = !!onMobileActivePaneChange;
  const campaignActive = isMobileMode ? mobileActivePane === 'campaign' : true;
  const splitActive = isMobileMode ? mobileActivePane === 'split' : true;

  const openCharacterId = splitTarget?.kind === 'character' ? splitTarget.characterId : null;
  const openWorldHomeId = splitTarget?.kind === 'world-home' ? splitTarget.worldId : null;

  function handlePickCharacter(characterId: string) {
    openSplit({ kind: 'character', characterId });
    setPickerOpen(false);
  }
  function handlePickWorldHome(worldId: string) {
    openSplit({ kind: 'world-home', worldId });
    setPickerOpen(false);
  }

  const splitTab = splitTarget ? (
    <Tab
      label={splitLabel}
      icon={iconFor(splitTarget)}
      active={splitActive}
      onPress={isMobileMode ? () => onMobileActivePaneChange!('split') : undefined}
      onClose={closeSplit}
    />
  ) : null;

  // The "+" button + its popover. Lives in either the left or the
  // right tab group depending on `splitMode` — when a split is open
  // and we're in side-by-side layout, the + sits next to the split
  // tab on the right where new tabs would land.
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
          excludeCharacterId={openCharacterId}
          excludeWorldHomeId={openWorldHomeId}
          onPickCharacter={handlePickCharacter}
          onPickWorldHome={handlePickWorldHome}
          onClose={() => setPickerOpen(false)}
          // Anchor the popover so it opens *into* the page, not off
          // the edge: rightward from the left + button, leftward
          // from the right + button.
          anchor={splitMode ? 'right' : 'left'}
        />
      ) : null}
    </View>
  );

  // In split mode, the right side of the row (split tab + +) is
  // positioned over the split pane. We use flex with absolute-style
  // splitter math: primary group takes splitRatio of the row width,
  // right group takes the rest. Outside of split mode, everything
  // flows naturally from the left.
  if (splitMode && splitTarget) {
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
          <Tab
            label={campaignLabel}
            icon="book-open-variant"
            active={campaignActive}
            onPress={isMobileMode ? () => onMobileActivePaneChange!('campaign') : undefined}
          />
        </View>
        <View style={[s.tabGroup, s.tabGroupRight, { flex: 1 }]}>
          {splitTab}
          {addButton}
        </View>
      </View>
    );
  }

  // Default — no split, or mobile pane-switcher. All tabs flow from
  // the left in the order they're added.
  return (
    <View style={s.row}>
      <Pressable
        onPress={() => router.replace('/(drawer)/home' as Href)}
        style={({ pressed }) => [s.homeBtn, pressed && { opacity: 0.7 }]}
        accessibilityLabel="Home"
      >
        <MaterialCommunityIcons name="home-outline" size={18} color={colors.outline} />
      </Pressable>
      <Tab
        label={campaignLabel}
        icon="book-open-variant"
        active={campaignActive}
        onPress={isMobileMode ? () => onMobileActivePaneChange!('campaign') : undefined}
      />
      {splitTab}
      {addButton}
    </View>
  );
}

/**
 * Dropdown popover anchored under the "+" button. Lists two sections:
 *
 *   - CHARACTERS — every character on the campaign. Tapping one opens
 *     the character sheet in split.
 *   - WORLD — the campaign's linked world (typically one). Tapping it
 *     opens the world's first page in split; once the page-tree is
 *     navigable inside `PagePaneContent` the user can move around
 *     from there.
 *
 * Already-open targets are filtered so the user can't pick a no-op.
 */
function OpenTabPicker({
  campaignId,
  excludeCharacterId,
  excludeWorldHomeId,
  onPickCharacter,
  onPickWorldHome,
  onClose,
  anchor = 'left',
}: {
  campaignId: string;
  excludeCharacterId: string | null;
  excludeWorldHomeId: string | null;
  onPickCharacter: (characterId: string) => void;
  onPickWorldHome: (worldId: string) => void;
  onClose: () => void;
  /** Which edge of the + button the popover hugs. `left` opens to
   *  the right (default); `right` opens to the left. The route flips
   *  this when the + button is anchored over the right pane, so the
   *  panel doesn't slip off-screen. */
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
      // Linked worlds → simple {id, name} entries. The picker drops
      // the user on the world's home overview (same surface as
      // /world/[worldId]); navigation into individual pages happens
      // inside that surface once it's open.
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

  const visibleCharacters = characters.filter((c) => c.id !== excludeCharacterId);
  const visibleWorlds = worldEntries.filter((w) => w.worldId !== excludeWorldHomeId);

  return (
    <>
      {/* Full-screen backdrop on web — click anywhere outside closes
          the popover. On native we lean on the parent re-render to
          dismiss via re-tap of the + button. */}
      {Platform.OS === 'web' ? (
        <Pressable style={s.pickerBackdrop} onPress={onClose} />
      ) : null}

      <View style={[s.picker, anchor === 'right' ? s.pickerAnchorRight : s.pickerAnchorLeft]}>
        {/* Characters section */}
        <Text variant="label-sm" family="body" weight="semibold" style={s.pickerHeader}>
          CHARACTERS
        </Text>
        {loading ? (
          <Text style={s.pickerEmpty}>Loading…</Text>
        ) : visibleCharacters.length === 0 ? (
          <Text style={s.pickerEmpty}>
            {characters.length === 0 ? 'No characters yet.' : 'Already open.'}
          </Text>
        ) : (
          visibleCharacters.map((c) => (
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

        {/* World section — typically one entry per campaign. Pages
            without a landing render disabled so the user knows the
            world is linked but has no content to open yet. */}
        {!loading && worldEntries.length > 0 ? (
          <>
            <View style={s.pickerDivider} />
            <Text variant="label-sm" family="body" weight="semibold" style={s.pickerHeader}>
              WORLD
            </Text>
            {visibleWorlds.length === 0 ? (
              <Text style={s.pickerEmpty}>Already open.</Text>
            ) : (
              visibleWorlds.map((w) => (
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
              ))
            )}
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
    case 'character': return 'account';
    case 'world-page': return 'book-open-variant';
    case 'world-home': return 'book-open-variant';
  }
}

/**
 * Resolve a label for the split target. Currently fetches character
 * names directly; world-page labels stay generic. Lives as a hook so
 * we can swap in a store-driven cache later without touching callers.
 */
function useSplitTargetLabel(target: SplitTarget | null): string {
  const [label, setLabel] = useState<string>(() => fallbackLabel(target));

  useEffect(() => {
    setLabel(fallbackLabel(target));
    if (!target) return;
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
    }
    return () => { cancelled = true; };
  }, [target]);

  return label;
}

function fallbackLabel(target: SplitTarget | null): string {
  if (!target) return '';
  switch (target.kind) {
    case 'character': return 'Character';
    case 'world-page': return 'Page';
    case 'world-home': return 'World';
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
    // The tab strip needs to sit above any sticky chrome below it on
    // web. Z-index works on web; native ignores it cleanly.
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
    // Pull the tab down 1px so its bottom edge overlaps the row's
    // border-bottom and reads as "attached" to the page content.
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

  /** Split-mode tab group — when the route renders the side-by-side
   *  shell we break the row into two flex children so the right
   *  group aligns above the split pane. `tabGroupRight` reverses
   *  alignment so the split tab + + sit close to the divider. */
  tabGroup: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 6,
    minWidth: 0,
  },
  tabGroupRight: { justifyContent: 'flex-start' },

  // "+" button anchor — relative-positioned wrapper so the popover
  // can be absolutely placed beneath it on web.
  addAnchor: { position: 'relative', marginBottom: 4 },
  addBtn: {
    width: 30, height: 30,
    alignItems: 'center', justifyContent: 'center',
    borderRadius: 6,
  },
  addBtnActive: { backgroundColor: colors.surfaceContainerHigh },

  // Popover panel + backdrop.
  pickerBackdrop: {
    position: 'absolute',
    // Cover the whole viewport so any click outside the popover
    // dismisses it. Negative offsets stretch beyond the anchor.
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
  /** Anchor variants — `Left` hugs the left edge of the + button
   *  (panel opens rightward); `Right` hugs the right edge (panel
   *  opens leftward). The route picks the variant that keeps the
   *  panel on-screen. */
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
  /** Thin separator between the picker's sections (Characters / World). */
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
