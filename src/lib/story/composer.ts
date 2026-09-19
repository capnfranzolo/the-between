/**
 * The Between — the 9:16 storyboard compositor.
 *
 * A *segment* is a self-contained unit of time that knows how to draw itself at
 * any local time t: `{ duration, draw(ctx, t) }`. The single-star story, the
 * static poster, the keepsake and (Stage F) the weekly reel are all built from
 * segments, so there is exactly one place where this piece decides what it
 * looks like.
 *
 * Building a segment is the expensive half — sky and star field are rasterised,
 * the star's curve is captured, text is wrapped and measured. `draw()` is then
 * cheap enough to run 240 times inside an ffmpeg pipe (~22 ms/frame at
 * 1080×1920; see `encode.ts`).
 *
 * ── The single-star story (`storySegment`, 10.2 s) ──
 *
 * Revision 1 turned the story inside out. It used to open on the star and
 * close on the question, which buried the question — the one thing that makes
 * a stranger's answer mean anything — under eight seconds of spirograph. It now
 * opens on the question and closes on a way in:
 *
 *   0.0 – 3.6   THE QUESTION, large, while the sky builds out of darkness
 *               behind it; it recedes as…
 *   3.0 – 8.4   …THE STAR draws itself and the answer rises. The answer is the
 *               emotional centre and gets the longest hold.
 *   7.8 – 10.2  THE WAY IN: a scannable QR for this star's URL, the short URL
 *               in plain text, and the site's name kept to a whisper.
 *
 * The three beats are `questionOpening`, `starSegment` and `qrCard`, joined by
 * `sequence()` with a 0.6 s crossfade. Every beat draws the *same* sky (same
 * question atmosphere, same seeded star field), so the crossfades read as one
 * continuous frame rather than three cards.
 *
 * ── The star beat alone (`starSegment`) ──
 *
 * Still a self-contained unit, and still what the weekly reel sequences between
 * its own intro and outro cards. Its timeline, in seconds of an 8 s beat
 * (shorter beats keep the proportions):
 *
 *   0.0 – 1.2   darkness; the question's sky and its star field breathe in
 *               (`skyIn: false` when a preceding beat already raised that sky)
 *   1.0 – 3.5   the star draws itself — its real curve, traced progressively
 *   2.6 – 4.0   the living star (fireflies, archetype) crossfades over the trace
 *   2.5 – 6.0   the answer rises line by line in Cormorant italic, then holds
 *   4.5 – 6.5   real neighbour stars from the same question drift faintly in
 *   6.4 – 8.0   thebetween.world · the question as an invitation ·
 *               "A new question opens every week." (`close: false` in the
 *               story, which ends on the QR instead)
 *
 * Nothing here is a button, a logo or a call to action. Branding is a whisper.
 * The QR is the one exception, and it is a door, not an advertisement.
 */

import { createCanvas, type Canvas, type SKRSContext2D } from '@napi-rs/canvas';
import { createSpirograph, EMOTIONS, type SpiroDimensions } from '../spirograph/renderer';
import { getAtmosphere } from '../atmosphere';
import { BTW, mulberry32, hashString } from '../btw';
import { SITE_URL } from '../constants';
import { font } from './fonts';
import { captureCurvePath, fitScale, tracePartial, type CurvePath } from './curve';
import { defaultOrigin, originHost, starUrlOn } from './origin';
import { renderQrTile } from './qr';
import {
  STORY_W, STORY_H, renderSkyLayer, renderMiniStar, skyGradient,
  starCentreInCanvas, STAR_LOGICAL_BOX, STAR_LOGICAL_DIAMETER,
} from './layers';
import {
  ANSWER_MAX_CHARS, answerFontSize, layoutBlock, truncate, type TextBlock,
} from './text';

export { STORY_W, STORY_H };

/** Default length of the star beat on its own, in seconds. The whole timeline
 *  is authored against this number; a shorter beat scales proportionally. */
export const STAR_SEGMENT_SECONDS = 8;
/** Default intro/outro card length for the weekly reel. */
export const CARD_SECONDS = 4;

// ── The single-star story's three beats ───────────────────────────────────────
/** The question, alone, while the sky builds. */
export const STORY_OPEN_SECONDS = 3.6;
/** The star and the answer — the longest beat, and the point of the piece. */
export const STORY_STAR_SECONDS = 5.4;
/** The QR and the short URL. Held perfectly still so it can be scanned. */
export const STORY_QR_SECONDS = 2.4;
/** Seam length between beats. */
export const STORY_CROSSFADE = 0.6;
/** The whole single-star story, in seconds. */
export const STORY_SECONDS =
  STORY_OPEN_SECONDS + STORY_STAR_SECONDS + STORY_QR_SECONDS - 2 * STORY_CROSSFADE;

