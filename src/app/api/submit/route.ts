import { NextRequest } from 'next/server';
import { generateShortcode } from '@/lib/shortcode';
import { extractDimensions } from '@/lib/dimensions/extract';
import { randomCurveType } from '@/lib/spirograph/renderer';
import { QUESTION_ID_MOCK, MIN_ANSWER_LENGTH, MAX_ANSWER_LENGTH } from '@/lib/constants';

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { answer } = body;

  if (!answer || typeof answer !== 'string') {
    return Response.json({ error: 'Missing answer' }, { status: 400 });
  }
  if (answer.length < MIN_ANSWER_LENGTH || answer.length > MAX_ANSWER_LENGTH) {
    return Response.json({ error: 'Answer length out of range' }, { status: 400 });
  }

  const shortcode = generateShortcode(4);
  const dimensionResult = await extractDimensions(answer);
  const curveType = randomCurveType();

  const dimensions = {
    ...dimensionResult,
    curveType,
  };

  // TODO: persist to Supabase
  return Response.json({
    shortcode,
    questionId: QUESTION_ID_MOCK,
    dimensions,
  });
}
