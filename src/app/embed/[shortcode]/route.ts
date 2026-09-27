/**
 * GET /embed/[shortcode] — the star's story as a bare, embeddable video page.
 *
 * This is what oEmbed consumers (Discord, Notion, WordPress, embed.ly) iframe,
 * and the `embedUrl` the VideoObject JSON-LD points search engines at. Nothing
 * but the video: black ground, 9:16 letterboxed to whatever box the consumer
 * gives us, poster first so a crawler hit never *triggers* a 21-second render
 * just to paint a preview (`preload="metadata"` + the poster is a still).
 *
 * Approved stars only — same guard as every other artefact surface.
 */

import { NextRequest } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';
import { escapeHtml } from '@/lib/html';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ shortcode: string }> },
) {
  const { shortcode } = await params;
  const safe = shortcode.replace(/[^a-zA-Z0-9_-]/g, '');
  if (!safe || safe !== shortcode) return new Response('Not found', { status: 404 });

  const { data: star } = await supabaseServer
    .from('stars')
    .select('answer, question_id')
    .eq('shortcode', safe)
    .eq('status', 'approved')
    .single();
  if (!star) return new Response('Not found', { status: 404 });

  let questionText = 'The Between';
  if (star.question_id) {
    const { data: q } = await supabaseServer
      .from('questions').select('text').eq('id', star.question_id).single();
    if (q?.text) questionText = q.text;
  }

  const title = escapeHtml(`${questionText} — The Between`);
  const poster = `/api/story/${safe}/poster`;
  const mp4 = `/api/story/${safe}`;
  const page = `/s/${safe}`;

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<style>
  html,body{margin:0;height:100%;background:#0b0812}
  body{display:flex;align-items:center;justify-content:center}
  video{max-width:100%;max-height:100vh;aspect-ratio:9/16;background:#0b0812}
  a{position:absolute;right:14px;bottom:10px;font:13px/1 system-ui,sans-serif;
    letter-spacing:.18em;color:rgba(240,232,224,.55);text-decoration:none}
</style>
</head>
<body>
<video src="${mp4}" poster="${poster}" controls muted autoplay loop playsinline preload="metadata"></video>
<a href="${page}" target="_top" rel="noopener">thebetween.world</a>
</body>
</html>`;

  return new Response(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      // Same edge-purgeability contract as the artefact routes: short enough
      // that an un-approved star's embed disappears within the hour.
      'Cache-Control': 'public, max-age=300, s-maxage=3600, stale-while-revalidate=86400',
    },
  });
}
