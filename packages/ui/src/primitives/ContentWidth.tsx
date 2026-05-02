// Caps the horizontal width of body content so reading-heavy pages don't
// stretch from edge to edge of a widescreen monitor. Editorial guidance is
// ~70 characters per line, which lands around 720–800px depending on font;
// form-heavy and grid layouts can go wider before becoming uncomfortable.
//
// Usage:
//   <ContentWidth>...</ContentWidth>            // 'reading' preset (default)
//   <ContentWidth size="wide">...</ContentWidth> // wider, for grids
//   <ContentWidth size="full">...</ContentWidth> // no cap, opt out per-region
//
// The wrapper centers itself with marginHorizontal: 'auto' on web; on native
// the same property collapses to 'auto' which RN treats as 0 — the
// alignSelf fallback handles native centering.

import type { ReactNode } from 'react';
import { View, type ViewStyle, type StyleProp } from 'react-native';

const PRESETS = {
  reading: 720,
  wide: 1080,
  full: undefined,
} as const;

export type ContentWidthSize = keyof typeof PRESETS;

type Props = {
  size?: ContentWidthSize;
  /** Custom max-width override; takes precedence over `size`. */
  maxWidth?: number;
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
};

export function ContentWidth({ size = 'reading', maxWidth, style, children }: Props) {
  const cap = maxWidth ?? PRESETS[size];
  if (cap == null) {
    // 'full' opt-out — render as a passthrough so callers can swap presets
    // without restructuring their tree.
    return <View style={style}>{children}</View>;
  }
  return (
    <View
      style={[
        {
          width: '100%',
          maxWidth: cap,
          alignSelf: 'center',
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}
