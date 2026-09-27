/**
 * GET /api/oembed?url=https://thebetween.world/s/{code} — oEmbed provider.
 *
 * Consumers (Discord, Notion, WordPress, embed.ly, Iframely) discover this via
 * the `application/json+oembed` link on /s/ pages and get back a `video` type
 * whose html iframes /embed/{code} — which is how a pasted star link becomes a
 * playing video in surfaces that honour oEmbed even when they ignore og:video.
 *
 * Spec notes honoured deliberately: unknown urls → 404, `format=xml` → 501
 * (we only speak JSON), maxwidth/maxheight scale the 9:16 box down, never up.
 */

import { NextRequest } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';
import { escapeHtml } from '@/lib/html';
import { SITE_URL } from '@/lib/constants';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const BASE_W = 360; // a comfortable inline 9:16 box
const BASE_H = 640;

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;

  const format = q.get('format');
  if (format && format !== 'json') {
    return Response.json({ error: 'Only json is supported' }, { status: 501 });
  }

  const url = q.get('url') ?? '';
  // Accept only our own /s/ links (with or without scheme/query noise).
  const m = /^https?:\/\/(?:www\.)?thebetween\.world\/s\/([a-zA-Z0-9_-]+)/.exec(url);
  if (!m) return Response.json({ error: 'Unknown url' }, { status: 404 });
  const shortcode = m[1];

  const { data: star } = await supabaseServer
    .from('stars')
    .select('answer, question_id')
    .eq('shortcode', shortcode)
    .eq('status', 'approved')
    .single();
  if (!star) return Response.json({ error: 'Unknown url' }, { status: 404 });

  let questionText = "What do you know is true but you can't prove?";
  if (star.question_id) {
    const { data: qq } = await supabaseServer
      .from('questions').select('text').eq('id', star.question_id).single();
    if (qq?.text) questionText = qq.text;
  }

  // Scale the 9:16 box down to the consumer's ceiling, never up.
  const maxW = parseInt(q.get('maxwidth') ?? '', 10);
  const maxH = parseInt(q.get('maxheight') ?? '', 10);
  let w = BASE_W;
  let h = BASE_H;
  if (Number.isFinite(maxW) && maxW > 0 && maxW < w) { w = maxW; h = Math.round(maxW * 16 / 9); }
  if (Number.isFinite(maxH) && maxH > 0 && maxH < h) { h = maxH; w = Math.round(maxH * 9 / 16); }

  const embedUrl = `https://${SITE_URL}/embed/${shortcode}`;
  const title = `${questionText} — The Between`;

  return Response.json(
    {
      version: '1.0',
      type: 'video',
      provider_name: 'The Between',
      provider_url: `https://${SITE_URL}`,
      title,
      html:
        `<iframe src="${embedUrl}" width="${w}" height="${h}" ` +
        `frameborder="0" allow="autoplay; fullscreen" allowfullscreen ` +
        `title="${escapeHtml(title)}"></iframe>`,
      width: w,
      height: h,
      thumbnail_url: `https://${SITE_URL}/api/og/${shortcode}`,
      thumbnail_width: 1200,
      thumbnail_height: 630,
    },
    { headers: { 'Cache-Control': 'public, max-age=300, s-maxage=3600' } },
  );
}
