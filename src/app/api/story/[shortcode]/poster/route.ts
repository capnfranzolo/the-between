/**
 * GET /api/story/[shortcode]/poster → one composed frame as a 1080×1920 PNG.
 *
 * Two jobs: the `<video poster>` / first paint of the share panel while the MP4
 * renders, and the static vertical fallback wherever video can't play (or
 * wasn't produced). Same compositor, same moment near the end of the story, so
 * the poster is literally a frame of the video rather than a separate design.
 */

import { NextRequest } from 'next/server';
import fs from 'node:fs/promises';
import { loadStoryInput } from '@/lib/story/data';
import { starSegment, renderSegmentFrame, POSTER_T } from '@/lib/story/composer';
import { getOrProduce, STORY_VERSION } from '@/lib/story/cache';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ shortcode: string }> },
) {
  const { shortcode } = await params;

  const input = await loadStoryInput(shortcode);
  if (!input) return new Response('Not found', { status: 404 });

  const etag = `"poster-${shortcode}-v${STORY_VERSION}"`;
  if (req.headers.get('if-none-match') === etag) {
    return new Response(null, { status: 304, headers: { ETag: etag } });
  }

  let artefact;
  try {
    artefact = await getOrProduce(`poster-${shortcode}`, 'png', async tmpPath => {
      const png = renderSegmentFrame(starSegment(input), POSTER_T);
      await fs.writeFile(tmpPath, png);
    });
  } catch (err) {
    console.error('[story/poster] render failed:', err);
    return new Response('Render failed', { status: 500 });
  }

  const buf = await fs.readFile(artefact.path);
  return new Response(new Uint8Array(buf), {
    headers: {
      'Content-Type': 'image/png',
      ETag: etag,
      'Content-Length': String(buf.byteLength),
      'Cache-Control': 'public, max-age=300, s-maxage=31536000, stale-while-revalidate=86400',
    },
  });
}
