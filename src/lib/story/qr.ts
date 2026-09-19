/**
 * The Between — the one place a QR code is drawn.
 *
 * Both artefacts that carry a way back (the story's closing beat and the
 * keepsake PNG) render their code through here, so they can never disagree
 * about size, polarity or quiet zone.
 *
 * Three decisions are load-bearing, and all three are about a code being
 * *actually scannable* off a phone screen playing a compressed video:
 *
 *   · **Normal polarity.** Dark modules on a light plate. Inverted codes are
 *     prettier against this sky and a good half of scanners will read them —
 *     but only a good half. The plate is the site's cream (`#F0E8E0`), not
 *     white, so it reads as a small card held up to the twilight rather than a
 *     browser chrome artefact.
 *   · **Integer module pixels.** The tile is sized to a whole number of pixels
 *     per module, so no module ever lands on a half-pixel and blurs through
 *     H.264. The tile's real size is therefore *near* the requested size, not
 *     exactly it — callers lay out from `canvas.width`.
 *   · **A full 4-module quiet zone**, which the spec requires and which
 *     scanners genuinely need. The plate's rounded corners stay well inside it,
 *     so a corner radius can never nibble a finder pattern.
 *
 * `QRCode.create` is synchronous (unlike `toBuffer`), which is what lets a
 * segment factory — which must be sync — build its own code.
 */

import { createCanvas, type Canvas, type SKRSContext2D } from '@napi-rs/canvas';
import QRCode from 'qrcode';

export interface QrTileOptions {
  /** Desired tile width in px, including the quiet zone. Rounded down to a
   *  whole number of module pixels. */
  size: number;
  /** Quiet-zone width, in modules. The spec's minimum is 4. */
  quiet?: number;
  /** Module colour. */
  dark?: string;
  /** Plate colour. */
  light?: string;
  errorCorrectionLevel?: 'L' | 'M' | 'Q' | 'H';
}

export interface QrTile {
  canvas: Canvas;
  /** Actual tile width/height in px (a whole number of modules). */
  px: number;
  /** Pixels per module — the number that decides whether a camera can resolve
   *  the code at all. */
  modulePx: number;
  /** Modules across the code itself, quiet zone excluded. */
  modules: number;
}

const PLATE = '#F0E8E0';
const INK = '#100B1E';

/** A rounded rectangle path — `roundRect` is not on every canvas build. */
export function roundedRectPath(
  ctx: SKRSContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/**
 * Renders `url` as an opaque, scannable tile on its own canvas.
 *
 * Opaque on purpose: a code composited onto a moving sky at partial alpha is a
 * code nobody can scan. The caller fades the whole tile in and then holds it
 * perfectly still.
 */
export function renderQrTile(url: string, opts: QrTileOptions): QrTile {
  const quiet = opts.quiet ?? 4;
  const qr = QRCode.create(url, {
    errorCorrectionLevel: opts.errorCorrectionLevel ?? 'Q',
  });
  const modules = qr.modules.size;
  const across = modules + quiet * 2;
  const modulePx = Math.max(1, Math.floor(opts.size / across));
  const px = modulePx * across;

  const canvas = createCanvas(px, px);
  const ctx = canvas.getContext('2d');

  // The plate. Its radius stays inside the quiet zone, so rounding can never
  // clip a finder pattern.
  ctx.fillStyle = opts.light ?? PLATE;
  roundedRectPath(ctx, 0, 0, px, px, Math.min(modulePx * (quiet - 1), px / 2));
  ctx.fill();

  ctx.fillStyle = opts.dark ?? INK;
  const data = qr.modules.data;
  for (let row = 0; row < modules; row++) {
    for (let col = 0; col < modules; col++) {
      if (!data[row * modules + col]) continue;
      ctx.fillRect(
        (quiet + col) * modulePx,
        (quiet + row) * modulePx,
        modulePx,
        modulePx,
      );
    }
  }

  return { canvas, px, modulePx, modules };
}
