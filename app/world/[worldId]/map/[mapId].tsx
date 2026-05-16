import { useLocalSearchParams } from 'expo-router';

import { WorldMapBody } from '../../../../components/world/WorldMapBody';

export default function WorldMapScreen() {
  const { worldId, mapId } = useLocalSearchParams<{ worldId: string; mapId: string }>();
  if (!worldId || !mapId) return null;
  return <WorldMapBody worldId={worldId} mapId={mapId} />;
}
