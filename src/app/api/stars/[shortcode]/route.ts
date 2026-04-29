import { NextRequest } from 'next/server';
import { hashString } from '@/lib/btw';
import { QUESTION_ID_MOCK } from '@/lib/constants';

const MOCK_STARS: Record<string, { shortcode: string; answer: string; question_id: string }> = {
  '7kx2': { shortcode: '7kx2', answer: "I think people remember the weather of a moment more than the words.", question_id: QUESTION_ID_MOCK },
  'a3pm': { shortcode: 'a3pm', answer: "Grief is just love with no place to land.", question_id: QUESTION_ID_MOCK },
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

  // Generate a plausible mock star for any shortcode
  return Response.json({
    shortcode,
    answer: "Something true that cannot be proven.",
    question_id: QUESTION_ID_MOCK,
  });
}
