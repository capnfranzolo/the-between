import { NextRequest } from 'next/server';
import type { DimensionResult } from '@/lib/dimensions/prompt';
import type { CurveType } from '@/lib/spirograph/renderer';

type StarDimensions = DimensionResult & { curveType: CurveType };

interface CosmosStarRow {
  id: string;
  shortcode: string;
  text: string;
  x: number;
  y: number;
  depth: number;
  unique_fact: string | null;
  dimensions: StarDimensions;
}

const COSMOS_STARS: CosmosStarRow[] = [
  { id: '7kx2', shortcode: '7kx2', text: "I think people remember the weather of a moment more than the words.", x: 0.50, y: 0.50, depth: 0, unique_fact: null, dimensions: { certainty: 0.52, warmth: 0.68, tension: 0.22, vulnerability: 0.71, scope: 0.75, rootedness: 0.38, emotionIndex: 4, curveType: 'lissajous', reasoning: 'Reflective observation about memory' } },
  { id: 'a3pm', shortcode: 'a3pm', text: "Grief is just love with no place to land.", x: 0.20, y: 0.42, depth: 0, unique_fact: "I keep a box of unsent letters.", dimensions: { certainty: 0.78, warmth: 0.82, tension: 0.65, vulnerability: 0.88, scope: 0.72, rootedness: 0.18, emotionIndex: 4, curveType: 'rose', reasoning: 'Tender declaration about grief' } },
  { id: 'q9wn', shortcode: 'q9wn', text: "The body knows things the mind hasn't admitted yet.", x: 0.80, y: 0.40, depth: 0, unique_fact: null, dimensions: { certainty: 0.65, warmth: 0.35, tension: 0.71, vulnerability: 0.62, scope: 0.80, rootedness: 0.15, emotionIndex: 5, curveType: 'hypotrochoid', reasoning: 'Unsettling philosophical claim about embodied knowledge' } },
  { id: 'b4tx', shortcode: 'b4tx', text: "Most cruelty is fear in a costume.", x: 0.36, y: 0.62, depth: 1, unique_fact: null, dimensions: { certainty: 0.74, warmth: 0.12, tension: 0.58, vulnerability: 0.22, scope: 0.92, rootedness: 0.72, emotionIndex: 5, curveType: 'rhodonea', reasoning: 'Cold declarative observation — universal, low vulnerability' } },
  { id: 'm7vc', shortcode: 'm7vc', text: "We become the voices we were spoken to with as children.", x: 0.66, y: 0.64, depth: 1, unique_fact: "I still say phrases my grandmother said.", dimensions: { certainty: 0.69, warmth: 0.76, tension: 0.42, vulnerability: 0.84, scope: 0.68, rootedness: 0.14, emotionIndex: 6, curveType: 'epitrochoid', reasoning: 'Warm tender truth about inherited voices' } },
  { id: 'h2ka', shortcode: 'h2ka', text: "The most honest thing about a person is what bores them.", x: 0.10, y: 0.66, depth: 1, unique_fact: null, dimensions: { certainty: 0.61, warmth: 0.28, tension: 0.31, vulnerability: 0.19, scope: 0.88, rootedness: 0.64, emotionIndex: 3, curveType: 'lissajous', reasoning: 'Calm philosophical observation — settled, low vulnerability' } },
  { id: 'r5jn', shortcode: 'r5jn', text: "There is a version of you that only exists when a particular person is in the room.", x: 0.90, y: 0.58, depth: 1, unique_fact: null, dimensions: { certainty: 0.55, warmth: 0.72, tension: 0.48, vulnerability: 0.77, scope: 0.62, rootedness: 0.22, emotionIndex: 6, curveType: 'rose', reasoning: 'Warm wondering insight — moderately personal and tender' } },
  { id: 'c8dz', shortcode: 'c8dz', text: "Some places remember you longer than you remember them.", x: 0.46, y: 0.30, depth: 2, unique_fact: null, dimensions: { certainty: 0.48, warmth: 0.44, tension: 0.24, vulnerability: 0.59, scope: 0.70, rootedness: 0.35, emotionIndex: 4, curveType: 'hypotrochoid', reasoning: 'Wistful semi-universal observation about place and memory' } },
  { id: 's1fp', shortcode: 's1fp', text: "We forgive people for what we want forgiven in ourselves.", x: 0.27, y: 0.20, depth: 2, unique_fact: null, dimensions: { certainty: 0.71, warmth: 0.62, tension: 0.55, vulnerability: 0.78, scope: 0.83, rootedness: 0.58, emotionIndex: 3, curveType: 'epitrochoid', reasoning: 'Wise resolved truth — high certainty, universal scope' } },
  { id: 'w6gh', shortcode: 'w6gh', text: "Love is mostly attention, repeated.", x: 0.71, y: 0.22, depth: 2, unique_fact: "I notice when someone's shoes are untied.", dimensions: { certainty: 0.82, warmth: 0.91, tension: 0.17, vulnerability: 0.74, scope: 0.76, rootedness: 0.28, emotionIndex: 6, curveType: 'rhodonea', reasoning: 'Tender declaration — high warmth, low tension, near-universal' } },
  { id: 'n4bb', shortcode: 'n4bb', text: "Every adult is a child still listening for footsteps.", x: 0.58, y: 0.18, depth: 2, unique_fact: null, dimensions: { certainty: 0.58, warmth: 0.41, tension: 0.68, vulnerability: 0.82, scope: 0.85, rootedness: 0.19, emotionIndex: 5, curveType: 'lissajous', reasoning: 'Anxious universal truth — high tension and vulnerability' } },
  { id: 'p2lq', shortcode: 'p2lq', text: "What we call intuition is grief that learned to speak softly.", x: 0.06, y: 0.30, depth: 2, unique_fact: null, dimensions: { certainty: 0.44, warmth: 0.38, tension: 0.62, vulnerability: 0.71, scope: 0.78, rootedness: 0.32, emotionIndex: 4, curveType: 'rose', reasoning: 'Melancholy philosophical claim — moderate certainty, universal scope' } },
];

const COSMOS_BONDS = [
  { id: 'bond-0', from_id: 'a3pm', to_id: '7kx2', reason: "Because they're both about the things we carry without knowing." },
  { id: 'bond-1', from_id: '7kx2', to_id: 'c8dz', reason: "What stays of a place is mostly its weather." },
  { id: 'bond-2', from_id: 'm7vc', to_id: 'r5jn', reason: "We are made of the rooms we've been in." },
  { id: 'bond-3', from_id: 'q9wn', to_id: 'p2lq', reason: "The mind is slow to admit what the body and grief already know." },
  { id: 'bond-4', from_id: 'b4tx', to_id: 'h2ka', reason: "Both ask: what is a person really trying to hide?" },
  { id: 'bond-5', from_id: 'a3pm', to_id: 's1fp', reason: "Forgiveness and grief are the same shape from different sides." },
  { id: 'bond-6', from_id: 'w6gh', to_id: 'n4bb', reason: "Both say: love is mostly listening." },
];

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ questionId: string }> }
) {
  await params;

  return Response.json({
    stars: COSMOS_STARS,
    bonds: COSMOS_BONDS,
  });
}
