export const BTW = {
  sky: ['#1E1840', '#3D2D65', '#7B5088', '#9A6080'] as const,
  horizon: ['#B87878', '#D09070', '#E0A868', '#F0C080'] as const,
  terrain: ['#5A3860', '#3E2046', '#261432'] as const,
  textPri: '#F0E8E0',
  textSec: '#C8B0E0',
  textDim: 'rgba(240, 232, 224, 0.55)',
  warmth: [
    '#7DB7D4',
    '#9AA8E0',
    '#B894D8',
    '#D49AC0',
    '#E8A890',
    '#F0B878',
    '#F5C868',
  ] as const,
};

export const SERIF = `'Cormorant Garamond', 'Playfair Display', Georgia, 'Times New Roman', serif`;
export const SANS = `'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif`;

export function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return function () {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = t;
    r = Math.imul(r ^ (r >>> 15), r | 1);
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashString(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function warmthColor(w: number): string {
  const i = Math.max(0, Math.min(BTW.warmth.length - 1, Math.round(w * (BTW.warmth.length - 1))));
  return BTW.warmth[i];
}

export function withAlpha(hex: string, a: number): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${a})`;
}
