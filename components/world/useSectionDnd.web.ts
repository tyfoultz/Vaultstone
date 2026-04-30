import { useRef } from 'react';
import { useDrag, useDrop } from 'react-dnd';
import type { WorldSection } from '@vaultstone/types';

export type SectionDragItem = {
  type: 'SIDEBAR_SECTION';
  section: WorldSection;
};

type DropPos = 'before' | 'after';

type UseSectionDndResult = {
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

export function useSectionDnd(
  section: WorldSection,
  onDrop: (dragged: WorldSection, target: WorldSection, position: DropPos) => void,
): UseSectionDndResult {
  const ref = useRef<HTMLDivElement>(null);

  const [{ isDragging }, dragRef] = useDrag<SectionDragItem, void, { isDragging: boolean }>({
    type: 'SIDEBAR_SECTION',
    item: { type: 'SIDEBAR_SECTION', section },
    collect: (monitor) => ({ isDragging: monitor.isDragging() }),
  });

  const [{ isOver, dropPosition }, dropRef] = useDrop<
    SectionDragItem,
    void,
    { isOver: boolean; dropPosition: DropPos | null }
  >({
    accept: 'SIDEBAR_SECTION',
    canDrop: (item) => item.section.id !== section.id,
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
      onDrop(item.section, section, pos);
    },
  });

  dragRef(dropRef(ref));

  return { ref, isDragging, dropPosition, isOver };
}
