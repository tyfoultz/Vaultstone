import { useRef } from 'react';
import { useDrag, useDrop } from 'react-dnd';
import type { WorldMap } from '@vaultstone/api';

export type MapDragItem = {
  type: 'SIDEBAR_MAP';
  map: WorldMap;
};

type DropPos = 'before' | 'after';

type UseMapDndResult = {
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
  const y = offset.y - rect.top;
  return y < rect.height / 2 ? 'before' : 'after';
}

export function useMapDnd(
  map: WorldMap,
  onDrop: (dragged: WorldMap, target: WorldMap, position: DropPos) => void,
): UseMapDndResult {
  const ref = useRef<HTMLDivElement>(null);

  const [{ isDragging }, dragRef] = useDrag<MapDragItem, void, { isDragging: boolean }>({
    type: 'SIDEBAR_MAP',
    item: { type: 'SIDEBAR_MAP', map },
    collect: (monitor) => ({ isDragging: monitor.isDragging() }),
  });

  const [{ isOver, dropPosition }, dropRef] = useDrop<
    MapDragItem,
    void,
    { isOver: boolean; dropPosition: DropPos | null }
  >({
    accept: 'SIDEBAR_MAP',
    canDrop: (item) => item.map.id !== map.id,
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
      onDrop(item.map, map, pos);
    },
  });

  dragRef(dropRef(ref));

  return { ref, isDragging, dropPosition, isOver };
}
