import { supabaseServer } from '@/lib/supabase/server';

/**
 * Public endpoint — returns all active questions ordered by display_order,
 * each with a `starCount` (approved stars) for the Phase 4 sky rail.
 */
export async function GET() {
  try {
    const [{ data: questions }, { data: stars }] = await Promise.all([
      supabaseServer
        .from('questions')
        .select('id, slug, text, display_order')
        .order('display_order', { ascending: true }),
      supabaseServer
        .from('stars')
        .select('id, question_id')
        .eq('status', 'approved'),
    ]);

    const counts = new Map<string, number>();
    (stars ?? []).forEach((s: { question_id: string }) => {
      counts.set(s.question_id, (counts.get(s.question_id) ?? 0) + 1);
    });

    const withCounts = (questions ?? []).map(q => ({
      ...q,
      starCount: counts.get(q.id) ?? 0,
    }));

    return Response.json({ questions: withCounts });
  } catch {
    return Response.json({ questions: [] });
  }
}
