import { NextRequest } from 'next/server';
import { MIN_REASON_LENGTH, MAX_REASON_LENGTH } from '@/lib/constants';

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { from_shortcode, to_star_id, reason, question_id } = body;

  if (!reason || typeof reason !== 'string') {
    return Response.json({ error: 'Missing reason' }, { status: 400 });
  }
  if (reason.length < MIN_REASON_LENGTH || reason.length > MAX_REASON_LENGTH) {
    return Response.json({ error: 'Reason length out of range' }, { status: 400 });
  }

  // TODO: persist to Supabase
  return Response.json({ ok: true, id: 'pending-' + Date.now() });
}
