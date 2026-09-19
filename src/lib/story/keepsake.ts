/**
 * The Between — the keepsake image.
 *
 * A 1080×1920 PNG a visitor can save to their camera roll: their star, what
 * they said, and the way back — a QR code, quiet in the bottom-right corner,
 * with the site's name facing it from the bottom-left.
 *
 * Revision 2 removed the spelled-out URL that used to sit beside the code. A
 * shortcode printed in 44 px type is the loudest thing on a contemplative
 * image, and it reads as a receipt number; the corner pair says the same thing
 * without raising its voice. The code itself is the way back, and it is sized
 * and coloured to be scannable rather than decorative (see `qr.ts`).
 *
 * Built on the same canvas the story video uses rather than on Satori, so it
 * gets the real Cormorant Garamond and the question's real sky. One rendering
 * path means the keepsake and the video can never disagree about how a star
 * looks.
 *
 * The line "We don't know who you are, so keep this if you want to come back."
 * is the product requirement, not decoration: there are no accounts, and this
 * image is the entire recovery mechanism.
 */

import { createCanvas } from '@napi-rs/canvas';
import { EMOTIONS, type SpiroDimensions } from '../spirograph/renderer';
import { font } from './fonts';
import { STORY_W, STORY_H, renderSkyLayer, renderMiniStar, STAR_LOGICAL_BOX } from './layers';
import { captureCurvePath, fitScale } from './curve';
import { SITE_URL } from '../constants';
import { defaultOrigin, starUrlOn } from './origin';
import { renderQrTile, QUIET_PLATE, QUIET_INK, QUIET_QR_SIZE } from './qr';
import { ANSWER_MAX_CHARS, answerFontSize, layoutBlock, truncate } from './text';

export const KEEPSAKE_LINE = "We don't know who you are, so keep this if you want to come back.";

export interface KeepsakeInput {
  shortcode: string;
  answer: string;
  uniqueFact?: string | null;
  dimensions: SpiroDimensions;
  questionText: string;
  questionId: string | null;
  /** The host this render was requested from, so a staging keepsake carries a
   *  staging link. Falls back to the canonical site. */
  origin?: string;
}

export function starUrl(shortcode: string, origin?: string): string {
  return starUrlOn(origin ?? defaultOrigin(), shortcode);
}

const MARGIN = 96;
const CONTENT_W = STORY_W - MARGIN * 2;

export async function renderKeepsakePng(input: KeepsakeInput): Promise<Buffer> {
  const dims: SpiroDimensions = { ...input.dimensions, seed: input.shortcode };
  const rgb = EMOTIONS[dims.emotionIndex]?.rgb ?? [240, 232, 224];
  const origin = input.origin ?? defaultOrigin();
  const url = starUrlOn(origin, input.shortcode);

  const canvas = createCanvas(STORY_W, STORY_H);
  const ctx = canvas.getContext('2d');

  ctx.drawImage(renderSkyLayer(input.questionId, input.shortcode), 0, 0);

  // ── The question ──
  // Not decoration and not a whisper: an answer without its question is a
  // sentence with no subject, and this image is what gets saved and re-shared.
  // It leads, in the same Cormorant italic the site asks questions in.
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  const question = layoutBlock(ctx, input.questionText, {
    face: 'serifItalic', size: 52, maxWidth: CONTENT_W - 20, maxLines: 3, lineHeightFactor: 1.32, minSize: 38,
  });
  ctx.font = question.fontSpec;
  ctx.fillStyle = 'rgba(240,232,224,0.86)';
  const QUESTION_TOP = 178;
  question.lines.forEach((l, i) =>
    ctx.fillText(l, STORY_W / 2, QUESTION_TOP + i * question.lineHeight + question.fontSize));
  const questionBottom = QUESTION_TOP + question.lines.length * question.lineHeight;

  // ── The star ──
  // Same extent normalisation the story uses, so a compact curve family (a rose,
  // say) is still legible as the subject of a keepsake. It sits below the
  // question, centred in whatever room the question left.
  const STAR_D = 440 * fitScale(captureCurvePath(dims, STAR_LOGICAL_BOX, 3.0));
  const starCanvas = renderMiniStar(dims, STAR_D, 3.0, { feather: false });
  const ANSWER_TOP = 1010;
  const starCentreY = Math.round((questionBottom + 44 + (ANSWER_TOP - 56)) / 2);
  ctx.drawImage(
    starCanvas,
    (STORY_W - starCanvas.width) / 2,
    starCentreY - starCanvas.height / 2,
  );

  // ── What they said ──
  const answerText = truncate(input.answer ?? '', ANSWER_MAX_CHARS);
  const answer = layoutBlock(ctx, `“${answerText}”`, {
    face: 'serifItalic',
    size: answerFontSize(answerText),
    maxWidth: CONTENT_W,
    maxLines: 5,
    lineHeightFactor: 1.36,
    minSize: 40,
  });
  ctx.font = answer.fontSpec;
  ctx.fillStyle = '#F0E8E0';
  answer.lines.forEach((l, i) =>
    ctx.fillText(l, STORY_W / 2, ANSWER_TOP + i * answer.lineHeight + answer.fontSize));
  let y = ANSWER_TOP + answer.lines.length * answer.lineHeight + answer.fontSize;

  if (input.uniqueFact) {
    ctx.font = font('sansLight', 28);
    ctx.fillStyle = 'rgba(240,232,224,0.5)';
    ctx.fillText(`— ${input.uniqueFact}`, STORY_W / 2, y + 30);
    y += 30;
  }

  // ── The way back ──
  const keep = layoutBlock(ctx, KEEPSAKE_LINE, {
    face: 'serifItalic', size: 36, maxWidth: CONTENT_W - 30, maxLines: 3, lineHeightFactor: 1.38, minSize: 28,
  });

  // The same tile the story's closing corner uses: the quiet plate, whole-pixel
  // modules, a full quiet zone. A keepsake whose code will not scan is a
  // keepsake with no way back at all, now that the URL text is gone.
  const tile = renderQrTile(url, {
    size: QUIET_QR_SIZE, light: QUIET_PLATE, dark: QUIET_INK,
  });

  // Bottom-anchored so the block sits the same whatever the answer's height.
  const blockBottom = STORY_H - 130;
  const qrTop = blockBottom - tile.px;
  const keepTop = qrTop - 56 - keep.lines.length * keep.lineHeight;

  ctx.font = keep.fontSpec;
  ctx.fillStyle = 'rgba(240,232,224,0.72)';
  ctx.textAlign = 'center';
  keep.lines.forEach((l, i) =>
    ctx.fillText(l, STORY_W / 2, keepTop + i * keep.lineHeight + keep.fontSize));

  // The two corners, facing each other: the door on the right, the name of the
  // place on the left, set on the code's own optical centre line.
  ctx.drawImage(tile.canvas, STORY_W - MARGIN - tile.px, qrTop);

  ctx.textAlign = 'left';
  ctx.font = font('sansLight', 28);
  ctx.fillStyle = 'rgba(240,232,224,0.55)';
  ctx.letterSpacing = '6px';
  ctx.fillText(SITE_URL, MARGIN, qrTop + tile.px / 2 + 10);
  ctx.letterSpacing = '0px';

  // A single mote in the star's own colour — the site's punctuation.
  ctx.fillStyle = `rgba(${rgb[0]},${rgb[1]},${rgb[2]},0.55)`;
  ctx.beginPath();
  ctx.arc(STORY_W / 2, keepTop - 56, 2.8, 0, Math.PI * 2);
  ctx.fill();

  return canvas.toBuffer('image/png');
}
