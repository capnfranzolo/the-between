-- Each star can only orbit ONE other star (one outgoing connection).
-- Many stars can orbit the same anchor — no constraint on to_star_id.
CREATE UNIQUE INDEX IF NOT EXISTS idx_connections_from_star
  ON connections(from_star_id)
  WHERE status != 'rejected';
