import { NextRequest } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';
import type { DimensionResult } from '@/lib/dimensions/prompt';
import type { CurveType } from '@/lib/spirograph/renderer';

type StarDimensions = DimensionResult & { curveType: CurveType };

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ questionId: string }> }
) {
  const { questionId } = await params;

  const [starsRes, bondsRes, questionRes] = await Promise.all([
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
  ]);

  const stars = (starsRes.data ?? []) as Array<{ id: string; shortcode: string; answer: string; unique_fact: string | null; dimensions: StarDimensions }>;

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
  });
}
