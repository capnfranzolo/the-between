import { NextRequest } from 'next/server';

const COSMOS_STARS = [
  { id: '7kx2', shortcode: '7kx2', text: "I think people remember the weather of a moment more than the words.", x: 0.50, y: 0.50, depth: 0, warmth: 0.62, unique_fact: null },
  { id: 'a3pm', shortcode: 'a3pm', text: "Grief is just love with no place to land.", x: 0.20, y: 0.42, depth: 0, warmth: 0.85, unique_fact: "I keep a box of unsent letters." },
  { id: 'q9wn', shortcode: 'q9wn', text: "The body knows things the mind hasn't admitted yet.", x: 0.80, y: 0.40, depth: 0, warmth: 0.30, unique_fact: null },
  { id: 'b4tx', shortcode: 'b4tx', text: "Most cruelty is fear in a costume.", x: 0.36, y: 0.62, depth: 1, warmth: 0.18, unique_fact: null },
  { id: 'm7vc', shortcode: 'm7vc', text: "We become the voices we were spoken to with as children.", x: 0.66, y: 0.64, depth: 1, warmth: 0.72, unique_fact: "I still say phrases my grandmother said." },
  { id: 'h2ka', shortcode: 'h2ka', text: "The most honest thing about a person is what bores them.", x: 0.10, y: 0.66, depth: 1, warmth: 0.45, unique_fact: null },
  { id: 'r5jn', shortcode: 'r5jn', text: "There is a version of you that only exists when a particular person is in the room.", x: 0.90, y: 0.58, depth: 1, warmth: 0.55, unique_fact: null },
  { id: 'c8dz', shortcode: 'c8dz', text: "Some places remember you longer than you remember them.", x: 0.46, y: 0.30, depth: 2, warmth: 0.20, unique_fact: null },
  { id: 's1fp', shortcode: 's1fp', text: "We forgive people for what we want forgiven in ourselves.", x: 0.27, y: 0.20, depth: 2, warmth: 0.78, unique_fact: null },
  { id: 'w6gh', shortcode: 'w6gh', text: "Love is mostly attention, repeated.", x: 0.71, y: 0.22, depth: 2, warmth: 0.92, unique_fact: "I notice when someone's shoes are untied." },
  { id: 'n4bb', shortcode: 'n4bb', text: "Every adult is a child still listening for footsteps.", x: 0.58, y: 0.18, depth: 2, warmth: 0.38, unique_fact: null },
  { id: 'p2lq', shortcode: 'p2lq', text: "What we call intuition is grief that learned to speak softly.", x: 0.06, y: 0.30, depth: 2, warmth: 0.50, unique_fact: null },
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
  await params; // consumed but not needed for mock

  return Response.json({
    stars: COSMOS_STARS,
    bonds: COSMOS_BONDS,
  });
}
