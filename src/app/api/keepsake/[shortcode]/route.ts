/**
 * GET /api/keepsake/[shortcode] → the 1080×1920 keepsake PNG.
 *
 * The thing a visitor saves to their camera roll so they can find their star
 * again: the star, the answer, the URL in plain text and a QR code. There are
 * no accounts here — this image *is* the recovery mechanism, which is why the
 * URL is legible as text and not only as a code.
 *
 * `?download=1` sets a filename so the Save control in SaveStarPanel produces a
 * sensibly named file instead of "keepsake".
 */

import { NextRequest } from 'next/server';
import fs from 'node:fs/promises';
import { loadStoryInput } from '@/lib/story/data';
import { renderKeepsakePng } from '@/lib/story/keepsake';
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

  const etag = `"keepsake-${shortcode}-v${STORY_VERSION}"`;
  if (req.headers.get('if-none-match') === etag) {
    return new Response(null, { status: 304, headers: { ETag: etag } });
  }

  let artefact;
  try {
    artefact = await getOrProduce(`keepsake-${shortcode}`, 'png', async tmpPath => {
      const png = await renderKeepsakePng({
        shortcode,
        answer: input.star.answer,
        uniqueFact: input.star.uniqueFact,
        dimensions: input.star.dimensions,
        questionText: input.questionText,
        questionId: input.questionId,
      });
      await fs.writeFile(tmpPath, png);
    });
  } catch (err) {
    console.error('[keepsake] render failed:', err);
    return new Response('Render failed', { status: 500 });
  }

  const buf = await fs.readFile(artefact.path);
  const download = req.nextUrl.searchParams.get('download') !== null;
  return new Response(new Uint8Array(buf), {
    headers: {
      'Content-Type': 'image/png',
      ETag: etag,
      'Content-Length': String(buf.byteLength),
      'Cache-Control': 'public, max-age=300, s-maxage=31536000, stale-while-revalidate=86400',
      'Content-Disposition':
        `${download ? 'attachment' : 'inline'}; filename="thebetween-${shortcode}.png"`,
    },
  });
}
