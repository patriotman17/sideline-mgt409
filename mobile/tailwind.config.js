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
      borderRadius: {
        xl: '14px',
        '2xl': '18px',
        '3xl': '24px',
      },
    },
  },
  plugins: [],
};
