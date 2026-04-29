export interface Question {
  id: string;
  slug: string;
  text: string;
  active: boolean;
  created_at: string;
}

export interface Star {
  id: string;
  question_id: string;
  shortcode: string;
  answer: string;
  unique_fact: string | null;
  status: 'pending' | 'approved' | 'rejected';
  /**
   * jsonb shape: { certainty, warmth, tension, vulnerability, scope, rootedness,
   *                emotionIndex, curveType, reasoning }
   * All floats are 0–1; emotionIndex is 0–6; curveType is a CURVE_TYPES string.
   */
  dimensions: {
    certainty: number;
    warmth: number;
    tension: number;
    vulnerability: number;
    scope: number;
    rootedness: number;
    emotionIndex: number;
    curveType: string;
    reasoning: string;
  } | null;
  ip_hash: string;
  created_at: string;
  approved_at: string | null;
}

export interface Connection {
  id: string;
  question_id: string;
  from_star_id: string;
  to_star_id: string;
  reason: string;
  status: 'pending' | 'approved' | 'rejected';
  ip_hash: string;
  created_at: string;
  approved_at: string | null;
}
