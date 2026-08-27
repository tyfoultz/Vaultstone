import { useCallback, useEffect } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { usePagesStore, useSplitPaneStore } from '@vaultstone/store';
import { colors } from '@vaultstone/ui';

import { PagePaneContent } from '../../../../components/world/PagePaneContent';
import { SplitPaneShell } from '../../../../components/world/SplitPaneShell.web';
import { worldPageHref } from '../../../../components/world/worldHref';

export default function PageDetailScreen() {
  const { worldId, pageId } = useLocalSearchParams<{ worldId: string; pageId: string }>();
  const router = useRouter();

  // Look at the right side specifically — the URL-driven primary page is never
  // in the tab store, so selectSplitPageId (focused-side) returns null when the
  // user clicks the left pane, falsely collapsing the split.
  const splitPageId = useSplitPaneStore((s) => {
    if (s.rightActiveIndex == null) return null;
    const t = s.rightTabs[s.rightActiveIndex];
    return t?.kind === 'world-page' ? t.pageId : null;
  });
  const focusedSide = useSplitPaneStore((s) => s.focusedSide);
  const closeSplitTab = useSplitPaneStore((s) => s.closeSplitTab);
  const setFocusedSide = useSplitPaneStore((s) => s.setFocusedSide);

  // Always close the right-side tab (the split pane); the left side in this
  // route is the URL-driven primary page which lives outside the tab store.
  const closeSplit = useCallback(() => {
    const { rightActiveIndex } = useSplitPaneStore.getState();
    if (rightActiveIndex != null) closeSplitTab('right', rightActiveIndex);
  }, [closeSplitTab]);

  const splitPage = usePagesStore((s) => {
    if (!splitPageId || !worldId) return null;
    return (s.byWorldId[worldId] ?? []).find((p) => p.id === splitPageId) ?? null;
  });

  useEffect(() => {
    if (splitPageId && !splitPage) closeSplit();
  }, [splitPageId, splitPage, closeSplit]);

  useEffect(() => {
    if (splitPageId && splitPageId === pageId) closeSplit();
  }, [splitPageId, pageId, closeSplit]);

  const handleSplitNavigate = useCallback(
    (targetPageId: string) => {
      if (!worldId) return;
      useSplitPaneStore.getState().openSplit(
        { kind: 'world-page', worldId, pageId: targetPageId },
        { preferSide: 'right' },
      );
    },
    [worldId],
  );

  const handleSwapPanes = useCallback(() => {
    if (!splitPageId || !worldId) return;
    const currentPrimary = pageId;
    router.replace(worldPageHref(worldId, splitPageId));
    useSplitPaneStore.getState().openSplit(
      { kind: 'world-page', worldId, pageId: currentPrimary! },
      { preferSide: 'right' },
    );
  }, [splitPageId, pageId, worldId, router]);

  if (!worldId || !pageId) return null;

  const isSplitActive = !!splitPageId && splitPageId !== pageId && Platform.OS === 'web';

  if (isSplitActive) {
    return (
      <View style={styles.root}>
        <SplitPaneShell
          primaryContent={
            <PagePaneContent
              pageId={pageId}
              worldId={worldId}
              splitMode
              focused={focusedSide === 'left'}
              onFocus={() => setFocusedSide('left')}
              onClose={closeSplit}
            />
          }
          splitContent={
            <PagePaneContent
              pageId={splitPageId}
              worldId={worldId}
              splitMode
              focused={focusedSide === 'right'}
              onFocus={() => setFocusedSide('right')}
              onClose={closeSplit}
              onNavigate={handleSplitNavigate}
            />
          }
        />
      </View>
    );
  }

  return (
    <PagePaneContent
      key={pageId}
      pageId={pageId}
      worldId={worldId}
    />
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.surfaceCanvas,
  },
});
