-- Rate limits for spam protection
CREATE TABLE IF NOT EXISTS rate_limits (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  ip_hash text NOT NULL,
  action text NOT NULL DEFAULT 'star_create',
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rate_limits_ip_action ON rate_limits(ip_hash, action, created_at);

ALTER TABLE rate_limits ENABLE ROW LEVEL SECURITY;

-- Add answer_hash to stars for duplicate detection
ALTER TABLE stars ADD COLUMN IF NOT EXISTS answer_hash text;
CREATE INDEX IF NOT EXISTS idx_stars_answer_hash ON stars(answer_hash, question_id);
