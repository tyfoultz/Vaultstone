/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,jsx,ts,tsx}',
    './packages/ui/src/**/*.{js,jsx,ts,tsx}',
  ],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        brand: '#534AB7',
        'hp-healthy': '#1D9E75',
        'hp-warning': '#EF9F27',
        'hp-danger': '#E24B4A',
        background: '#12110f',
        surface: '#0e0d0b',
        border: '#2e2b25',
        'text-primary': '#e8e0cc',
        'text-secondary': '#7a7568',
      },
      fontFamily: {
        display: ['Cinzel'],
        body: ['CrimsonPro'],
      },
    },
  },
  plugins: [],
};
