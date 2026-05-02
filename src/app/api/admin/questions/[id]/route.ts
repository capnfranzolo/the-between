import { NextRequest } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';

function isAuthed(req: NextRequest) {
  return req.cookies.get('admin_session')?.value === '1';
}

/** PATCH /api/admin/questions/[id] — update text, slug, active, display_order */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isAuthed(req)) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const body = await req.json();
  const updates: Record<string, unknown> = {};

  if (typeof body.text === 'string') updates.text = body.text.trim();
  if (typeof body.slug === 'string') {
    updates.slug = body.slug.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
  }
  if (typeof body.active === 'boolean') updates.active = body.active;
  if (typeof body.display_order === 'number') updates.display_order = body.display_order;

  if (Object.keys(updates).length === 0) {
    return Response.json({ error: 'No fields to update' }, { status: 400 });
  }

  const { data, error } = await supabaseServer
    .from('questions')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true, question: data });
}

/** DELETE /api/admin/questions/[id] — delete question + all its stars and connections */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isAuthed(req)) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;

  // Fetch all star IDs for this question
  const { data: stars, error: starsErr } = await supabaseServer
    .from('stars')
    .select('id')
    .eq('question_id', id);

  if (starsErr) return Response.json({ error: starsErr.message }, { status: 500 });

  const starIds = (stars ?? []).map(s => s.id as string);

  // Delete connections involving those stars
  if (starIds.length > 0) {
    const { error: connErr1 } = await supabaseServer
      .from('connections')
      .delete()
      .in('from_star_id', starIds);
    if (connErr1) return Response.json({ error: connErr1.message }, { status: 500 });

    const { error: connErr2 } = await supabaseServer
      .from('connections')
      .delete()
      .in('to_star_id', starIds);
    if (connErr2) return Response.json({ error: connErr2.message }, { status: 500 });
  }

  // Also delete any connections with question_id (in case of orphans)
  await supabaseServer.from('connections').delete().eq('question_id', id);

  // Delete all stars for this question
  if (starIds.length > 0) {
    const { error: delStarsErr } = await supabaseServer
      .from('stars')
      .delete()
      .eq('question_id', id);
    if (delStarsErr) return Response.json({ error: delStarsErr.message }, { status: 500 });
  }

  // Finally delete the question
  const { error: delQErr } = await supabaseServer
    .from('questions')
    .delete()
    .eq('id', id);

  if (delQErr) return Response.json({ error: delQErr.message }, { status: 500 });

  return Response.json({ ok: true, deletedStars: starIds.length });
}
