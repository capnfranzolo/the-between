/**
 * GET /api/story/[shortcode] → the star's 9:16 story as an MP4.
 *
 * Rendered on demand the first time a share preview is opened, then cached on
 * disk (see `src/lib/story/cache.ts`). Approved stars only — the same guard as
 * `api/og/[shortcode]`, for the same reason.
 *
 * Range requests are honoured: iOS Safari refuses to play a `<video>` whose
 * source ignores `Range`, and the share panel plays this inline.
 *
 * If ffmpeg cannot run (or the encode fails), the route answers 503 with the
 * poster URL rather than an error page — the share panel already shows the
 * poster and simply never upgrades to video.
 */

import { NextRequest } from 'next/server';
import fs from 'node:fs/promises';
import { loadStoryInput } from '@/lib/story/data';
import { starSegment } from '@/lib/story/composer';
import { encodeSegment, ffmpegAvailable } from '@/lib/story/encode';
import { getOrProduce, STORY_VERSION } from '@/lib/story/cache';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

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

  const etag = `"story-${shortcode}-v${STORY_VERSION}"`;
  if (req.headers.get('if-none-match') === etag) {
    return new Response(null, { status: 304, headers: { ETag: etag } });
  }

  let artefact;
  try {
    artefact = await getOrProduce(`story-${shortcode}`, 'mp4', async tmpPath => {
      const segment = starSegment(input);
      const result = await encodeSegment(segment, tmpPath);
      console.log(
        `[story] rendered ${shortcode} — ${result.frames} frames in ${result.ms} ms`,
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

  const headers = new Headers({
    'Content-Type': 'video/mp4',
    'Accept-Ranges': 'bytes',
    ETag: etag,
    // The URL is stable across composer versions, so the ETag — not a long
    // browser max-age — is what makes a bumped STORY_VERSION take effect.
    'Cache-Control': 'public, max-age=300, s-maxage=31536000, stale-while-revalidate=86400',
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
