import { useRef } from 'react';
import { useDrag, useDrop } from 'react-dnd';
import type { WorldPage } from '@vaultstone/types';

export type DropPosition = 'before' | 'child' | 'after';

export type PageDragItem = {
  type: 'SIDEBAR_PAGE';
  page: WorldPage;
  depth: number;
};

type UsePageDndResult = {
  ref: React.RefObject<HTMLDivElement | null>;
  isDragging: boolean;
  dropPosition: DropPosition | null;
  isOver: boolean;
};

function getDropPosition(
  monitor: { getClientOffset: () => { x: number; y: number } | null },
  element: HTMLDivElement,
): DropPosition {
  const offset = monitor.getClientOffset();
  if (!offset) return 'child';
  const rect = element.getBoundingClientRect();
  const y = offset.y - rect.top;
  const height = rect.height;
  if (y < height * 0.25) return 'before';
  if (y > height * 0.75) return 'after';
  return 'child';
}

export function usePageDnd(
  page: WorldPage,
  depth: number,
  maxDepth: number,
  onDrop: (draggedPage: WorldPage, targetPage: WorldPage, position: DropPosition) => void,
  getIsDescendant: (draggedId: string, targetId: string) => boolean,
): UsePageDndResult {
  const ref = useRef<HTMLDivElement>(null);

  const [{ isDragging }, dragRef] = useDrag<PageDragItem, void, { isDragging: boolean }>({
    type: 'SIDEBAR_PAGE',
    item: { type: 'SIDEBAR_PAGE', page, depth },
    collect: (monitor) => ({
      isDragging: monitor.isDragging(),
    }),
  });

  const [{ isOver, dropPosition }, dropRef] = useDrop<
    PageDragItem,
    void,
    { isOver: boolean; dropPosition: DropPosition | null }
  >({
    accept: 'SIDEBAR_PAGE',
    canDrop: (item) => {
      if (item.page.id === page.id) return false;
      if (getIsDescendant(item.page.id, page.id)) return false;
      return true;
    },
    hover: () => {},
    collect: (monitor) => {
      if (!monitor.isOver({ shallow: true }) || !monitor.canDrop()) {
        return { isOver: false, dropPosition: null };
      }
      const el = ref.current;
      if (!el) return { isOver: true, dropPosition: 'child' };
      const pos = getDropPosition(monitor as unknown as Parameters<typeof getDropPosition>[0], el);
      if (pos === 'child' && depth >= maxDepth) {
        return { isOver: true, dropPosition: 'after' };
      }
      return { isOver: true, dropPosition: pos };
    },
    drop: (item, monitor) => {
      if (!monitor.isOver({ shallow: true })) return;
      const el = ref.current;
      if (!el) return;
      let pos = getDropPosition(monitor as unknown as Parameters<typeof getDropPosition>[0], el);
      if (pos === 'child' && depth >= maxDepth) pos = 'after';
      onDrop(item.page, page, pos);
    },
  });

  dragRef(dropRef(ref));

  return { ref, isDragging, dropPosition, isOver };
}
