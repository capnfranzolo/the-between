/**
 * The Between — server-side font registration for the story compositor.
 *
 * @napi-rs/canvas has no system font fallback we can rely on inside a
 * container, so the two sacred faces (`src/lib/btw.ts`: Cormorant Garamond +
 * Inter) are registered from the `@fontsource/*` packages that ship in
 * node_modules. Each face gets its OWN family alias rather than relying on
 * napi-rs style matching — asking for `italic 60px 'Cormorant Garamond'` is
 * matcher-dependent, whereas `60px 'BTW Cormorant Italic'` is exact.
 *
 * Registration happens once at module load. If a face is missing the module
 * does NOT throw: `fontsReady()` reports the truth so callers can decide, and
 * the composer degrades to the generic serif/sans rather than 500ing a share.
 */

import { GlobalFonts } from '@napi-rs/canvas';
import path from 'node:path';
import fs from 'node:fs';

/** Family aliases — use these verbatim in `ctx.font`. */
export const FONT = {
  /** Cormorant Garamond 400 italic — the voice of the piece (answers, questions). */
  serifItalic: 'BTW Cormorant Italic',
  /** Cormorant Garamond 400 roman. */
  serif: 'BTW Cormorant',
  /** Cormorant Garamond 500 roman — headings that need a touch more body. */
  serifMedium: 'BTW Cormorant Medium',
  /** Inter 300 — the whisper-quiet UI voice (urls, eyebrows). */
  sansLight: 'BTW Inter Light',
  /** Inter 400. */
  sans: 'BTW Inter',
} as const;

type FaceKey = keyof typeof FONT;

const FACES: Record<FaceKey, string> = {
  serifItalic: '@fontsource/cormorant-garamond/files/cormorant-garamond-latin-400-italic.woff2',
  serif: '@fontsource/cormorant-garamond/files/cormorant-garamond-latin-400-normal.woff2',
  serifMedium: '@fontsource/cormorant-garamond/files/cormorant-garamond-latin-500-normal.woff2',
  sansLight: '@fontsource/inter/files/inter-latin-300-normal.woff2',
  sans: '@fontsource/inter/files/inter-latin-400-normal.woff2',
};

/** Generic fallbacks, used only if a face fails to register. */
const FALLBACK: Record<FaceKey, string> = {
  serifItalic: 'serif',
  serif: 'serif',
  serifMedium: 'serif',
  sansLight: 'sans-serif',
  sans: 'sans-serif',
};

let registered: Record<FaceKey, boolean> | null = null;

function nodeModulesRoot(): string {
  // `process.cwd()` is the Next.js project root in dev, in `next start`, and in
  // a standalone container build. Resolve from there rather than from a bundled
  // `__dirname`, which Turbopack rewrites.
  return path.join(process.cwd(), 'node_modules');
}

function registerAll(): Record<FaceKey, boolean> {
  const root = nodeModulesRoot();
  const out = {} as Record<FaceKey, boolean>;
  for (const key of Object.keys(FACES) as FaceKey[]) {
    const file = path.join(root, FACES[key]);
    try {
      out[key] = fs.existsSync(file) && Boolean(GlobalFonts.registerFromPath(file, FONT[key]));
    } catch (err) {
      console.error(`[story/fonts] failed to register ${key} from ${file}:`, err);
      out[key] = false;
    }
    if (!out[key]) console.error(`[story/fonts] MISSING FACE ${key} → ${file}`);
  }
  return out;
}

/** Idempotent; safe to call from every entry point. */
export function ensureFonts(): Record<FaceKey, boolean> {
  if (!registered) registered = registerAll();
  return registered;
}

/** True only when every face registered — the composer's non-tofu guarantee. */
export function fontsReady(): boolean {
  const r = ensureFonts();
  return (Object.keys(r) as FaceKey[]).every(k => r[k]);
}

/**
 * Builds a `ctx.font` string for a registered face, falling back to the
 * generic family if that face did not register.
 *
 *   ctx.font = font('serifItalic', 64);
 */
export function font(face: FaceKey, sizePx: number): string {
  const r = ensureFonts();
  const family = r[face] ? `"${FONT[face]}"` : FALLBACK[face];
  return `${sizePx}px ${family}`;
}

// Register eagerly so a broken install surfaces at import time, in the logs,
// rather than as tofu in a shared video.
ensureFonts();
