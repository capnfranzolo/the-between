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
  dimensions: Record<string, number> | null;
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
