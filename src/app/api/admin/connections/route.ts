import { NextRequest } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';

function isAuthed(req: NextRequest) {
  return req.cookies.get('admin_session')?.value === '1';
}

export async function GET(req: NextRequest) {
  if (!isAuthed(req)) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const status = searchParams.get('status') ?? 'pending';
  const questionId = searchParams.get('questionId');
  const sortBy = searchParams.get('sortBy') ?? 'created_at';
  const sortDir = searchParams.get('sortDir') ?? 'desc';
  const page = parseInt(searchParams.get('page') ?? '0');
  const limit = parseInt(searchParams.get('limit') ?? '50');

  let query = supabaseServer
    .from('connections')
    .select('*')
    .order(sortBy, { ascending: sortDir === 'asc' })
    .range(page * limit, page * limit + limit - 1);

  if (status !== 'all') query = query.eq('status', status);
  if (questionId) query = query.eq('question_id', questionId);

  const { data: connections, error } = await query;
  if (error) return Response.json({ error: error.message }, { status: 500 });
  if (!connections || connections.length === 0) return Response.json({ connections: [] });

  // Fetch both stars for each connection
  const starIds = [...new Set([
    ...connections.map(c => c.from_star_id),
    ...connections.map(c => c.to_star_id),
  ])];

  const { data: stars } = await supabaseServer
    .from('stars')
    .select('id, shortcode, answer, unique_fact, dimensions, question_id')
    .in('id', starIds);

  const starMap = Object.fromEntries((stars ?? []).map(s => [s.id, s]));

  const enriched = connections.map(c => ({
    ...c,
    from_star: starMap[c.from_star_id] ?? null,
    to_star: starMap[c.to_star_id] ?? null,
  }));

  return Response.json({ connections: enriched });
}
