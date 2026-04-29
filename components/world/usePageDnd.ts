import { useRef } from 'react';
import type { View } from 'react-native';
import type { WorldPage } from '@vaultstone/types';

export type DropPosition = 'before' | 'child' | 'after';

export function usePageDnd(
  _page: WorldPage,
  _depth: number,
  _maxDepth: number,
  _onDrop: (draggedPage: WorldPage, targetPage: WorldPage, position: DropPosition) => void,
  _getIsDescendant: (draggedId: string, targetId: string) => boolean,
) {
  return {
    ref: useRef<View>(null),
    isDragging: false,
    dropPosition: null as DropPosition | null,
    isOver: false,
  };
}
