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

  const splitPageId = useSplitPaneStore((s) => s.splitPageId);
  const focusedPane = useSplitPaneStore((s) => s.focusedPane);
  const closeSplit = useSplitPaneStore((s) => s.closeSplit);
  const setFocusedPane = useSplitPaneStore((s) => s.setFocusedPane);

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
      useSplitPaneStore.getState().openSplit(targetPageId);
    },
    [],
  );

  const handleSwapPanes = useCallback(() => {
    if (!splitPageId || !worldId) return;
    const currentPrimary = pageId;
    router.replace(worldPageHref(worldId, splitPageId));
    useSplitPaneStore.getState().openSplit(currentPrimary!);
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
              focused={focusedPane === 'primary'}
              onFocus={() => setFocusedPane('primary')}
              onClose={closeSplit}
            />
          }
          splitContent={
            <PagePaneContent
              pageId={splitPageId}
              worldId={worldId}
              splitMode
              focused={focusedPane === 'split'}
              onFocus={() => setFocusedPane('split')}
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
