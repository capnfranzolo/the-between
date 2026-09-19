/**
 * The Between — typography helpers for the story compositor.
 *
 * Long answers are truncated and size-scaled the way `api/og/[shortcode]` does,
 * so a shared video and a shared link preview never disagree about what a star
 * "says". The numbers differ because the canvas is 1080 wide portrait rather
 * than 2400 wide landscape — the rule is the same: never overflow, never let a
 * three-word answer swim in a tiny face.
 */

import type { SKRSContext2D } from '@napi-rs/canvas';
import { font } from './fonts';

/** Hard ceiling on answer length in the vertical frame. */
export const ANSWER_MAX_CHARS = 190;

export function truncate(text: string, max: number): string {
  const t = text.trim();
  if (t.length <= max) return t;
  // Prefer a word boundary so the ellipsis doesn't land mid-word.
  const cut = t.slice(0, max);
  const space = cut.lastIndexOf(' ');
  return (space > max * 0.6 ? cut.slice(0, space) : cut).trimEnd() + '…';
}

/** Answer face size for the 1080-wide vertical frame. Mirrors the OG ladder. */
export function answerFontSize(text: string): number {
  if (text.length <= 40) return 76;
  if (text.length <= 70) return 66;
  if (text.length <= 110) return 58;
  if (text.length <= 150) return 50;
  return 44;
}

/** Greedy word wrap against a measured max width. */
export function wrapText(
  ctx: SKRSContext2D,
  text: string,
  maxWidth: number,
): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    const candidate = line ? `${line} ${w}` : w;
    if (line && ctx.measureText(candidate).width > maxWidth) {
      lines.push(line);
      line = w;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines;
}

export interface TextBlock {
  lines: string[];
  fontSize: number;
  lineHeight: number;
  /** ctx.font string for this block. */
  fontSpec: string;
}

/**
 * Lays out a block, stepping the face down until it fits `maxLines`. Generous
 * negative space is the point of this frame, so overflowing is never the answer.
 */
export function layoutBlock(
  ctx: SKRSContext2D,
  text: string,
  opts: {
    face: 'serifItalic' | 'serif' | 'serifMedium' | 'sans' | 'sansLight';
    size: number;
    maxWidth: number;
    maxLines: number;
    lineHeightFactor?: number;
    minSize?: number;
  },
): TextBlock {
  const lhf = opts.lineHeightFactor ?? 1.34;
  let size = opts.size;
  const min = opts.minSize ?? Math.round(opts.size * 0.6);
  let lines: string[] = [];
  for (;;) {
    ctx.font = font(opts.face, size);
    lines = wrapText(ctx, text, opts.maxWidth);
    if (lines.length <= opts.maxLines || size <= min) break;
    size -= 2;
  }
  if (lines.length > opts.maxLines) {
    lines = lines.slice(0, opts.maxLines);
    lines[lines.length - 1] = lines[lines.length - 1].replace(/[\s,;:.]+$/, '') + '…';
  }
  return { lines, fontSize: size, lineHeight: Math.round(size * lhf), fontSpec: font(opts.face, size) };
}

export function blockHeight(b: TextBlock): number {
  return b.lines.length * b.lineHeight;
}
