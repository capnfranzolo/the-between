/**
 * GET /api/story/[shortcode] → the star's 9:16 story as an MP4.
 *
 * Rendered on demand the first time a share preview is opened, then cached on
 * disk (see `src/lib/story/cache.ts`). Approved stars only — the same guard as
 * `api/og/[shortcode]`, for the same reason.
 *
 * The story ends on a scannable QR for the star's own page, built from the
 * origin *this request* arrived on — so a staging render carries a staging
 * link. That makes the origin part of the rendered bytes, which is why it is
 * folded into both the cache key and the ETag.
 *
 * Range requests are honoured: iOS Safari refuses to play a `<video>` whose
 * source ignores `Range`, and the share panel plays this inline.
 *
 * If ffmpeg cannot run (or the encode fails), the route answers 503 with the
 * poster URL rather than an error page — the share panel already shows the
 * poster and simply never upgrades to video.
 */

import { NextRequest, after } from 'next/server';
import fs from 'node:fs/promises';
import { loadStoryInput } from '@/lib/story/data';
import { storySegment } from '@/lib/story/composer';
import { originFromRequest, originTag } from '@/lib/story/origin';
import { encodeSegment, ffmpegAvailable } from '@/lib/story/encode';
import { getOrProduce, cacheKey, STORY_VERSION } from '@/lib/story/cache';
import { storeEnabled, storedArtefactUrl, uploadArtefact } from '@/lib/story/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Serverless hint (Vercel): the revision-3 story is 21 s / 630 frames —
// ~40 s of ffmpeg on an idle box, ~90-100 s on a cold serverless one.
export const maxDuration = 300;

function parseRange(header: string | null, size: number): { start: number; end: number } | null {
  if (!header) return null;
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!m) return null;
  const [, rawStart, rawEnd] = m;
  let start: number;
  let end: number;
  if (rawStart === '') {
    // Suffix range: the last N bytes.
    const n = parseInt(rawEnd, 10);
    if (!Number.isFinite(n) || n <= 0) return null;
    start = Math.max(0, size - n);
    end = size - 1;
  } else {
    start = parseInt(rawStart, 10);
    end = rawEnd === '' ? size - 1 : parseInt(rawEnd, 10);
  }
  if (!Number.isFinite(start) || !Number.isFinite(end) || start > end || start >= size) return null;
  return { start, end: Math.min(end, size - 1) };
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ shortcode: string }> },
) {
  const { shortcode } = await params;

  const input = await loadStoryInput(shortcode);
  if (!input) return new Response('Not found', { status: 404 });

  if (!ffmpegAvailable()) {
    return Response.json(
      { error: 'video_unavailable', poster: `/api/story/${shortcode}/poster` },
      { status: 503 },
    );
  }

  // The story's closing beat renders a QR for *this* host, so the origin is
  // part of the bytes — and therefore of the cache key and the ETag.
  const origin = originFromRequest(req);
  const tag = originTag(origin);

  const etag = `"story-${shortcode}-v${STORY_VERSION}-${tag}"`;
  if (req.headers.get('if-none-match') === etag) {
    return new Response(null, { status: 304, headers: { ETag: etag } });
  }

  // Already in durable storage? Hand the request to the bucket's CDN instead
  // of streaming 2 MB through this process. The redirect itself is cached only
  // briefly — the object URL is versioned, so a STORY_VERSION bump changes
  // where this route points, and a long-lived redirect would pin the old one.
  // `?proxy=1` forces same-origin bytes (escape hatch if a client ever
  // mishandles the cross-origin hop).
  const storeKey = cacheKey(`story-${shortcode}-${tag}`, 'mp4');
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
    artefact = await getOrProduce(`story-${shortcode}-${tag}`, 'mp4', async tmpPath => {
      const segment = storySegment(input, { origin });
      const result = await encodeSegment(segment, tmpPath);
      console.log(
        `[story] rendered ${shortcode} @ ${origin} — ${result.frames} frames in ${result.ms} ms`,
      );
    });
  } catch (err) {
    console.error('[story] encode failed:', err);
    return Response.json(
      { error: 'render_failed', poster: `/api/story/${shortcode}/poster` },
      { status: 503 },
    );
  }

  if (!artefact.rendered) console.log(`[story] cache hit ${shortcode}`);

  // This request streams from disk (first render, or storage was unreachable);
  // future ones should come from the CDN. `after` runs the upload once the
  // response is sent — on serverless it's `waitUntil`, so the instance isn't
  // frozen mid-upload. An upload failure only means the next request streams
  // from disk too.
  if (storeEnabled()) after(() => uploadArtefact(storeKey, artefact.path, 'video/mp4'));

  const headers = new Headers({
    'Content-Type': 'video/mp4',
    'Accept-Ranges': 'bytes',
    ETag: etag,
    // s-maxage is deliberately SHORT: Vercel's edge caches this streamed
    // response on the story URL, and a year-long entry would outlive a
    // moderation purge — the edge never re-consults the function, so a
    // rejected star's video would keep playing. The bucket is the durable
    // layer now; an edge miss costs a 302 hop, not a re-render.
    'Cache-Control': 'public, max-age=300, s-maxage=3600, stale-while-revalidate=86400',
    'Content-Disposition': `inline; filename="thebetween-${shortcode}.mp4"`,
  });

  const range = parseRange(req.headers.get('range'), artefact.size);
  if (range) {
    const fh = await fs.open(artefact.path, 'r');
    try {
      const length = range.end - range.start + 1;
      const buf = Buffer.alloc(length);
      await fh.read(buf, 0, length, range.start);
      headers.set('Content-Range', `bytes ${range.start}-${range.end}/${artefact.size}`);
      headers.set('Content-Length', String(length));
      return new Response(new Uint8Array(buf), { status: 206, headers });
    } finally {
      await fh.close();
    }
  }

  const buf = await fs.readFile(artefact.path);
  headers.set('Content-Length', String(buf.byteLength));
  return new Response(new Uint8Array(buf), { status: 200, headers });
}
