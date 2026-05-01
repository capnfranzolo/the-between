import { NextRequest } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';
import { extractDimensions } from '@/lib/dimensions/extract';
import { randomCurveType } from '@/lib/spirograph/renderer';
import { hashString } from '@/lib/btw';

function isAuthed(req: NextRequest) {
  return req.cookies.get('admin_session')?.value === '1';
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isAuthed(req)) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const body = await req.json();
  const { answer, uniqueFact, status } = body;

  const updates: Record<string, unknown> = {};
  if (status !== undefined) updates.status = status;
  if (uniqueFact !== undefined) updates.unique_fact = uniqueFact;

  if (answer !== undefined) {
    updates.answer = answer;
    updates.answer_hash = hashString(answer.trim().toLowerCase()).toString(16);
    const dimResult = await extractDimensions(answer);
    updates.dimensions = { ...dimResult, curveType: randomCurveType() };
  }

  const { data, error } = await supabaseServer
    .from('stars')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true, star: data });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isAuthed(req)) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;

  const { data: removedConns } = await supabaseServer
    .from('connections')
    .delete()
    .or(`from_star_id.eq.${id},to_star_id.eq.${id}`)
    .select('id');

  const { error } = await supabaseServer.from('stars').delete().eq('id', id);
  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({ ok: true, connectionsRemoved: removedConns?.length ?? 0 });
}
