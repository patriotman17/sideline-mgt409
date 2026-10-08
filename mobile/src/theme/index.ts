import palette from './palette.json';

/** Color tokens for places where Tailwind classes can't be used (icons, gradients, nav options). */
export const colors = palette;

export type ColorToken = keyof typeof palette;

/** Append an alpha channel to a #RRGGBB hex color. */
export function withAlpha(hex: string, alpha: number): string {
  const a = Math.round(Math.min(1, Math.max(0, alpha)) * 255)
    .toString(16)
    .padStart(2, '0');
  return `${hex}${a}`;
}

/** Mix a #RRGGBB color toward white (0 = unchanged, 1 = white). */
export function lighten(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1, 7), 16);
  const mix = (c: number) => Math.round(c + (255 - c) * amount);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(mix);
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}
