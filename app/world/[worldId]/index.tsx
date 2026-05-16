// Thin route wrapper around the reusable <WorldHome> component.
// The actual world overview UI lives in
// components/world/WorldHome.tsx so it can also render inside the
// campaign page's split pane.
import { useLocalSearchParams } from 'expo-router';
import { WorldHome } from '../../../components/world/WorldHome';

export default function WorldLandingScreen() {
  const { worldId } = useLocalSearchParams<{ worldId: string }>();
  if (!worldId) return null;
  return <WorldHome worldId={worldId} />;
}
