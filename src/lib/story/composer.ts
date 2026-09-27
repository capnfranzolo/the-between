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
 * ── The single-star story (`storySegment`, 21.0 s) ──
 *
 * Revision 1 turned the story inside out: it used to open on the star and close
 * on the question, which buried the question — the one thing that makes a
 * stranger's answer mean anything. Revision 2 finished the thought. The
 * question no longer *recedes* at all; it does exactly what it does on the site
 * (see `ArrivalTitle`), rising from the centre of the frame to its quiet place
 * at the top and staying there for the rest of the piece. And the separate QR
 * end card is gone: a card nobody watches to the end is a door nobody opens,
 * and it stole the last two and a half seconds from the star.
 *
 *   0.0 – 2.0   THE QUESTION, large and centred, while the sky builds out of
 *               darkness behind it
 *   2.0 – 3.0   …it travels up and settles into the top chrome, where it stays
 *               for every remaining frame
 *   3.0 – 9.0   THE STAR draws itself and the answer rises under it. The answer
 *               is the emotional centre and gets the longest hold (~3 s).
 *   6.8 – 9.0   the corners arrive and hold, still and opaque: the QR bottom
 *               left, the site's name bottom right. No URL text anywhere.
 *
 * Two beats now — `questionOpening` and `starSegment` — joined by `sequence()`
 * with a 0.6 s crossfade, and wrapped by the closing corners. Both beats draw
 * the *same* sky (same question atmosphere, same seeded star field) and, across
 * the seam, the *same* question block in the same place, so the crossfade is
 * genuinely invisible rather than merely quick.
 *
 * ── The star beat alone (`starSegment`) ──
 *
 * Still a self-contained unit, and still what the weekly reel sequences between
 * its own intro and outro cards. Revision 3 (owner): the star no longer draws
 * as a fast-forwarded single trace that a finished star then fades over — it
 * FORMS, using the renderer's own Stage-G reveal (`renderStatic(t, {forming})`),
 * at the site's own five-second pace: fireflies arrive one at a time, the ghost
 * inscribes itself, dressings arrive last, and the forming star hands off to
 * its living self mid-motion because they are the same drawing. Then it *plays*
 * — the owner wants the finished animation enjoyed, not glimpsed.
 *
 * The timeline (absolute seconds; the head and forming never compress — a
 * shorter `duration` only shortens the play):
 *
 *   0.0 – 1.35        darkness; the sky and its star field breathe in
 *                     (`skyIn: false` when a preceding beat raised that sky)
 *   1.0 – 6.0         the star forms — `FORMING_DURATION_MS`, the site's speed
 *   3.2 – 5.5         the answer rises line by line in Cormorant italic
 *   6.6 – 8.6         real neighbour stars from the same question drift in
 *   6.0 – end         the living star plays (12 s in the story's beat)
 *   last 2.1 s        thebetween.world · the question as an invitation ·
 *                     "A new question opens every week." (`close: false` in
 *                     the story, which carries the question at the top
 *                     throughout and ends on the corners instead)
 *
 * Nothing here is a button, a logo or a call to action. Branding is a whisper.
 * The QR is the one exception, and it is a door, not an advertisement.
 */

import { createCanvas, type Canvas, type SKRSContext2D } from '@napi-rs/canvas';
import {
  createSpirograph, formingProgress, FORMING_DURATION_MS,
  EMOTIONS, type SpiroDimensions,
} from '../spirograph/renderer';
import { getAtmosphere } from '../atmosphere';
import { BTW, mulberry32, hashString } from '../btw';
import { SITE_URL } from '../constants';
import { font } from './fonts';
import { captureCurvePath, fitScale } from './curve';
import { defaultOrigin, starUrlOn } from './origin';
import { renderQrTile, QUIET_PLATE, QUIET_INK, QUIET_QR_SIZE } from './qr';
import {
  STORY_W, STORY_H, renderSkyLayer, renderMiniStar, skyGradient,
  starCentreInCanvas, STAR_LOGICAL_BOX, STAR_LOGICAL_DIAMETER,
} from './layers';
import {
  ANSWER_MAX_CHARS, answerFontSize, layoutBlock, truncate, type TextBlock,
} from './text';

export { STORY_W, STORY_H };

/** When the forming reveal begins inside a star beat — one breath of sky. */
const FORM_START = 1.0;
/** The forming reveal itself: `FORMING_DURATION_MS`, never compressed — the
 *  owner's revision-3 note was precisely that a sped-up forming reads as
 *  fast-forward. A beat's `duration` budget goes to the play, not the build. */
const FORM_SECONDS = FORMING_DURATION_MS / 1000;

/** Default length of the star beat on its own, in seconds: one breath, the
 *  five-second forming, then twelve seconds of the star simply playing. */
export const STAR_SEGMENT_SECONDS = FORM_START + FORM_SECONDS + 12;
/** Default intro/outro card length for the weekly reel. */
export const CARD_SECONDS = 4;

// ── The single-star story's two beats ─────────────────────────────────────────
/** The question alone, while the sky builds — and then its travel to the top. */
export const STORY_OPEN_SECONDS = 3.6;
/** The star and the answer — the longest beat, and the point of the piece. */
export const STORY_STAR_SECONDS = STAR_SEGMENT_SECONDS;
/** Seam length between beats. */
export const STORY_CROSSFADE = 0.6;
/** The whole single-star story, in seconds. */
export const STORY_SECONDS = STORY_OPEN_SECONDS + STORY_STAR_SECONDS - STORY_CROSSFADE;

// ── The closing corners ───────────────────────────────────────────────────────
/** When the corners begin to arrive, counted back from the end. */
const CORNERS_IN = 2.2;
/** …and when they are fully up. Everything after this is opaque and perfectly
 *  still: a code that is still fading is a code nobody can scan. */
const CORNERS_SETTLED = 1.2;
/** The corners' distance from the bottom edge — the keepsake's, so the two
 *  artefacts sit their codes at the same height. */
const CORNER_BOTTOM = 130;

/** Camera time the curve is *captured* at — used only to measure the star's
 *  extent for framing (`fitScale`). Matches the OG route's `renderStatic(3.0)`
 *  so the two artefacts are framed around the same pose. */
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
/** Where the answer block starts — the star must never reach it. */
const ANSWER_TOP = 1090;
/** Air the star keeps between itself and the question above / answer below. */
const STAR_CLEARANCE = 56;

// ── The question's resting place ──────────────────────────────────────────────
// The pages' top chrome, translated to 1080×1920: `ArrivalTitle` lands its
// question at top:22 on an 844-tall viewport in Cormorant italic at
// clamp(22px,3.2vw,36px) and 0.5 opacity. Scaled to this frame that is ~50px
// from the edge — too close for a 9:16 video, where every platform paints its
// own chrome over the first ~10% — so the rest sits a little lower and a touch
// more present, the compression tax on a half-transparent serif being what it
// is. Everything else is the site's treatment exactly.
const TOP_QUESTION_TOP = 104;
const TOP_QUESTION_SIZE = 56;
const TOP_QUESTION_ALPHA = 0.62;
/** The opening's centred pose is the same block scaled up — never re-wrapped,
 *  so the line breaks are identical from the first frame to the last (the trick
 *  `ArrivalTitle` uses to make its own landing invisible). The layout width is
 *  therefore the frame's content width *divided* by this. */
const TOP_QUESTION_SCALE = 1.35;
const TOP_QUESTION_WIDTH = Math.round(CONTENT_W / TOP_QUESTION_SCALE);
/** Where the centred pose is anchored — the vignette's own focal point. */
const TOP_QUESTION_CENTRE_Y = STORY_H * 0.46;

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
function starPlacement(settle: number, centreY: number) {
  const scale = STAR_DPR * settle;
  return {
    scale,
    dx: STORY_W / 2 - (STAR_LOGICAL_BOX / 2) * scale,
    dy: centreY - (STAR_LOGICAL_BOX / 2 + 30) * scale,
    dest: STAR_BOX.px * settle,
  };
}

/**
 * Where the star sits, and how big it is allowed to get, given whatever the
 * question above it turned out to need.
 *
 * `fitScale` normalises wildly different curve families onto a comparable
 * extent and can reach 1.55 — a star 868 px across, whose top edge would land
 * at y≈206 and collide with a question resting at the top of the frame. So in
 * story mode the star is centred in the band left between the question and the
 * answer, and its fit is capped to that band. Without a top question (the reel)
 * nothing changes: the historical centre and the raw fit stand.
 */
function starBand(fit: number, questionBottom: number | null): { centreY: number; fit: number } {
  if (questionBottom == null) return { centreY: STAR_CENTRE_Y, fit };
  const top = questionBottom + STAR_CLEARANCE;
  const bottom = ANSWER_TOP - STAR_CLEARANCE;
  const centreY = Math.round((top + bottom) / 2);
  const maxFit = (bottom - centreY) / (STAR_DIAMETER / 2);
  return { centreY, fit: Math.min(fit, maxFit) };
}

function rgbaOf(rgb: readonly [number, number, number], a: number): string {
  return `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${a.toFixed(3)})`;
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

// ── The question that stays ───────────────────────────────────────────────────

/**
 * Lays the question out ONCE, at its resting size, for the whole story.
 *
 * Both beats draw this same object: the opening scales it up around the centre
 * of the frame and walks it to the top, the star beat draws it at rest. One
 * layout means one set of line breaks, which is what lets the two beats overlap
 * across the crossfade without the text appearing to twitch.
 */
export function layoutTopQuestion(questionText: string): TextBlock {
  return layoutBlock(scratchCtx(), questionText, {
    face: 'serifItalic',
    size: TOP_QUESTION_SIZE,
    maxWidth: TOP_QUESTION_WIDTH,
    maxLines: 3,
    lineHeightFactor: 1.3,
    minSize: 40,
  });
}

/** The bottom edge of the question at rest — what the star has to clear. */
function topQuestionBottom(block: TextBlock): number {
  return TOP_QUESTION_TOP + block.lines.length * block.lineHeight;
}

/**
 * Draws the question somewhere on its journey: `p` 0 is the opening's centred
 * pose, 1 is the resting place at the top. Scale, position and opacity are one
 * interpolation, so there is exactly one path between the two states and the
 * star beat can reproduce its endpoint exactly by passing p = 1.
 */
function drawTopQuestion(
  ctx: SKRSContext2D,
  block: TextBlock,
  p: number,
  opts: { perLineAlpha?: (i: number) => number; perLineRise?: (i: number) => number } = {},
): void {
  const h = block.lines.length * block.lineHeight;
  const scale = TOP_QUESTION_SCALE + (1 - TOP_QUESTION_SCALE) * p;
  const restAnchor = TOP_QUESTION_TOP + h / 2;
  const anchorY = TOP_QUESTION_CENTRE_Y + (restAnchor - TOP_QUESTION_CENTRE_Y) * p;
  const alpha = 1 + (TOP_QUESTION_ALPHA - 1) * p;

  ctx.save();
  ctx.translate(STORY_W / 2, anchorY);
  ctx.scale(scale, scale);
  drawBlock(ctx, block, 0, -h / 2, () => BTW.textPri, {
    perLineAlpha: i => alpha * (opts.perLineAlpha ? opts.perLineAlpha(i) : 1),
    perLineRise: opts.perLineRise,
  });
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
  /**
   * The story's question, already laid out by `layoutTopQuestion`, resting at
   * the top of the frame for the whole beat. Passing it also moves the star
   * into the band beneath it (see `starBand`). The reel passes nothing and is
   * unaffected — its question lives on the intro card.
   */
  topQuestion?: TextBlock | null;
}

export function starSegment(
  input: StoryInput,
  opts: StarSegmentOptions = {},
): Segment {
  const duration = opts.duration ?? STAR_SEGMENT_SECONDS;
  const wantSkyIn = opts.skyIn ?? true;
  const wantClose = opts.close ?? true;
  const wantNeighbours = opts.neighbours ?? true;
  const topQuestion = opts.topQuestion ?? null;
  // The head of the timeline is absolute — the sky's breath and the forming
  // reveal happen at the site's own speed no matter what `duration` says
  // (revision 3: a compressed forming reads as fast-forward). A shorter beat
  // only shortens the *play* — the stretch where the finished star just lives.

  const dims: SpiroDimensions = { ...input.star.dimensions, seed: input.star.shortcode };
  const rgb = (EMOTIONS[dims.emotionIndex]?.rgb ?? [240, 232, 224]) as [number, number, number];

  const sky = renderSkyLayer(input.questionId, input.star.shortcode);
  const curve = captureCurvePath(dims, STAR_LOGICAL_BOX, STAR_CAM_T);
  // Curve families differ hugely in reach; normalise so every star holds the
  // frame (clamped, so a compact thought still reads as compact) — then fit it
  // to whatever room the question above and the answer below have left.
  const band = starBand(fitScale(curve), topQuestion ? topQuestionBottom(topQuestion) : null);
  const fit = band.fit;
  const centreY = band.centreY;
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
      const skyIn = wantSkyIn ? easeInOut(ramp(t, 0, 1.35)) : 1;
      ctx.globalAlpha = skyIn;
      ctx.drawImage(sky, 0, 0);
      ctx.globalAlpha = 1;

      // 2 ── the star FORMS — the renderer's own Stage-G reveal, driven
      // deterministically at the site's own pace (Spirograph.tsx does exactly
      // this with a rAF clock). Camera time runs from the same clock, so the
      // forming star hands off to its living self mid-motion — one continuous
      // drawing, not a trace crossfading into a different object. The renderer
      // raises its own canvas from empty: no external fade, no settle scale.
      const starT = t - FORM_START;
      if (starT >= 0) {
        const p = formingProgress(starT * 1000);
        spiro.renderStatic(starT, p < 1 ? { forming: p } : undefined);
        const place = starPlacement(fit, centreY);
        ctx.drawImage(starCanvas, place.dx, place.dy, place.dest, place.dest);
      }

      // 3 ── neighbours drift in once the star has fully formed
      drawNeighbours(ctx, neighbours, easeInOut(ramp(t, 6.6, 8.6)), t);

      // 3½ ── the story's question, resting at the top where the opening beat
      // left it. Drawn every frame at exactly the pose `drawTopQuestion(…, 1)`
      // produces, so the crossfade with the opening lands on identical pixels.
      if (topQuestion) drawTopQuestion(ctx, topQuestion, 1);

      // 4 ── the answer rises, line by line, while the star is still forming —
      // the words and the drawing finish together.
      drawBlock(ctx, answer, STORY_W / 2, ANSWER_TOP, () => BTW.textPri, {
        perLineAlpha: i => easeOut(ramp(t, 3.2 + i * 0.25, 4.4 + i * 0.25)),
        perLineRise: i => (1 - easeOut(ramp(t, 3.2 + i * 0.25, 4.4 + i * 0.25))) * 26,
      });
      if (byline) {
        drawBlock(
          ctx, byline, STORY_W / 2,
          ANSWER_TOP + answer.lines.length * answer.lineHeight + 20,
          () => 'rgba(240,232,224,0.52)',
          { perLineAlpha: () => easeOut(ramp(t, 4.6, 5.6)) * 0.9 },
        );
      }

      // 5 ── the quiet close, anchored to the END of the beat: however long the
      // play runs, the invitation arrives in its final two seconds.
      const closeStart = duration - 2.1;
      const closeIn = wantClose ? easeInOut(ramp(t, closeStart, closeStart + 1.0)) : 0;
      if (closeIn > 0.004) {
        drawBlock(ctx, question, STORY_W / 2, closeTop, () => 'rgba(240,232,224,0.66)', {
          perLineAlpha: i => easeOut(ramp(t, closeStart + i * 0.12, closeStart + 0.9 + i * 0.12)),
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
 * The story's first beat: the question, large, read before anything else — and
 * then its journey to the top of the frame.
 *
 * The sky builds out of darkness behind it over ~1.4 s (the opening the piece
 * has always had) but the words arrive *first*, at a quarter-second, so the
 * very first thing a scrolling viewer resolves is what was asked. They hold,
 * centred and large, for a beat — then travel up and settle into the top
 * chrome, arriving exactly as the crossfade to the star beat begins. They do
 * not leave: the star beat goes on drawing them in the same place for every
 * remaining frame of the story.
 *
 * `block` must be the same object the star beat is given, and `seed` must match
 * too, so both beats raise the identical star field and draw identical text
 * through the seam.
 */
export function questionOpening(opts: {
  block: TextBlock;
  questionId: string | null;
  seed: string;
  duration?: number;
  /** When the travel begins and ends, in seconds of this beat. The end should
   *  coincide with the start of the crossfade, so the question is already at
   *  rest before the next beat starts drawing it too. */
  travel?: { from: number; to: number };
}): Segment {
  const duration = opts.duration ?? STORY_OPEN_SECONDS;
  const sky = renderSkyLayer(opts.questionId, opts.seed);
  const from = opts.travel?.from ?? Math.max(0.9, duration - 1.6);
  const to = opts.travel?.to ?? Math.max(from + 0.4, duration - STORY_CROSSFADE);

  return {
    duration,
    draw(ctx, t) {
      ctx.save();
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, STORY_W, STORY_H);
      ctx.globalAlpha = easeInOut(ramp(t, 0, 1.4));
      ctx.drawImage(sky, 0, 0);
      ctx.globalAlpha = 1;

      drawTopQuestion(ctx, opts.block, easeInOut(ramp(t, from, to)), {
        perLineAlpha: i => easeOut(ramp(t, 0.25 + i * 0.16, 1.15 + i * 0.16)),
        perLineRise: i => (1 - easeOut(ramp(t, 0.25 + i * 0.16, 1.15 + i * 0.16))) * 26,
      });
      ctx.restore();
    },
  };
}

/**
 * The closing corners, laid over the whole story: the door, and the name of the
 * place, arriving in the last seconds and then holding perfectly still.
 *
 * This replaced a dedicated QR end card (revision 2). The card held a fine code
 * on a slate nobody watched to: it cost two and a half seconds and it ended the
 * piece on a graphic instead of on the star. In the corners the code costs
 * nothing — the star keeps the frame, the question keeps the top, and a viewer
 * who wants in has something to point a camera at for the closing beats.
 *
 * It is opaque, unmoving and fully arrived a second before the end (a code
 * still fading is a code nobody can scan), and small and quiet enough — see
 * `qr.ts` for how small, and how that number was arrived at — that it reads as
 * a mark in the corner rather than a call to action. There is no URL in text
 * anywhere: the word is the site, the code is the star.
 */
function withClosingCorners(base: Segment, url: string): Segment {
  const tile = renderQrTile(url, {
    size: QUIET_QR_SIZE, light: QUIET_PLATE, dark: QUIET_INK,
  });
  const qrX = MARGIN;
  const qrY = STORY_H - CORNER_BOTTOM - tile.px;
  // The wordmark sits on the code's optical centre line, facing it across the
  // frame — the same pairing the keepsake makes, mirrored.
  const wordmarkY = qrY + tile.px / 2 + 10;
  const from = base.duration - CORNERS_IN;
  const to = base.duration - CORNERS_SETTLED;

  return {
    duration: base.duration,
    draw(ctx, t) {
      base.draw(ctx, t);
      const a = easeOut(ramp(t, from, to));
      if (a <= 0.004) return;

      ctx.save();
      ctx.globalAlpha = a;
      ctx.drawImage(tile.canvas, qrX, qrY);
      ctx.globalAlpha = 1;

      ctx.textAlign = 'right';
      ctx.textBaseline = 'alphabetic';
      ctx.font = font('sansLight', 28);
      ctx.fillStyle = `rgba(240,232,224,${(0.55 * a).toFixed(3)})`;
      drawTracked(ctx, SITE_URL, STORY_W - MARGIN, wordmarkY, 6);
      ctx.restore();
    },
  };
}

/**
 * THE single-star story: the question rises and stays, the star draws itself
 * beneath it, the answer holds, and the way in arrives in the corners.
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
  // One layout, both beats — this is what makes the seam invisible.
  const question = layoutTopQuestion(input.questionText);

  const story = sequence(
    [
      questionOpening({
        block: question,
        questionId: input.questionId,
        seed,
        duration: STORY_OPEN_SECONDS,
        // The travel ends exactly where the crossfade begins.
        travel: { from: 2.0, to: STORY_OPEN_SECONDS - STORY_CROSSFADE },
      }),
      starSegment(input, {
        duration: STORY_STAR_SECONDS,
        skyIn: false,
        close: false,
        topQuestion: question,
      }),
    ],
    STORY_CROSSFADE,
  );

  return withClosingCorners(story, starUrlOn(origin, seed));
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
 * The poster moment, in seconds of a `storySegment`: the question has arrived
 * at the top and settled, the star is fully formed and living (forming ends at
 * story-time 9.0), the answer is up and holding, the neighbours have drifted
 * in (11.6) — and the corners (duration − CORNERS_IN ≈ 18.8) have not begun to
 * fade up yet. Mid-play: the widest still moment the story has, never a
 * transitional frame.
 */
export const POSTER_T = 12;

// Re-exported so the keepsake can build a matching background without reaching
// into the layer module itself.
export { getAtmosphere, skyGradient, renderSkyLayer };
