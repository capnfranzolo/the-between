/**
 * The Between — "the star draws itself".
 *
 * The story video reveals a star by drawing its *actual* curve, progressively,
 * rather than fading in a finished picture. To do that we need the curve in
 * screen space — but `renderer.ts` keeps `evalPoint`/`project`/`computeGeometry`
 * private, and it is not ours to change. Re-deriving the math here would mean
 * two copies of the geometry that could silently drift apart.
 *
 * So instead of reading the math, we *watch the renderer draw*. `createSpirograph`
 * takes a canvas and calls `canvas.getContext('2d')`; we hand it a canvas-shaped
 * object whose context is a recorder — every path command is captured, nothing
 * is rasterised. The longest recorded path is the ghost trace: `CONFIG.ghostSteps`
 * (800) segments walked in strict theta order from 0 to `totalTheta`. That
 * polyline *is* the curve, projected by the renderer's own camera.
 *
 * One wrinkle: the renderer only draws the ghost when `certainty > 0.7`. Since
 * `evalPoint` never reads `certainty` (it only scales tail length, fade and
 * stroke weight), we capture with `certainty: 1` and get the identical geometry.
 * `certainty` does cross one other threshold — the `comet` archetype dressing —
 * but dressings are drawn separately and we discard everything except the
 * longest path. Family resolution (which could swap in a standalone form that
 * skips the ghost entirely) ignores `certainty` altogether.
 */

import type { SKRSContext2D } from '@napi-rs/canvas';
import { createSpirograph, CONFIG, type SpiroDimensions } from '../spirograph/renderer';

export interface CurvePoint {
  /** Quadratic control point (the renderer's previous raw sample). */
  cx: number;
  cy: number;
  /** Segment endpoint (the midpoint between two raw samples). */
  x: number;
  y: number;
}

/** A captured curve in the star canvas's logical coordinate space. */
export interface CurvePath {
  points: CurvePoint[];
  /** Logical size the path was captured at (points are in 0..size). */
  size: number;
  /** Distance from the star's centre to its furthest point, in logical units.
   *  Curve families differ wildly in extent — a rose is a third the reach of an
   *  epitrochoid — so a frame that wants every star to *read* has to know this. */
  extent: number;
}

// ── The recorder ──────────────────────────────────────────────────────────────
// A closed, explicit stand-in for the slice of CanvasRenderingContext2D that
// src/lib/spirograph/* actually touches (verified by grep over that directory).
// No Proxy: @napi-rs native methods misbehave through a forwarding proxy, and a
// silent no-op for an unexpected member would hide a renderer change rather
// than surfacing it.

class GradientStub {
  addColorStop(): void {}
}

class PathRecorder {
  paths: CurvePoint[][] = [];
  private current: CurvePoint[] | null = null;
  private pen = { x: 0, y: 0 };

  // Style + state sinks — assigned by the renderer, never read back.
  fillStyle: unknown = '';
  strokeStyle: unknown = '';
  lineWidth = 1;
  lineCap = 'butt';
  lineJoin = 'miter';
  globalAlpha = 1;
  globalCompositeOperation = 'source-over';

  beginPath(): void {
    this.current = [];
    this.paths.push(this.current);
  }
  moveTo(x: number, y: number): void {
    this.pen = { x, y };
    this.current?.push({ cx: x, cy: y, x, y });
  }
  lineTo(x: number, y: number): void {
    this.current?.push({ cx: this.pen.x, cy: this.pen.y, x, y });
    this.pen = { x, y };
  }
  quadraticCurveTo(cx: number, cy: number, x: number, y: number): void {
    this.current?.push({ cx, cy, x, y });
    this.pen = { x, y };
  }
  closePath(): void {}
  arc(): void {}
  ellipse(): void {}
  stroke(): void {}
  fill(): void {}
  fillRect(): void {}
  clearRect(): void {}
  save(): void {}
  restore(): void {}
  translate(): void {}
  setTransform(): void {}
  createLinearGradient(): GradientStub {
    return new GradientStub();
  }
  createRadialGradient(): GradientStub {
    return new GradientStub();
  }
}

