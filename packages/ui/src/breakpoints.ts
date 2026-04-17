import { useWindowDimensions } from 'react-native';

export const BREAKPOINTS = {
  sm: 560,
  md: 768,
  lg: 900,
  xl: 1280,
} as const;

export type BreakpointKey = keyof typeof BREAKPOINTS;

export type BreakpointState = {
  width: number;
  isMobile: boolean;
  isTablet: boolean;
  isDesktop: boolean;
  isWide: boolean;
  tier: 'xs' | BreakpointKey;
};

export function useBreakpoint(): BreakpointState {
  const { width } = useWindowDimensions();
  const isMobile = width < BREAKPOINTS.md;
  const isTablet = width >= BREAKPOINTS.md && width < BREAKPOINTS.lg;
  const isDesktop = width >= BREAKPOINTS.lg && width < BREAKPOINTS.xl;
  const isWide = width >= BREAKPOINTS.xl;

  let tier: BreakpointState['tier'] = 'xs';
  if (width >= BREAKPOINTS.xl) tier = 'xl';
  else if (width >= BREAKPOINTS.lg) tier = 'lg';
  else if (width >= BREAKPOINTS.md) tier = 'md';
  else if (width >= BREAKPOINTS.sm) tier = 'sm';

  return { width, isMobile, isTablet, isDesktop, isWide, tier };
}
