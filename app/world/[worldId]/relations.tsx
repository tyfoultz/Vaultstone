import { useLocalSearchParams } from 'expo-router';

import { WorldRelationsBody } from '../../../components/world/WorldRelationsBody';

export default function RelationsScreen() {
  const { worldId } = useLocalSearchParams<{ worldId: string }>();
  if (!worldId) return null;
  return <WorldRelationsBody worldId={worldId} />;
}
