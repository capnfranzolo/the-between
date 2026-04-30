import { NextRequest } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';
import { hashString } from '@/lib/btw';
import { MIN_REASON_LENGTH, MAX_REASON_LENGTH } from '@/lib/constants';

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { fromStarId, toStarId, questionId, reason } = body;

  if (!fromStarId || !toStarId || !questionId) {
    return Response.json({ error: 'Missing fields' }, { status: 400 });
  }
  if (!reason || typeof reason !== 'string') {
    return Response.json({ error: 'Missing reason' }, { status: 400 });
  }
  if (reason.trim().length < MIN_REASON_LENGTH || reason.trim().length > MAX_REASON_LENGTH) {
    return Response.json({ error: 'Reason length out of range' }, { status: 400 });
  }
  if (fromStarId === toStarId) {
    return Response.json({ error: 'Cannot connect a star to itself' }, { status: 400 });
  }

  // Validate both stars exist
  const [fromRes, toRes] = await Promise.all([
    supabaseServer.from('stars').select('id').eq('id', fromStarId).maybeSingle(),
    supabaseServer.from('stars').select('id').eq('id', toStarId).maybeSingle(),
  ]);

  if (!fromRes.data) return Response.json({ error: 'From-star not found' }, { status: 404 });
  if (!toRes.data) return Response.json({ error: 'To-star not found' }, { status: 404 });

  // Check no existing outgoing connection for fromStar
  const { data: existing } = await supabaseServer
    .from('connections')
    .select('id')
    .eq('from_star_id', fromStarId)
    .neq('status', 'rejected')
    .maybeSingle();

  if (existing) {
    return Response.json({ error: 'Star already orbiting another', alreadyConnected: true }, { status: 409 });
  }

  const rawIp =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    req.headers.get('x-real-ip') ??
    'unknown';
  const ipHash = hashString(rawIp).toString(16);

  const { data: conn, error } = await supabaseServer
    .from('connections')
    .insert({
      question_id: questionId,
      from_star_id: fromStarId,
      to_star_id: toStarId,
      reason: reason.trim(),
      ip_hash: ipHash,
    })
    .select('id, from_star_id, to_star_id, reason')
    .single();

  if (error) {
    console.error('Insert connection error:', error);
    return Response.json({ error: 'Failed to save' }, { status: 500 });
  }

  return Response.json({
    ok: true,
    connection: {
      id: conn.id,
      from_id: conn.from_star_id,
      to_id: conn.to_star_id,
      reason: conn.reason,
    },
  });
}
