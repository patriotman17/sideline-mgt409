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
