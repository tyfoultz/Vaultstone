import { useRef } from 'react';
import type { View } from 'react-native';
import type { Side } from '@vaultstone/store';

export type DropPos = 'before' | 'after';

export type TabDropInfo = {
  fromSide: Side;
  fromIndex: number;
  toSide: Side;
  toIndex: number;
  position: DropPos;
};

// Native stub — campaign split tabs aren't draggable outside of web.
export function useTabDnd(
  _side: Side,
  _index: number,
  _onDrop: (info: TabDropInfo) => void,
  _draggable: boolean = true,
) {
  return {
    ref: useRef<View>(null),
    isDragging: false,
    dropPosition: null as DropPos | null,
    isOver: false,
  };
}

export function useEmptySideDnd(
  _side: Side,
  _getEndIndex: () => number,
  _onDrop: (info: TabDropInfo) => void,
) {
  return {
    ref: useRef<View>(null),
    isOver: false,
  };
}
