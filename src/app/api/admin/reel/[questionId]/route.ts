/**
 * GET /api/admin/reel/[questionId] — the weekly reel MP4 for one question.
 *
 * Admin-authed, no public surface. Loads the question's picked stars
 * (`reel_order` 1–5, approved only, ordered), sequences them through the
 * story engine's segment API — the same `sequence([introCard, ...stars,
 * outroCard])` → `encodeSegment` contract Stage C built for the single-star
 * story — and serves the result as a downloadable MP4.
 *
 * Cached on disk like the story/keepsake routes (`getOrProduce`), keyed on a
 * hash of everything that can change what the reel looks like: the question,
 * the picked stars (shortcode + answer + dimensions, so an admin edit or
 * regen invalidates), and the follow handles. `STORY_VERSION` is folded in by
 * `getOrProduce`'s own cache key.
 */

import { NextRequest } from 'next/server';
import { isAdmin } from '@/lib/adminSession';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import { supabaseServer } from '@/lib/supabase/server';
import type { SpiroDimensions } from '@/lib/spirograph/renderer';
import {
  sequence, introCard, outroCard, starSegment,
  encodeSegment, ffmpegAvailable,
  getOrProduce,
  loadNeighbours,
  type StoryInput,
} from '@/lib/story';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// A hint for deployment platforms (Vercel). Revision 3 grew the reel to
// ~43 s (uncompressed forming per star) — ~1300 frames, which a cold
// serverless box encodes in minutes. The dev server imposes no ceiling.
export const maxDuration = 300;

const DIM_DEFAULTS: SpiroDimensions = {
  certainty: 0.5,
  warmth: 0.5,
  tension: 0.5,
  vulnerability: 0.5,
  scope: 0.5,
  rootedness: 0.5,
  emotionIndex: 3,
  curveType: 'hypotrochoid',
};

function toDims(raw: Partial<SpiroDimensions> | null | undefined, shortcode: string): SpiroDimensions {
  return { ...DIM_DEFAULTS, ...(raw ?? {}), seed: shortcode };
}

interface ReelStarRow {
  shortcode: string;
  answer: string | null;
  unique_fact: string | null;
  dimensions: Partial<SpiroDimensions> | null;
  reel_order: number | null;
  status: string;
}

const SOCIAL_KEYS = ['social_instagram', 'social_tiktok', 'social_x', 'social_facebook'] as const;
const SOCIAL_LABELS: Record<string, string> = {
  social_instagram: 'Instagram',
  social_tiktok: 'TikTok',
  social_x: 'X',
  social_facebook: 'Facebook',
};

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ questionId: string }> },
) {
  if (!isAdmin(req)) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const { questionId } = await params;

  const { data: question } = await supabaseServer
    .from('questions')
    .select('id, slug, text')
    .eq('id', questionId)
    .single<{ id: string; slug: string; text: string }>();

  if (!question) return Response.json({ error: 'Question not found' }, { status: 404 });

  const { data: starRows } = await supabaseServer
    .from('stars')
    .select('shortcode, answer, unique_fact, dimensions, reel_order, status')
    .eq('question_id', questionId)
    .eq('status', 'approved');

  const picked = ((starRows ?? []) as ReelStarRow[])
    .filter(r => r.reel_order != null)
    .sort((a, b) => (a.reel_order as number) - (b.reel_order as number))
    .slice(0, 5);

  if (picked.length === 0) {
    return Response.json({ error: 'No stars picked for this reel yet' }, { status: 400 });
  }

  if (!ffmpegAvailable()) {
    return Response.json({ error: 'video_unavailable' }, { status: 503 });
  }

  // The outro promotes whatever question is currently featured — not
  // necessarily the one this reel is for, if an admin regenerates a past
  // week's reel after the feature has moved on.
  const { data: allQuestions } = await supabaseServer
    .from('questions')
    .select('id, text, featured_at');
  const featured = (allQuestions ?? []).reduce<{ id: string; text: string; at: string } | null>((best, q) => {
    if (!q.featured_at) return best;
    if (!best || q.featured_at > best.at) return { id: q.id, text: q.text, at: q.featured_at };
    return best;
  }, null);

  const { data: socialRows } = await supabaseServer
    .from('settings')
    .select('key, value')
    .in('key', SOCIAL_KEYS as unknown as string[]);
  const follow = (socialRows ?? [])
    .filter((r: { key: string; value: string }) =>
      (SOCIAL_KEYS as readonly string[]).includes(r.key) && r.value && r.value.trim() !== '')
    .map((r: { key: string; value: string }) => SOCIAL_LABELS[r.key] ?? r.key);

  // Cache key: everything that changes what the reel looks like. STORY_VERSION
  // itself is folded in by getOrProduce's own cacheKey().
  const keyMaterial = JSON.stringify({
    questionId,
    featuredId: featured?.id ?? null,
    featuredText: featured?.text ?? null,
    follow,
    stars: picked.map(s => ({
      shortcode: s.shortcode, answer: s.answer, uniqueFact: s.unique_fact, dimensions: s.dimensions,
    })),
  });
  const hash = crypto.createHash('sha256').update(keyMaterial).digest('hex').slice(0, 20);
  const cacheId = `reel-${questionId}-${hash}`;

  let artefact;
  try {
    artefact = await getOrProduce(cacheId, 'mp4', async tmpPath => {
      const starSegs = await Promise.all(picked.map(async row => {
        const neighbours = await loadNeighbours(questionId, row.shortcode);
        const input: StoryInput = {
          star: {
            shortcode: row.shortcode,
            answer: row.answer ?? '',
            uniqueFact: row.unique_fact,
            dimensions: toDims(row.dimensions, row.shortcode),
          },
          questionText: question.text,
          questionId,
          neighbours,
        };
        // 1 s breath + the uncompressed 5 s forming + 2.5 s of play. Forming
        // never compresses (revision 3), so this is the floor for a beat that
        // still gets to *be* a star for a moment.
        return starSegment(input, { duration: 8.5 });
      }));

      const reel = sequence([
        introCard(question.text, questionId),
        ...starSegs,
        outroCard({ questionId: featured?.id ?? questionId, follow, line: featured?.text, subline: 'A new question opens every week.' }),
      ]);

      const result = await encodeSegment(reel, tmpPath);
      console.log(
        `[admin/reel] rendered ${question.slug} — ${picked.length} stars, ${result.frames} frames in ${result.ms} ms`,
      );
    });
  } catch (err) {
    console.error('[admin/reel] encode failed:', err);
    return Response.json({ error: 'render_failed' }, { status: 503 });
  }

  if (!artefact.rendered) console.log(`[admin/reel] cache hit ${question.slug} (${cacheId})`);

  const buf = await fs.readFile(artefact.path);
  return new Response(new Uint8Array(buf), {
    status: 200,
    headers: {
      'Content-Type': 'video/mp4',
      'Content-Length': String(buf.byteLength),
      // Admin-authed, per-request download — never an intermediate cache.
      'Cache-Control': 'private, no-store',
      'Content-Disposition': `attachment; filename="the-between-reel-${question.slug}.mp4"`,
    },
  });
}
