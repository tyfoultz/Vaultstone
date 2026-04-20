import { forwardRef, useCallback, useImperativeHandle, useRef, type ReactNode } from 'react';
import { View } from 'react-native';
import { TransformWrapper, TransformComponent, type ReactZoomPanPinchRef } from 'react-zoom-pan-pinch';
import { GhostButton, colors, spacing } from '@vaultstone/ui';
import type { MapStackViewport } from '@vaultstone/store';

// Scale bounds and step shared with the ZoomControl bar. 8 linear steps
// from minScale → maxScale means each +/- button click changes scale by
// 0.375. Wheel step is sized so one typical mouse-wheel notch (deltaY≈100)
// produces the same 0.375 change — trackpads (small deltaY) still feel
// smooth because the library multiplies step × |deltaY| in smooth mode.
export const MIN_SCALE = 1;
export const MAX_SCALE = 4;
const SLIDER_STEP = (MAX_SCALE - MIN_SCALE) / 8;
const WHEEL_STEP = SLIDER_STEP / 100;

export type MapCanvasHandle = {
  zoomIn: () => void;
  zoomOut: () => void;
};

type Props = {
  imageUrl: string;
  imageWidth: number;
  imageHeight: number;
  initialViewport?: MapStackViewport;
  onViewportChange?: (v: MapStackViewport) => void;
  onCanvasClick?: (args: { xPct: number; yPct: number }) => void;
  onCanvasRightClick?: (args: { xPct: number; yPct: number }) => void;
  children?: ReactNode;
};

export const MapCanvas = forwardRef<MapCanvasHandle, Props>(function MapCanvas(
  {
    imageUrl,
    imageWidth,
    imageHeight,
    initialViewport,
    onViewportChange,
    onCanvasClick,
    onCanvasRightClick,
    children,
  },
  ref,
) {
  const transformRef = useRef<ReactZoomPanPinchRef | null>(null);

  useImperativeHandle(
    ref,
    () => ({
      zoomIn: () => transformRef.current?.zoomIn(SLIDER_STEP),
      zoomOut: () => transformRef.current?.zoomOut(SLIDER_STEP),
    }),
    [],
  );

  const handleTransform = useCallback(
    (_ref: ReactZoomPanPinchRef, state: { scale: number; positionX: number; positionY: number }) => {
      onViewportChange?.({
        scale: state.scale,
        translateX: state.positionX,
        translateY: state.positionY,
      });
    },
    [onViewportChange],
  );

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLImageElement>) => {
      if (!onCanvasClick) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const xPct = (e.clientX - rect.left) / rect.width;
      const yPct = (e.clientY - rect.top) / rect.height;
      if (xPct >= 0 && xPct <= 1 && yPct >= 0 && yPct <= 1) {
        onCanvasClick({ xPct, yPct });
      }
    },
    [onCanvasClick],
  );

  const handleContextMenu = useCallback(
    (e: React.MouseEvent<HTMLImageElement>) => {
      if (!onCanvasRightClick) return;
      e.preventDefault();
      const rect = e.currentTarget.getBoundingClientRect();
      const xPct = (e.clientX - rect.left) / rect.width;
      const yPct = (e.clientY - rect.top) / rect.height;
      if (xPct >= 0 && xPct <= 1 && yPct >= 0 && yPct <= 1) {
        onCanvasRightClick({ xPct, yPct });
      }
    },
    [onCanvasRightClick],
  );

  const pointerEventsMode: 'auto' | 'none' = onCanvasClick || onCanvasRightClick ? 'auto' : 'none';

  return (
    <View style={{ flex: 1, backgroundColor: colors.surfaceContainerLowest, position: 'relative' }}>
      <TransformWrapper
        ref={transformRef}
        initialScale={initialViewport?.scale ?? 1}
        initialPositionX={initialViewport?.translateX ?? 0}
        initialPositionY={initialViewport?.translateY ?? 0}
        minScale={MIN_SCALE}
        maxScale={MAX_SCALE}
        doubleClick={{ disabled: true }}
        wheel={{ step: WHEEL_STEP }}
        panning={{ velocityDisabled: true }}
        velocityAnimation={{ disabled: true }}
        onTransform={handleTransform}
        limitToBounds={false}
      >
        {({ resetTransform }) => (
          <>
            <div
              style={{
                position: 'absolute',
                top: spacing.md,
                right: spacing.md,
                zIndex: 2,
              }}
            >
              <GhostButton label="Reset view" onPress={() => resetTransform()} />
            </div>
            <TransformComponent
              wrapperStyle={{ width: '100%', height: '100%' }}
              contentStyle={{ width: imageWidth, height: imageHeight }}
            >
              <div style={{ position: 'relative', width: imageWidth, height: imageHeight }}>
                <img
                  src={imageUrl}
                  width={imageWidth}
                  height={imageHeight}
                  alt=""
                  draggable={false}
                  onClick={handleClick}
                  onContextMenu={handleContextMenu}
                  style={{ display: 'block', userSelect: 'none', pointerEvents: pointerEventsMode }}
                />
                {children}
              </div>
            </TransformComponent>
          </>
        )}
      </TransformWrapper>
    </View>
  );
});
