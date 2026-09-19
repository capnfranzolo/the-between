/**
 * The Between — pre-rendered background layers for the story compositor.
 *
 * The sky gradient and the background star field are identical in every frame
 * of a segment, and each costs more to draw than the star itself. They are
 * rasterised once per segment and composited as images thereafter — the single
 * biggest lever on encode time (see the benchmark in the Stage C report).
 *
 * Nothing here invents a new look: the gradient stops come straight from
 * `getAtmosphere(questionId).skyStops` (the same per-question sky the cosmos
 * dome uses), read bottom-up so offset 0 sits on the horizon.
 */

import { createCanvas, type Canvas, type SKRSContext2D } from '@napi-rs/canvas';
import { getAtmosphere, type AtmosphereConfig } from '../atmosphere';
import { mulberry32, hashString } from '../btw';
import { createSpirograph, type SpiroDimensions } from '../spirograph/renderer';

export const STORY_W = 1080;
export const STORY_H = 1920;

/**
 * The question's atmosphere as a vertical gradient: horizon (skyStops offset 0)
 * at the bottom of the frame, zenith black at the top.
 */
export function skyGradient(
  ctx: SKRSContext2D,
  atm: AtmosphereConfig,
  w: number,
  h: number,
): CanvasGradient {
  const g = ctx.createLinearGradient(0, h, 0, 0);
  for (const s of atm.skyStops) g.addColorStop(Math.max(0, Math.min(1, s.offset)), s.color);
  return g;
}

/**
 * Sky + background star field, rasterised once.
 *
 * `seed` keeps the field stable for a given star, so re-encoding the same story
 * (a cache bust, a reel regeneration) produces the same sky rather than a
 * subtly different one.
 */
export function renderSkyLayer(
  questionId: string | null | undefined,
  seed: string,
  w = STORY_W,
  h = STORY_H,
): Canvas {
  const atm = getAtmosphere(questionId);
  const canvas = createCanvas(w, h);
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = skyGradient(ctx, atm, w, h);
  ctx.fillRect(0, 0, w, h);

  // Star field — dense at the zenith, thinning toward the lit horizon where it
  // would be washed out anyway. Same density/floor dials the cosmos dome uses.
  const rand = mulberry32(hashString(`sky:${seed}`));
  const count = Math.round(520 * atm.starDensity);
  for (let i = 0; i < count; i++) {
    const x = rand() * w;
    // Bias toward the zenith (y = 0): u^1.7 crowds samples near the top.
    const y = h * Math.pow(rand(), 1.7);
    // …and fade what lands low, where the lit horizon would wash it out anyway.
    const wash = Math.pow(1 - y / h, 1.1);
    const a = (0.2 + rand() * 0.55) * atm.starFloor * wash;
    if (a < 0.02) continue;
    const r = 0.5 + rand() * 1.5;
    ctx.fillStyle = `rgba(255,252,246,${a.toFixed(3)})`;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // A breath of horizon glow so the bottom third doesn't read as a flat band.
  const glow = ctx.createRadialGradient(w * 0.5, h * 1.02, 0, w * 0.5, h * 1.02, w * 0.9);
  const [gr, gg, gb] = atm.cloudTint.split(',').map(n => parseInt(n, 10));
  glow.addColorStop(0, `rgba(${gr},${gg},${gb},${0.20 * atm.terrainGlow + 0.05})`);
  glow.addColorStop(1, `rgba(${gr},${gg},${gb},0)`);
  // Fill the whole frame: clipping the gradient to the lower half leaves a
  // visible seam where it stops, and it is already transparent up top.
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, w, h);

  // Vignette is baked in rather than drawn per frame: it never changes, and a
  // full-frame radial fill costs as much as the whole sky blit.
  drawVignette(ctx, w, h);

  return canvas;
}

/**
 * The renderer's curve radius is fixed in *logical* units (CONFIG.outerRadius ×
 * camera zoom, plus tilt), so a star is roughly this many logical pixels across
 * no matter what canvas it is handed. Scaling a star therefore means changing
 * `dpr`, not `size` — passing a small `size` just crops the drawing, which is
 * what produced hard square edges on the first pass at neighbour stars.
 */
export const STAR_LOGICAL_DIAMETER = 450;
/** Logical canvas the renderer draws into; comfortably clears the widest
 *  archetype dressings (saturn rings, satellite motes) at any dpr. */
export const STAR_LOGICAL_BOX = 620;

/** Where the star's centre lands inside a canvas rendered at `dpr`. */
export function starCentreInCanvas(dpr: number): { x: number; y: number; px: number } {
  return {
    x: (STAR_LOGICAL_BOX / 2) * dpr,
    // renderFrame offsets the camera down by CONFIG.camera.yOffset (30).
    y: (STAR_LOGICAL_BOX / 2 + 30) * dpr,
    px: Math.round(STAR_LOGICAL_BOX * dpr),
  };
}

/**
 * Renders a star to its own canvas, scaled so the star itself is about
 * `targetDiameter` pixels across. Used for the neighbour stars that drift into
 * frame: re-rendering five live spirographs every frame would double the encode
 * budget for something the viewer reads as a distant glimmer.
 *
 * The rim is feathered so a dressing that reaches past the box never shows a
 * square edge.
 */
export function renderMiniStar(
  dims: SpiroDimensions,
  targetDiameter: number,
  t = 3.0,
  opts: { feather?: boolean } = {},
): Canvas {
  const dpr = targetDiameter / STAR_LOGICAL_DIAMETER;
  const px = Math.round(STAR_LOGICAL_BOX * dpr);
  const canvas = createCanvas(px, px);
  // The browser renderer assigns canvas.style.{width,height}; @napi-rs/canvas
  // has no style object (same patch as server-render.ts).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (canvas as any).style = { width: `${px}px`, height: `${px}px` };
  const spiro = createSpirograph(canvas as unknown as HTMLCanvasElement, dims, {
    size: STAR_LOGICAL_BOX,
    dpr,
  });
  spiro.renderStatic(t);

  if (opts.feather !== false) {
    // The star's own body reaches ~0.36 of the box; the ring below only catches
    // a dressing that overshoots, so the star itself is never dimmed.
    const ctx = canvas.getContext('2d');
    ctx.globalCompositeOperation = 'destination-out';
    const feather = ctx.createRadialGradient(px / 2, px / 2, px * 0.42, px / 2, px / 2, px * 0.5);
    feather.addColorStop(0, 'rgba(0,0,0,0)');
    feather.addColorStop(1, 'rgba(0,0,0,1)');
    ctx.fillStyle = feather;
    ctx.fillRect(0, 0, px, px);
    ctx.globalCompositeOperation = 'source-over';
  }
  return canvas;
}

/** Vignette that keeps the eye in the centre column. Baked into the sky layer;
 *  a full-frame radial fill costs about as much as the sky blit itself. */
export function drawVignette(ctx: SKRSContext2D, w: number, h: number, strength = 0.35): void {
  const g = ctx.createRadialGradient(w / 2, h * 0.46, h * 0.22, w / 2, h * 0.46, h * 0.72);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, `rgba(4,2,14,${strength})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}
