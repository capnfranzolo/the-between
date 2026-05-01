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
  const search = searchParams.get('search') ?? '';
  const sortBy = searchParams.get('sortBy') ?? 'created_at';
  const sortDir = searchParams.get('sortDir') ?? 'desc';
  const page = parseInt(searchParams.get('page') ?? '0');
  const limit = parseInt(searchParams.get('limit') ?? '50');

  let query = supabaseServer
    .from('stars')
    .select('*, questions(id, slug, text)')
    .order(sortBy, { ascending: sortDir === 'asc' })
    .range(page * limit, page * limit + limit - 1);

  if (status !== 'all') query = query.eq('status', status);
  if (questionId) query = query.eq('question_id', questionId);
  if (search) {
    query = query.or(`answer.ilike.%${search}%,unique_fact.ilike.%${search}%`);
  }

  const { data: stars, error } = await query;
  if (error) return Response.json({ error: error.message }, { status: 500 });

  if (!stars || stars.length === 0) return Response.json({ stars: [] });

  // Fetch ip_counts for all unique ip_hashes
  const ipHashes = [...new Set(stars.map(s => s.ip_hash).filter(Boolean))];
  const { data: ipCounts } = await supabaseServer
    .from('stars')
    .select('ip_hash')
    .in('ip_hash', ipHashes);

  const ipCountMap: Record<string, number> = {};
  for (const row of ipCounts ?? []) {
    ipCountMap[row.ip_hash] = (ipCountMap[row.ip_hash] ?? 0) + 1;
  }

  // Fetch connection counts
  const starIds = stars.map(s => s.id);
  const { data: fromConns } = await supabaseServer
    .from('connections')
    .select('from_star_id')
    .in('from_star_id', starIds);
  const { data: toConns } = await supabaseServer
    .from('connections')
    .select('to_star_id')
    .in('to_star_id', starIds);

  const connCountMap: Record<string, number> = {};
  for (const r of fromConns ?? []) connCountMap[r.from_star_id] = (connCountMap[r.from_star_id] ?? 0) + 1;
  for (const r of toConns ?? []) connCountMap[r.to_star_id] = (connCountMap[r.to_star_id] ?? 0) + 1;

  const enriched = stars.map(s => ({
    ...s,
    ip_count: ipCountMap[s.ip_hash] ?? 1,
    connection_count: connCountMap[s.id] ?? 0,
  }));

  return Response.json({ stars: enriched });
}
