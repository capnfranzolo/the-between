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
      // Delete connections first (one filter per id pair to avoid oversized OR)
      for (const id of ids) {
        await supabaseServer
          .from('connections')
          .delete()
          .or(`from_star_id.eq.${id},to_star_id.eq.${id}`);
      }
    }
    const { data: deleted, error: delError } = await supabaseServer
      .from(table)
      .delete()
      .in('id', ids)
      .select('id');
    if (delError) return Response.json({ error: delError.message }, { status: 500 });
    affected = deleted?.length ?? 0;
    if (affected === 0) {
      return Response.json({ error: 'No rows deleted — check service role key' }, { status: 500 });
    }
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
