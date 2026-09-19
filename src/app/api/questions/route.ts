import { supabaseServer } from '@/lib/supabase/server';

/**
 * Public endpoint — returns all active questions, each with a `starCount`
 * (approved stars) for the Phase 4 sky rail.
 *
 * Order: the currently-featured question first (greatest `featured_at`),
 * then previously-featured questions by `featured_at` descending (the
 * "previous question" travel history), then never-featured questions by
 * `display_order`. A single `featured_at desc nullslast` sort plus
 * `display_order asc` as the tiebreaker achieves exactly this: Postgres's
 * default NULLS FIRST for DESC is overridden so never-featured rows (NULL)
 * sort after every featured one, ordered among themselves by display_order.
 */
export async function GET() {
  try {
    const [{ data: questions }, { data: stars }] = await Promise.all([
      supabaseServer
        .from('questions')
        .select('id, slug, text, display_order, featured_at')
        .eq('active', true)
        .order('featured_at', { ascending: false, nullsFirst: false })
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