/**
 * Replays the renderer's drawing of `dims` without rasterising anything and
 * returns the star's full curve as a screen-space polyline.
 *
 * Returns `null` for stars whose family resolves to a standalone form
 * (`proposals.ts`) — those never draw a ghost trace, so there is no curve to
 * capture and the composer falls back to a bloom-in reveal.
 */
export function captureCurvePath(
  dims: SpiroDimensions,
  size: number,
  cameraTime: number,
): CurvePath | null {
  const rec = new PathRecorder();
  const fakeCanvas = {
    width: size,
    height: size,
    style: { width: `${size}px`, height: `${size}px` },
    getContext: () => rec,
  };

  try {
    const spiro = createSpirograph(
      fakeCanvas as unknown as HTMLCanvasElement,
      // `certainty: 1` forces the ghost trace on; the curve itself is unchanged.
      { ...dims, certainty: 1 },
      { size, dpr: 1 },
    );
    spiro.renderStatic(cameraTime);
  } catch (err) {
    console.error('[story/curve] capture failed:', err);
    return null;
  }

  // The ghost is the only path with ~800 vertices; archetype dressings and
  // firefly tail segments are an order of magnitude shorter.
  let best: CurvePoint[] = [];
  for (const p of rec.paths) if (p.length > best.length) best = p;

  const MIN_POINTS = Math.floor(CONFIG.ghostSteps * 0.5);
  if (best.length < MIN_POINTS) return null;

  // The renderer centres the camera at (size/2, size/2 + yOffset).
  const cx = size / 2;
  const cy = size / 2 + CONFIG.camera.yOffset;
  let extent = 0;
  for (const p of best) {
    const d = Math.hypot(p.x - cx, p.y - cy);
    if (d > extent) extent = d;
  }

  return { points: best, size, extent };
}

/** The extent a "typical" star reaches — the outer radius through the camera's
 *  zoom, which is what the cosmos and the OG image are framed around. */
export const REFERENCE_EXTENT = CONFIG.outerRadius * CONFIG.camera.zoom;

/**
 * How much to scale a star so it holds the frame like any other.
 *
 * A rose curve genuinely reaches a third as far as an epitrochoid; at a fixed
 * scale it would sit lost in the middle of a 9:16 frame for eight seconds. The
 * correction is deliberately gentle and clamped — a compact thought should still
 * *look* compact, just not invisible.
 */
export function fitScale(path: CurvePath | null): number {
  if (!path || path.extent <= 1) return 1;
  return Math.max(0.85, Math.min(1.55, REFERENCE_EXTENT / path.extent));
}

/**
 * Strokes the first `progress` (0..1) of a captured curve, using the renderer's
 * own midpoint-quadratic smoothing so the revealed line matches the finished
 * star's silhouette exactly.
 *
 * The caller owns transform, colour and width; this only builds the path.
 */
export function tracePartial(
  ctx: SKRSContext2D,
  path: CurvePath,
  progress: number,
): { x: number; y: number } | null {
  const pts = path.points;
  const last = Math.max(0, Math.min(pts.length - 1, Math.floor(progress * (pts.length - 1))));
  if (last < 1) return null;

  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i <= last; i++) {
    const p = pts[i];
    ctx.quadraticCurveTo(p.cx, p.cy, p.x, p.y);
  }

  // Carry the pen the fractional remainder of the next segment so the tip moves
  // smoothly at 30fps instead of snapping point to point.
  const frac = progress * (pts.length - 1) - last;
  const head = { x: pts[last].x, y: pts[last].y };
  if (frac > 0 && last + 1 < pts.length) {
    const n = pts[last + 1];
    head.x = pts[last].x + (n.x - pts[last].x) * frac;
    head.y = pts[last].y + (n.y - pts[last].y) * frac;
    ctx.lineTo(head.x, head.y);
  }
  return head;
}
