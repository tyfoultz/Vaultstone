// Vaultstone Noir — "Magical Midnight" design tokens.
// Palette, typography, and radius scale derived from the Stitch design system.
// Legacy keys (background, surface, border, textPrimary/Secondary, brand) are
// preserved as aliases to the new Noir values so existing StyleSheet-based
// screens pick up the new palette without code changes. New code should prefer
// the explicit token names below.

export const colors = {
  // Core surface tonal hierarchy (void-first).
  // NOTE: `surface` is the legacy "card/elevated" alias (mapped to Noir's
  // surfaceContainerHigh) so existing StyleSheets pop against the canvas.
  // For the explicit Noir canvas, use `background` or `surfaceCanvas`.
  surface: '#282a2c',
  surfaceCanvas: '#121416',
  surfaceContainerLowest: '#0c0e10',
  surfaceContainerLow: '#1a1c1e',
  surfaceContainer: '#1e2022',
  surfaceContainerHigh: '#282a2c',
  surfaceContainerHighest: '#333537',

  // Celestial accents.
  primary: '#d3bbff',
  primaryContainer: '#6d28d9',
  onPrimary: '#3f008d',
  onPrimaryContainer: '#dac5ff',

  secondary: '#adc6ff',
  secondaryContainer: '#0566d9',
  onSecondary: '#002e6a',
  onSecondaryContainer: '#e6ecff',

  tertiary: '#cebdff',
  tertiaryContainer: '#6144af',

  // Text.
  onSurface: '#e2e2e5',
  onSurfaceVariant: '#ccc3d7',
  outline: '#958da1',
  outlineVariant: '#4a4455',

  // Semantic state (preserved across the overhaul).
  hpHealthy: '#1D9E75',
  hpWarning: '#EF9F27',
  hpDanger: '#E24B4A',
  error: '#ffb4ab',
  errorContainer: '#93000a',

  // --- World-builder semantic accents (Phase 2; additive) ---
  // `primary` (Noir lavender above) remains the sole primary-action color.
  // These tokens drive template accents, visibility chips, and event tags.
  player: '#4ec8c0',
  onPlayer: '#062321',
  playerContainer: '#0b3c39',
  playerGlow: 'rgba(78, 200, 192, 0.18)',

  gm: '#e6a255',
  onGm: '#2b1708',
  gmContainer: '#4a2a10',
  gmGlow: 'rgba(230, 162, 85, 0.18)',

  cosmic: '#6b8af0',
  onCosmic: '#0b1232',
  cosmicContainer: '#142040',
  cosmicGlow: 'rgba(107, 138, 240, 0.18)',

  // danger reuses existing hpDanger (#E24B4A); provide onDanger for parity.
  onDanger: '#3a0a0a',
  dangerContainer: '#5a1212',
  dangerGlow: 'rgba(226, 75, 74, 0.18)',

  // --- Legacy aliases (mapped onto the Noir palette) ---
  // Existing screens reference these; they stay valid.
  background: '#121416',
  border: '#4a4455',
  textPrimary: '#e2e2e5',
  textSecondary: '#ccc3d7',
  brand: '#d3bbff',
} as const;

export const fonts = {
  // New names.
  headline: 'SpaceGrotesk',
  body: 'Manrope',
  label: 'Manrope',
  // Weight-specific Manrope handles used by existing StyleSheets.
  bodySemiBold: 'Manrope-SemiBold',
  bodyBold: 'Manrope-Bold',
  // Legacy aliases — mapped to the new editorial pair so existing fontFamily
  // references render with the new fonts instead of Cinzel / Crimson Pro.
  display: 'SpaceGrotesk',
} as const;

export const typography = {
  displayLg: 60,
  displayMd: 48,
  displaySm: 36,
  headlineLg: 32,
  headlineMd: 28,
  headlineSm: 24,
  titleLg: 20,
  titleMd: 18,
  titleSm: 16,
  bodyLg: 18,
  bodyMd: 16,
  bodySm: 14,
  labelLg: 14,
  labelMd: 12,
  labelSm: 10,
} as const;

export const radius = {
  DEFAULT: 2,
  lg: 4,
  xl: 8,
  full: 12,
  pill: 9999,
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  '2xl': 48,
  '3xl': 64,
} as const;

export const tracking = {
  tight: -0.5,
  normal: 0,
  wide: 0.5,
  wider: 1.5,
  widest: 2.5,
} as const;
