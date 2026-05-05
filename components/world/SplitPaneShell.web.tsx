import { useCallback, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSplitPaneStore } from '@vaultstone/store';
import { colors } from '@vaultstone/ui';

type Props = {
  primaryContent: React.ReactNode;
  splitContent: React.ReactNode;
};

export function SplitPaneShell({ primaryContent, splitContent }: Props) {
  const splitRatio = useSplitPaneStore((s) => s.splitRatio);
  const setSplitRatio = useSplitPaneStore((s) => s.setSplitRatio);
  const setFocusedPane = useSplitPaneStore((s) => s.setFocusedPane);
  const [dragging, setDragging] = useState(false);
  const [hovered, setHovered] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      setDragging(true);

      const onMouseMove = (ev: MouseEvent) => {
        if (!containerRef.current) return;
        const rect = containerRef.current.getBoundingClientRect();
        const ratio = (ev.clientX - rect.left) / rect.width;
        setSplitRatio(ratio);
      };

      const onMouseUp = () => {
        setDragging(false);
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      };

      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    },
    [setSplitRatio],
  );

  return (
    <div
      ref={containerRef}
      style={{ display: 'flex', flexDirection: 'row', flex: 1, minHeight: 0 }}
    >
      <div
        style={{ width: `${splitRatio * 100}%`, display: 'flex', minWidth: 0 }}
        onPointerDown={() => setFocusedPane('primary')}
      >
        {primaryContent}
      </div>

      <div
        onMouseDown={handleMouseDown}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          width: 6,
          cursor: 'col-resize',
          backgroundColor: dragging || hovered
            ? colors.primary + '55'
            : colors.outlineVariant + '22',
          position: 'relative',
          flexShrink: 0,
          transition: dragging ? 'none' : 'background-color 0.15s',
        }}
      >
        <div
          style={{
            position: 'absolute',
            left: 2,
            top: 0,
            bottom: 0,
            width: 2,
            backgroundColor: dragging || hovered
              ? colors.primary
              : 'transparent',
            transition: dragging ? 'none' : 'background-color 0.15s',
          }}
        />
      </div>

      <div
        style={{ flex: 1, display: 'flex', minWidth: 0 }}
        onPointerDown={() => setFocusedPane('split')}
      >
        {splitContent}
      </div>
    </div>
  );
}
