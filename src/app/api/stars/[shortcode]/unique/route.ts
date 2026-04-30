import { NextRequest } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';
import { MIN_UNIQUE_LENGTH, MAX_UNIQUE_LENGTH } from '@/lib/constants';

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

  const { data: star, error } = await supabaseServer
    .from('stars')
    .update({ unique_fact: unique_fact.trim() })
    .eq('shortcode', shortcode)
    .select('shortcode, question_id')
    .single();

  if (error || !star) {
    return Response.json({ error: 'Star not found' }, { status: 404 });
  }

  return Response.json({ ok: true, shortcode: star.shortcode, questionId: star.question_id });
}
