import { NextRequest } from 'next/server';

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { type, id, action, edit } = body;

  if (!type || !id || !action) {
    return Response.json({ error: 'Missing fields' }, { status: 400 });
  }

  // TODO: update Supabase record
  console.log(`Admin moderate: ${type} ${id} → ${action}${edit ? ' (edited)' : ''}`);

  return Response.json({ ok: true, type, id, action });
}
