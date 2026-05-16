import { useLocalSearchParams } from 'expo-router';

import { WorldMapIndexBody } from '../../../../components/world/WorldMapIndexBody';

// Landing for `/world/:worldId/map`. The body resolves the world's
// primary (or first) map and redirects to it; otherwise renders the
// upload-first-map empty state.
export default function WorldMapIndexScreen() {
  const { worldId } = useLocalSearchParams<{ worldId: string }>();
  if (!worldId) return null;
  return <WorldMapIndexBody worldId={worldId} />;
}
