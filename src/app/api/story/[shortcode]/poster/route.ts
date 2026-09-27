/**
 * GET /api/story/[shortcode]/poster → one composed frame as a 1080×1920 PNG.
 *
 * Two jobs: the `<video poster>` / first paint of the share panel while the MP4
 * renders, and the static vertical fallback wherever video can't play (or
 * wasn't produced). Same compositor, same moment near the end of the story, so
 * the poster is literally a frame of the video rather than a separate design.
 */

import { NextRequest, after } from 'next/server';
import fs from 'node:fs/promises';
import { loadStoryInput } from '@/lib/story/data';
import { storySegment, renderSegmentFrame, POSTER_T } from '@/lib/story/composer';
import { originFromRequest, originTag } from '@/lib/story/origin';
import { getOrProduce, cacheKey, STORY_VERSION } from '@/lib/story/cache';
import { storeEnabled, storedArtefactUrl, uploadArtefact } from '@/lib/story/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Serverless hint (Vercel): a poster is a single composed frame — quick, but
// comfortably clear of the default timeout on a cold, loaded function.
export const maxDuration = 60;

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ shortcode: string }> },
) {
  const { shortcode } = await params;

  const input = await loadStoryInput(shortcode);
  if (!input) return new Response('Not found', { status: 404 });

  // The poster is a frame of the story, and the story is origin-aware — so the
  // poster keys on the origin too, and stays correct if POSTER_T ever moves
  // into the closing QR beat.
  const origin = originFromRequest(req);
  const tag = originTag(origin);

  const etag = `"poster-${shortcode}-v${STORY_VERSION}-${tag}"`;
  if (req.headers.get('if-none-match') === etag) {
    return new Response(null, { status: 304, headers: { ETag: etag } });
  }

  // Serve from durable storage when we can — same contract as the MP4 route:
  // short-lived redirect, year-long cache on the versioned object itself.
  const storeKey = cacheKey(`poster-${shortcode}-${tag}`, 'png');
  const proxied = req.nextUrl.searchParams.get('proxy') === '1';
  if (storeEnabled() && !proxied) {
    const url = await storedArtefactUrl(storeKey);
    if (url) {
      return new Response(null, {
        status: 302,
        headers: { Location: url, 'Cache-Control': 'public, max-age=300' },
      });
    }
  }

  let artefact;
  try {
    artefact = await getOrProduce(`poster-${shortcode}-${tag}`, 'png', async tmpPath => {
      const png = renderSegmentFrame(storySegment(input, { origin }), POSTER_T);
      await fs.writeFile(tmpPath, png);
    });
  } catch (err) {
    console.error('[story/poster] render failed:', err);
    return new Response('Render failed', { status: 500 });
  }

  // `after` = post-response upload that serverless won't freeze mid-flight.
  if (storeEnabled()) after(() => uploadArtefact(storeKey, artefact.path, 'image/png'));

  const buf = await fs.readFile(artefact.path);
  return new Response(new Uint8Array(buf), {
    headers: {
      'Content-Type': 'image/png',
      ETag: etag,
      'Content-Length': String(buf.byteLength),
      // Short s-maxage so a moderation purge takes effect at the edge too
      // (see the story route) — the bucket carries the long-lived copy.
      'Cache-Control': 'public, max-age=300, s-maxage=3600, stale-while-revalidate=86400',
    },
  });
}
