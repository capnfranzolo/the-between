import { NextRequest } from 'next/server';
import { QUESTION_ID_MOCK, MIN_UNIQUE_LENGTH, MAX_UNIQUE_LENGTH } from '@/lib/constants';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ shortcode: string }> }
) {
  const { shortcode } = await params;
  const body = await req.json();
  const { unique_fact } = body;

  if (!unique_fact || typeof unique_fact !== 'string') {
    return Response.json({ error: 'Missing unique fact' }, { status: 400 });
  }
  if (unique_fact.length < MIN_UNIQUE_LENGTH || unique_fact.length > MAX_UNIQUE_LENGTH) {
    return Response.json({ error: 'Unique fact length out of range' }, { status: 400 });
  }

  // TODO: persist to Supabase
  return Response.json({ ok: true, shortcode, questionId: QUESTION_ID_MOCK });
}
