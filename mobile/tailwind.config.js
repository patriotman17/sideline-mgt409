// Design tokens live in src/theme/palette.json so TS code (icons, gradients)
// and Tailwind classes share a single source of truth.
const palette = require('./src/theme/palette.json');

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,jsx,ts,tsx}'],
  // Sideline is dark-only; 'class' avoids NativeWind's web media-query color-scheme listener.
  darkMode: 'class',
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: palette,
      // Condensed display face for scores, clocks and stats (loaded in src/app/_layout.tsx).
      // Custom fonts carry their own weight — don't combine with font-bold etc.
      fontFamily: {
        score: ['BarlowCondensed_800ExtraBold'],
        'score-bold': ['BarlowCondensed_700Bold'],
        cond: ['BarlowCondensed_600SemiBold'],
      },
      borderRadius: {
        xl: '14px',
        '2xl': '18px',
        '3xl': '24px',
      },
      // Web only (used with the `web:` variant): sheet-style entrance for game/replay screens.
      keyframes: {
        'sheet-in': {
          '0%': { transform: 'translateY(48px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
      },
      animation: {
        'sheet-in': 'sheet-in 320ms cubic-bezier(0.2, 0.8, 0.2, 1) both',
      },
    },
  },
  plugins: [],
};