/** Camera time the star is frozen at while it draws itself. Matches the OG
 *  route's `renderStatic(3.0)`, so a poster and an unfurl show the same pose. */
const STAR_CAM_T = 3.0;

// ── Geometry ──────────────────────────────────────────────────────────────────
/** How wide the star itself should read in the 1080-wide frame — just over half,
 *  so it is unmistakably the subject without crowding the answer. */
const STAR_DIAMETER = 560;
const STAR_DPR = STAR_DIAMETER / STAR_LOGICAL_DIAMETER;
const STAR_BOX = starCentreInCanvas(STAR_DPR);
const STAR_CENTRE_Y = 640;
const MARGIN = 96;
const CONTENT_W = STORY_W - MARGIN * 2;

// ── Types ─────────────────────────────────────────────────────────────────────

export interface Segment {
  readonly duration: number;
  /** Draws the segment at local time `t` (seconds, 0..duration). */
  draw(ctx: SKRSContext2D, t: number): void;
}

export interface StoryStar {
  shortcode: string;
  answer: string;
  uniqueFact?: string | null;
  dimensions: SpiroDimensions;
}

export interface StoryNeighbour {
  shortcode: string;
  dimensions: SpiroDimensions;
}

export interface StoryInput {
  star: StoryStar;
  questionText: string;
  questionId: string | null;
  /** Real stars from the same question. Up to 5 are used. */
  neighbours: StoryNeighbour[];
}

// ── Easing ────────────────────────────────────────────────────────────────────

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
/** Linear ramp from a→b mapped to 0..1. */
const ramp = (t: number, a: number, b: number) => clamp01((t - a) / (b - a || 1));
const easeOut = (p: number) => 1 - Math.pow(1 - p, 3);
const easeInOut = (p: number) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);

// ── Shared drawing helpers ────────────────────────────────────────────────────

/** A measuring context, so layout can happen before any frame exists. */
function scratchCtx(): SKRSContext2D {
  return createCanvas(STORY_W, 64).getContext('2d');
}

/** The star's own offscreen — the renderer sizes and clears it per frame. */
function makeSpiro(canvas: Canvas, dims: SpiroDimensions) {
  return createSpirograph(canvas as unknown as HTMLCanvasElement, dims, {
    size: STAR_LOGICAL_BOX,
    dpr: STAR_DPR,
  });
}

/**
 * The transform that maps the renderer's logical star space onto the frame,
 * at a given settle scale. The trace and the live star share it, so the drawn
 * line and the star it becomes sit in exactly the same place.
 */
function starPlacement(settle: number) {
  const scale = STAR_DPR * settle;
  return {
    scale,
    dx: STORY_W / 2 - (STAR_LOGICAL_BOX / 2) * scale,
    dy: STAR_CENTRE_Y - (STAR_LOGICAL_BOX / 2 + 30) * scale,
    dest: STAR_BOX.px * settle,
  };
}

function rgbaOf(rgb: readonly [number, number, number], a: number): string {
  return `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${a.toFixed(3)})`;
}

function creamAlpha(a: number): string {
  // BTW.textPri #F0E8E0
  return `rgba(240,232,224,${a.toFixed(3)})`;
}

/** Draws text with extra tracking — the quiet, spaced voice the site uses for
 *  its few sans-serif lines. */
function drawTracked(
  ctx: SKRSContext2D,
  text: string,
  x: number,
  y: number,
  tracking: number,
): void {
  const prev = ctx.letterSpacing;
  ctx.letterSpacing = `${tracking}px`;
  ctx.fillText(text, x, y);
  ctx.letterSpacing = prev;
}

function drawBlock(
  ctx: SKRSContext2D,
  block: TextBlock,
  centreX: number,
  topY: number,
  colour: (lineIndex: number) => string,
  opts: { perLineAlpha?: (i: number) => number; perLineRise?: (i: number) => number } = {},
): void {
  ctx.font = block.fontSpec;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  block.lines.forEach((line, i) => {
    const a = opts.perLineAlpha ? opts.perLineAlpha(i) : 1;
    if (a <= 0.004) return;
    const rise = opts.perLineRise ? opts.perLineRise(i) : 0;
    ctx.fillStyle = colour(i);
    ctx.globalAlpha = a;
    ctx.fillText(line, centreX, topY + i * block.lineHeight + block.fontSize + rise);
    ctx.globalAlpha = 1;
  });
}

