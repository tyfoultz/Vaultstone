// Dispatcher that renders the right body for whatever's pinned to the
// campaign's split slot. Kept thin: it just unwraps `SplitTarget` and
// delegates to the existing surface components (CharacterSheet for
// characters, PagePaneContent for world pages). Add a new arm here
// when introducing another split-target kind.

import { useSplitPaneStore, type SplitTarget } from '@vaultstone/store';
import { CharacterSheet } from './character-sheet/CharacterSheet';
import { PagePaneContent } from './world/PagePaneContent';
import { WorldHome } from './world/WorldHome';

type Props = {
  target: SplitTarget;
};

export function SplitPaneContent({ target }: Props) {
  const closeSplit = useSplitPaneStore((s) => s.closeSplit);

  switch (target.kind) {
    case 'character':
      return (
        <CharacterSheet
          characterId={target.characterId}
          embedded
          onClose={closeSplit}
        />
      );
    case 'world-page':
      return (
        <PagePaneContent
          pageId={target.pageId}
          worldId={target.worldId}
          splitMode
          onClose={closeSplit}
        />
      );
    case 'world-home':
      return (
        <WorldHome
          worldId={target.worldId}
          embedded
          onClose={closeSplit}
        />
      );
  }
}
