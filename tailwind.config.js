/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,jsx,ts,tsx}',
    './components/**/*.{js,jsx,ts,tsx}',
    './packages/ui/src/**/*.{js,jsx,ts,tsx}',
  ],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        // Surface tonal hierarchy.
        surface: '#121416',
        'surface-container-lowest': '#0c0e10',
        'surface-container-low': '#1a1c1e',
        'surface-container': '#1e2022',
        'surface-container-high': '#282a2c',
        'surface-container-highest': '#333537',

        // Accents.
        primary: '#d3bbff',
        'primary-container': '#6d28d9',
        'on-primary': '#3f008d',
        'on-primary-container': '#dac5ff',

        secondary: '#adc6ff',
        'secondary-container': '#0566d9',
        'on-secondary': '#002e6a',
        'on-secondary-container': '#e6ecff',

        tertiary: '#cebdff',
        'tertiary-container': '#6144af',

        // Text.
        'on-surface': '#e2e2e5',
        'on-surface-variant': '#ccc3d7',
        outline: '#958da1',
        'outline-variant': '#4a4455',

        // Semantic state.
        'hp-healthy': '#1D9E75',
        'hp-warning': '#EF9F27',
        'hp-danger': '#E24B4A',
        error: '#ffb4ab',
        'error-container': '#93000a',

        // Legacy aliases (Noir values).
        background: '#121416',
        border: '#4a4455',
        'text-primary': '#e2e2e5',
        'text-secondary': '#ccc3d7',
        brand: '#d3bbff',
      },
      fontFamily: {
        headline: ['SpaceGrotesk'],
        body: ['Manrope'],
        label: ['Manrope'],
        // Legacy.
        display: ['SpaceGrotesk'],
      },
      borderRadius: {
        DEFAULT: '0.125rem',
        lg: '0.25rem',
        xl: '0.5rem',
        full: '0.75rem',
        pill: '9999px',
      },
      letterSpacing: {
        tighter: '-0.05em',
        tight: '-0.025em',
        normal: '0',
        wide: '0.025em',
        wider: '0.05em',
        widest: '0.15em',
      },
    },
  },
  plugins: [],
};
