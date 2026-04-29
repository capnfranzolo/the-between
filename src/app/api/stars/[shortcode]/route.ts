import { NextRequest } from 'next/server';
import { QUESTION_ID_MOCK } from '@/lib/constants';
import type { DimensionResult } from '@/lib/dimensions/prompt';
import type { CurveType } from '@/lib/spirograph/renderer';

type StarDimensions = DimensionResult & { curveType: CurveType };

const DEFAULT_DIMS: StarDimensions = {
  certainty: 0.5, warmth: 0.5, tension: 0.4, vulnerability: 0.7,
  scope: 0.3, rootedness: 0.5, emotionIndex: 3,
  curveType: 'hypotrochoid', reasoning: '',
};

const MOCK_STARS: Record<string, { shortcode: string; answer: string; question_id: string; dimensions: StarDimensions }> = {
  '7kx2': {
    shortcode: '7kx2',
    answer: "I think people remember the weather of a moment more than the words.",
    question_id: QUESTION_ID_MOCK,
    dimensions: { certainty: 0.52, warmth: 0.68, tension: 0.22, vulnerability: 0.71, scope: 0.75, rootedness: 0.38, emotionIndex: 4, curveType: 'lissajous', reasoning: 'Reflective observation about memory and sensation' },
  },
  'a3pm': {
    shortcode: 'a3pm',
    answer: "Grief is just love with no place to land.",
    question_id: QUESTION_ID_MOCK,
    dimensions: { certainty: 0.78, warmth: 0.82, tension: 0.65, vulnerability: 0.88, scope: 0.72, rootedness: 0.18, emotionIndex: 4, curveType: 'rose', reasoning: 'Tender declaration about grief — high certainty, warm, somewhat universal' },
  },
};

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ shortcode: string }> }
) {
  const { shortcode } = await params;

  const known = MOCK_STARS[shortcode];
  if (known) {
    return Response.json(known);
  }

  return Response.json({
    shortcode,
    answer: "Something true that cannot be proven.",
    question_id: QUESTION_ID_MOCK,
    dimensions: DEFAULT_DIMS,
  });
}
