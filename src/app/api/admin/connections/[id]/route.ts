import { NextRequest } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';

function isAuthed(req: NextRequest) {
  return req.cookies.get('admin_session')?.value === '1';
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isAuthed(req)) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const { status } = await req.json();

  const { data, error } = await supabaseServer
    .from('connections')
    .update({ status })
    .eq('id', id)
    .select()
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true, connection: data });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isAuthed(req)) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;

  const { error } = await supabaseServer.from('connections').delete().eq('id', id);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}
