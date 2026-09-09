import { NextRequest } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';
import type { DimensionResult } from '@/lib/dimensions/prompt';
import type { CurveType } from '@/lib/spirograph/renderer';

type StarDimensions = DimensionResult & { curveType: CurveType };
type StarRow = { id: string; shortcode: string; answer: string; unique_fact: string | null; dimensions: StarDimensions; status?: string };

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ questionId: string }> }
) {
  const { questionId } = await params;
  // The submitter's own shortcode, if they have one — proof of ownership
  // (shortcodes for a pending star are never otherwise exposed). Lets the
  // LLM gate keep other visitors from ever seeing a pending star while still
  // showing the submitter theirs: "it will rise into the shared sky once
  // it's seen" (never surfaced as "flagged"/"pending"/"moderation").
  const mine = req.nextUrl.searchParams.get('mine');

  const [starsRes, bondsRes, questionRes, totalStarsRes, totalBondsRes, mineRes] = await Promise.all([
    supabaseServer
      .from('stars')
      .select('id, shortcode, answer, unique_fact, dimensions')
      .eq('question_id', questionId)
      .eq('status', 'approved'),
    supabaseServer
      .from('connections')
      .select('id, from_star_id, to_star_id, reason')
      .eq('question_id', questionId)
      .eq('status', 'approved'),
    supabaseServer
      .from('questions')
      .select('id, text')
      .eq('id', questionId)
      .single(),
    // Liveness — cosmos-wide totals (all questions), not just this one.
    supabaseServer
      .from('stars')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'approved'),
    supabaseServer
      .from('connections')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'approved'),
    mine
      ? supabaseServer
          .from('stars')
          .select('id, shortcode, answer, unique_fact, dimensions, status')
          .eq('question_id', questionId)
          .eq('shortcode', mine)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const stars = (starsRes.data ?? []) as StarRow[];

  // Fold in the submitter's own star even if it's still awaiting the human
  // queue — moderation is never weakened for anyone else, since this only
  // ever adds the one star whose exact shortcode the requester already knew.
  const mineRow = mineRes?.data as StarRow | null | undefined;
  if (mineRow && !stars.some(s => s.shortcode === mineRow.shortcode)) {
    stars.push(mineRow);
  }

  const bonds = (bondsRes.data ?? []).map(b => ({
    id: b.id,
    from_id: b.from_star_id,
    to_id: b.to_star_id,
    reason: b.reason,
  }));

  return Response.json({
    question: questionRes.data ?? null,
    stars,
    bonds,
    totals: {
      thoughts: totalStarsRes.count ?? 0,
      bonds: totalBondsRes.count ?? 0,
    },
  });
}
