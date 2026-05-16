// Thin route wrapper around the reusable <CharacterSheet> component.
// The actual sheet (state, render, modals, ~4k lines) lives in
// components/character-sheet/CharacterSheet.tsx so it can be embedded
// in the campaign page's split pane alongside the standalone route.
import { useLocalSearchParams } from 'expo-router';
import { CharacterSheet } from '../../../components/character-sheet/CharacterSheet';

export default function CharacterSheetScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  if (!id) return null;
  return <CharacterSheet characterId={id} />;
}
