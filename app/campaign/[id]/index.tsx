// Campaign detail route. Layout: a browser-style tab strip with two
// groups (left + right) sits at the top; the body renders one pane
// per non-empty side. Tabs (including the campaign itself) flow
// freely between the two groups via drag-reorder.
//
// On first mount the route seeds a single `{ kind: 'campaign' }` tab
// on the left side. Subsequent target adds (party-card click, +
// picker, page-mention click inside an embedded world) append to the
// right side. The user can drag any tab anywhere.
//
// State is mirrored to the URL as `?tabs=L:campaign:cid@0;R:char:x@0`
// so deep links and refreshes preserve layout.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform, Pressable, useWindowDimensions, View, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  decodeSplitTabs,
  encodeSplitTabs,
  useSplitPaneStore,
  type Side,
  type SplitTarget,
} from '@vaultstone/store';
import { colors, spacing, radius } from '@vaultstone/ui';
import { CampaignPageV2 } from '../../../components/campaign/CampaignPageV2';
import { CampaignTabRow } from '../../../components/campaign/CampaignTabRow';
import { SharedDndProvider } from '../../../components/DndProviderContext';
import { SplitPaneContent } from '../../../components/SplitPaneContent';
import { SplitPaneShell } from '../../../components/world/SplitPaneShell.web';
import {
  FloatingNotesProvider,
  type FloatingNotesState,
} from '../../../components/session/FloatingNotesContext';
import { FloatingNotesOverlay, type PanelPos } from '../../../components/session/FloatingNotesOverlay';

export default function CampaignDetailScreen() {
  const params = useLocalSearchParams<{ id: string; tabs?: string }>();
  const id = params.id;
  const tabsParam = params.tabs;
  const router = useRouter();

  const leftTabs = useSplitPaneStore((s) => s.leftTabs);
  const rightTabs = useSplitPaneStore((s) => s.rightTabs);
  const leftActiveIndex = useSplitPaneStore((s) => s.leftActiveIndex);
  const rightActiveIndex = useSplitPaneStore((s) => s.rightActiveIndex);
  const setSplitState = useSplitPaneStore((s) => s.setSplitState);
  // Derive active targets without going through a Zustand selector
  // that returns a fresh object literal each call — the new object
  // would trigger a re-render on every store update via Object.is,
  // and combined with our URL-mirror effect that's the route to an
  // infinite render loop.
  const activeTargets = {
    left: leftActiveIndex == null ? null : leftTabs[leftActiveIndex] ?? null,
    right: rightActiveIndex == null ? null : rightTabs[rightActiveIndex] ?? null,
  };

  const { width } = useWindowDimensions();
  const isDesktop = width >= 768;
  const useMobileLayout = !isDesktop || Platform.OS !== 'web';

  // Mobile-only: which side's body is currently visible. Defaults to
  // whichever side the user last focused.
  const focusedSide = useSplitPaneStore((s) => s.focusedSide);
  const [mobileActiveSide, setMobileActiveSide] = useState<Side>('left');
  useEffect(() => {
    setMobileActiveSide(focusedSide);
  }, [focusedSide]);

  // Hydrate the store from the URL on first mount and whenever
  // `?tabs=` changes externally (browser back/forward, deep link).
  // Always make sure exactly one campaign tab exists; if the URL is
  // missing one, inject it on the left side.
  useEffect(() => {
    if (!id) return;
    const fromUrl = decodeSplitTabs(tabsParam ?? null);
    const hasCampaign = [...fromUrl.leftTabs, ...fromUrl.rightTabs].some(
      (t) => t.kind === 'campaign' && t.campaignId === id,
    );
    let { leftTabs: l, rightTabs: r, leftActiveIndex: la, rightActiveIndex: ra } = fromUrl;
    if (!hasCampaign) {
      // Cold open with no campaign in the URL — inject it at the
      // front of the left side and focus it. Any prior left tabs
      // shift down one.
      l = [{ kind: 'campaign', campaignId: id }, ...l];
      la = 0;
    }
    if (l.length === 0 && r.length === 0) {
      // Defensive — should be unreachable given the campaign injection.
      l = [{ kind: 'campaign', campaignId: id }];
      la = 0;
    }
    // Bail when the store already matches to avoid re-render loops
    // with the inverse mirror effect below.
    const storeState = useSplitPaneStore.getState();
    if (
      sameTabList(storeState.leftTabs, l) &&
      sameTabList(storeState.rightTabs, r) &&
      storeState.leftActiveIndex === la &&
      storeState.rightActiveIndex === ra
    ) return;
    setSplitState({ leftTabs: l, rightTabs: r, leftActiveIndex: la, rightActiveIndex: ra });
  }, [id, tabsParam, setSplitState]);

  // Mirror store → URL. The lastWritten ref breaks the cycle with the
  // hydration effect.
  const lastWrittenRef = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    const encoded = encodeSplitTabs({
      leftTabs, rightTabs, leftActiveIndex, rightActiveIndex,
    });
    if (lastWrittenRef.current === encoded) return;
    lastWrittenRef.current = encoded;
    if (encoded === (tabsParam ?? null)) return;
    router.setParams({ tabs: encoded ?? undefined });
  }, [leftTabs, rightTabs, leftActiveIndex, rightActiveIndex, tabsParam, router]);

  // On unmount, reset the store so navigating to a different campaign
  // doesn't leak the previous campaign's tabs.
  useEffect(() => {
    return () => {
      setSplitState({ leftTabs: [], rightTabs: [], leftActiveIndex: null, rightActiveIndex: null });
    };
  }, [setSplitState]);

  // Floating session notes — state lives here so the overlay persists
  // across all tab/pane switches within the campaign.
  const [notesState, setNotesState] = useState<FloatingNotesState | null>(null);
  const [notesOpen, setNotesOpen] = useState(false);
  const [notesPos, setNotesPos] = useState<PanelPos | null>(null);
  const notesApi = useMemo(() => ({
    register: (s: FloatingNotesState) => setNotesState(s),
    open: (s: FloatingNotesState) => { setNotesState(s); setNotesOpen(true); },
    close: () => { setNotesState(null); setNotesOpen(false); setNotesPos(null); },
    toggle: () => setNotesOpen((v) => !v),
    get isOpen() { return notesState !== null && notesOpen; },
    get isRegistered() { return notesState !== null; },
  }), [notesState, notesOpen]);

  // Body resolution per side. Memoized so a no-op re-render of the
  // route doesn't recreate the JSX (and force key-based remounts of
  // PagePaneContent / WorldHome which would lose unsaved drafts).
  const leftBody = useMemo(() => renderTargetBody(activeTargets.left, id), [activeTargets.left, id]);
  const rightBody = useMemo(() => renderTargetBody(activeTargets.right, id), [activeTargets.right, id]);

  if (!id) return null;

  const leftFilled = !!activeTargets.left;
  const rightFilled = !!activeTargets.right;
  const showSplit = leftFilled && rightFilled;

  // Body — depends on layout and which sides are populated.
  let body: React.ReactNode;
  if (!showSplit) {
    // One side empty → render the populated side full-width.
    body = leftFilled ? leftBody : rightBody;
  } else if (!useMobileLayout) {
    body = (
      <SplitPaneShell
        primaryContent={leftBody}
        splitContent={rightBody}
      />
    );
  } else {
    // Mobile / narrow web — keep both panes mounted but only one
    // visible at a time. The tab row above toggles which.
    body = (
      <View style={styles.mobileStack}>
        <View style={[styles.mobilePane, mobileActiveSide === 'left' ? styles.mobilePaneActive : styles.mobilePaneHidden]}>
          {leftBody}
        </View>
        <View style={[styles.mobilePane, mobileActiveSide === 'right' ? styles.mobilePaneActive : styles.mobilePaneHidden]}>
          {rightBody}
        </View>
      </View>
    );
  }

  return (
    <FloatingNotesProvider value={notesApi}>
      <SharedDndProvider>
        <View style={styles.root}>
          <CampaignTabRow
            campaignId={id}
            mobileActiveSide={useMobileLayout ? mobileActiveSide : undefined}
            onMobileActiveSideChange={useMobileLayout ? setMobileActiveSide : undefined}
            splitMode={!useMobileLayout && showSplit}
          />
          {body}
          {notesState && notesOpen ? (
            <FloatingNotesOverlay
              sessionId={notesState.sessionId}
              userId={notesState.userId}
              campaignId={notesState.campaignId}
              isDM={notesState.isDM}
              memberNames={notesState.memberNames}
              position={notesPos}
              onPositionChange={setNotesPos}
              onClose={() => { setNotesState(null); setNotesOpen(false); setNotesPos(null); }}
            />
          ) : null}
          {notesState ? (
            <Pressable
              style={[styles.notesPill, notesOpen && styles.notesPillActive]}
              onPress={() => setNotesOpen((v) => !v)}
              accessibilityLabel="Session Notes"
            >
              <MaterialCommunityIcons
                name="notebook-outline"
                size={16}
                color={notesOpen ? colors.onSurface : colors.primary}
              />
            </Pressable>
          ) : null}
        </View>
      </SharedDndProvider>
    </FloatingNotesProvider>
  );
}