// ── The star's reveal ─────────────────────────────────────────────────────────

/**
 * Strokes the captured curve up to `progress`, with a hot recent trail and a
 * firefly-bright tip — the pen that is drawing the star.
 *
 * Falls back to nothing when the star has no capturable curve (standalone
 * family forms); `starSegment` then blooms the live render in instead.
 */
function drawTrace(
  ctx: SKRSContext2D,
  path: CurvePath,
  progress: number,
  rgb: readonly [number, number, number],
  alpha: number,
  scale: number,
): void {
  if (alpha <= 0.004 || progress <= 0) return;
  const place = starPlacement(scale);

  ctx.save();
  // Curve points are in the renderer's logical space — the same space the live
  // star is drawn in, so one transform serves both.
  ctx.translate(place.dx, place.dy);
  ctx.scale(place.scale, place.scale);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // Settled line: everything already drawn, quiet.
  ctx.strokeStyle = rgbaOf(rgb, 0.16 * alpha);
  ctx.lineWidth = 1.1;
  const head = tracePartial(ctx, path, progress);
  ctx.stroke();

  // The last stretch still glows — a comet's tail behind the pen.
  const n = path.points.length - 1;
  const tailLen = Math.min(0.09, progress) * n;
  const CHUNKS = 7;
  for (let c = 0; c < CHUNKS; c++) {
    const p0 = (progress * n - tailLen * (1 - c / CHUNKS)) / n;
    const p1 = (progress * n - tailLen * (1 - (c + 1) / CHUNKS)) / n;
    if (p1 <= 0) continue;
    const heat = (c + 1) / CHUNKS;
    ctx.beginPath();
    const from = Math.max(1, Math.floor(p0 * n));
    const to = Math.max(1, Math.floor(p1 * n));
    if (to <= from) continue;
    ctx.moveTo(path.points[from].x, path.points[from].y);
    for (let i = from + 1; i <= to; i++) {
      const pt = path.points[i];
      ctx.quadraticCurveTo(pt.cx, pt.cy, pt.x, pt.y);
    }
    ctx.strokeStyle = rgbaOf(rgb, 0.10 + 0.55 * Math.pow(heat, 2) * alpha);
    ctx.lineWidth = 1.1 + heat * 1.4;
    ctx.stroke();
  }

  // The pen itself.
  if (head && progress < 0.999) {
    const glowR = 26;
    const g = ctx.createRadialGradient(head.x, head.y, 0, head.x, head.y, glowR);
    g.addColorStop(0, rgbaOf(rgb, 0.55 * alpha));
    g.addColorStop(0.35, rgbaOf(rgb, 0.22 * alpha));
    g.addColorStop(1, rgbaOf(rgb, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(head.x, head.y, glowR, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = creamAlpha(0.8 * alpha);
    ctx.beginPath();
    ctx.arc(head.x, head.y, 2.6, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

// ── Neighbour stars ───────────────────────────────────────────────────────────

interface NeighbourSprite {
  canvas: Canvas;
  x: number;
  y: number;
  size: number;
  phase: number;
  driftX: number;
  driftY: number;
  alpha: number;
}

function buildNeighbours(input: StoryInput): NeighbourSprite[] {
  const rand = mulberry32(hashString(`neighbours:${input.star.shortcode}`));
  const picked = input.neighbours.slice(0, 5);
  // Centres, in frame fractions. They keep clear of the star (centre column,
  // upper third) and of the answer, and stay far enough from the edges that a
  // drifting sprite never touches one.
  const anchors: Array<[number, number]> = [
    [0.16, 0.115], [0.84, 0.175], [0.115, 0.375], [0.885, 0.335], [0.30, 0.50],
  ];
  return picked.map((n, i) => {
    // Distant glimmers, not co-stars: a fifth to a third of the hero's size.
    const diameter = Math.round(96 + rand() * 54);
    const canvas = renderMiniStar(n.dimensions, diameter, 2.2 + rand() * 2);
    const [ax, ay] = anchors[i % anchors.length];
    // Drift is added at draw time, so keep a margin wide enough that a sprite
    // can never reach an edge and show a cut silhouette.
    const pad = 34;
    const clampX = (v: number) => Math.max(pad, Math.min(STORY_W - canvas.width - pad, v));
    const clampY = (v: number) => Math.max(pad, Math.min(STORY_H - canvas.height - pad, v));
    return {
      canvas,
      x: clampX(STORY_W * ax - canvas.width / 2),
      y: clampY(STORY_H * ay - canvas.height / 2),
      size: canvas.width,
      phase: rand() * Math.PI * 2,
      driftX: (rand() - 0.5) * 22,
      driftY: -8 - rand() * 14,
      alpha: 0.17 + rand() * 0.11,
    };
  });
}

function drawNeighbours(
  ctx: SKRSContext2D,
  sprites: NeighbourSprite[],
  appear: number,
  t: number,
): void {
  if (appear <= 0.004) return;
  for (const s of sprites) {
    const bob = Math.sin(t * 0.55 + s.phase) * 4;
    ctx.globalAlpha = s.alpha * appear;
    ctx.drawImage(
      s.canvas,
      s.x + s.driftX * appear,
      s.y + s.driftY * appear + bob,
    );
  }
  ctx.globalAlpha = 1;
}

// ══════════════════════════════════════════════════════════════════════════════
// THE STAR SEGMENT
// ══════════════════════════════════════════════════════════════════════════════

export interface StarSegmentOptions {
  duration?: number;
  /**
   * Fade the sky up from black over the first beat (default). Set false when a
   * preceding segment has already raised the *same* sky — the story's question
   * opening does, and a second fade-from-black there would read as a stutter.
   */
  skyIn?: boolean;
  /**
   * Draw the quiet tail — the question as an invitation, thebetween.world, and
   * the weekly line (default). The single-star story ends on the QR card
   * instead, and sets this false.
   */
  close?: boolean;
  /** Let the neighbour stars drift in (default). */
  neighbours?: boolean;
}

export function starSegment(
  input: StoryInput,
  opts: StarSegmentOptions = {},
): Segment {
  const duration = opts.duration ?? STAR_SEGMENT_SECONDS;
  const wantSkyIn = opts.skyIn ?? true;
  const wantClose = opts.close ?? true;
  const wantNeighbours = opts.neighbours ?? true;
  // The timeline is authored against 8 s; a reel's shorter star beats keep the
  // same proportions rather than truncating the ending.
  const k = duration / STAR_SEGMENT_SECONDS;
  const at = (s: number) => s * k;

  const dims: SpiroDimensions = { ...input.star.dimensions, seed: input.star.shortcode };
  const rgb = (EMOTIONS[dims.emotionIndex]?.rgb ?? [240, 232, 224]) as [number, number, number];

  const sky = renderSkyLayer(input.questionId, input.star.shortcode);
  const curve = captureCurvePath(dims, STAR_LOGICAL_BOX, STAR_CAM_T);
  // Curve families differ hugely in reach; normalise so every star holds the
  // frame (clamped, so a compact thought still reads as compact).
  const fit = fitScale(curve);
  const neighbours = wantNeighbours ? buildNeighbours(input) : [];

  // The live star gets one offscreen, re-rendered per frame.
  const starCanvas = createCanvas(STAR_BOX.px, STAR_BOX.px);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (starCanvas as any).style = { width: `${STAR_BOX.px}px`, height: `${STAR_BOX.px}px` };
  const spiro = makeSpiro(starCanvas, dims);

  // ── Text, laid out once ──
  const m = scratchCtx();
  const answerText = truncate(input.star.answer ?? '', ANSWER_MAX_CHARS);
  const answer = layoutBlock(m, `“${answerText}”`, {
    face: 'serifItalic',
    size: answerFontSize(answerText),
    maxWidth: CONTENT_W,
    maxLines: 5,
    lineHeightFactor: 1.36,
    minSize: 40,
  });
  const byline = input.star.uniqueFact
    ? layoutBlock(m, `— ${input.star.uniqueFact}`, {
        face: 'sansLight', size: 28, maxWidth: CONTENT_W, maxLines: 1, minSize: 22,
      })
    : null;
  const question = layoutBlock(m, input.questionText, {
    face: 'serifItalic', size: 38, maxWidth: CONTENT_W - 60, maxLines: 3, lineHeightFactor: 1.4, minSize: 30,
  });

  const ANSWER_TOP = 1090;
  const answerBottom = ANSWER_TOP + answer.lines.length * answer.lineHeight + (byline ? 62 : 0);
  // The closing block is bottom-anchored so it reads the same whatever the
  // answer's height turned out to be.
  const CLOSE_BOTTOM = STORY_H - 150;
  const closeHeight = question.lines.length * question.lineHeight + 150;
  const closeTop = Math.max(answerBottom + 80, CLOSE_BOTTOM - closeHeight);

  return {
    duration,
    draw(ctx, t) {
      ctx.save();
      ctx.textBaseline = 'alphabetic';

      // 1 ── darkness, then the question's sky breathes in
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, STORY_W, STORY_H);
      const skyIn = wantSkyIn ? easeInOut(ramp(t, 0, at(1.35))) : 1;
      ctx.globalAlpha = skyIn;
      ctx.drawImage(sky, 0, 0);
      ctx.globalAlpha = 1;

      // 2 ── the star draws itself, then comes alive
      const drawP = easeInOut(ramp(t, at(1.0), at(3.5)));
      const settle = fit * (0.955 + 0.045 * easeOut(ramp(t, at(1.0), at(4.0))));
      const liveIn = easeInOut(ramp(t, at(2.6), at(4.0)));
      // The trace is captured at a frozen camera, so it must be gone before the
      // live star has rotated far enough for the two to read as doubled.
      const traceOut = 1 - easeInOut(ramp(t, at(3.9), at(5.0)));

      if (curve) {
        drawTrace(ctx, curve, drawP, rgb, traceOut, settle);
      }

      // Star time: frozen at the capture pose while it draws, then living.
      const starT = t <= at(3.5) ? STAR_CAM_T : STAR_CAM_T + (t - at(3.5));
      const liveAlpha = curve ? liveIn : easeInOut(ramp(t, at(1.0), at(3.2)));
      if (liveAlpha > 0.004) {
        spiro.renderStatic(starT);
        const place = starPlacement(settle);
        ctx.globalAlpha = liveAlpha;
        ctx.drawImage(starCanvas, place.dx, place.dy, place.dest, place.dest);
        ctx.globalAlpha = 1;
      }

      // 3 ── neighbours drift in from the same question's sky
      drawNeighbours(ctx, neighbours, easeInOut(ramp(t, at(4.5), at(6.5))), t);

      // 4 ── the answer rises, line by line, and holds
      drawBlock(ctx, answer, STORY_W / 2, ANSWER_TOP, () => BTW.textPri, {
        perLineAlpha: i => easeOut(ramp(t, at(2.5 + i * 0.22), at(3.5 + i * 0.22))),
        perLineRise: i => (1 - easeOut(ramp(t, at(2.5 + i * 0.22), at(3.5 + i * 0.22)))) * 26,
      });
      if (byline) {
        drawBlock(
          ctx, byline, STORY_W / 2,
          ANSWER_TOP + answer.lines.length * answer.lineHeight + 20,
          () => 'rgba(240,232,224,0.52)',
          { perLineAlpha: () => easeOut(ramp(t, at(3.6), at(4.6))) * 0.9 },
        );
      }

      // 5 ── the quiet close
      const closeIn = wantClose ? easeInOut(ramp(t, at(6.4), at(7.4))) : 0;
      if (closeIn > 0.004) {
        drawBlock(ctx, question, STORY_W / 2, closeTop, () => 'rgba(240,232,224,0.66)', {
          perLineAlpha: i => easeOut(ramp(t, at(6.4 + i * 0.12), at(7.3 + i * 0.12))),
        });
        const qBottom = closeTop + question.lines.length * question.lineHeight;

        ctx.globalAlpha = closeIn;
        // A single dim mote instead of a rule — the site's own punctuation.
        ctx.fillStyle = rgbaOf(rgb, 0.5);
        ctx.beginPath();
        ctx.arc(STORY_W / 2, qBottom + 34, 2.6, 0, Math.PI * 2);
        ctx.fill();

        ctx.textAlign = 'center';
        ctx.font = font('sansLight', 28);
        ctx.fillStyle = 'rgba(240,232,224,0.48)';
        drawTracked(ctx, SITE_URL, STORY_W / 2, qBottom + 92, 3.4);

        ctx.font = font('serifItalic', 32);
        ctx.fillStyle = 'rgba(240,232,224,0.40)';
        ctx.fillText('A new question opens every week.', STORY_W / 2, qBottom + 146);
        ctx.globalAlpha = 1;
      }

      ctx.restore();
    },
  };
}

// ══════════════════════════════════════════════════════════════════════════════
// THE STORY'S OPENING AND CLOSING BEATS
// ══════════════════════════════════════════════════════════════════════════════

/**
 * The story's first beat: the question, large, read before anything else.
 *
 * The sky builds out of darkness behind it over ~1.4 s — the opening the piece
 * has always had — but the words arrive *first*, at a quarter-second, so the
 * very first thing a scrolling viewer resolves is what was asked. The block
 * then recedes (drifts up, dims) through the last second, handing the frame to
 * the star; `sequence()`'s crossfade completes the dissolve.
 *
 * `seed` must match the star beat's, so both raise the identical star field and
 * the seam between them is invisible.
 */
export function questionOpening(
  questionText: string,
  questionId: string | null,
  seed: string,
  opts: { duration?: number } = {},
): Segment {
  const duration = opts.duration ?? STORY_OPEN_SECONDS;
  const sky = renderSkyLayer(questionId, seed);
  const m = scratchCtx();
  const block = layoutBlock(m, questionText, {
    face: 'serifItalic', size: 82, maxWidth: CONTENT_W, maxLines: 5,
    lineHeightFactor: 1.3, minSize: 50,
  });
  const top = STORY_H / 2 - (block.lines.length * block.lineHeight) / 2 - 30;
  // The recede: the last second of the beat, finished off by the crossfade.
  const RECEDE = 1.0;

  return {
    duration,
    draw(ctx, t) {
      ctx.save();
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, STORY_W, STORY_H);
      ctx.globalAlpha = easeInOut(ramp(t, 0, 1.4));
      ctx.drawImage(sky, 0, 0);
      ctx.globalAlpha = 1;

      const out = easeInOut(ramp(t, duration - RECEDE, duration));
      drawBlock(ctx, block, STORY_W / 2, top, () => BTW.textPri, {
        perLineAlpha: i =>
          easeOut(ramp(t, 0.25 + i * 0.16, 1.15 + i * 0.16)) * (1 - 0.78 * out),
        perLineRise: i =>
          (1 - easeOut(ramp(t, 0.25 + i * 0.16, 1.15 + i * 0.16))) * 26 - 38 * out,
      });
      ctx.restore();
    },
  };
}

/**
 * The story's last beat: a door.
 *
 * A viewer watching this on someone else's phone has no way to type a URL they
 * saw for two seconds — so the final frames hold a genuinely scannable code for
 * *this star's* page, with the short URL spelled out beneath it for anyone who
 * would rather read it. The star itself sits above the code, small, so the card
 * is still this star's card and not a generic end slate.
 *
 * Everything is drawn opaque and perfectly still once it has arrived: a code
 * that is still moving, or still fading, is a code nobody can scan.
 */
export function qrCard(opts: {
  /** The URL the code encodes — already origin-aware. */
  url: string;
  /** The same URL as a human reads it, e.g. `thebetween.world/s/4xh8`. */
  label: string;
  seed: string;
  questionId?: string | null;
  /** Draws this star small above the code. */
  dimensions?: SpiroDimensions;
  duration?: number;
}): Segment {
  const duration = opts.duration ?? STORY_QR_SECONDS;
  const sky = renderSkyLayer(opts.questionId ?? null, opts.seed);
  // ~440 px asked for; the tile rounds down to a whole number of module pixels
  // (comfortably past the ~260 px a phone needs to scan off another screen).
  const tile = renderQrTile(opts.url, { size: 440 });

  // The plate and its shadow never change, so they are composited once here
  // rather than re-blurring a 400 px shadow on all 72 frames of the beat. The
  // shadow is what lifts the card off the sky instead of pasting it on.
  const SHADOW_PAD = 80;
  const plate = createCanvas(tile.px + SHADOW_PAD * 2, tile.px + SHADOW_PAD * 2);
  {
    const p = plate.getContext('2d');
    p.shadowColor = 'rgba(0,0,0,0.5)';
    p.shadowBlur = 44;
    p.shadowOffsetY = 10;
    p.drawImage(tile.canvas, SHADOW_PAD, SHADOW_PAD);
  }

  const star = opts.dimensions ? renderMiniStar(opts.dimensions, 200) : null;
  const STAR_CY = 640;
  const tileTop = 780;
  const plateX = (STORY_W - plate.width) / 2;
  const labelY = tileTop + tile.px + 96;
  // In production the label already *is* the site — saying it twice is noise.
  const brand = opts.label.startsWith(SITE_URL) ? null : SITE_URL;

  return {
    duration,
    draw(ctx, t) {
      ctx.save();
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, STORY_W, STORY_H);
      ctx.drawImage(sky, 0, 0);

      const inA = easeOut(ramp(t, 0.12, 0.72));
      if (inA <= 0.004) { ctx.restore(); return; }

      if (star) {
        ctx.globalAlpha = inA * 0.9;
        ctx.drawImage(star, (STORY_W - star.width) / 2, STAR_CY - star.height / 2);
      }

      ctx.globalAlpha = inA;
      ctx.drawImage(plate, plateX, tileTop - SHADOW_PAD);

      ctx.textAlign = 'center';
      ctx.textBaseline = 'alphabetic';
      ctx.font = font('sans', 46);
      ctx.fillStyle = BTW.textPri;
      drawTracked(ctx, opts.label, STORY_W / 2, labelY, 2.2);

      if (brand) {
        ctx.font = font('sansLight', 26);
        ctx.fillStyle = 'rgba(240,232,224,0.40)';
        drawTracked(ctx, brand, STORY_W / 2, labelY + 68, 7);
      }
      ctx.globalAlpha = 1;
      ctx.restore();
    },
  };
}

/**
 * THE single-star story: question → star → way in.
 *
 * `origin` is the host the request arrived on, so a staging render carries a
 * staging QR. It defaults to the canonical site for renders with no request
 * behind them. Because it is baked into the pixels, every cache that holds the
 * result must key on it too (see `origin.ts`).
 */
export function storySegment(
  input: StoryInput,
  opts: { origin?: string } = {},
): Segment {
  const origin = opts.origin ?? defaultOrigin();
  const seed = input.star.shortcode;
  return sequence(
    [
      questionOpening(input.questionText, input.questionId, seed, {
        duration: STORY_OPEN_SECONDS,
      }),
      starSegment(input, {
        duration: STORY_STAR_SECONDS,
        skyIn: false,
        close: false,
      }),
      qrCard({
        url: starUrlOn(origin, seed),
        label: `${originHost(origin)}/s/${seed}`,
        seed,
        questionId: input.questionId,
        dimensions: input.star.dimensions,
        duration: STORY_QR_SECONDS,
      }),
    ],
    STORY_CROSSFADE,
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// REEL CARDS (exported for Stage F)
// ══════════════════════════════════════════════════════════════════════════════

/**
 * The weekly reel's opening card: this week's question, alone in its own sky.
 */
export function introCard(
  questionText: string,
  questionId: string | null,
  opts: { duration?: number; eyebrow?: string } = {},
): Segment {
  const duration = opts.duration ?? CARD_SECONDS;
  const eyebrow = opts.eyebrow ?? 'this week';
  const sky = renderSkyLayer(questionId, `intro:${questionId ?? 'default'}`);
  const m = scratchCtx();
  const block = layoutBlock(m, questionText, {
    face: 'serifItalic', size: 72, maxWidth: CONTENT_W, maxLines: 5, lineHeightFactor: 1.32, minSize: 46,
  });
  const top = STORY_H / 2 - (block.lines.length * block.lineHeight) / 2 - 40;

  return {
    duration,
    draw(ctx, t) {
      const p = t / duration;
      ctx.save();
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, STORY_W, STORY_H);
      ctx.globalAlpha = easeInOut(ramp(t, 0, duration * 0.25));
      ctx.drawImage(sky, 0, 0);
      ctx.globalAlpha = 1;

      ctx.textAlign = 'center';
      ctx.font = font('sansLight', 26);
      ctx.fillStyle = `rgba(240,232,224,${(0.42 * easeOut(ramp(t, 0.2, 1.2))).toFixed(3)})`;
      drawTracked(ctx, eyebrow.toUpperCase(), STORY_W / 2, top - 110, 9);

      drawBlock(ctx, block, STORY_W / 2, top, () => BTW.textPri, {
        perLineAlpha: i => easeOut(ramp(t, 0.5 + i * 0.22, 1.7 + i * 0.22)) * (1 - easeInOut(ramp(p, 0.9, 1))),
        perLineRise: i => (1 - easeOut(ramp(t, 0.5 + i * 0.22, 1.7 + i * 0.22))) * 24,
      });
      ctx.restore();
    },
  };
}

/**
 * The weekly reel's closing card: the invitation, and whichever social handles
 * the `settings` table actually has (Stage E/0 supply them; empty ones never
 * render).
 */
export function outroCard(
  opts: {
    questionId?: string | null;
    duration?: number;
    follow?: string[];
    line?: string;
    /** A quieter second line beneath the main one — when the reel puts the
     *  featured question in `line`, the weekly invitation lives here. */
    subline?: string;
  } = {},
): Segment {
  const duration = opts.duration ?? CARD_SECONDS;
  const line = opts.line ?? 'A new question opens every week.';
  const follow = (opts.follow ?? []).filter(Boolean);
  const sky = renderSkyLayer(opts.questionId ?? null, `outro:${opts.questionId ?? 'default'}`);
  const m = scratchCtx();
  const block = layoutBlock(m, line, {
    face: 'serifItalic', size: 64, maxWidth: CONTENT_W, maxLines: 3, lineHeightFactor: 1.32, minSize: 44,
  });
  const subBlock = opts.subline
    ? layoutBlock(m, opts.subline, {
        face: 'serifItalic', size: 40, maxWidth: CONTENT_W, maxLines: 2, lineHeightFactor: 1.35, minSize: 32,
      })
    : null;
  const subGap = subBlock ? 72 : 0;
  const subHeight = subBlock ? subBlock.lines.length * subBlock.lineHeight : 0;
  const top = STORY_H / 2 - (block.lines.length * block.lineHeight + subGap + subHeight) / 2;

  return {
    duration,
    draw(ctx, t) {
      ctx.save();
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, STORY_W, STORY_H);
      ctx.globalAlpha = easeInOut(ramp(t, 0, duration * 0.3));
      ctx.drawImage(sky, 0, 0);
      ctx.globalAlpha = 1;

      drawBlock(ctx, block, STORY_W / 2, top, () => BTW.textPri, {
        perLineAlpha: i => easeOut(ramp(t, 0.3 + i * 0.2, 1.5 + i * 0.2)),
        perLineRise: i => (1 - easeOut(ramp(t, 0.3 + i * 0.2, 1.5 + i * 0.2))) * 22,
      });

      let bottom = top + block.lines.length * block.lineHeight;
      if (subBlock) {
        drawBlock(ctx, subBlock, STORY_W / 2, bottom + subGap, () => 'rgba(240,232,224,0.62)', {
          perLineAlpha: i => easeOut(ramp(t, 0.9 + i * 0.2, 2.1 + i * 0.2)),
          perLineRise: i => (1 - easeOut(ramp(t, 0.9 + i * 0.2, 2.1 + i * 0.2))) * 16,
        });
        bottom += subGap + subHeight;
      }
      ctx.textAlign = 'center';
      ctx.globalAlpha = easeOut(ramp(t, 1.2, 2.4));
      ctx.font = font('sansLight', 30);
      ctx.fillStyle = 'rgba(240,232,224,0.52)';
      drawTracked(ctx, SITE_URL, STORY_W / 2, bottom + 96, 3.6);
      if (follow.length) {
        ctx.font = font('sansLight', 26);
        ctx.fillStyle = 'rgba(240,232,224,0.34)';
        drawTracked(ctx, follow.join('   ·   '), STORY_W / 2, bottom + 154, 2.2);
      }
      ctx.globalAlpha = 1;
      ctx.restore();
    },
  };
}

/**
 * Concatenates segments into one, crossfading `crossfade` seconds at each seam.
 * Stage F's weekly reel is `sequence([introCard, ...starSegments, outroCard])`.
 */
export function sequence(segments: Segment[], crossfade = 0.6): Segment {
  if (segments.length === 0) throw new Error('sequence() needs at least one segment');
  const starts: number[] = [];
  let cursor = 0;
  for (const s of segments) {
    starts.push(cursor);
    cursor += s.duration - crossfade;
  }
  const duration = cursor + crossfade;

  // Crossfading needs a scratch frame to blend the outgoing segment into.
  const scratch = createCanvas(STORY_W, STORY_H);
  const sctx = scratch.getContext('2d');

  return {
    duration,
    draw(ctx, t) {
      let drawn = 0;
      for (let i = 0; i < segments.length; i++) {
        const s = segments[i];
        const local = t - starts[i];
        if (local < 0 || local > s.duration) continue;
        if (drawn === 0) {
          s.draw(ctx, Math.min(local, s.duration));
        } else {
          // Second (incoming) segment: render to scratch, then fade it over.
          sctx.clearRect(0, 0, STORY_W, STORY_H);
          s.draw(sctx, Math.min(local, s.duration));
          ctx.globalAlpha = clamp01(local / (crossfade || 1));
          ctx.drawImage(scratch, 0, 0);
          ctx.globalAlpha = 1;
        }
        drawn++;
      }
      if (drawn === 0) {
        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, STORY_W, STORY_H);
      }
    },
  };
}

// ── Single-frame helpers ──────────────────────────────────────────────────────

/** Renders one frame of a segment to a PNG buffer (poster, static fallback). */
export function renderSegmentFrame(segment: Segment, t: number): Buffer {
  const canvas = createCanvas(STORY_W, STORY_H);
  const ctx = canvas.getContext('2d');
  segment.draw(ctx, Math.max(0, Math.min(segment.duration, t)));
  return canvas.toBuffer('image/png');
}

/**
 * The poster moment, in seconds of a `storySegment`: the star is drawn, the
 * answer is fully up and holding, the question has handed over and the QR beat
 * has not begun. Anything later lands mid-crossfade and posters a half-faded
 * frame.
 */
export const POSTER_T = 7.2;

// Re-exported so the keepsake can build a matching background without reaching
// into the layer module itself.
export { getAtmosphere, skyGradient, renderSkyLayer };
