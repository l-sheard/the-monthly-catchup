/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        // Mirrors src/constants/theme.ts — keep both in sync.
        primary: { DEFAULT: '#FF6B4A', dark: '#FF8266' },
        cream: '#FFFBF7',
        charcoal: '#181310',
        sand: '#F5EFE8',
        umber: '#252019',
      },
    },
  },
  plugins: [],
};
