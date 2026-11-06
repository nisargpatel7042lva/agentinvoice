// Letter-by-letter reveal (Halden spec): each character goes invisible → blurred ghost → accent → final colour.

export type RGB = [number, number, number];

export function hexToRgb(hex: string): RGB {
  const h = hex.trim().replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const n = parseInt(full.slice(0, 6), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
export const smooth = (v: number) => {
  const t = clamp01(v);
  return t * t * (3 - 2 * t);
};
const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

export interface RevealColors {
  ghost: RGB;
  accent: RGB;
  final: RGB;
  /** Final colour for characters inside a highlight span. */
  highlight: RGB;
}

/** Paints every [data-ch] span inside `root` for overall progress p (0..1). */
export function paint(root: HTMLElement | null, p: number, spread: number, c: RevealColors) {
  if (!root) return;
  const chars = root.querySelectorAll<HTMLElement>("[data-ch]");
  const n = chars.length || 1;
  chars.forEach((el, i) => {
    const t = clamp01((p * (1 + spread) - i / n) / spread);
    let rgb: RGB;
    let opacity = 1;
    let blur = 0;
    if (t < 0.35) {
      const k = t / 0.35;
      opacity = k;
      blur = 8 - 6.5 * k;
      rgb = c.ghost;
    } else if (t < 0.7) {
      const k = (t - 0.35) / 0.35;
      blur = 1.5 * (1 - k);
      rgb = mix(c.ghost, c.accent, k);
    } else {
      const k = (t - 0.7) / 0.3;
      rgb = mix(c.accent, el.dataset.hl ? c.highlight : c.final, k);
    }
    el.style.color = `rgba(${rgb[0] | 0},${rgb[1] | 0},${rgb[2] | 0},${opacity.toFixed(3)})`;
    el.style.filter = blur > 0.05 ? `blur(${blur.toFixed(2)}px)` : "none";
  });
}
