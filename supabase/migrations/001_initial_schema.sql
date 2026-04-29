-- Drop hello-world test table
DROP TABLE IF EXISTS stars;

-- Questions (one cosmos per question)
CREATE TABLE questions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  slug text UNIQUE NOT NULL,
  text text NOT NULL,
  active boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- Stars (individual thoughts)
CREATE TABLE stars (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  question_id uuid NOT NULL REFERENCES questions(id),
  shortcode text UNIQUE NOT NULL,
  answer text NOT NULL CHECK (char_length(answer) BETWEEN 20 AND 500),
  unique_fact text CHECK (unique_fact IS NULL OR char_length(unique_fact) BETWEEN 3 AND 120),
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  dimensions jsonb,
  ip_hash text NOT NULL,
  created_at timestamptz DEFAULT now(),
  approved_at timestamptz
);

-- Connections (bonds between stars)
CREATE TABLE connections (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  question_id uuid NOT NULL REFERENCES questions(id),
  from_star_id uuid NOT NULL REFERENCES stars(id),
  to_star_id uuid NOT NULL REFERENCES stars(id),
  reason text NOT NULL CHECK (char_length(reason) BETWEEN 4 AND 100),
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  ip_hash text NOT NULL,
  created_at timestamptz DEFAULT now(),
  approved_at timestamptz,
  UNIQUE(from_star_id, to_star_id)
);

-- Indexes
CREATE INDEX idx_stars_shortcode ON stars(shortcode);
CREATE INDEX idx_stars_question_status ON stars(question_id, status);
CREATE INDEX idx_connections_question_status ON connections(question_id, status);

-- Row Level Security
ALTER TABLE questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE stars ENABLE ROW LEVEL SECURITY;
ALTER TABLE connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read active questions" ON questions FOR SELECT USING (active = true);
CREATE POLICY "Anyone can read approved stars or own star by shortcode" ON stars FOR SELECT USING (status = 'approved');
CREATE POLICY "Anyone can insert stars" ON stars FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update own star unique_fact" ON stars FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Anyone can read approved connections" ON connections FOR SELECT USING (status = 'approved');
CREATE POLICY "Anyone can insert connections" ON connections FOR INSERT WITH CHECK (true);

-- Seed the first question
INSERT INTO questions (slug, text, active) VALUES
  ('what-do-you-know-is-true', 'What do you know is true but you can''t prove?', true);
