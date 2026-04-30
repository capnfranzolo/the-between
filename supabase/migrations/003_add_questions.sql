ALTER TABLE questions ADD COLUMN IF NOT EXISTS display_order integer DEFAULT 0;

UPDATE questions SET display_order = 1 WHERE slug = 'what-do-you-know-is-true';

INSERT INTO questions (slug, text, active, display_order) VALUES
  ('what-feels-like-home', 'What feels like home to you?', true, 2),
  ('something-ordinary-sacred', 'What''s something ordinary that feels sacred to you?', true, 3),
  ('kindest-thing-strangers', 'What''s the kindest thing you''ve witnessed between strangers?', true, 4),
  ('after-youre-gone', 'What would you want someone to know about you after you''re gone?', true, 5),
  ('younger-self-surprised', 'What''s something you believe now that your younger self would be surprised by?', true, 6)
ON CONFLICT (slug) DO NOTHING;
