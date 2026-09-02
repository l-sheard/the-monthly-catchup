/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        // Mirrors src/constants/theme.ts (Colors.light/dark) — keep both in
        // sync: paper/background, sand/backgroundElement, charcoal/text,
        // umber/dark-mode backgroundElement, primary/primary.
        primary: { DEFAULT: '#F2776A', dark: '#F58F84' },
        charcoal: '#1B3A33',
        sand: '#EFEFEC',
        'sand-line': '#C9C9C2',
        umber: '#16231F',
        paper: '#F9F3E7',
        'paper-line': '#EBE0C6',
      },
      fontFamily: {
        // Loaded via @expo-google-fonts/space-mono in app/_layout.tsx.
        // Two explicit families, not font-mono + font-bold: RN doesn't
        // synthesize bold for custom (non-variable) fonts on native, so a
        // Tailwind font-weight utility alone renders no heavier there —
        // headings/emphasis need the actual bold font file.
        mono: ['SpaceMono_400Regular', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
        'mono-bold': ['SpaceMono_700Bold', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
    },
  },
  plugins: [],
};
