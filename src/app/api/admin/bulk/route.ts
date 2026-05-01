import { NextRequest } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';

function isAuthed(req: NextRequest) {
  return req.cookies.get('admin_session')?.value === '1';
}

export async function POST(req: NextRequest) {
  if (!isAuthed(req)) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { action, type, ids } = await req.json() as {
    action: 'approve' | 'reject' | 'delete';
    type: 'star' | 'connection';
    ids: string[];
  };

  if (!action || !type || !Array.isArray(ids) || ids.length === 0) {
    return Response.json({ error: 'Missing fields' }, { status: 400 });
  }

  const table = type === 'star' ? 'stars' : 'connections';
  let affected = 0;

  if (action === 'delete') {
    if (type === 'star') {
      // Delete connections first
      await supabaseServer
        .from('connections')
        .delete()
        .or(ids.map(id => `from_star_id.eq.${id},to_star_id.eq.${id}`).join(','));
    }
    const { data: deleted } = await supabaseServer
      .from(table)
      .delete()
      .in('id', ids)
      .select('id');
    affected = deleted?.length ?? ids.length;
  } else {
    const status = action === 'approve' ? 'approved' : 'rejected';
    const { data: updated } = await supabaseServer
      .from(table)
      .update({ status })
      .in('id', ids)
      .select('id');
    affected = updated?.length ?? ids.length;
  }

  return Response.json({ ok: true, affected });
}
