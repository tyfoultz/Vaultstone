import { useRef } from 'react';
import type { View } from 'react-native';
import type { WorldSection } from '@vaultstone/types';

type DropPos = 'before' | 'after';

export function useSectionDnd(
  _section: WorldSection,
  _onDrop: (dragged: WorldSection, target: WorldSection, position: DropPos) => void,
) {
  return {
    ref: useRef<View>(null),
    isDragging: false,
    dropPosition: null as DropPos | null,
    isOver: false,
  };
}
