import { NextRequest } from 'next/server';
import { generateShortcode } from '@/lib/shortcode';
import { extractDimensions } from '@/lib/dimensions/extract';
import { randomCurveType } from '@/lib/spirograph/renderer';
import { MIN_ANSWER_LENGTH, MAX_ANSWER_LENGTH } from '@/lib/constants';
import { supabaseServer } from '@/lib/supabase/server';
import { hashString } from '@/lib/btw';

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { answer, question_id } = body;

  if (!answer || typeof answer !== 'string') {
    return Response.json({ error: 'Missing answer' }, { status: 400 });
  }
  if (answer.length < MIN_ANSWER_LENGTH || answer.length > MAX_ANSWER_LENGTH) {
    return Response.json({ error: 'Answer length out of range' }, { status: 400 });
  }

  let questionId: string;
  if (question_id && typeof question_id === 'string') {
    questionId = question_id;
  } else {
    const { data: fallbackQuestion } = await supabaseServer
      .from('questions')
      .select('id')
      .eq('active', true)
      .order('display_order')
      .limit(1)
      .single();
    if (!fallbackQuestion) {
      return Response.json({ error: 'No active question' }, { status: 503 });
    }
    questionId = fallbackQuestion.id;
  }

  const rawIp =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    req.headers.get('x-real-ip') ??
    'unknown';
  const ipHash = hashString(rawIp).toString(16);

  const shortcode = generateShortcode(4);
  const dimensionResult = await extractDimensions(answer);
  const curveType = randomCurveType();

  const dimensions = {
    ...dimensionResult,
    curveType,
  };

  const { error } = await supabaseServer
    .from('stars')
    .insert({
      shortcode,
      answer,
      question_id: questionId,
      status: 'approved',
      approved_at: new Date().toISOString(),
      ip_hash: ipHash,
      dimensions,
    });

  if (error) {
    console.error('Insert star error:', error);
    return Response.json({ error: 'Failed to save' }, { status: 500 });
  }

  return Response.json({ shortcode, questionId, dimensions });
}
