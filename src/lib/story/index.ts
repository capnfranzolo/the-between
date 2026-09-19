/**
 * The Between — story engine public surface.
 *
 * Stage D (share panel) needs the route contracts; Stage F (weekly reel) needs
 * the segment API and the encoder. Both should import from here rather than
 * reaching into individual modules.
 *
 * Building a reel is:
 *
 *   const reel = sequence([
 *     introCard(question.text, question.id),
 *     ...stars.map(s => starSegment(s, { duration: 6 })),
 *     outroCard({ questionId: question.id, follow: handles }),
 *   ]);
 *   await encodeSegment(reel, outPath);
 */

export {
  STORY_W, STORY_H, STAR_SEGMENT_SECONDS, CARD_SECONDS, POSTER_T,
  starSegment, introCard, outroCard, sequence, renderSegmentFrame,
  type Segment, type StoryInput, type StoryStar, type StoryNeighbour,
} from './composer';

export { STORY_FPS, encodeMp4, encodeSegment, ffmpegAvailable, FfmpegUnavailableError } from './encode';
export { STORY_VERSION, getOrProduce, storyCacheDir, cacheKey, inFlightCount } from './cache';
export { loadStoryInput, loadNeighbours } from './data';
export { renderKeepsakePng, starUrl, KEEPSAKE_LINE, type KeepsakeInput } from './keepsake';
export { ensureFonts, fontsReady, font, FONT } from './fonts';
