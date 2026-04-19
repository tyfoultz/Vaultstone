import { useCallback, useRef, type ReactNode } from 'react';
import { View } from 'react-native';
import { TransformWrapper, TransformComponent, type ReactZoomPanPinchRef } from 'react-zoom-pan-pinch';
import { GhostButton, colors, spacing } from '@vaultstone/ui';
import type { MapStackViewport } from '@vaultstone/store';

type Props = {
  imageUrl: string;
  imageWidth: number;
  imageHeight: number;
  initialViewport?: MapStackViewport;
  onViewportChange?: (v: MapStackViewport) => void;
  onCanvasClick?: (args: { xPct: number; yPct: number }) => void;
  children?: ReactNode;
};

// Pan/zoom map canvas (web). The TransformWrapper applies a CSS transform
// to the inner content box; PinLayer lives inside that box so pin positions
// move with the image naturally.
export function MapCanvas({
  imageUrl,
  imageWidth,
  imageHeight,
  initialViewport,
  onViewportChange,
  onCanvasClick,
  children,
}: Props) {
  const ref = useRef<ReactZoomPanPinchRef | null>(null);

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

  return (
    <View style={{ flex: 1, backgroundColor: colors.surfaceContainerLowest, position: 'relative' }}>
      <TransformWrapper
        ref={ref}
        initialScale={initialViewport?.scale ?? 1}
        initialPositionX={initialViewport?.translateX ?? 0}
        initialPositionY={initialViewport?.translateY ?? 0}
        minScale={0.5}
        maxScale={4}
        doubleClick={{ step: 0.7 }}
        wheel={{ step: 0.2 }}
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
                  style={{ display: 'block', userSelect: 'none', pointerEvents: onCanvasClick ? 'auto' : 'none' }}
                />
                {children}
              </div>
            </TransformComponent>
          </>
        )}
      </TransformWrapper>
    </View>
  );
}