/** Render the body for a single active target. Returns the campaign
 *  page when the target is the campaign tab, otherwise delegates to
 *  `SplitPaneContent`. Keyed by target identity so each tab keeps its
 *  own component state. */
function renderTargetBody(target: SplitTarget | null, campaignId: string): React.ReactNode {
  if (!target) return null;
  if (target.kind === 'campaign') {
    return <CampaignPageV2 key={`campaign:${campaignId}`} campaignId={campaignId} />;
  }
  return (
    <SplitPaneContent
      key={`${target.kind}:${targetKey(target)}`}
      target={target}
    />
  );
}

function targetKey(t: SplitTarget): string {
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

function sameTabList(a: SplitTarget[], b: SplitTarget[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const x = a[i];
    const y = b[i];
    if (x.kind !== y.kind) return false;
    if (targetKey(x) !== targetKey(y)) return false;
  }
  return true;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surfaceCanvas },
  mobileStack: { flex: 1, position: 'relative' },
  mobilePane: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
  },
  mobilePaneActive: {
    ...(Platform.OS === 'web' ? { display: 'flex' } : {}),
  },
  mobilePaneHidden: {
    ...(Platform.OS === 'web'
      ? { display: 'none' as const }
      : { opacity: 0, pointerEvents: 'none' as const }
    ),
  },
  notesPill: {
    position: 'absolute',
    top: 6,
    right: spacing.sm + 4,
    width: 32,
    height: 32,
    borderRadius: radius.xl,
    backgroundColor: colors.surfaceContainer,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    alignItems: 'center',
    justifyContent: 'center',
    ...(Platform.OS === 'web'
      ? { zIndex: 20, cursor: 'pointer' } as any
      : { elevation: 4 }
    ),
  },
  notesPillActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
});
