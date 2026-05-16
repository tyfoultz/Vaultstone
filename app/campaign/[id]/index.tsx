// Campaign detail route. The V2 redesign is now the only layout —
// the legacy V1 dashboard was removed once V2 reached parity.
//
// Sub-routes (combat, party, notes, recap, rulebook, etc.) still
// live in their own files at `/campaign/[id]/<route>` and are
// reached via the V2 page's primary action card and references row.
//
// Layout: a browser-style tab strip sits at the top of the route
// (home button + campaign tab + optional split tab). Below it,
// either the campaign page alone (no split), a horizontal
// side-by-side split shell (web ≥768px with split target), or a
// pane-switching stack (mobile / narrow web with split target).
//
// The split target is mirrored to a `?split=` query param so deep
// links work and refreshing the page preserves the open sheet.

import { useEffect, useRef, useState } from 'react';
import { Platform, useWindowDimensions, View, StyleSheet } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  useSplitPaneStore,
  decodeSplitTarget,
  encodeSplitTarget,
} from '@vaultstone/store';
import { colors } from '@vaultstone/ui';
import { CampaignPageV2 } from '../../../components/campaign/CampaignPageV2';
import { CampaignTabRow } from '../../../components/campaign/CampaignTabRow';
import { SplitPaneContent } from '../../../components/SplitPaneContent';
import { SplitPaneShell } from '../../../components/world/SplitPaneShell.web';

export default function CampaignDetailScreen() {
  const params = useLocalSearchParams<{ id: string; split?: string }>();
  const id = params.id;
  const splitParam = params.split;
  const router = useRouter();
  const splitTarget = useSplitPaneStore((s) => s.splitTarget);
  const openSplit = useSplitPaneStore((s) => s.openSplit);
  const closeSplit = useSplitPaneStore((s) => s.closeSplit);
  const { width } = useWindowDimensions();
  const isDesktop = width >= 768;
  const useMobileLayout = !isDesktop || Platform.OS !== 'web';

  // Mobile-only: which pane is visible. Defaults to the split pane
  // when one is just opened (matches user intent). When the split
  // closes we don't auto-snap — the layout collapses to campaign-only
  // anyway. When a new split opens, switch to it.
  const [mobileActivePane, setMobileActivePane] = useState<'campaign' | 'split'>('split');
  useEffect(() => {
    if (splitTarget) setMobileActivePane('split');
  }, [splitTarget]);

  // Hydrate the store from the URL on first mount + whenever the
  // ?split= param changes externally (browser back/forward, deep link).
  // Skip writes when the store is already in sync to avoid loops with
  // the inverse effect below.
  useEffect(() => {
    const fromUrl = decodeSplitTarget(splitParam ?? null);
    const fromStore = useSplitPaneStore.getState().splitTarget;
    if (sameTarget(fromUrl, fromStore)) return;
    if (fromUrl) openSplit(fromUrl);
    else closeSplit();
  }, [splitParam, openSplit, closeSplit]);

  // Mirror store → URL whenever the split target changes. We use
  // `router.setParams` so the rest of the route stack is unaffected.
  // The lastWritten ref breaks the cycle with the hydration effect:
  // when WE write the URL we don't want it to re-hydrate the store.
  const lastWrittenRef = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    const encoded = encodeSplitTarget(splitTarget);
    if (lastWrittenRef.current === encoded) return;
    lastWrittenRef.current = encoded;
    if (encoded === (splitParam ?? null)) return;
    router.setParams({ split: encoded ?? undefined });
  }, [splitTarget, splitParam, router]);

  // Drop the split on unmount so navigating away from a campaign
  // doesn't leak a stale target into another route's URL.
  useEffect(() => {
    return () => { closeSplit(); };
  }, [closeSplit]);

  if (!id) return null;

  const campaign = <CampaignPageV2 campaignId={id} />;
  const splitBody = splitTarget ? <SplitPaneContent target={splitTarget} /> : null;

  // Body — depends on layout and whether a split is active.
  let body: React.ReactNode;
  if (!splitTarget) {
    body = campaign;
  } else if (!useMobileLayout) {
    body = (
      <SplitPaneShell
        primaryContent={campaign}
        splitContent={splitBody}
      />
    );
  } else {
    // Mobile / narrow web — keep both panes mounted but only one
    // visible at a time. The tab row above toggles which.
    body = (
      <View style={styles.mobileStack}>
        <View style={[styles.mobilePane, mobileActivePane === 'campaign' ? styles.mobilePaneActive : styles.mobilePaneHidden]}>
          {campaign}
        </View>
        <View style={[styles.mobilePane, mobileActivePane === 'split' ? styles.mobilePaneActive : styles.mobilePaneHidden]}>
          {splitBody}
        </View>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <CampaignTabRow
        campaignId={id}
        mobileActivePane={useMobileLayout ? mobileActivePane : undefined}
        onMobileActivePaneChange={useMobileLayout ? setMobileActivePane : undefined}
        splitMode={!useMobileLayout && !!splitTarget}
      />
      {body}
    </View>
  );
}

function sameTarget(a: ReturnType<typeof decodeSplitTarget>, b: ReturnType<typeof decodeSplitTarget>): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  if (a.kind !== b.kind) return false;
  if (a.kind === 'character' && b.kind === 'character') {
    return a.characterId === b.characterId;
  }
  if (a.kind === 'world-page' && b.kind === 'world-page') {
    return a.worldId === b.worldId && a.pageId === b.pageId;
  }
  if (a.kind === 'world-home' && b.kind === 'world-home') {
    return a.worldId === b.worldId;
  }
  return false;
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
});
