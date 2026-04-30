import { useRef } from 'react';
import type { View } from 'react-native';
import type { WorldMap } from '@vaultstone/api';

type DropPos = 'before' | 'after';

export function useMapDnd(
  _map: WorldMap,
  _onDrop: (dragged: WorldMap, target: WorldMap, position: DropPos) => void,
) {
  return {
    ref: useRef<View>(null),
    isDragging: false,
    dropPosition: null as DropPos | null,
    isOver: false,
  };
}
