-- Question of the Week: admin sets `featured_at` on a question to make it
-- "this week's question"; history of past featured_at values drives the
-- "previous question" paging. `reel_order` marks which stars an admin has
-- picked (and in what order, 1-5) for a question's weekly reel.
ALTER TABLE questions ADD COLUMN IF NOT EXISTS featured_at timestamptz NULL;
ALTER TABLE stars ADD COLUMN IF NOT EXISTS reel_order integer NULL;

-- Follow CTA handles — empty until the owner fills them in via admin; the
-- CTA renders only the ones with a non-empty value.
INSERT INTO settings (key, value) VALUES
  ('social_instagram', ''),
  ('social_tiktok', ''),
  ('social_x', ''),
  ('social_facebook', '')
ON CONFLICT (key) DO NOTHING;
