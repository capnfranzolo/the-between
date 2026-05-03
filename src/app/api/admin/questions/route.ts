import { NextRequest } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';

function isAuthed(req: NextRequest) {
  return req.cookies.get('admin_session')?.value === '1';
}

/** GET /api/admin/questions — list all questions with per-question stats */
export async function GET(req: NextRequest) {
  if (!isAuthed(req)) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: questions, error } = await supabaseServer
    .from('questions')
    .select('id, slug, text, active, display_order, created_at')
    .order('display_order', { ascending: true });

  if (error) return Response.json({ error: error.message }, { status: 500 });

  // Per-question star + connection counts
  const { data: starRows } = await supabaseServer
    .from('stars')
    .select('question_id, status');

  const { data: connRows } = await supabaseServer
    .from('connections')
    .select('question_id, status');

  const starStats: Record<string, { total: number; approved: number; pending: number; rejected: number }> = {};
  const connStats: Record<string, { total: number; approved: number; pending: number }> = {};

  for (const s of (starRows ?? [])) {
    const q = s.question_id as string;
    if (!starStats[q]) starStats[q] = { total: 0, approved: 0, pending: 0, rejected: 0 };
    starStats[q].total++;
    if (s.status === 'approved') starStats[q].approved++;
    if (s.status === 'pending')  starStats[q].pending++;
    if (s.status === 'rejected') starStats[q].rejected++;
  }

  for (const c of (connRows ?? [])) {
    const q = c.question_id as string;
    if (!connStats[q]) connStats[q] = { total: 0, approved: 0, pending: 0 };
    connStats[q].total++;
    if (c.status === 'approved') connStats[q].approved++;
    if (c.status === 'pending')  connStats[q].pending++;
  }

  const result = (questions ?? []).map(q => ({
    ...q,
    stars: starStats[q.id] ?? { total: 0, approved: 0, pending: 0, rejected: 0 },
    connections: connStats[q.id] ?? { total: 0, approved: 0, pending: 0 },
  }));

  return Response.json({ questions: result });
}

/** POST /api/admin/questions — create a new question */
export async function POST(req: NextRequest) {
  if (!isAuthed(req)) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const text = (body.text ?? '').trim();
  const slug = (body.slug ?? '').trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');

  if (!text) return Response.json({ error: 'text is required' }, { status: 400 });
  if (!slug) return Response.json({ error: 'slug is required' }, { status: 400 });

  // Get max display_order
  const { data: maxRow } = await supabaseServer
    .from('questions')
    .select('display_order')
    .order('display_order', { ascending: false })
    .limit(1)
    .single();

  const nextOrder = ((maxRow?.display_order as number | null) ?? 0) + 1;

  const { data, error } = await supabaseServer
    .from('questions')
    .insert({ text, slug, active: true, display_order: nextOrder })
    .select()
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true, question: data });
}
