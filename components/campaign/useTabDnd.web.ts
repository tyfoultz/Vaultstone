// Horizontal drag-to-reorder for the campaign split-tab row. Tabs
// carry their `side` in the drag payload so they can be dropped onto
// either side of the strip; the drop target reports the hovered side
// + index + position (before/after) and the consumer translates that
// into a moveSplitTab call. Web only; native ships a no-op stub.

import { useRef } from 'react';
import { useDrag, useDrop } from 'react-dnd';
import type { Side } from '@vaultstone/store';

export const TAB_DND_TYPE = 'campaign-split-tab';

export type TabDragItem = {
  type: typeof TAB_DND_TYPE;
  fromSide: Side;
  fromIndex: number;
};

export type DropPos = 'before' | 'after';

export type TabDropInfo = {
  fromSide: Side;
  fromIndex: number;
  toSide: Side;
  toIndex: number;
  position: DropPos;
};

type UseTabDndResult = {
  ref: React.RefObject<HTMLDivElement | null>;
  isDragging: boolean;
  dropPosition: DropPos | null;
  isOver: boolean;
};

function getDropPos(
  monitor: { getClientOffset: () => { x: number; y: number } | null },
  element: HTMLDivElement,
): DropPos {
  const offset = monitor.getClientOffset();
  if (!offset) return 'after';
  const rect = element.getBoundingClientRect();
  const x = offset.x - rect.left;
  return x < rect.width / 2 ? 'before' : 'after';
}

export function useTabDnd(
  side: Side,
  index: number,
  onDrop: (info: TabDropInfo) => void,
  /** When false, dragging this tab is disabled (e.g. some pinned
   *  tabs may opt out). Default true. */
  draggable: boolean = true,
): UseTabDndResult {
  const ref = useRef<HTMLDivElement>(null);

  const [{ isDragging }, dragRef] = useDrag<TabDragItem, void, { isDragging: boolean }>({
    type: TAB_DND_TYPE,
    item: { type: TAB_DND_TYPE, fromSide: side, fromIndex: index },
    canDrag: () => draggable,
    collect: (monitor) => ({ isDragging: monitor.isDragging() }),
  });

  const [{ isOver, dropPosition }, dropRef] = useDrop<
    TabDragItem,
    void,
    { isOver: boolean; dropPosition: DropPos | null }
  >({
    accept: TAB_DND_TYPE,
    canDrop: (item) => !(item.fromSide === side && item.fromIndex === index),
    collect: (monitor) => {
      if (!monitor.isOver({ shallow: true }) || !monitor.canDrop()) {
        return { isOver: false, dropPosition: null };
      }
      const el = ref.current;
      if (!el) return { isOver: true, dropPosition: 'after' };
      return {
        isOver: true,
        dropPosition: getDropPos(
          monitor as unknown as Parameters<typeof getDropPos>[0],
          el,
        ),
      };
    },
    drop: (item, monitor) => {
      if (!monitor.isOver({ shallow: true })) return;
      const el = ref.current;
      if (!el) return;
      const pos = getDropPos(
        monitor as unknown as Parameters<typeof getDropPos>[0],
        el,
      );
      onDrop({
        fromSide: item.fromSide,
        fromIndex: item.fromIndex,
        toSide: side,
        toIndex: index,
        position: pos,
      });
    },
  });

  dragRef(dropRef(ref));

  return { ref, isDragging, dropPosition, isOver };
}

/**
 * Trailing drop zone for a tab group. Always rendered (so it can
 * accept drops even when the side has tabs), positioned after the
 * last tab. The `getEndIndex` callback returns the destination
 * side's current length so the drop lands at the end of the list
 * — and when the source is on the same side, the hook caller is
 * responsible for the standard index-adjustment.
 */
export function useEmptySideDnd(
  side: Side,
  getEndIndex: () => number,
  onDrop: (info: TabDropInfo) => void,
): {
  ref: React.RefObject<HTMLDivElement | null>;
  isOver: boolean;
} {
  const ref = useRef<HTMLDivElement>(null);
  const [{ isOver }, dropRef] = useDrop<TabDragItem, void, { isOver: boolean }>({
    accept: TAB_DND_TYPE,
    canDrop: (item) => {
      // Allow same-side drops only when the source is not already the
      // last tab — otherwise dropping in the trailing zone is a no-op.
      if (item.fromSide !== side) return true;
      return item.fromIndex !== getEndIndex() - 1;
    },
    collect: (monitor) => ({
      isOver: monitor.isOver({ shallow: true }) && monitor.canDrop(),
    }),
    drop: (item) => {
      onDrop({
        fromSide: item.fromSide,
        fromIndex: item.fromIndex,
        toSide: side,
        toIndex: getEndIndex(),
        position: 'before',
      });
    },
  });
  dropRef(ref);
  return { ref, isOver };
}
