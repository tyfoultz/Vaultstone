import { forwardRef, useCallback, useImperativeHandle, useRef, type ReactNode } from 'react';
import { View } from 'react-native';
import { TransformWrapper, TransformComponent, type ReactZoomPanPinchRef } from 'react-zoom-pan-pinch';
import { GhostButton, colors, spacing } from '@vaultstone/ui';
import type { MapStackViewport } from '@vaultstone/store';

export type MapCanvasHandle = {
  zoomIn: () => void;
  zoomOut: () => void;
};

type Props = {
  imageUrl: string;
  imageWidth: number;
  imageHeight: number;
  // Scale bounds for this map. Route computes fit-scale from canvas
  // dimensions so the whole map is visible at the default view, and
  // passes fitScale (minScale + initialScale) and fitScale * 4 (maxScale).
  minScale: number;
  maxScale: number;
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
    minScale,
    maxScale,
    initialViewport,
    onViewportChange,
    onCanvasClick,
    onCanvasRightClick,
    children,
  },
  ref,
) {
  const transformRef = useRef<ReactZoomPanPinchRef | null>(null);

  // 8 linear steps between min and max. setTransform (not zoomIn/Out)
  // so each click is an EVEN scale delta — zoomIn/Out uses scale*exp(step)
  // in smooth mode, which bunches levels at the high end.
  const sliderStep = (maxScale - minScale) / 8;
  // Mouse wheel: one notch (deltaY ≈ 100) = one slider step. Trackpads
  // (small deltaY) stay smooth because the library multiplies step × |deltaY|.
  const wheelStep = sliderStep / 100;

  const zoomBy = useCallback(
    (delta: number) => {
      const t = transformRef.current;
      if (!t) return;
      const { scale, positionX, positionY } = t.state;
      const next = Math.max(minScale, Math.min(maxScale, scale + delta));
      if (next === scale) return;
      t.setTransform(positionX, positionY, next, 150);
    },
    [minScale, maxScale],
  );

  useImperativeHandle(
    ref,
    () => ({
      zoomIn: () => zoomBy(sliderStep),
      zoomOut: () => zoomBy(-sliderStep),
    }),
    [zoomBy, sliderStep],
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

  const initialScale = initialViewport?.scale ?? minScale;
  const initialX = initialViewport?.translateX ?? 0;
  const initialY = initialViewport?.translateY ?? 0;

  return (
    <View style={{ flex: 1, backgroundColor: colors.surfaceContainerLowest, position: 'relative' }}>
      <TransformWrapper
        ref={transformRef}
        initialScale={initialScale}
        initialPositionX={initialX}
        initialPositionY={initialY}
        minScale={minScale}
        maxScale={maxScale}
        centerOnInit
        doubleClick={{ disabled: true }}
        wheel={{ step: wheelStep }}
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
