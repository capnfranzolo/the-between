import { NextRequest } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';

function isAuthed(req: NextRequest) {
  return req.cookies.get('admin_session')?.value === '1';
}

export async function GET(req: NextRequest) {
  if (!isAuthed(req)) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const { data } = await supabaseServer.from('settings').select('key, value');
    return Response.json({ settings: data ?? [] });
  } catch {
    return Response.json({ settings: [] });
  }
}

export async function PATCH(req: NextRequest) {
  if (!isAuthed(req)) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const { key, value } = await req.json();
  if (!key || typeof value !== 'string') {
    return Response.json({ error: 'Missing key or value' }, { status: 400 });
  }
  // Try upsert first; if the table has no updated_at column Supabase will
  // reject the extra field — fall back to a plain upsert without it.
  let upsertError = (await supabaseServer
    .from('settings')
    .upsert({ key, value }, { onConflict: 'key' })).error;

  if (upsertError) return Response.json({ error: upsertError.message }, { status: 500 });
  return Response.json({ ok: true });
}
